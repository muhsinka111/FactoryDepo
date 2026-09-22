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
 *
 * Control plane (022, owner mandate "admin only can control"): an admin can edit
 * ANY listing (price included), pull one off the catalogue reversibly, delete one
 * outright, edit ANY supplier record, and read the resulting trail at
 * GET /api/admin/audit. Every one of those writes its `admin_audit` row in the
 * same transaction as the change it describes — see routes/adminAudit.ts for the
 * rules the trail obeys (real before/after from the stored row, no entry for a
 * change that did not happen).
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import { and, desc, eq, gte, ilike, isNotNull, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import * as c from '@workspace/api-zod';
// `adminAudit` comes straight from the schema package (see routes/adminAudit.ts):
// the local `./db.js` re-export seam is a shared file this wave does not touch.
import { adminAudit } from '@workspace/db';
import {
  db,
  banners,
  faqs,
  featureFlags,
  products,
  productQuestions,
  productViews,
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
  toIso,
  toNum,
  toNumOrNull,
} from '../http.js';
import { productColumns, queueEmail } from '../helpers.js';
import {
  actingAdminId,
  auditDiff,
  auditSnapshot,
  mapAdminAuditRow,
  recordAdminAction,
  submittedFields,
  type FieldKind,
} from './adminAudit.js';

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

/* ---------- shared: applying an admin patch ---------- */

/**
 * Turn a validated admin patch into DB column values. A pg `numeric` column is
 * written as a string (the convention POST/PATCH /api/products already uses) so
 * the value cannot pick up float formatting on the way in; every other column
 * takes the parsed value as it stands. Only the keys present are written — a
 * field the caller omitted is never touched, whatever the schema's `.default()`
 * would have produced for it.
 */
function columnSet(patch: Record<string, unknown>, numericCols: readonly string[]): Record<string, unknown> {
  const set: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    set[key] = numericCols.includes(key) && value !== null ? String(value) : value;
  }
  return set;
}

/* ---------- shared: pg error unwrapping ---------- */

/**
 * The pg error code + the table that blocked a delete, unwrapped from whatever
 * drizzle threw. Drizzle wraps the driver error in a `DrizzleQueryError` whose
 * own `code` is undefined — the pg fields (`code`, `constraint`, `table`) live on
 * `.cause`, so checking only the thrown error misses every FK violation and a
 * refused delete surfaces as a 500 instead of a 409.
 */
function pgError(err: unknown): { code?: string; table?: string } {
  let current: unknown = err;
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth += 1) {
    const candidate = current as { code?: unknown; constraint?: unknown; table?: unknown; cause?: unknown };
    if (typeof candidate.code === 'string') {
      // FK constraints are named `<table>_<column>_fkey` — the table is the half
      // of the name a human needs ("still referenced from saved_lots").
      const fromConstraint =
        typeof candidate.constraint === 'string' ? candidate.constraint.replace(/_[A-Za-z0-9]+_fkey$/, '') : undefined;
      const table = fromConstraint ?? (typeof candidate.table === 'string' ? candidate.table : undefined);
      return { code: candidate.code, table };
    }
    current = candidate.cause;
  }
  return {};
}

/* ---------- suppliers ---------- */

/**
 * The admin supplier projection: the directory row plus REAL per-status counts
 * over `supplier_docs`. It lives here once and every admin supplier response
 * uses it (list, attest, edit), so the control plane and the verification desk
 * can never disagree about a supplier's shape.
 */
const adminSupplierCols = {
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
};

/** The columns an admin may edit on a supplier, in the audit trail's terms. */
const supplierEditableCols = {
  id: suppliers.id,
  companyName: suppliers.companyName,
  country: suppliers.country,
  city: suppliers.city,
  addressLine: suppliers.addressLine,
  description: suppliers.description,
  contactEmail: suppliers.contactEmail,
  contactPhone: suppliers.contactPhone,
  website: suppliers.website,
  incoterms: suppliers.incoterms,
  leadTimeDays: suppliers.leadTimeDays,
  paymentTerms: suppliers.paymentTerms,
  logoMediaId: suppliers.logoMediaId,
  verifiedLevel: suppliers.verifiedLevel,
  tags: suppliers.tags,
};

/** How each editable supplier column is normalised for the trail. */
const supplierFieldKinds: Record<string, FieldKind> = {
  leadTimeDays: 'number',
  logoMediaId: 'number',
  verifiedLevel: 'number',
  tags: 'json',
};

/** GET /api/admin/suppliers — directory rows + real per-status doc counts. */
adminRouter.get('/suppliers', async (_req, res) => {
  const rows = await db
    .select(adminSupplierCols)
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
    .select(adminSupplierCols)
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

/**
 * PATCH /api/admin/suppliers/:id — edit ANY supplier record.
 *
 * The owner's control plane: the same fields a seller may publish about their own
 * shop (company name, address, contacts, incoterms, payment terms, logo) plus the
 * two a seller may NOT touch — `verifiedLevel` and `tags` — because they are the
 * desk's call, not the shop's claim.
 *
 * Same discipline as the listing patch: only the fields the caller actually sent,
 * `before`/`after` diffed from the STORED row (never from the body), the write and
 * its audit row in one transaction, and no audit row when nothing changed. A
 * supplier edit that quietly claimed a change it did not make would be evidence
 * of the opposite of what it is for.
 */
adminRouter.patch('/suppliers/:id', async (req, res) => {
  const id = parseId(req);
  const uid = actingAdminId(req);
  const raw = (req.body ?? {}) as Record<string, unknown>;
  const input = c.zAdminUpdateSupplierInput.safeParse(raw);
  if (!input.success) {
    throw new HttpError(400, { error: 'validation_error', details: input.error.message });
  }

  const [existing] = await db.select(supplierEditableCols).from(suppliers).where(eq(suppliers.id, id)).limit(1);
  if (!existing) throw new HttpError(404, { error: 'not_found' });

  const patch = submittedFields(input.data as Record<string, unknown>, raw);
  const diff = auditDiff(existing as Record<string, unknown>, patch, supplierFieldKinds);

  if (diff.changed.length > 0) {
    await db.transaction(async (tx) => {
      await tx.update(suppliers).set(columnSet(patch, [])).where(eq(suppliers.id, id));
      await recordAdminAction(
        {
          adminUserId: uid,
          action: 'supplier.update',
          entity: 'supplier',
          entityId: id,
          before: diff.before,
          after: diff.after,
        },
        tx,
      );
    });
  }

  const [row] = await db
    .select(adminSupplierCols)
    .from(suppliers)
    .innerJoin(users, eq(suppliers.userId, users.id))
    .where(eq(suppliers.id, id))
    .limit(1);
  if (!row) throw new HttpError(404, { error: 'not_found' });

  respond(res, c.zAdminSupplier, mapAdminSupplier(row));
});

/* ---------- listings ---------- */

/**
 * The admin listing projection: the frozen `zProduct` plus the moderation state
 * the console has to show. `pulledReason` is admin-side detail that `zProduct`
 * does not carry (the lib/** contracts are frozen for this change), so the
 * projection extends it HERE instead of widening the public product shape —
 * every row this emits is still a valid `zProduct`, so the public contract and
 * the admin one cannot disagree about the fields they share.
 */
const zAdminListing = c.zProduct.extend({
  moderationStatus: z.string().optional(),
  pulledReason: z.string().nullable().optional(),
});
const zAdminListingList = c.zProductList.extend({ items: z.array(zAdminListing) });

/** `zProduct` + the moderation columns — one projection for reads and writes. */
const adminListingCols = {
  ...productColumns,
  moderationStatus: products.moderationStatus,
  pulledReason: products.pulledReason,
};

/** How each editable listing column is normalised for the audit trail. */
const listingFieldKinds: Record<string, FieldKind> = {
  price: 'number',
  moq: 'number',
  quantityAvailable: 'number',
  leadTimeDays: 'number',
  spec: 'json',
};

/** The listing columns that are pg `numeric` — written back as strings. */
const listingNumericCols = ['price', 'moq', 'quantityAvailable'];

/** The fields a deleted listing is remembered by (the audit trail's `before`). */
const listingDeleteCols = [
  'name', 'category', 'price', 'currency', 'unit', 'moq', 'quantityAvailable',
  'originCountry', 'location', 'leadTimeDays', 'listingType', 'status',
  'moderationStatus', 'pulledReason', 'dataSource', 'imageKey', 'supplierId',
] as const;

/** Row → JSON for the admin listing projection. */
function mapAdminListing(
  p: Record<string, unknown>,
): c.Product & { moderationStatus: string; pulledReason: string | null } {
  return {
    ...mapProduct(p),
    moderationStatus: p.moderationStatus == null ? 'visible' : String(p.moderationStatus),
    pulledReason: p.pulledReason == null ? null : String(p.pulledReason),
  };
}

/** Re-read one listing (with its supplier join) for a mutation response. */
async function fetchAdminListing(id: number): Promise<Record<string, unknown> | null> {
  const [row] = await db
    .select(adminListingCols)
    .from(products)
    .innerJoin(suppliers, eq(products.supplierId, suppliers.id))
    .innerJoin(users, eq(suppliers.userId, users.id))
    .where(eq(products.id, id))
    .limit(1);
  return (row as Record<string, unknown> | undefined) ?? null;
}

/**
 * GET /api/admin/listings — the paginated catalogue, on the public query contract
 * plus the admin-only moderation view.
 *
 * `?moderation=visible|pulled` narrows the list to one moderation state, and an
 * unknown value is a 400 rather than a silently dropped filter (dropping it would
 * return MORE rows — which reads like data, not like a bug). `moderationStatus`
 * and `pulledReason` ride on every row so the console can show why a lot is off
 * the catalogue without a second request. Pagination is unchanged: 1-based
 * `page`, `pages` computed from the real total.
 */
adminRouter.get('/listings', async (req, res) => {
  const parsed = c.zProductListQuery.safeParse(req.query ?? {});
  if (!parsed.success) {
    throw new HttpError(400, { error: 'validation_error', details: parsed.error.message });
  }
  const { q, category, country, minPrice, maxPrice, hasImage, page, limit } = parsed.data;

  const moderation = typeof req.query.moderation === 'string' ? req.query.moderation : undefined;
  if (moderation !== undefined && moderation !== 'visible' && moderation !== 'pulled') {
    throw new HttpError(400, {
      error: 'validation_error',
      details: "moderation must be 'visible' or 'pulled'",
    });
  }

  const conds: ReturnType<typeof and>[] = [];
  if (q) conds.push(or(ilike(products.name, `%${q}%`), ilike(products.category, `%${q}%`)));
  if (category) conds.push(eq(products.category, category));
  if (country) conds.push(eq(products.originCountry, country));
  if (minPrice != null) conds.push(gte(products.price, String(minPrice)));
  if (maxPrice != null) conds.push(lte(products.price, String(maxPrice)));
  if (hasImage === 1) conds.push(isNotNull(products.imageKey));
  if (moderation) conds.push(eq(products.moderationStatus, moderation));
  const where = conds.length > 0 ? and(...conds) : undefined;

  const [totalRow, rows] = await Promise.all([
    db
      .select({ total: sql<number>`count(*)` })
      .from(products)
      .innerJoin(suppliers, eq(products.supplierId, suppliers.id))
      .innerJoin(users, eq(suppliers.userId, users.id))
      .where(where),
    db
      .select(adminListingCols)
      .from(products)
      .innerJoin(suppliers, eq(products.supplierId, suppliers.id))
      .innerJoin(users, eq(suppliers.userId, users.id))
      .where(where)
      .orderBy(desc(products.id))
      .limit(limit)
      .offset((page - 1) * limit),
  ]);

  const total = toNum(totalRow[0]?.total);
  respond(res, zAdminListingList, {
    items: rows.map(mapAdminListing),
    total,
    page,
    pages: Math.ceil(total / limit),
  });
});

/**
 * PATCH /api/admin/listings/:id — edit ANY listing, including its price.
 *
 * Only the fields the caller actually SENT are considered. The write schemas are
 * partials over shapes that carry `.default(...)`, so a parsed body can hold a
 * value the request never mentioned — writing it (or recording it) would put a
 * change in the audit trail that the admin never asked for.
 *
 * `before`/`after` are diffed from the row AS STORED against the validated patch,
 * so the trail can only state changes that happened; a patch that changes nothing
 * is a plain 200 and writes no audit row (an entry claiming a change would be the
 * exact lie this table exists to prevent). The write and its audit row commit in
 * one transaction: a listing can never be re-priced without the entry, and a
 * failed audit insert rolls the price back.
 */
adminRouter.patch('/listings/:id', async (req, res) => {
  const id = parseId(req);
  const uid = actingAdminId(req);
  const raw = (req.body ?? {}) as Record<string, unknown>;
  const input = c.zAdminUpdateListingInput.safeParse(raw);
  if (!input.success) {
    throw new HttpError(400, { error: 'validation_error', details: input.error.message });
  }

  const [existing] = await db
    .select(adminListingCols)
    .from(products)
    .innerJoin(suppliers, eq(products.supplierId, suppliers.id))
    .innerJoin(users, eq(suppliers.userId, users.id))
    .where(eq(products.id, id))
    .limit(1);
  if (!existing) throw new HttpError(404, { error: 'not_found' });

  const patch = submittedFields(input.data as Record<string, unknown>, raw);
  const diff = auditDiff(existing as Record<string, unknown>, patch, listingFieldKinds);

  if (diff.changed.length > 0) {
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx
        .update(products)
        .set({ ...columnSet(patch, listingNumericCols), updatedAt: now })
        .where(eq(products.id, id));
      await recordAdminAction(
        {
          adminUserId: uid,
          action: 'listing.update',
          entity: 'product',
          entityId: id,
          before: diff.before,
          after: diff.after,
        },
        tx,
      );
    });
  }

  const row = await fetchAdminListing(id);
  if (!row) throw new HttpError(404, { error: 'not_found' });
  respond(res, zAdminListing, mapAdminListing(row));
});

/**
 * POST /api/admin/listings/:id/pull — take a listing off the catalogue WITHOUT
 * destroying it: the row, its history and its media stay, the moderation state
 * flips to 'pulled' and the reason, the acting admin and the moment are stamped.
 * Restore is the reverse (below), so this is the reversible half of the owner's
 * "pull it off the catalogue" tool.
 *
 * Pulling an already-pulled listing is a 409 `already_pulled`: re-pulling would
 * overwrite the original reason and attribution, and the trail would then name
 * the second admin for the first admin's decision.
 *
 * NOTE: whether a pulled listing disappears from the PUBLIC catalogue is the read
 * side's rule, not this route's — see the read filter on GET /api/products. This
 * route only records the state.
 */
adminRouter.post('/listings/:id/pull', async (req, res) => {
  const id = parseId(req);
  const uid = actingAdminId(req);
  const input = c.zAdminPullListingInput.safeParse(req.body ?? {});
  if (!input.success) {
    throw new HttpError(400, { error: 'validation_error', details: input.error.message });
  }
  const { reason } = input.data;

  const [existing] = await db
    .select({
      id: products.id,
      moderationStatus: products.moderationStatus,
      pulledReason: products.pulledReason,
      pulledBy: products.pulledBy,
      pulledAt: products.pulledAt,
    })
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  if (!existing) throw new HttpError(404, { error: 'not_found' });
  if (existing.moderationStatus === 'pulled') {
    throw new HttpError(409, {
      error: 'already_pulled',
      details: 'This listing is already off the catalogue; restore it first if it should go back.',
    });
  }

  const pulledAt = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(products)
      .set({ moderationStatus: 'pulled', pulledReason: reason, pulledBy: uid, pulledAt, updatedAt: pulledAt })
      .where(eq(products.id, id));
    await recordAdminAction(
      {
        adminUserId: uid,
        action: 'listing.pull',
        entity: 'product',
        entityId: id,
        before: auditSnapshot(existing as Record<string, unknown>, ['moderationStatus', 'pulledReason', 'pulledBy', 'pulledAt']),
        after: auditSnapshot(
          { moderationStatus: 'pulled', pulledReason: reason, pulledBy: uid, pulledAt },
          ['moderationStatus', 'pulledReason', 'pulledBy', 'pulledAt'],
        ),
      },
      tx,
    );
  });

  const row = await fetchAdminListing(id);
  if (!row) throw new HttpError(404, { error: 'not_found' });
  respond(res, zAdminListing, mapAdminListing(row));
});

/**
 * POST /api/admin/listings/:id/restore — put a pulled listing back on the
 * catalogue and clear the pull stamps, so the row does not carry a reason for a
 * state it is no longer in.
 *
 * Restoring a listing that is not pulled is a 409 `not_pulled`: the caller is
 * acting on a state that is not there, and silently "restoring" would hide either
 * a stale console or a wrong id.
 */
adminRouter.post('/listings/:id/restore', async (req, res) => {
  const id = parseId(req);
  const uid = actingAdminId(req);

  const [existing] = await db
    .select({
      id: products.id,
      moderationStatus: products.moderationStatus,
      pulledReason: products.pulledReason,
      pulledBy: products.pulledBy,
      pulledAt: products.pulledAt,
    })
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  if (!existing) throw new HttpError(404, { error: 'not_found' });
  if (existing.moderationStatus !== 'pulled') {
    throw new HttpError(409, {
      error: 'not_pulled',
      details: 'This listing is not pulled — there is nothing to restore.',
    });
  }

  const clearedAt = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(products)
      .set({ moderationStatus: 'visible', pulledReason: null, pulledBy: null, pulledAt: null, updatedAt: clearedAt })
      .where(eq(products.id, id));
    await recordAdminAction(
      {
        adminUserId: uid,
        action: 'listing.restore',
        entity: 'product',
        entityId: id,
        before: auditSnapshot(existing as Record<string, unknown>, ['moderationStatus', 'pulledReason', 'pulledBy', 'pulledAt']),
        after: auditSnapshot(
          { moderationStatus: 'visible', pulledReason: null, pulledBy: null, pulledAt: null },
          ['moderationStatus', 'pulledReason', 'pulledBy', 'pulledAt'],
        ),
      },
      tx,
    );
  });

  const row = await fetchAdminListing(id);
  if (!row) throw new HttpError(404, { error: 'not_found' });
  respond(res, zAdminListing, mapAdminListing(row));
});

/**
 * DELETE /api/admin/listings/:id — delete a listing outright.
 *
 * The row's key fields are written into the audit trail's `before` first, because
 * after this the row is gone: the entry is the only remaining record of what was
 * deleted, by whom and when. `product_media` cascades with the row (FK), so an
 * uploaded gallery is not left orphaned.
 *
 * Two kinds of dependent row are treated differently, deliberately:
 *   - `product_views` is TELEMETRY ABOUT the listing (it records that the page was
 *     opened once), and its FK does not cascade — leaving it in place would make
 *     every listing that was ever displayed undeletable, so the view rows go with
 *     the listing and their count is recorded in the trail (`before.productViews`).
 *   - orders, offers, message threads and saved lots are OTHER PEOPLE'S records
 *     that depend on this listing. Their presence refuses the delete with 409
 *     `listing_in_use`, naming the table that blocked it: a delete that silently
 *     broke an order's history would be worse than a delete that fails.
 */
adminRouter.delete('/listings/:id', async (req, res) => {
  const id = parseId(req);
  const uid = actingAdminId(req);

  const [existing] = await db
    .select({
      name: products.name,
      category: products.category,
      price: products.price,
      currency: products.currency,
      unit: products.unit,
      moq: products.moq,
      quantityAvailable: products.quantityAvailable,
      originCountry: products.originCountry,
      location: products.location,
      leadTimeDays: products.leadTimeDays,
      listingType: products.listingType,
      status: products.status,
      moderationStatus: products.moderationStatus,
      pulledReason: products.pulledReason,
      dataSource: products.dataSource,
      imageKey: products.imageKey,
      supplierId: products.supplierId,
    })
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  if (!existing) throw new HttpError(404, { error: 'not_found' });

  // Read the view count before the teardown so the trail can record how much
  // telemetry went with the listing (the count is real; nothing is estimated).
  const [viewRow] = await db
    .select({ total: sql<number>`count(*)` })
    .from(productViews)
    .where(eq(productViews.productId, id));
  const recordedViews = toNum(viewRow?.total);

  try {
    await db.transaction(async (tx) => {
      // Telemetry about the listing goes with it (see the note above); this is
      // inside the transaction, so a delete refused further down leaves the
      // view rows exactly as they were.
      await tx.delete(productViews).where(eq(productViews.productId, id));
      await tx.delete(products).where(eq(products.id, id));
      await recordAdminAction(
        {
          adminUserId: uid,
          action: 'listing.delete',
          entity: 'product',
          entityId: id,
          before: {
            ...auditSnapshot(existing as Record<string, unknown>, listingDeleteCols, listingFieldKinds),
            productViews: recordedViews,
          },
          after: null,
        },
        tx,
      );
    });
  } catch (err) {
    // Referenced by a record that depends on this listing (order, offer, thread,
    // saved lot) — deleting would break someone else's history.
    const pg = pgError(err);
    if (pg.code === '23503') {
      throw new HttpError(409, {
        error: 'listing_in_use',
        details: pg.table
          ? `This listing is referenced by ${pg.table} — deleting it would break records that depend on it.`
          : 'This listing is referenced by existing orders, offers or messages.',
      });
    }
    throw err;
  }

  res.status(204).end();
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

/* ---------- audit trail ---------- */

/** Default/maximum page size for the trail: the console shows the recent past,
 *  and a bounded limit is what keeps an unbounded table readable. */
const AUDIT_DEFAULT_LIMIT = 50;
const AUDIT_MAX_LIMIT = 200;

/**
 * GET /api/admin/audit — what admins did, newest first.
 *
 * Every row is an `admin_audit` entry written by the transaction that made the
 * change (routes/adminAudit.ts), so this is a record of changes that ACTUALLY
 * happened, not of requests that were made. `adminName` is joined for display and
 * is null when the admin's account is gone — the entry survives the account, which
 * is the point of an audit trail.
 *
 * `?limit=` defaults to 50 and is capped at 200 (a cap, not a silent default:
 * `limit=1000` returns 200 rows AND says so through `total`). `?entity=` and
 * `?entityId=` narrow the trail to one subject's history — e.g.
 * `?entity=product&entityId=42` is "everything that ever happened to listing 42".
 * `total` is a real COUNT over the same filters, so it stays honest when the
 * request is capped.
 */
adminRouter.get('/audit', async (req, res) => {
  const limitRaw = typeof req.query.limit === 'string' ? req.query.limit.trim() : undefined;
  let limit = AUDIT_DEFAULT_LIMIT;
  if (limitRaw !== undefined && limitRaw !== '') {
    const parsedLimit = Number.parseInt(limitRaw, 10);
    if (!Number.isFinite(parsedLimit) || parsedLimit < 1) {
      throw new HttpError(400, {
        error: 'validation_error',
        details: 'limit must be a positive integer',
      });
    }
    limit = Math.min(parsedLimit, AUDIT_MAX_LIMIT);
  }

  const entityRaw = typeof req.query.entity === 'string' ? req.query.entity.trim() : undefined;
  const entity = entityRaw === '' ? undefined : entityRaw;

  const entityIdRaw = typeof req.query.entityId === 'string' ? req.query.entityId.trim() : undefined;
  let entityId: number | undefined;
  if (entityIdRaw !== undefined && entityIdRaw !== '') {
    const parsedEntityId = Number.parseInt(entityIdRaw, 10);
    if (!Number.isFinite(parsedEntityId)) {
      throw new HttpError(400, {
        error: 'validation_error',
        details: 'entityId must be an integer',
      });
    }
    entityId = parsedEntityId;
  }

  const conds: ReturnType<typeof and>[] = [];
  if (entity) conds.push(eq(adminAudit.entity, entity));
  if (entityId !== undefined) conds.push(eq(adminAudit.entityId, entityId));
  const where = conds.length > 0 ? and(...conds) : undefined;

  const [totalRow, rows] = await Promise.all([
    db.select({ total: sql<number>`count(*)` }).from(adminAudit).where(where),
    db
      .select({
        id: adminAudit.id,
        adminUserId: adminAudit.adminUserId,
        adminName: users.name,
        action: adminAudit.action,
        entity: adminAudit.entity,
        entityId: adminAudit.entityId,
        before: adminAudit.before,
        after: adminAudit.after,
        createdAt: adminAudit.createdAt,
      })
      .from(adminAudit)
      .leftJoin(users, eq(adminAudit.adminUserId, users.id))
      .where(where)
      .orderBy(desc(adminAudit.createdAt), desc(adminAudit.id))
      .limit(limit),
  ]);

  respond(res, c.zAdminAuditList, {
    items: rows.map(mapAdminAuditRow),
    total: toNum(totalRow[0]?.total),
  });
});
