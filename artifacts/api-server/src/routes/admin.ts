/**
 * routes/admin.ts — the admin console. EVERY route here is `admin` role only.
 *
 * Honesty rules (AGENTS.md), enforced by construction:
 *  - every number in GET /api/admin/overview is a real COUNT/SUM over a real
 *    table — there is no placeholder and no invented trend anywhere;
 *  - `paymentsConfirmedTotal` is summed in Postgres over the numeric column and
 *    only then coerced to a JS number (no float arithmetic);
 *  - a supplier's per-status document counts are real `supplier_docs` counts;
 *  - approving a supplier stamps `attestedBy`/`attestedAt` with the admin who
 *    did it. The rule chosen (see approve/reject below) is deliberate: approval
 *    means verifiedLevel 2 ("documents reviewed"), rejection resets it to 0 and
 *    keeps the attestation so the audit trail shows the rejection instead of
 *    silently discarding it.
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import { and, desc, eq, gte, ilike, isNotNull, lte, or, sql } from 'drizzle-orm';
import * as c from '@workspace/api-zod';
import {
  db,
  banners,
  faqs,
  featureFlags,
  products,
  productQuestions,
  quotes,
  rfqs,
  suppliers,
  supplierDocs,
  supportTickets,
  users,
} from '../db.js';
import { requireAuth, requireRole } from '../auth.js';
import {
  HttpError,
  mapAdminProductQuestion,
  mapAdminSupplier,
  mapBanner,
  mapFaq,
  mapFeatureFlag,
  mapProduct,
  mapRfq,
  mapSupplierDoc,
  mapSupportTicket,
  parseId,
  respond,
  toNum,
} from '../http.js';
import { productColumns, queueEmail } from '../helpers.js';

export const adminRouter = Router();

// Every route in this file is admin-only: one gate, applied once.
adminRouter.use(requireAuth, requireRole('admin'));

/* ---------- shared: quote counts subquery (matches routes/rfqs.ts) ---------- */

const quoteCounts = db
  .select({ rfqId: quotes.rfqId, count: sql<number>`count(*)`.as('count') })
  .from(quotes)
  .groupBy(quotes.rfqId)
  .as('quote_counts');

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

/**
 * One product-Q&A row plus the listing it belongs to — the admin queue reads
 * questions by listing, not by product page, so the joined name is part of the
 * row. `dataSource` rides along so a moderator can see provenance.
 */
const adminQuestionCols = {
  id: productQuestions.id,
  productId: productQuestions.productId,
  productName: products.name,
  question: productQuestions.question,
  askerName: productQuestions.askerName,
  createdAt: productQuestions.createdAt,
  answer: productQuestions.answer,
  answeredAt: productQuestions.answeredAt,
  answeredByName: productQuestions.answeredByName,
  status: productQuestions.status,
  dataSource: productQuestions.dataSource,
};

/* ---------- overview ---------- */

/**
 * GET /api/admin/overview — one honest COUNT/SUM per metric. Every scalar is
 * read from the table it claims to describe; nothing here is derived, cached or
 * estimated. `total`-style client trends are deliberately absent.
 */
adminRouter.get('/overview', async (_req, res) => {
  const [row] = (
    await db.execute(sql`
      SELECT
        (SELECT count(*) FROM "users")                                        AS "users",
        (SELECT count(*) FROM "users" WHERE "role" = 'buyer')                 AS "buyers",
        (SELECT count(*) FROM "suppliers")                                    AS "suppliers",
        (SELECT count(*) FROM "products")                                     AS "products",
        (SELECT count(*) FROM "products" WHERE "dataSource" = 'demo')          AS "demoProducts",
        (SELECT count(*) FROM "products" WHERE "dataSource" = 'platform')      AS "platformProducts",
        (SELECT count(*) FROM "rfqs")                                         AS "rfqs",
        (SELECT count(*) FROM "quotes")                                       AS "quotes",
        (SELECT count(*) FROM "orders")                                       AS "orders",
        (SELECT count(*) FROM "offers")                                       AS "offers",
        (SELECT count(*) FROM "offers" WHERE "status" = 'pending')             AS "openOffers",
        (SELECT count(*) FROM "threads")                                      AS "threads",
        (SELECT count(*) FROM "messages")                                     AS "messages",
        (SELECT count(*) FROM "shipments")                                    AS "shipments",
        (SELECT count(*) FROM "payments" WHERE "status" = 'awaiting')          AS "paymentsAwaiting",
        (SELECT COALESCE(sum("amount"), 0) FROM "payments" WHERE "status" = 'confirmed') AS "paymentsConfirmedTotal",
        (SELECT count(*) FROM "supplier_docs" WHERE "status" = 'submitted')    AS "docsAwaitingReview",
        (SELECT count(*) FROM "support_tickets" WHERE "status" = 'open')       AS "supportTicketsOpen",
        (SELECT count(*) FROM "product_views")                                AS "productViews",
        (SELECT count(*) FROM "email_outbox" WHERE "status" = 'queued')        AS "emailsQueued"
    `)
  ).rows as Record<string, unknown>[];

  respond(res, c.zAdminOverview, {
    users: toNum(row?.users),
    buyers: toNum(row?.buyers),
    suppliers: toNum(row?.suppliers),
    products: toNum(row?.products),
    demoProducts: toNum(row?.demoProducts),
    platformProducts: toNum(row?.platformProducts),
    rfqs: toNum(row?.rfqs),
    quotes: toNum(row?.quotes),
    orders: toNum(row?.orders),
    offers: toNum(row?.offers),
    openOffers: toNum(row?.openOffers),
    threads: toNum(row?.threads),
    messages: toNum(row?.messages),
    shipments: toNum(row?.shipments),
    paymentsAwaiting: toNum(row?.paymentsAwaiting),
    // Summed by Postgres over numeric(14,2); coerced once, never accumulated.
    paymentsConfirmedTotal: toNum(row?.paymentsConfirmedTotal),
    docsAwaitingReview: toNum(row?.docsAwaitingReview),
    supportTicketsOpen: toNum(row?.supportTicketsOpen),
    productViews: toNum(row?.productViews),
    emailsQueued: toNum(row?.emailsQueued),
  });
});

/* ---------- suppliers ---------- */

/** GET /api/admin/suppliers — directory rows + real per-status doc counts. */
adminRouter.get('/suppliers', async (_req, res) => {
  const rows = await db
    .select({
      id: suppliers.id,
      companyName: suppliers.companyName,
      country: suppliers.country,
      city: suppliers.city,
      contactEmail: suppliers.contactEmail,
      verifiedLevel: suppliers.verifiedLevel,
      rating: suppliers.rating,
      trustScore: users.trustScore,
      productCount: sql<number>`(SELECT count(*) FROM "products" p WHERE p."supplierId" = ${suppliers.id})`.as('productCount'),
      dataSource: suppliers.dataSource,
      attestedAt: suppliers.attestedAt,
      attestedBy: suppliers.attestedBy,
      docsMissing: sql<number>`(SELECT count(*) FROM "supplier_docs" d WHERE d."supplierId" = ${suppliers.id} AND d."status" = 'missing')`.as('docsMissing'),
      docsSubmitted: sql<number>`(SELECT count(*) FROM "supplier_docs" d WHERE d."supplierId" = ${suppliers.id} AND d."status" = 'submitted')`.as('docsSubmitted'),
      docsApproved: sql<number>`(SELECT count(*) FROM "supplier_docs" d WHERE d."supplierId" = ${suppliers.id} AND d."status" = 'approved')`.as('docsApproved'),
      docsRejected: sql<number>`(SELECT count(*) FROM "supplier_docs" d WHERE d."supplierId" = ${suppliers.id} AND d."status" = 'rejected')`.as('docsRejected'),
      createdAt: suppliers.createdAt,
    })
    .from(suppliers)
    .innerJoin(users, eq(suppliers.userId, users.id))
    .orderBy(desc(suppliers.verifiedLevel), suppliers.id);

  respond(res, c.zAdminSupplierList, { items: rows.map(mapAdminSupplier), total: rows.length });
});

/**
 * Shared approve/reject for a supplier.
 *
 * RULE (deliberate, documented once and applied to both verbs):
 *   approve → verifiedLevel = 2, attestedAt = now(), attestedBy = acting admin.
 *     Level 2 means "identity + documents reviewed by FactoryDepo". Level 3
 *     (on-site inspection) is never granted here because no inspection is
 *     recorded by this endpoint, and inventing one would be dishonest.
 *     A supplier already at level 3 keeps it — approval never downgrades.
 *   reject  → verifiedLevel = 0 (nothing verified), and the attestation is
 *     still stamped, so the record shows WHO rejected it and WHEN rather than
 *     erasing the review. Documents are left untouched: the supplier can fix
 *     and resubmit them.
 * The supplier's account/admin is notified through the transactional outbox.
 */
async function attestSupplier(req: Request, res: Response, approve: boolean): Promise<void> {
  const id = parseId(req);
  const uid = req.userId;
  if (uid == null) throw new HttpError(401, { error: 'auth_required' });

  const [existing] = await db
    .select({ id: suppliers.id, userId: suppliers.userId, verifiedLevel: suppliers.verifiedLevel, companyName: suppliers.companyName, dataSource: suppliers.dataSource })
    .from(suppliers)
    .where(eq(suppliers.id, id))
    .limit(1);
  if (!existing) throw new HttpError(404, { error: 'not_found' });

  await db
    .update(suppliers)
    .set({
      verifiedLevel: approve ? Math.max(2, toNum(existing.verifiedLevel)) : 0,
      attestedAt: new Date(),
      attestedBy: uid,
    })
    .where(eq(suppliers.id, id));

  const [row] = await db
    .select({
      id: suppliers.id,
      companyName: suppliers.companyName,
      country: suppliers.country,
      city: suppliers.city,
      contactEmail: suppliers.contactEmail,
      verifiedLevel: suppliers.verifiedLevel,
      rating: suppliers.rating,
      trustScore: users.trustScore,
      productCount: sql<number>`(SELECT count(*) FROM "products" p WHERE p."supplierId" = ${suppliers.id})`.as('productCount'),
      dataSource: suppliers.dataSource,
      attestedAt: suppliers.attestedAt,
      attestedBy: suppliers.attestedBy,
      docsMissing: sql<number>`(SELECT count(*) FROM "supplier_docs" d WHERE d."supplierId" = ${suppliers.id} AND d."status" = 'missing')`.as('docsMissing'),
      docsSubmitted: sql<number>`(SELECT count(*) FROM "supplier_docs" d WHERE d."supplierId" = ${suppliers.id} AND d."status" = 'submitted')`.as('docsSubmitted'),
      docsApproved: sql<number>`(SELECT count(*) FROM "supplier_docs" d WHERE d."supplierId" = ${suppliers.id} AND d."status" = 'approved')`.as('docsApproved'),
      docsRejected: sql<number>`(SELECT count(*) FROM "supplier_docs" d WHERE d."supplierId" = ${suppliers.id} AND d."status" = 'rejected')`.as('docsRejected'),
      createdAt: suppliers.createdAt,
    })
    .from(suppliers)
    .innerJoin(users, eq(suppliers.userId, users.id))
    .where(eq(suppliers.id, id))
    .limit(1);

  const [account] = await db.select({ email: users.email }).from(users).where(eq(users.id, toNum(existing.userId))).limit(1);
  await queueEmail({
    toEmail: account?.email,
    template: approve ? 'supplier-approved' : 'supplier-rejected',
    payload: { supplierId: id, companyName: existing.companyName },
  });

  respond(res, c.zAdminSupplier, mapAdminSupplier(row));
}

/** POST /api/admin/suppliers/:id/approve — verifiedLevel 2 + attestation. */
adminRouter.post('/suppliers/:id/approve', async (req, res) => {
  await attestSupplier(req, res, true);
});

/** POST /api/admin/suppliers/:id/reject — verifiedLevel 0, attestation kept. */
adminRouter.post('/suppliers/:id/reject', async (req, res) => {
  await attestSupplier(req, res, false);
});

/* ---------- listings ---------- */

/** GET /api/admin/listings — paginated catalogue, same query contract as public. */
adminRouter.get('/listings', async (req, res) => {
  const parsed = c.zProductListQuery.safeParse(req.query ?? {});
  if (!parsed.success) {
    throw new HttpError(400, { error: 'validation_error', details: parsed.error.message });
  }
  const { q, category, country, minPrice, maxPrice, hasImage, page, limit } = parsed.data;

  const conds: ReturnType<typeof and>[] = [];
  if (q) conds.push(or(ilike(products.name, `%${q}%`), ilike(products.category, `%${q}%`)));
  if (category) conds.push(eq(products.category, category));
  if (country) conds.push(eq(products.originCountry, country));
  if (minPrice != null) conds.push(gte(products.price, String(minPrice)));
  if (maxPrice != null) conds.push(lte(products.price, String(maxPrice)));
  if (hasImage === 1) conds.push(isNotNull(products.imageKey));
  const where = conds.length > 0 ? and(...conds) : undefined;

  const [totalRow, rows] = await Promise.all([
    db
      .select({ total: sql<number>`count(*)` })
      .from(products)
      .innerJoin(suppliers, eq(products.supplierId, suppliers.id))
      .innerJoin(users, eq(suppliers.userId, users.id))
      .where(where),
    db
      .select(productColumns)
      .from(products)
      .innerJoin(suppliers, eq(products.supplierId, suppliers.id))
      .innerJoin(users, eq(suppliers.userId, users.id))
      .where(where)
      .orderBy(desc(products.id))
      .limit(limit)
      .offset((page - 1) * limit),
  ]);

  const total = toNum(totalRow[0]?.total);
  respond(res, c.zProductList, {
    items: rows.map(mapProduct),
    total,
    page,
    pages: Math.ceil(total / limit),
  });
});

/* ---------- RFQs ---------- */

/** GET /api/admin/rfqs — every RFQ platform-wide, newest first. */
adminRouter.get('/rfqs', async (_req, res) => {
  const rows = await db
    .select({ ...rfqCols })
    .from(rfqs)
    .leftJoin(quoteCounts, eq(rfqs.id, quoteCounts.rfqId))
    .orderBy(desc(rfqs.id));
  respond(res, c.zRfqList, { items: rows.map(mapRfq), total: rows.length });
});

/* ---------- verification desk ---------- */

/** GET /api/admin/docs — every supplier document, newest first. */
adminRouter.get('/docs', async (_req, res) => {
  const rows = await db.select().from(supplierDocs).orderBy(desc(supplierDocs.id));
  respond(res, c.zSupplierDocList, { items: rows.map(mapSupplierDoc), total: rows.length });
});

/** POST /api/admin/docs/:id/review — approve/reject/mark-missing one document. */
adminRouter.post('/docs/:id/review', async (req, res) => {
  const id = parseId(req);
  const input = c.zReviewDocInput.safeParse(req.body ?? {});
  if (!input.success) {
    throw new HttpError(400, { error: 'validation_error', details: input.error.message });
  }
  const uid = req.userId;
  if (uid == null) throw new HttpError(401, { error: 'auth_required' });

  const [existing] = await db.select({ id: supplierDocs.id }).from(supplierDocs).where(eq(supplierDocs.id, id)).limit(1);
  if (!existing) throw new HttpError(404, { error: 'not_found' });

  const { status, note } = input.data;
  await db
    .update(supplierDocs)
    .set({ status, note: note ?? null, reviewedBy: uid, reviewedAt: new Date() })
    .where(eq(supplierDocs.id, id));

  const [row] = await db.select().from(supplierDocs).where(eq(supplierDocs.id, id)).limit(1);
  respond(res, c.zSupplierDoc, mapSupplierDoc(row));
});

/* ---------- feature flags ---------- */

/** GET /api/admin/features — every flag. */
adminRouter.get('/features', async (_req, res) => {
  const rows = await db.select().from(featureFlags).orderBy(featureFlags.key);
  respond(res, c.zFeatureFlagList, { items: rows.map(mapFeatureFlag), total: rows.length });
});

/** PATCH /api/admin/features — { key, enabled, label?, description? } upsert. */
adminRouter.patch('/features', async (req, res) => {
  const input = c.zUpdateFeatureFlagInput.safeParse(req.body ?? {});
  if (!input.success) {
    throw new HttpError(400, { error: 'validation_error', details: input.error.message });
  }
  const { key, enabled, label, description } = input.data;

  const [row] = await db
    .insert(featureFlags)
    .values({
      key,
      enabled,
      label: label ?? key,
      description: description ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: featureFlags.key,
      set: {
        enabled,
        ...(label !== undefined ? { label } : {}),
        ...(description !== undefined ? { description } : {}),
        updatedAt: new Date(),
      },
    })
    .returning();

  respond(res, c.zFeatureFlag, mapFeatureFlag(row));
});

/* ---------- banners ---------- */

/** GET /api/admin/banners — every placement, newest first. */
adminRouter.get('/banners', async (_req, res) => {
  const rows = await db.select().from(banners).orderBy(desc(banners.id));
  respond(res, c.zBannerList, { items: rows.map(mapBanner), total: rows.length });
});

/** POST /api/admin/banners — create a banner. */
adminRouter.post('/banners', async (req, res) => {
  const input = c.zCreateBannerInput.safeParse(req.body ?? {});
  if (!input.success) {
    throw new HttpError(400, { error: 'validation_error', details: input.error.message });
  }
  const d = input.data;
  const [row] = await db
    .insert(banners)
    .values({
      title: d.title,
      body: d.body ?? null,
      placement: d.placement,
      imageKey: d.imageKey ?? null,
      href: d.href ?? null,
      active: d.active,
      startsAt: d.startsAt ? new Date(d.startsAt) : null,
      endsAt: d.endsAt ? new Date(d.endsAt) : null,
    })
    .returning();

  res.status(201);
  respond(res, c.zBanner, mapBanner(row));
});

/* ---------- FAQs ---------- */

/** GET /api/admin/faqs — help-centre content, by position then id. */
adminRouter.get('/faqs', async (_req, res) => {
  const rows = await db.select().from(faqs).orderBy(faqs.position, faqs.id);
  respond(res, c.zFaqList, { items: rows.map(mapFaq), total: rows.length });
});

/** POST /api/admin/faqs — create an FAQ entry. */
adminRouter.post('/faqs', async (req, res) => {
  const input = c.zCreateFaqInput.safeParse(req.body ?? {});
  if (!input.success) {
    throw new HttpError(400, { error: 'validation_error', details: input.error.message });
  }
  const d = input.data;
  const [row] = await db
    .insert(faqs)
    .values({ category: d.category ?? null, question: d.question, answer: d.answer, position: d.position })
    .returning();

  res.status(201);
  respond(res, c.zFaq, mapFaq(row));
});

/* ---------- product questions (Q&A moderation) ---------- */

/**
 * GET /api/admin/questions — every listing question, newest first, with the
 * listing name. Unfiltered on purpose: this is the moderation queue, so
 * pending and hidden rows must be visible (they are exactly the ones a
 * moderator is looking for).
 */
adminRouter.get('/questions', async (_req, res) => {
  const rows = await db
    .select(adminQuestionCols)
    .from(productQuestions)
    .innerJoin(products, eq(productQuestions.productId, products.id))
    .orderBy(desc(productQuestions.createdAt), desc(productQuestions.id));
  respond(res, c.zAdminProductQuestionList, {
    items: rows.map(mapAdminProductQuestion),
    total: rows.length,
  });
});

/**
 * PATCH /api/admin/questions/:id — moderation: 'answered' publishes, 'hidden'
 * suppresses. Status is the ONLY field moderation writes: the answer the seller
 * wrote is kept in both directions, so un-hiding restores the original wording
 * instead of leaving a stub.
 *
 * Moderating an unanswered question to 'answered' is refused (409): publishing
 * it would put an empty answer in front of a buyer, and 'answered' is what makes
 * a question public — the seller has to actually answer first.
 */
adminRouter.patch('/questions/:id', async (req, res) => {
  const id = parseId(req);
  const input = c.zModerateQuestionInput.safeParse(req.body ?? {});
  if (!input.success) {
    throw new HttpError(400, { error: 'validation_error', details: input.error.message });
  }

  const [existing] = await db
    .select({ id: productQuestions.id, answer: productQuestions.answer })
    .from(productQuestions)
    .where(eq(productQuestions.id, id))
    .limit(1);
  if (!existing) throw new HttpError(404, { error: 'not_found' });
  if (input.data.status === 'answered' && (existing.answer == null || existing.answer.trim() === '')) {
    throw new HttpError(409, {
      error: 'unanswered_question',
      details: 'This question has no answer yet — the seller must answer it before it can be published.',
    });
  }

  await db.update(productQuestions).set({ status: input.data.status }).where(eq(productQuestions.id, id));

  const [row] = await db
    .select(adminQuestionCols)
    .from(productQuestions)
    .innerJoin(products, eq(productQuestions.productId, products.id))
    .where(eq(productQuestions.id, id))
    .limit(1);

  respond(res, c.zAdminProductQuestion, mapAdminProductQuestion(row));
});

/* ---------- support tickets ---------- */

/** GET /api/admin/tickets — every ticket, priority-agnostic, newest first. */
adminRouter.get('/tickets', async (_req, res) => {
  const rows = await db.select().from(supportTickets).orderBy(desc(supportTickets.id));
  respond(res, c.zSupportTicketList, { items: rows.map(mapSupportTicket), total: rows.length });
});

/** PATCH /api/admin/tickets — { id, status?, priority? } moves a ticket on. */
adminRouter.patch('/tickets', async (req, res) => {
  const input = c.zUpdateTicketInput.safeParse(req.body ?? {});
  if (!input.success) {
    throw new HttpError(400, { error: 'validation_error', details: input.error.message });
  }
  const { id, status, priority } = input.data;

  const [existing] = await db.select({ id: supportTickets.id }).from(supportTickets).where(eq(supportTickets.id, id)).limit(1);
  if (!existing) throw new HttpError(404, { error: 'not_found' });

  const patch: Record<string, unknown> = {};
  if (status !== undefined) patch.status = status;
  if (priority !== undefined) patch.priority = priority;
  if (Object.keys(patch).length > 0) {
    await db.update(supportTickets).set(patch).where(eq(supportTickets.id, id));
  }

  const [row] = await db.select().from(supportTickets).where(eq(supportTickets.id, id)).limit(1);
  respond(res, c.zSupportTicket, mapSupportTicket(row));
});
