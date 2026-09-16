/**
 * routes/saved.ts — a buyer's shortlist of lots ("saved lots").
 *
 * Access rules: every route is authenticated and strictly self-scoped. A saved
 * lot is keyed by (userId, productId), and `userId` always comes from the token
 * — never from the body — so one user can never read or mutate another user's
 * shortlist. GET embeds the full `zProduct` (joined through suppliers + users)
 * so a shortlisted card can still show its `dataSource` provenance tag.
 */
import { Router } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import * as c from '@workspace/api-zod';
import { db, products, savedLots, suppliers, users } from '../db.js';
import { requireAuth } from '../auth.js';
import { HttpError, mapSavedLot, respond } from '../http.js';
import { fetchProductRow, productColumns } from '../helpers.js';

export const savedRouter = Router();

/** GET /api/saved — the caller's shortlist, newest first, with the full product. */
savedRouter.get('/', requireAuth, async (req, res) => {
  const uid = req.userId;
  if (uid == null) throw new HttpError(401, { error: 'auth_required' });

  // `savedAt` carries the shortlist row's timestamp; the product's own
  // createdAt comes from the embedded zProduct projection.
  const rows = await db
    .select({ userId: savedLots.userId, productId: savedLots.productId, savedAt: savedLots.createdAt, ...productColumns })
    .from(savedLots)
    .innerJoin(products, eq(savedLots.productId, products.id))
    .innerJoin(suppliers, eq(products.supplierId, suppliers.id))
    .innerJoin(users, eq(suppliers.userId, users.id))
    .where(eq(savedLots.userId, uid))
    .orderBy(desc(savedLots.createdAt));

  const items = rows.map((r) => mapSavedLot({ ...r, createdAt: r.savedAt }));
  respond(res, c.zSavedLotList, { items, total: items.length });
});

/**
 * POST /api/saved — idempotent shortlist add. ON CONFLICT DO NOTHING means a
 * double-tap or retry never 500s and never duplicates the row.
 */
savedRouter.post('/', requireAuth, async (req, res) => {
  const input = c.zSaveLotInput.safeParse(req.body ?? {});
  if (!input.success) {
    throw new HttpError(400, { error: 'validation_error', details: input.error.message });
  }
  const uid = req.userId;
  if (uid == null) throw new HttpError(401, { error: 'auth_required' });

  const { productId } = input.data;
  const product = await fetchProductRow(productId);
  if (!product) throw new HttpError(404, { error: 'product_not_found' });

  const [row] = await db
    .insert(savedLots)
    .values({ userId: uid, productId })
    .onConflictDoNothing({ target: [savedLots.userId, savedLots.productId] })
    .returning();

  // Already saved: re-read so the response is the same shape either way.
  const saved =
    row ??
    (
      await db
        .select()
        .from(savedLots)
        .where(and(eq(savedLots.userId, uid), eq(savedLots.productId, productId)))
        .limit(1)
    )[0];

  res.status(row ? 201 : 200);
  respond(res, c.zSavedLot, mapSavedLot({ ...saved, ...product, createdAt: saved?.createdAt ?? new Date() }));
});

/** DELETE /api/saved/:productId — remove from own shortlist. 204 either way. */
savedRouter.delete('/:productId', requireAuth, async (req, res) => {
  const uid = req.userId;
  if (uid == null) throw new HttpError(401, { error: 'auth_required' });
  const raw = Array.isArray(req.params['productId']) ? req.params['productId'][0] : req.params['productId'];
  const productId = Number.parseInt(raw ?? '', 10);
  if (Number.isNaN(productId)) throw new HttpError(400, { error: 'invalid_id' });

  await db.delete(savedLots).where(and(eq(savedLots.userId, uid), eq(savedLots.productId, productId)));
  res.status(204).end();
});
