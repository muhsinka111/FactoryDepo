/**
 * routes/offers.ts — lot-by-lot price negotiation.
 *
 * Access rules
 *  - POST /api/offers            : any authenticated caller opens an offer on a
 *                                  product. The seller is derived from the
 *                                  product row, never from the body.
 *  - GET  /api/offers            : role-aware. A buyer sees the offers they
 *                                  opened; a supplier sees the offers against
 *                                  their OWN supplier row; an admin sees all.
 *  - POST /api/offers/:id/counter: only a party to that offer (its buyer, or the
 *                                  supplier it belongs to). Inserts a new linked
 *                                  offer (parentOfferId) and flips the parent to
 *                                  'countered' in ONE transaction.
 *  - POST /api/offers/:id/accept
 *    POST /api/offers/:id/reject : only a party; status transitions validated —
 *                                  an accepted/rejected offer is final and
 *                                  cannot be re-decided (409).
 * The negotiation is an immutable chain of rows: a counter never mutates the
 * terms it answers, it points at them.
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import { desc, eq, or, sql } from 'drizzle-orm';
import * as c from '@workspace/api-zod';
import { db, offers, products, suppliers, users } from '../db.js';
import { requireAuth } from '../auth.js';
import { HttpError, mapOffer, parseId, respond, toNum } from '../http.js';
import { callerContext, notify, queueEmail } from '../helpers.js';

export const offersRouter = Router();

/** Columns for a full `zOffer` (product/buyer/supplier names + provenance). */
const offerCols = {
  id: offers.id,
  productId: offers.productId,
  productName: products.name,
  buyerId: offers.buyerId,
  buyerName: users.name,
  supplierId: offers.supplierId,
  supplierName: suppliers.companyName,
  quantity: offers.quantity,
  unitPrice: offers.unitPrice,
  currency: offers.currency,
  parentOfferId: offers.parentOfferId,
  status: offers.status,
  notes: offers.notes,
  dataSource: products.dataSource,
  createdAt: offers.createdAt,
};

/** Statuses from which no further decision can be taken. */
const FINAL_STATUSES = new Set(['accepted', 'rejected', 'withdrawn']);

function selectOffer(id: number) {
  return db
    .select(offerCols)
    .from(offers)
    .innerJoin(products, eq(offers.productId, products.id))
    .innerJoin(users, eq(offers.buyerId, users.id))
    .innerJoin(suppliers, eq(offers.supplierId, suppliers.id))
    .where(eq(offers.id, id))
    .limit(1);
}

/** POST /api/offers — buyer-side action; supplier comes from the product. */
offersRouter.post('/', requireAuth, async (req, res) => {
  const input = c.zCreateOfferInput.safeParse(req.body ?? {});
  if (!input.success) {
    throw new HttpError(400, { error: 'validation_error', details: input.error.message });
  }
  const ctx = await callerContext(req.userId);
  if (!ctx) throw new HttpError(401, { error: 'auth_required' });

  const { productId, quantity, unitPrice, currency, notes } = input.data;

  const [product] = await db
    .select({
      id: products.id,
      name: products.name,
      supplierId: products.supplierId,
      supplierName: suppliers.companyName,
      supplierUserId: suppliers.userId,
      supplierEmail: users.email,
    })
    .from(products)
    .innerJoin(suppliers, eq(products.supplierId, suppliers.id))
    .innerJoin(users, eq(suppliers.userId, users.id))
    .where(eq(products.id, productId))
    .limit(1);

  if (!product) throw new HttpError(404, { error: 'product_not_found' });
  if (ctx.userId === toNum(product.supplierUserId)) {
    throw new HttpError(400, { error: 'own_listing', details: 'You cannot open an offer on your own listing.' });
  }

  // unitPrice/quantity go to numeric(14,2) as strings; no JS float math anywhere.
  const [inserted] = await db
    .insert(offers)
    .values({
      productId,
      buyerId: ctx.userId,
      supplierId: toNum(product.supplierId),
      quantity: String(quantity),
      unitPrice: String(unitPrice),
      currency,
      status: 'pending',
      notes: notes ?? null,
    })
    .returning({ id: offers.id });

  await notify(
    {
      userId: toNum(product.supplierUserId),
      role: 'supplier',
      text: `New offer #${toNum(inserted?.id)} on your listing "${product.name}".`,
      type: 'offer',
      link: `/supplier/offers`,
    },
  );
  await queueEmail({
    toEmail: product.supplierEmail,
    template: 'offer-received',
    payload: {
      offerId: toNum(inserted?.id),
      productId,
      productName: product.name,
      buyerId: ctx.userId,
      unitPrice,
      quantity,
      currency,
    },
  });

  const [row] = await selectOffer(toNum(inserted?.id));
  res.status(201);
  respond(res, c.zOffer, mapOffer(row));
});

/** GET /api/offers — offers the caller is party to (all of them for an admin). */
offersRouter.get('/', requireAuth, async (req, res) => {
  const ctx = await callerContext(req.userId);
  if (!ctx) throw new HttpError(401, { error: 'auth_required' });

  // Role-aware scoping. A supplier only ever sees offers against their own
  // supplier row — never "offers where supplierId = some other supplier".
  const where = ctx.isAdmin
    ? undefined
    : ctx.supplierId != null
      ? ctx.role === 'supplier'
        ? eq(offers.supplierId, ctx.supplierId)
        : or(eq(offers.buyerId, ctx.userId), eq(offers.supplierId, ctx.supplierId))
      : eq(offers.buyerId, ctx.userId);

  const base = db
    .select(offerCols)
    .from(offers)
    .innerJoin(products, eq(offers.productId, products.id))
    .innerJoin(users, eq(offers.buyerId, users.id))
    .innerJoin(suppliers, eq(offers.supplierId, suppliers.id));

  const rows = await (where ? base.where(where) : base).orderBy(desc(offers.id));
  respond(res, c.zOfferList, { items: rows.map(mapOffer), total: rows.length });
});

/** POST /api/offers/:id/counter — one transaction: insert child + flip parent. */
offersRouter.post('/:id/counter', requireAuth, async (req, res) => {
  const id = parseId(req);
  const input = c.zCounterOfferInput.safeParse(req.body ?? {});
  if (!input.success) {
    throw new HttpError(400, { error: 'validation_error', details: input.error.message });
  }
  const ctx = await callerContext(req.userId);
  if (!ctx) throw new HttpError(401, { error: 'auth_required' });

  const newOfferId = await db.transaction(async (tx) => {
    const [parent] = await tx
      .select({
        id: offers.id,
        productId: offers.productId,
        // Scalar sub-select rather than a join: the row lock below must apply to
        // exactly one table ("FOR UPDATE cannot be applied to the nullable side
        // of an outer join" is a real Postgres error this avoids).
        productName: sql<string>`(SELECT p."name" FROM "products" p WHERE p."id" = ${offers.productId})`,
        buyerId: offers.buyerId,
        supplierId: offers.supplierId,
        quantity: offers.quantity,
        currency: offers.currency,
        status: offers.status,
      })
      .from(offers)
      .where(eq(offers.id, id))
      .for('update')
      .limit(1);

    if (!parent) throw new HttpError(404, { error: 'not_found' });
    const isParty = parent.buyerId === ctx.userId || (ctx.supplierId != null && parent.supplierId === ctx.supplierId);
    if (!isParty) throw new HttpError(403, { error: 'forbidden' });
    if (FINAL_STATUSES.has(String(parent.status))) {
      throw new HttpError(409, { error: 'offer_final', details: `Offer is already ${parent.status}.` });
    }

    const [child] = await tx
      .insert(offers)
      .values({
        productId: toNum(parent.productId),
        buyerId: toNum(parent.buyerId),
        supplierId: toNum(parent.supplierId),
        quantity: String(input.data.quantity ?? toNum(parent.quantity)),
        unitPrice: String(input.data.unitPrice),
        currency: input.data.currency ?? String(parent.currency ?? 'USD'),
        parentOfferId: toNum(parent.id),
        status: 'pending',
        notes: input.data.notes ?? null,
      })
      .returning({ id: offers.id });

    await tx.update(offers).set({ status: 'countered' }).where(eq(offers.id, toNum(parent.id)));

    // Side effects ride the same transaction, so a rolled-back counter never
    // leaves a phantom notification or outbox row behind (both swallow errors,
    // so they cannot roll the counter back either).
    const counterpartyUserId = ctx.userId === toNum(parent.buyerId) ? null : toNum(parent.buyerId);
    const counterpartyEmail = counterpartyUserId
      ? (await tx.select({ email: users.email }).from(users).where(eq(users.id, counterpartyUserId)).limit(1))[0]?.email
      : (
          await tx
            .select({ email: users.email })
            .from(suppliers)
            .innerJoin(users, eq(suppliers.userId, users.id))
            .where(eq(suppliers.id, toNum(parent.supplierId)))
            .limit(1)
        )[0]?.email;
    if (counterpartyUserId) {
      await notify(
        { userId: counterpartyUserId, role: 'buyer', text: `Offer #${id} was countered.`, type: 'offer', link: '/buyer/offers' },
        tx,
      );
    }
    await queueEmail(
      {
        toEmail: counterpartyEmail,
        subject: `Counter-offer on offer #${id}`,
        template: 'offer_countered',
        payload: { parentOfferId: id, offerId: toNum(child?.id), unitPrice: input.data.unitPrice },
      },
      tx,
    );

    return toNum(child?.id);
  });

  const [row] = await selectOffer(newOfferId);
  res.status(201);
  respond(res, c.zOffer, mapOffer(row));
});

/**
 * Shared accept/reject: party-only, status-validated, notified, one transaction.
 */
async function decide(req: Request, res: Response, next: 'accepted' | 'rejected'): Promise<void> {
  const id = parseId(req);
  const ctx = await callerContext(req.userId);
  if (!ctx) throw new HttpError(401, { error: 'auth_required' });

  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        id: offers.id,
        buyerId: offers.buyerId,
        supplierId: offers.supplierId,
        status: offers.status,
        supplierUserId: suppliers.userId,
      })
      .from(offers)
      .innerJoin(suppliers, eq(offers.supplierId, suppliers.id))
      .where(eq(offers.id, id))
      .for('update')
      .limit(1);

    if (!row) throw new HttpError(404, { error: 'not_found' });
    const isParty = row.buyerId === ctx.userId || (ctx.supplierId != null && row.supplierId === ctx.supplierId);
    if (!isParty) throw new HttpError(403, { error: 'forbidden' });
    if (FINAL_STATUSES.has(String(row.status))) {
      throw new HttpError(409, { error: 'offer_final', details: `Offer is already ${row.status}.` });
    }

    await tx.update(offers).set({ status: next }).where(eq(offers.id, id));

    const otherUserId = ctx.userId === toNum(row.buyerId) ? toNum(row.supplierUserId) : toNum(row.buyerId);
    const otherRole = ctx.userId === toNum(row.buyerId) ? 'supplier' : 'buyer';
    const otherEmail = (
      await tx.select({ email: users.email }).from(users).where(eq(users.id, otherUserId)).limit(1)
    )[0]?.email;
    await notify(
      { userId: otherUserId, role: otherRole, text: `Offer #${id} was ${next}.`, type: 'offer', link: `/${otherRole}/offers` },
      tx,
    );
    await queueEmail(
      {
        toEmail: otherEmail,
        subject: `Offer #${id} ${next}`,
        template: `offer_${next}`,
        payload: { offerId: id, status: next },
      },
      tx,
    );
  });

  const [updated] = await selectOffer(id);
  respond(res, c.zOffer, mapOffer(updated));
}

/** POST /api/offers/:id/accept — party-only; an already-decided offer → 409. */
offersRouter.post('/:id/accept', requireAuth, async (req, res) => {
  await decide(req, res, 'accepted');
});

/** POST /api/offers/:id/reject — party-only; an already-decided offer → 409. */
offersRouter.post('/:id/reject', requireAuth, async (req, res) => {
  await decide(req, res, 'rejected');
});
