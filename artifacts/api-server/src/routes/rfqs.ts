import { Router } from 'express';
import { desc, eq, sql } from 'drizzle-orm';
import * as c from '@workspace/api-zod';
import { db, quotes, rfqs, suppliers, users } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';
import { HttpError, mapQuote, mapRfq, parseId, respond, toNum } from '../http.js';

export const rfqsRouter = Router();

/** Subquery: quote count per RFQ. */
const quoteCounts = db
  .select({
    rfqId: quotes.rfqId,
    count: sql<number>`count(*)`.as('count'),
  })
  .from(quotes)
  .groupBy(quotes.rfqId)
  .as('quote_counts');

/** Columns for list/detail (quoteCount via subquery). */
const rfqCols = {
  id: rfqs.id,
  buyerId: rfqs.buyerId,
  title: rfqs.title,
  category: rfqs.category,
  description: rfqs.description,
  quantity: rfqs.quantity,
  unit: rfqs.unit,
  targetCountry: rfqs.targetCountry,
  status: rfqs.status,
  quoteCount: sql<number>`coalesce(${quoteCounts.count}, 0)`.as('quoteCount'),
  deadline: rfqs.deadline,
  createdAt: rfqs.createdAt,
};

/** GET /api/rfqs — all RFQs, newest first. */
rfqsRouter.get('/', async (_req, res) => {
  const rows = await db
    .select({ ...rfqCols })
    .from(rfqs)
    .leftJoin(quoteCounts, eq(rfqs.id, quoteCounts.rfqId))
    .orderBy(desc(rfqs.id));

  const [totalRow] = await db.select({ total: sql<number>`count(*)` }).from(rfqs);

  respond(res, c.zRfqList, {
    items: rows.map(mapRfq),
    total: toNum(totalRow?.total),
  });
});

/** POST /api/rfqs — buyer only. */
rfqsRouter.post('/', requireAuth, requireRole('buyer'), async (req, res) => {
  const input = c.zCreateRfqInput.safeParse(req.body ?? {});
  if (!input.success) {
    throw new HttpError(400, { error: 'validation_error', details: input.error.message });
  }
  const uid = req.userId;
  if (uid == null) throw new HttpError(401, { error: 'auth_required' });
  const { title, category, description, quantity, unit, targetCountry } = input.data;

  const [inserted] = await db
    .insert(rfqs)
    .values({
      buyerId: uid,
      title,
      category,
      description: description ?? null,
      quantity: String(quantity),
      unit,
      targetCountry: targetCountry ?? null,
      status: 'open',
    })
    .returning();

  res.status(201);
  respond(res, c.zRfq, mapRfq({ ...inserted, quoteCount: 0 }));
});

/** GET /api/rfqs/:id — RFQ + its quotes (supplierName + trustScore joined). */
rfqsRouter.get('/:id', async (req, res) => {
  const id = parseId(req);
  const [rfqRow] = await db
    .select({ ...rfqCols })
    .from(rfqs)
    .leftJoin(quoteCounts, eq(rfqs.id, quoteCounts.rfqId))
    .where(eq(rfqs.id, id))
    .limit(1);
  if (!rfqRow) throw new HttpError(404, { error: 'not_found' });

  const quoteRows = await db
    .select({
      id: quotes.id,
      rfqId: quotes.rfqId,
      supplierId: quotes.supplierId,
      supplierName: suppliers.companyName,
      price: quotes.price,
      currency: quotes.currency,
      leadTimeDays: quotes.leadTimeDays,
      notes: quotes.notes,
      status: quotes.status,
      trustScore: users.trustScore,
      createdAt: quotes.createdAt,
    })
    .from(quotes)
    .innerJoin(suppliers, eq(quotes.supplierId, suppliers.id))
    .innerJoin(users, eq(suppliers.userId, users.id))
    .where(eq(quotes.rfqId, id))
    .orderBy(desc(quotes.createdAt));

  respond(res, c.zRfqDetail, { rfq: mapRfq(rfqRow), quotes: quoteRows.map(mapQuote) });
});

/** POST /api/rfqs/:id/quotes — supplier only. 409 {error:'rfq_closed'} when closed. */
rfqsRouter.post('/:id/quotes', requireAuth, requireRole('supplier'), async (req, res) => {
  const id = parseId(req);
  const input = c.zCreateQuoteInput.safeParse(req.body ?? {});
  if (!input.success) {
    throw new HttpError(400, { error: 'validation_error', details: input.error.message });
  }
  const uid = req.userId;
  if (uid == null) throw new HttpError(401, { error: 'auth_required' });

  const [rfqRow] = await db
    .select({ id: rfqs.id, status: rfqs.status })
    .from(rfqs)
    .where(eq(rfqs.id, id))
    .limit(1);
  if (!rfqRow) throw new HttpError(404, { error: 'not_found' });
  if (rfqRow.status === 'closed') throw new HttpError(409, { error: 'rfq_closed' });

  const [supplierRow] = await db
    .select({
      supplierId: suppliers.id,
      supplierName: suppliers.companyName,
      trustScore: users.trustScore,
    })
    .from(suppliers)
    .innerJoin(users, eq(suppliers.userId, users.id))
    .where(eq(suppliers.userId, uid))
    .limit(1);
  if (!supplierRow) throw new HttpError(403, { error: 'forbidden' });

  const { price, currency, leadTimeDays, notes } = input.data;
  const [inserted] = await db
    .insert(quotes)
    .values({
      rfqId: id,
      supplierId: supplierRow.supplierId,
      price: String(price),
      currency,
      leadTimeDays,
      notes: notes ?? null,
      status: 'submitted',
    })
    .returning();

  if (rfqRow.status === 'open') {
    await db.update(rfqs).set({ status: 'quoted' }).where(eq(rfqs.id, id));
  }

  res.status(201);
  respond(
    res,
    c.zQuote,
    mapQuote({
      ...inserted,
      supplierName: supplierRow.supplierName,
      trustScore: supplierRow.trustScore,
    }),
  );
});
