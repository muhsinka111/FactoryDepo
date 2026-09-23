/**
 * routes/suppliers.ts — public supplier directory + the seller's OWN shop (022).
 *
 *   GET   /api/suppliers      : public directory (unchanged).
 *   GET   /api/suppliers/me   : the caller's own shop row — identity from the
 *                               token, never from a path or body id.
 *   PATCH /api/suppliers/me   : edit ONLY the caller's own row.
 *   GET   /api/suppliers/:id  : public profile (unchanged).
 *
 * `/me` is registered BEFORE `/:id` on purpose: Express matches in registration
 * order, so a later `/me` would be parsed as an id and 400 on every request.
 *
 * The shop routes are `requireAuth + requireSellerSurface`: a supplier gets in,
 * and so does an ADMIN that owns a supplier row (the official FactoryDepo seller
 * account controls both surfaces from one login — that row is what it edits,
 * never somebody else's). A buyer, or an admin with no supplier row, gets 403
 * (there is no shop to edit); an anonymous caller gets 401. A supplier with no
 * supplier row yet gets 404 `no_supplier` — this route does not auto-create one
 * (creating a public company record is `POST /api/me/become-supplier`'s job).
 *
 * NOT writable here: `verifiedLevel` (the desk's decision), `dataSource` (a
 * provenance fact, not an opinion) and `attestedAt/attestedBy` (audit columns).
 * The zod input has no field for them, so a request that tries is stripped
 * rather than honoured.
 */
import { Router } from 'express';
import { desc, eq, sql } from 'drizzle-orm';
import * as c from '@workspace/api-zod';
// `media` is re-exported by the schema package (022); src/db.ts is not one of
// this task's files, so the table is imported from there.
import { media } from '@workspace/db';
import { db, products, suppliers, users } from '../db.js';
import { requireAuth, requireSellerSurface } from '../auth.js';
import { HttpError, mapSupplier, parseId, respond, toNum } from '../http.js';

export const suppliersRouter = Router();

/** Subquery: product count per supplier. */
const productCounts = db
  .select({
    supplierId: products.supplierId,
    count: sql<number>`count(*)`.as('count'),
  })
  .from(products)
  .groupBy(products.supplierId)
  .as('product_counts');

/** Columns for list + detail (trustScore via users, productCount via subquery). */
const supplierCols = {
  id: suppliers.id,
  companyName: suppliers.companyName,
  country: suppliers.country,
  city: suppliers.city,
  description: suppliers.description,
  verifiedLevel: suppliers.verifiedLevel,
  rating: suppliers.rating,
  inspectionsCount: suppliers.inspectionsCount,
  fulfillmentRate: suppliers.fulfillmentRate,
  tags: suppliers.tags,
  since: suppliers.since,
  trustScore: users.trustScore,
  productCount: sql<number>`coalesce(${productCounts.count}, 0)`.as('productCount'),
  dataSource: suppliers.dataSource,
};

/**
 * The seller's OWN shop projection (022): every field they may edit, plus the
 * moderation/verification facts they may READ but not write, plus a real
 * listing count. `listingCount` is a COUNT over their products — a seller's
 * dashboard figure must never be an invented number.
 */
const shopCols = {
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
  dataSource: suppliers.dataSource,
  listingCount: sql<number>`coalesce(${productCounts.count}, 0)`.as('listingCount'),
};

/** Row → zMyShop. Optional fields stay null (rendered as "not stated"), never ''. */
function mapMyShop(s: Record<string, unknown>): c.MyShop {
  const str = (v: unknown): string | null => (v == null || v === '' ? null : String(v));
  return {
    id: toNum(s.id),
    companyName: String(s.companyName),
    country: String(s.country ?? ''),
    city: str(s.city),
    addressLine: str(s.addressLine),
    description: str(s.description),
    contactEmail: str(s.contactEmail),
    contactPhone: str(s.contactPhone),
    website: str(s.website),
    incoterms: str(s.incoterms),
    leadTimeDays: s.leadTimeDays == null ? null : toNum(s.leadTimeDays),
    paymentTerms: str(s.paymentTerms),
    logoMediaId: s.logoMediaId == null ? null : toNum(s.logoMediaId),
    verifiedLevel: toNum(s.verifiedLevel),
    dataSource: String(s.dataSource ?? 'platform'),
    listingCount: toNum(s.listingCount),
  };
}

/** The caller's own supplier row id, or null. */
async function ownSupplierIdOf(userId: number): Promise<number | null> {
  const [row] = await db
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(eq(suppliers.userId, userId))
    .limit(1);
  return row ? toNum(row.id) : null;
}

/** The caller's own shop row (with its listing count), or null. */
async function loadShop(supplierId: number): Promise<c.MyShop | null> {
  const [row] = await db
    .select(shopCols)
    .from(suppliers)
    .leftJoin(productCounts, eq(suppliers.id, productCounts.supplierId))
    .where(eq(suppliers.id, supplierId))
    .limit(1);
  return row ? mapMyShop(row) : null;
}

/** GET /api/suppliers — ordered verifiedLevel desc, rating desc. */
suppliersRouter.get('/', async (_req, res) => {
  const rows = await db
    .select({ ...supplierCols })
    .from(suppliers)
    .innerJoin(users, eq(suppliers.userId, users.id))
    .leftJoin(productCounts, eq(suppliers.id, productCounts.supplierId))
    .orderBy(desc(suppliers.verifiedLevel), desc(suppliers.rating));

  const [totalRow] = await db.select({ total: sql<number>`count(*)` }).from(suppliers);

  respond(res, c.zSupplierList, {
    items: rows.map(mapSupplier),
    total: toNum(totalRow?.total),
  });
});

/** GET /api/suppliers/me — the signed-in seller's own shop (identity from the token). */
suppliersRouter.get('/me', requireAuth, requireSellerSurface, async (req, res) => {
  const uid = req.userId;
  if (uid == null) throw new HttpError(401, { error: 'auth_required' });

  const supplierId = await ownSupplierIdOf(uid);
  if (supplierId == null) throw new HttpError(404, { error: 'no_supplier' });

  const shop = await loadShop(supplierId);
  if (!shop) throw new HttpError(404, { error: 'no_supplier' });
  respond(res, c.zMyShop, shop);
});

/**
 * PATCH /api/suppliers/me — edit the caller's own shop.
 *
 * There is no id in the path or the body: the token decides the row, so a
 * supplier can never edit another company's record through this route. Only the
 * fields present in `zUpdateShopProfileInput` are written; anything else
 * (verifiedLevel, dataSource, attestedAt/By, userId) is not accepted.
 */
suppliersRouter.patch('/me', requireAuth, requireSellerSurface, async (req, res) => {
  const input = c.zUpdateShopProfileInput.safeParse(req.body ?? {});
  if (!input.success) {
    throw new HttpError(400, { error: 'validation_error', details: input.error.message });
  }
  const uid = req.userId;
  if (uid == null) throw new HttpError(401, { error: 'auth_required' });

  const supplierId = await ownSupplierIdOf(uid);
  if (supplierId == null) throw new HttpError(404, { error: 'no_supplier' });

  const d = input.data;

  // A logo must be the seller's OWN upload — pointing the shop at someone else's
  // media id would publish a file they do not control.
  if (d.logoMediaId != null) {
    const [upload] = await db
      .select({ ownerUserId: media.ownerUserId })
      .from(media)
      .where(eq(media.id, d.logoMediaId))
      .limit(1);
    if (!upload) throw new HttpError(404, { error: 'not_found', details: 'Unknown media id.' });
    if (toNum(upload.ownerUserId) !== uid) {
      throw new HttpError(403, { error: 'forbidden', details: 'That upload belongs to another account.' });
    }
  }

  const patch: Record<string, unknown> = {};
  if (d.companyName !== undefined) patch.companyName = d.companyName;
  if (d.country !== undefined) patch.country = d.country;
  if (d.city !== undefined) patch.city = d.city;
  if (d.addressLine !== undefined) patch.addressLine = d.addressLine;
  if (d.description !== undefined) patch.description = d.description;
  if (d.contactEmail !== undefined) patch.contactEmail = d.contactEmail;
  if (d.contactPhone !== undefined) patch.contactPhone = d.contactPhone;
  if (d.website !== undefined) patch.website = d.website;
  if (d.incoterms !== undefined) patch.incoterms = d.incoterms;
  if (d.leadTimeDays !== undefined) patch.leadTimeDays = d.leadTimeDays;
  if (d.paymentTerms !== undefined) patch.paymentTerms = d.paymentTerms;
  if (d.logoMediaId !== undefined) patch.logoMediaId = d.logoMediaId;

  if (Object.keys(patch).length > 0) {
    await db.update(suppliers).set(patch).where(eq(suppliers.id, supplierId));
  }

  const shop = await loadShop(supplierId);
  if (!shop) throw new HttpError(404, { error: 'no_supplier' });
  respond(res, c.zMyShop, shop);
});

/** GET /api/suppliers/:id */
suppliersRouter.get('/:id', async (req, res) => {
  const id = parseId(req);
  const [row] = await db
    .select({ ...supplierCols })
    .from(suppliers)
    .innerJoin(users, eq(suppliers.userId, users.id))
    .leftJoin(productCounts, eq(suppliers.id, productCounts.supplierId))
    .where(eq(suppliers.id, id))
    .limit(1);
  if (!row) throw new HttpError(404, { error: 'not_found' });
  respond(res, c.zSupplier, mapSupplier(row));
});
