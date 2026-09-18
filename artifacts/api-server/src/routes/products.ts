/**
 * routes/products.ts — public catalog reads plus supplier-owned listing CRUD.
 *
 * Access rules
 *  - GET    /api/products       : public (anonymous allowed) — unchanged.
 *  - GET    /api/products/:id   : public; best-effort `product_views` insert.
 *  - POST   /api/products       : supplier only. The seller is ALWAYS the
 *                                 caller's own supplier row — `supplierId` is
 *                                 not accepted from the body. New listings are
 *                                 real supply, so `dataSource` is 'platform'
 *                                 (only seed/import code writes 'demo').
 *  - PATCH  /api/products/:id   : supplier only AND the row's supplierId must be
 *                                 the caller's own supplierId → 403 otherwise.
 *                                 A supplier can never edit another supplier's
 *                                 listing.
 *  - DELETE /api/products/:id   : same ownership rule as PATCH.
 */
import { Router } from 'express';
import { and, desc, eq, gte, ilike, lte, or, sql } from 'drizzle-orm';
import * as c from '@workspace/api-zod';
import { db, products, productViews, suppliers, users } from '../db.js';
import { requireAuth, requireRole, verifyToken } from '../auth.js';
import { HttpError, mapProduct, parseId, respond, toNum } from '../http.js';
import { callerContext, productColumns } from '../helpers.js';

export const productsRouter = Router();

/** Columns for list + detail (supplierName via suppliers, trustScore via users). */
const productCols = productColumns;

/**
 * Resolve the caller's own supplier row for a listing mutation. Returns null
 * for a caller with no supplier profile — the caller must then 403.
 */
async function ownSupplier(userId: number): Promise<{ id: number; verifiedLevel: number; country: string | null } | null> {
  const [row] = await db
    .select({ id: suppliers.id, verifiedLevel: suppliers.verifiedLevel, country: suppliers.country })
    .from(suppliers)
    .where(eq(suppliers.userId, userId))
    .limit(1);
  return row
    ? { id: toNum(row.id), verifiedLevel: toNum(row.verifiedLevel), country: row.country == null ? null : String(row.country) }
    : null;
}

/**
 * GET /api/products — q/category/country/minPrice/maxPrice filters + pagination.
 *
 * `mine=1` (same 0/1 numeric-boolean convention as `hasImage`) scopes the list to
 * the caller's OWN supplier row and therefore requires a token. A caller without
 * a supplier profile gets an empty list — returning the whole catalogue under a
 * "my listings" filter would be a leak, not a convenience. With `mine` absent or
 * 0 the route is public and byte-identical to before.
 */
productsRouter.get('/', async (req, res) => {
  const parsed = c.zProductListQuery.safeParse(req.query ?? {});
  if (!parsed.success) {
    throw new HttpError(400, { error: 'validation_error', details: parsed.error.message });
  }
  const { q, category, listingType, country, minPrice, maxPrice, hasImage, mine, page, limit } = parsed.data;

  // `mine` is validated by the same schema as everything else; it arrives in
  // parsed.data, not as a raw string.
  const ownOnly = mine === 1 || String((req.query as Record<string, unknown>)['mine'] ?? '') === '1';

  let scopedSupplierId: number | null = null;
  if (ownOnly) {
    const auth = req.headers.authorization;
    const token = typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    const uid = req.userId ?? (token ? verifyToken(token)?.sub : undefined);
    if (uid == null) throw new HttpError(401, { error: 'auth_required' });

    const ctx = await callerContext(uid);
    if (!ctx) throw new HttpError(401, { error: 'auth_required' });
    if (ctx.supplierId == null) {
      respond(res, c.zProductList, { items: [], total: 0, page, pages: 0 });
      return;
    }
    scopedSupplierId = ctx.supplierId;
  }

  const conds: ReturnType<typeof and>[] = [];
  if (scopedSupplierId != null) conds.push(eq(products.supplierId, scopedSupplierId));
  if (q) {
    conds.push(
      or(
        ilike(products.name, `%${q}%`),
        ilike(products.category, `%${q}%`),
        ilike(products.description, `%${q}%`),
      ),
    );
  }
  if (category) conds.push(eq(products.category, category));
  if (listingType) conds.push(eq(products.listingType, listingType));
  if (country) conds.push(eq(products.originCountry, country));
  if (minPrice != null) conds.push(gte(products.price, String(minPrice)));
  if (maxPrice != null) conds.push(lte(products.price, String(maxPrice)));
  if (hasImage === 1) conds.push(sql`${products.imageKey} IS NOT NULL`);
  const where = conds.length > 0 ? and(...conds) : undefined;

  const [totalRow, rows] = await Promise.all([
    db
      .select({ total: sql<number>`count(*)` })
      .from(products)
      .innerJoin(suppliers, eq(products.supplierId, suppliers.id))
      .innerJoin(users, eq(suppliers.userId, users.id))
      .where(where),
    db
      .select(productCols)
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

/**
 * GET /api/products/categories — live listing counts per category.
 *
 * Declared BEFORE `/:id` so the literal "categories" is never parsed as a
 * product id. The UI uses these real counts to offer only categories that
 * actually hold stock, so no filter can lead to an empty results page.
 */
productsRouter.get('/categories', async (_req, res) => {
  const rows = await db
    .select({ category: products.category, n: sql<number>`count(*)` })
    .from(products)
    .groupBy(products.category)
    .orderBy(desc(sql`count(*)`));
  const items = rows
    .map((r) => ({ category: r.category, count: toNum(r.n) }))
    .filter((r) => r.count > 0);
  respond(res, c.zCategoryCountList, { items, total: items.reduce((n, r) => n + r.count, 0) });
});

/**
 * POST /api/products — supplier creates a listing under their own supplier row.
 * The body can never name a supplier: `supplierId` comes from the caller.
 */
productsRouter.post('/', requireAuth, requireRole('supplier'), async (req, res) => {
  const input = c.zCreateProductInput.safeParse(req.body ?? {});
  if (!input.success) {
    throw new HttpError(400, { error: 'validation_error', details: input.error.message });
  }
  const uid = req.userId;
  if (uid == null) throw new HttpError(401, { error: 'auth_required' });

  const mine = await ownSupplier(uid);
  if (!mine) throw new HttpError(403, { error: 'forbidden', details: 'No supplier profile for this account.' });

  const {
    name,
    category,
    description,
    spec,
    price,
    currency,
    unit,
    moq,
    originCountry,
    purityGrade,
    imageKey,
    quantityAvailable,
    status,
    listingType,
  } = input.data;

  // Origin defaults to the supplier's own registered country — never invented.
  const origin = originCountry ?? mine.country ?? '';
  if (!origin) {
    throw new HttpError(400, { error: 'validation_error', details: 'originCountry is required (no supplier country on file).' });
  }

  const [inserted] = await db
    .insert(products)
    .values({
      supplierId: mine.id,
      name,
      category,
      description: description ?? null,
      spec: spec ?? [],
      // numeric(14,2) columns take strings — no JS float math on money.
      price: String(price),
      currency,
      unit,
      moq: String(moq),
      originCountry: origin,
      purityGrade: purityGrade ?? null,
      // A newly created listing has not been inspected yet; verification is a
      // separate admin act (see routes/admin.ts), it is never self-granted.
      verified: false,
      imageKey: imageKey ?? null,
      quantityAvailable: String(quantityAvailable),
      status,
      listingType,
      // Real user-created supply. Only seed/import code writes 'demo'.
      dataSource: 'platform',
    })
    .returning({ id: products.id });

  const [row] = await db
    .select(productCols)
    .from(products)
    .innerJoin(suppliers, eq(products.supplierId, suppliers.id))
    .innerJoin(users, eq(suppliers.userId, users.id))
    .where(eq(products.id, toNum(inserted?.id)))
    .limit(1);

  res.status(201);
  respond(res, c.zProduct, mapProduct(row));
});

/** GET /api/products/:id — public detail; view tracking is best-effort. */
productsRouter.get('/:id', async (req, res) => {
  const id = parseId(req);
  const [row] = await db
    .select(productCols)
    .from(products)
    .innerJoin(suppliers, eq(products.supplierId, suppliers.id))
    .innerJoin(users, eq(suppliers.userId, users.id))
    .where(eq(products.id, id))
    .limit(1);
  if (!row) throw new HttpError(404, { error: 'not_found' });

  // Honest `totalViews` needs real rows to count. Anonymous browsing stores a
  // NULL userId. Recording a view must NEVER fail the read.
  try {
    const auth = req.headers.authorization;
    const token = typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    const payload = token ? verifyToken(token) : null;
    await db.insert(productViews).values({ productId: id, userId: payload?.sub ?? null });
  } catch (err) {
    console.error('[products] view tracking failed (ignored):', err instanceof Error ? err.message : String(err));
  }

  respond(res, c.zProduct, mapProduct(row));
});

/**
 * PATCH /api/products/:id — supplier edits their OWN listing.
 * Ownership, not role: a supplier whose row id differs from the listing's
 * supplierId gets 403 even though they hold a valid supplier token.
 */
productsRouter.patch('/:id', requireAuth, requireRole('supplier'), async (req, res) => {
  const id = parseId(req);
  const input = c.zUpdateProductInput.safeParse(req.body ?? {});
  if (!input.success) {
    throw new HttpError(400, { error: 'validation_error', details: input.error.message });
  }
  const uid = req.userId;
  if (uid == null) throw new HttpError(401, { error: 'auth_required' });

  const mine = await ownSupplier(uid);
  if (!mine) throw new HttpError(403, { error: 'forbidden', details: 'No supplier profile for this account.' });

  const [existing] = await db
    .select({ id: products.id, supplierId: products.supplierId })
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  if (!existing) throw new HttpError(404, { error: 'not_found' });
  if (toNum(existing.supplierId) !== mine.id) {
    throw new HttpError(403, { error: 'forbidden', details: 'This listing belongs to another supplier.' });
  }

  const patch: Record<string, unknown> = {};
  const d = input.data;
  if (d.name !== undefined) patch.name = d.name;
  if (d.category !== undefined) patch.category = d.category;
  if (d.description !== undefined) patch.description = d.description;
  if (d.spec !== undefined) patch.spec = d.spec;
  if (d.price !== undefined) patch.price = String(d.price);
  if (d.currency !== undefined) patch.currency = d.currency;
  if (d.unit !== undefined) patch.unit = d.unit;
  if (d.moq !== undefined) patch.moq = String(d.moq);
  if (d.originCountry !== undefined) patch.originCountry = d.originCountry;
  if (d.purityGrade !== undefined) patch.purityGrade = d.purityGrade;
  if (d.imageKey !== undefined) patch.imageKey = d.imageKey;
  if (d.quantityAvailable !== undefined) patch.quantityAvailable = String(d.quantityAvailable);
  if (d.status !== undefined) patch.status = d.status;
  if (d.listingType !== undefined) patch.listingType = d.listingType;
  // Never patchable here: supplierId, dataSource, verified (admin/seed only).

  if (Object.keys(patch).length > 0) {
    await db.update(products).set(patch).where(and(eq(products.id, id), eq(products.supplierId, mine.id)));
  }

  const [row] = await db
    .select(productCols)
    .from(products)
    .innerJoin(suppliers, eq(products.supplierId, suppliers.id))
    .innerJoin(users, eq(suppliers.userId, users.id))
    .where(eq(products.id, id))
    .limit(1);

  respond(res, c.zProduct, mapProduct(row));
});

/**
 * DELETE /api/products/:id — supplier deletes their OWN listing.
 * The DELETE is scoped by supplierId too, so even a race that slipped past the
 * pre-check cannot delete another supplier's row.
 */
productsRouter.delete('/:id', requireAuth, requireRole('supplier'), async (req, res) => {
  const id = parseId(req);
  const uid = req.userId;
  if (uid == null) throw new HttpError(401, { error: 'auth_required' });

  const mine = await ownSupplier(uid);
  if (!mine) throw new HttpError(403, { error: 'forbidden', details: 'No supplier profile for this account.' });

  const [existing] = await db
    .select({ id: products.id, supplierId: products.supplierId })
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  if (!existing) throw new HttpError(404, { error: 'not_found' });
  if (toNum(existing.supplierId) !== mine.id) {
    throw new HttpError(403, { error: 'forbidden', details: 'This listing belongs to another supplier.' });
  }

  try {
    await db.delete(products).where(and(eq(products.id, id), eq(products.supplierId, mine.id)));
  } catch (err) {
    // Referenced by an order/offer/RFQ-flow row — deleting would break history.
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === '23503') {
      throw new HttpError(409, { error: 'listing_in_use', details: 'This listing is referenced by existing orders or offers.' });
    }
    throw err;
  }

  res.status(204).end();
});
