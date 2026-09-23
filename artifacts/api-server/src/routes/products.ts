/**
 * routes/products.ts — public catalog reads plus supplier-owned listing CRUD.
 *
 * Access rules
 *  - GET    /api/products       : public (anonymous allowed) — unchanged.
 *  - GET    /api/products/:id   : public; best-effort `product_views` insert.
 *  - POST   /api/products       : seller surface (a supplier, or an admin that
 *                                 owns a supplier row — `requireSellerSurface`).
 *                                 The seller is ALWAYS the caller's own supplier
 *                                 row — `supplierId` is not accepted from the
 *                                 body. New listings are real supply, so
 *                                 `dataSource` is 'platform' (only seed/import
 *                                 code writes 'demo').
 *  - PATCH  /api/products/:id   : seller surface AND the row's supplierId must be
 *                                 the caller's own supplierId → 403 otherwise.
 *                                 A supplier can never edit another supplier's
 *                                 listing. An admin may edit any listing; a
 *                                 PULLED listing (022) is refused with 409
 *                                 `listing_pulled` for everyone except an admin.
 *  - DELETE /api/products/:id   : same ownership rule as PATCH; the seller gate
 *                                 (`requireSellerSurface`) decides who may try.
 *  - GET    /api/products/:id/questions           : public; visibility depends
 *                                 on who is asking (see the route).
 *  - POST   /api/products/:id/questions           : any signed-in caller.
 *  - POST   /api/products/:id/questions/:qid/answer : ONLY the supplier who owns
 *                                 the listing, or an admin → 403 otherwise
 *                                 (including the asker answering themselves).
 *  - POST   /api/products/:id/media               : attach an uploaded photo
 *                                 (022) to a listing the caller owns, or any
 *                                 listing as an admin → 403 otherwise.
 *  - DELETE /api/products/:id/media/:mediaId      : detach, same ownership rule.
 *
 * Moderation plane (022): a listing whose `moderationStatus` is 'pulled' leaves
 * the public catalogue — it is filtered out of the list, its detail 404s, and it
 * cannot be edited by its seller — while the owning supplier and any admin keep
 * seeing it (with `moderationStatus`, and the reason if one was recorded), so a
 * seller can find out why their lot vanished instead of assuming a bug.
 */
import { Router } from 'express';
import type { Request } from 'express';
import { and, desc, eq, gte, ilike, inArray, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import * as c from '@workspace/api-zod';
// `media` / `product_media` (022) are re-exported by the schema package;
// src/db.ts is not one of this task's files, so they are imported here.
import { media, productMedia } from '@workspace/db';
import { db, products, productQuestions, productViews, suppliers, users } from '../db.js';
import { requireAuth, requireSellerSurface, verifyToken } from '../auth.js';
import { HttpError, mapProduct, mapProductQuestion, parseId, parseParamId, respond, toNum } from '../http.js';
import { callerContext, productColumns, type CallerContext } from '../helpers.js';
import { mediaColumnsNoBytes, mediaRef } from './media.js';

export const productsRouter = Router();

/**
 * Best-effort caller for a PUBLIC route: a valid Bearer token resolves the
 * caller, anything else (absent, expired, forged) is treated as anonymous.
 * A public read must never 401 because a stale token is sitting in
 * localStorage — the anonymous view is simply the smaller one.
 */
async function optionalCaller(req: Request): Promise<CallerContext | null> {
  const auth = req.headers.authorization;
  const token = typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const payload = token ? verifyToken(token) : null;
  if (!payload) return null;
  return callerContext(payload.sub);
}

/**
 * Columns for list + detail (supplierName via suppliers, trustScore via users),
 * plus the 022 listing extras. `productColumns` (helpers.ts) carries the
 * pre-022 projection, so the new columns are spread on here.
 */
const productCols = {
  ...productColumns,
  location: products.location,
  leadTimeDays: products.leadTimeDays,
  moderationStatus: products.moderationStatus,
  pulledReason: products.pulledReason,
};

/**
 * The owner/admin view of a listing: `zProduct` plus the moderation reason.
 * `zProduct` deliberately has no `pulledReason` (it is moderation state, not
 * catalogue copy), so it is declared here and used only for a caller who is the
 * owning supplier or an admin. The public shape stays exactly `c.zProduct`.
 */
const zProductModerated = c.zProduct.extend({ pulledReason: z.string().nullable().optional() });

/** `moderationStatus` is NOT NULL with a 'visible' default — tolerate an old row. */
function moderationOf(row: Record<string, unknown>): string {
  const v = row.moderationStatus;
  return v == null ? 'visible' : String(v);
}

/** True when this listing has been pulled from the public catalogue (022). */
function isPulled(row: Record<string, unknown>): boolean {
  return moderationOf(row) === 'pulled';
}

/**
 * Map a product row to the API shape, adding the 022 extras. `mapProduct`
 * (http.ts) owns the pre-022 projection; the gallery and moderation fields are
 * layered on here because both the list and the detail response need them.
 *
 * `mediaRefs` is only passed by the DETAIL route — a list of 50 rows must not
 * fire 50 gallery queries (the list omits the gallery by design).
 */
function mapListing(
  row: Record<string, unknown>,
  opts: { mediaRefs?: c.MediaRef[]; includePulledReason?: boolean } = {},
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    ...mapProduct(row),
    location: row.location == null ? null : String(row.location),
    leadTimeDays: row.leadTimeDays == null ? null : toNum(row.leadTimeDays),
    moderationStatus: moderationOf(row),
  };
  if (opts.mediaRefs) out.media = opts.mediaRefs;
  if (opts.includePulledReason) {
    out.pulledReason = row.pulledReason == null ? null : String(row.pulledReason);
  }
  return out;
}

/**
 * Ordered gallery for a set of listings, keyed by product id. One query for the
 * whole page instead of one per row; rows come back in `position` order, which
 * is the order the seller attached them (the first is the cover).
 */
async function fetchGallery(productIds: number[]): Promise<Map<number, c.MediaRef[]>> {
  const byProduct = new Map<number, c.MediaRef[]>();
  if (productIds.length === 0) return byProduct;
  const rows = await db
    .select({ productId: productMedia.productId, ...mediaColumnsNoBytes })
    .from(productMedia)
    .innerJoin(media, eq(productMedia.mediaId, media.id))
    .where(inArray(productMedia.productId, productIds))
    .orderBy(productMedia.productId, productMedia.position, productMedia.id);
  for (const r of rows) {
    const pid = toNum(r.productId);
    const list = byProduct.get(pid) ?? [];
    list.push(mediaRef(r));
    byProduct.set(pid, list);
  }
  return byProduct;
}

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
  const { q, category, listingType, country, minPrice, maxPrice, supplierId, hasImage, mine, page, limit } =
    parsed.data;

  // The caller (if any) drives two things: `mine=1` scoping and whether pulled
  // listings are visible. `optionalCaller` never turns a public read into a 401
  // — an absent/expired/forged token is simply the anonymous caller.
  const ctx = await optionalCaller(req);

  // `mine` is validated by the same schema as everything else; it arrives in
  // parsed.data, not as a raw string.
  const ownOnly = mine === 1 || String((req.query as Record<string, unknown>)['mine'] ?? '') === '1';

  let scopedSupplierId: number | null = null;
  if (ownOnly) {
    if (!ctx) throw new HttpError(401, { error: 'auth_required' });
    if (ctx.supplierId == null) {
      respond(res, c.zProductList, { items: [], total: 0, page, pages: 0 });
      return;
    }
    scopedSupplierId = ctx.supplierId;
  }

  /**
   * Pulled listings (022) leave the PUBLIC catalogue: a listing that 404s on its
   * own detail URL must not still be browsable in the list. The owning supplier
   * (a list scoped to their own row) and any admin keep seeing them, so a seller
   * can find out why a lot vanished instead of assuming a bug.
   */
  const seesPulled =
    ctx != null &&
    (ctx.isAdmin ||
      (ctx.supplierId != null && (scopedSupplierId === ctx.supplierId || supplierId === ctx.supplierId)));

  const conds: ReturnType<typeof and>[] = [];
  if (!seesPulled) conds.push(sql`coalesce(${products.moderationStatus}, 'visible') <> 'pulled'`);
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
  // Alias-aware market filter: a request for either spelling of a market matches
  // EVERY spelling of it, so the count the market strip advertises is the number
  // of rows its own link returns (and a listing published with the long form
  // from `COUNTRIES` is reachable from the code-based link).
  if (country) {
    const group = marketSpellings(country);
    conds.push(
      group.length > 1 ? inArray(products.originCountry, group) : eq(products.originCountry, group[0]),
    );
  }
  // Public per-supplier scope. `mine` wins when both are present (a supplier
  // asking for its own listings must never be widened by a body-supplied id).
  if (supplierId != null && scopedSupplierId == null) conds.push(eq(products.supplierId, supplierId));
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
    // The list omits the gallery on purpose (one query per row for a 50-row
    // page); location / lead time / moderation state ride along.
    items: rows.map((r) => mapListing(r)),
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
    // Pulled rows are out of the public catalogue, so they must be out of the
    // counts too — otherwise a chip promises rows its own filter no longer
    // returns (the exact mismatch the market strip was fixed for).
    .where(sql`coalesce(${products.moderationStatus}, 'visible') <> 'pulled'`)
    .groupBy(products.category)
    .orderBy(desc(sql`count(*)`));
  const items = rows
    .map((r) => ({ category: r.category, count: toNum(r.n) }))
    .filter((r) => r.count > 0);
  respond(res, c.zCategoryCountList, { items, total: items.reduce((n, r) => n + r.count, 0) });
});

/**
 * Name → market code. The catalogue stores a mix of codes and names for the
 * same market ('TR' and 'Türkiye', 'CN' and 'China'), so counting raw values
 * would split a market across rows and under-report it. Only true synonyms are
 * merged; anything unrecognised (including the deliberate 'Global' bucket) keeps
 * its literal value rather than being forced into a country.
 *
 * The counts route AND the `country` filter both read this one map: if they
 * disagree, the header strip advertises a figure whose own link cannot return
 * it (measured once: strip 'TR 29' → `?country=TR` → 13 rows).
 */
const COUNTRY_ALIASES: Record<string, string> = {
  türkiye: 'TR', turkey: 'TR', tr: 'TR',
  china: 'CN', cn: 'CN',
  usa: 'US', us: 'US', 'united states': 'US',
  germany: 'DE', de: 'DE',
  netherlands: 'NL', nl: 'NL',
  italy: 'IT', it: 'IT',
  spain: 'ES', es: 'ES',
  poland: 'PL', pl: 'PL',
  france: 'FR', fr: 'FR',
  'united kingdom': 'GB', uk: 'GB', gb: 'GB',
};

/** The market a stored/requested origin value belongs to — its code, or itself. */
function marketKey(value: string): string {
  const raw = value.trim();
  return COUNTRY_ALIASES[raw.toLowerCase()] ?? raw;
}

/**
 * Every catalogue spelling that belongs to the same market as `value`.
 *
 * One market, several spellings: the supplier publish form writes the long name
 * from `COUNTRIES` ('Türkiye') while the market strip links the code ('TR'), so
 * a filter for either has to match both — otherwise a real listing is
 * unreachable, or a count promises rows its own link does not return.
 *
 * An unrecognised value returns exactly itself, so its filter stays a literal
 * exact match: 'Global' is a bucket, never a country to be widened into one.
 */
function marketSpellings(value: string): string[] {
  const trimmed = value.trim();
  const key = trimmed ? COUNTRY_ALIASES[trimmed.toLowerCase()] : undefined;
  if (!key) return [value];

  // Stored rows are not case-consistent ('Türkiye', 'china'), so the group
  // carries each alias in the casings a publisher could plausibly have written.
  const spellings = new Set<string>([key, trimmed]);
  for (const alias of Object.keys(COUNTRY_ALIASES)) {
    if (COUNTRY_ALIASES[alias] !== key) continue;
    spellings.add(alias);
    spellings.add(alias.charAt(0).toUpperCase() + alias.slice(1));
    spellings.add(alias.toUpperCase());
  }
  return [...spellings];
}

/**
 * GET /api/products/countries — live listing counts per origin market, used by
 * the header's market strip. Declared BEFORE `/:id` so "countries" is never
 * parsed as a product id. Counts are real; a market with no stock is simply
 * absent from the list, never shown as a guess.
 *
 * This route is the single source of truth for market sizes: every count it
 * emits is what `GET /api/products?country=<that market>` returns, because both
 * sides go through `marketKey` / `marketSpellings`.
 */
productsRouter.get('/countries', async (_req, res) => {
  const rows = await db
    .select({ country: products.originCountry, n: sql<number>`count(*)` })
    .from(products)
    // Same rule as /categories: a pulled listing is not in the catalogue this
    // count describes (Σ /countries must equal Σ ?country=<each item>).
    .where(sql`coalesce(${products.moderationStatus}, 'visible') <> 'pulled'`)
    .groupBy(products.originCountry);
  const merged = new Map<string, number>();
  for (const r of rows) {
    const raw = String(r.country ?? '').trim();
    if (!raw) continue;
    const key = marketKey(raw);
    merged.set(key, (merged.get(key) ?? 0) + toNum(r.n));
  }
  const items = [...merged.entries()]
    .map(([country, count]) => ({ country, count }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);
  respond(res, c.zCountryCountList, { items, total: items.reduce((n, r) => n + r.count, 0) });
});

/**
 * GET /api/products/catalogue-state — how much of the catalogue is real.
 *
 * Every catalogue-wide claim in the interface ("everything here is demo data")
 * is computed from this, never hardcoded: the moment the owner publishes one
 * real listing, the notice must disappear on its own. Counts follow the same
 * visibility rule as /categories and /countries (a pulled listing is not in the
 * catalogue the claim describes).
 */
productsRouter.get('/catalogue-state', async (_req, res) => {
  const rows = await db
    .select({ dataSource: products.dataSource, supplierId: products.supplierId, n: sql<number>`count(*)` })
    .from(products)
    .where(sql`coalesce(${products.moderationStatus}, 'visible') <> 'pulled'`)
    .groupBy(products.dataSource, products.supplierId);
  let real = 0;
  let demo = 0;
  const sellers = new Set<number>();
  for (const r of rows) {
    const n = toNum(r.n);
    if (String(r.dataSource) === 'demo') demo += n;
    else real += n;
    if (r.supplierId != null) sellers.add(Number(r.supplierId));
  }
  respond(res, c.zCatalogueState, {
    listings: real + demo,
    realListings: real,
    demoListings: demo,
    sellers: sellers.size,
  });
});

/**
 * POST /api/products — the caller creates a listing under their own supplier row.
 * The body can never name a supplier: `supplierId` comes from the caller. The
 * gate is `requireSellerSurface`, so the admin account that owns a shop can
 * publish here too — as itself, never under the row named in the body.
 */
productsRouter.post('/', requireAuth, requireSellerSurface, async (req, res) => {
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
    location,
    leadTimeDays,
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
      // 022: seller-declared stock location and lead time. Both optional — a
      // listing without them says "not stated" instead of a guessed value.
      location: location ?? null,
      leadTimeDays: leadTimeDays ?? null,
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
  // A brand-new listing has no uploaded photos yet — an empty array, not an
  // absent field, so the client can render the gallery slot without guessing.
  respond(res, c.zProduct, mapListing(row, { mediaRefs: [] }));
});

/**
 * GET /api/products/:id — public detail; view tracking is best-effort.
 *
 * Visibility (022): a pulled listing 404s for the public — the same shape an
 * unknown id gets — while the supplier who owns it and any admin still read it,
 * with `moderationStatus` (and the recorded reason) attached. The owner/admin
 * response also carries the ordered gallery; the public one carries it too, since
 * the photos are the listing's published content.
 */
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

  const ctx = await optionalCaller(req);
  const ownsListing = ctx?.supplierId != null && ctx.supplierId === toNum(row.supplierId);
  const privileged = ctx != null && (ctx.isAdmin || ownsListing);
  if (isPulled(row) && !privileged) throw new HttpError(404, { error: 'not_found' });

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

  const gallery = await fetchGallery([id]);
  respond(
    res,
    privileged ? zProductModerated : c.zProduct,
    mapListing(row, { mediaRefs: gallery.get(id) ?? [], includePulledReason: privileged }),
  );
});

/* ---------------------------------------------------------------------------
 * Product Q&A — "ask the seller a question".
 *
 * The listing page builds its FAQ out of these rows: a buyer asks, the seller
 * answers, and only an ANSWERED question is public. A question is never
 * published by the asker, and it is never answered by the asker.
 * ------------------------------------------------------------------------ */

/** Newest-first cap for one listing's Q&A. `total` reports the uncapped count. */
const QUESTION_CAP = 100;

/**
 * GET /api/products/:id/questions — PUBLIC. Visibility is a property of the
 * caller, not of the route:
 *
 *   anonymous                → answered questions only;
 *   any signed-in caller     → answered, plus their OWN pending questions;
 *   owning supplier / admin  → everything, including hidden ones.
 *
 * A `hidden` row is omitted even for its asker — suppression is a moderation
 * decision, and echoing it back to the asker would defeat it. The response
 * carries no `askerId`, so a pending question is visible to its author without
 * exposing who else asked what.
 */
productsRouter.get('/:id/questions', async (req, res) => {
  const id = parseId(req);

  const [product] = await db
    .select({ id: products.id, supplierId: products.supplierId })
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  if (!product) throw new HttpError(404, { error: 'not_found' });

  const ctx = await optionalCaller(req);
  const ownsListing = ctx?.supplierId != null && ctx.supplierId === toNum(product.supplierId);
  const seesEverything = ctx != null && (ctx.isAdmin || ownsListing);

  const conds: ReturnType<typeof and>[] = [eq(productQuestions.productId, id)];
  if (!seesEverything) {
    conds.push(
      ctx
        ? or(
            eq(productQuestions.status, 'answered'),
            and(eq(productQuestions.askerId, ctx.userId), eq(productQuestions.status, 'pending')),
          )
        : eq(productQuestions.status, 'answered'),
    );
  }
  const where = and(...conds);

  const [countRow, rows] = await Promise.all([
    db.select({ total: sql<number>`count(*)` }).from(productQuestions).where(where),
    db
      .select()
      .from(productQuestions)
      .where(where)
      .orderBy(desc(productQuestions.createdAt), desc(productQuestions.id))
      .limit(QUESTION_CAP),
  ]);

  respond(res, c.zProductQuestionList, {
    items: rows.map(mapProductQuestion),
    total: toNum(countRow[0]?.total),
  });
});

/**
 * POST /api/products/:id/questions — ask the seller a question. Any signed-in
 * caller may ask; an unknown listing is a 404.
 *
 * The row is always `pending` and always `platform`: publishing an answer is
 * the seller's act, and a question asked through the API is real buying
 * interest (only seed/import code may ever write 'demo').
 */
productsRouter.post('/:id/questions', requireAuth, async (req, res) => {
  const id = parseId(req);
  const input = c.zCreateProductQuestionInput.safeParse(req.body ?? {});
  if (!input.success) {
    throw new HttpError(400, { error: 'validation_error', details: input.error.message });
  }
  const uid = req.userId;
  if (uid == null) throw new HttpError(401, { error: 'auth_required' });

  const [product] = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  if (!product) throw new HttpError(404, { error: 'not_found' });

  const ctx = await callerContext(uid);
  if (!ctx) throw new HttpError(401, { error: 'auth_required' });

  const [row] = await db
    .insert(productQuestions)
    .values({
      productId: id,
      askerId: ctx.userId,
      // Snapshot: a later rename must not relabel an already-asked question.
      askerName: ctx.name,
      question: input.data.question,
      status: 'pending',
      dataSource: 'platform',
    })
    .returning();

  res.status(201);
  respond(res, c.zProductQuestion, mapProductQuestion(row));
});

/**
 * POST /api/products/:id/questions/:qid/answer — the seller answers.
 *
 * Ownership, not role: the caller must be the supplier whose row owns THIS
 * listing, or an admin. A supplier who does not own the listing gets 403, and
 * so does the asker answering their own question — a Q&A where the buyer writes
 * both halves is worth nothing to a sourcing manager.
 *
 * The answer is stamped with who wrote it and when, and flips the row to
 * `answered` in the same UPDATE, so a question can never be 'answered' with an
 * empty answer text.
 */
productsRouter.post('/:id/questions/:qid/answer', requireAuth, async (req, res) => {
  const id = parseId(req);
  const qid = parseParamId(req, 'qid');
  const input = c.zAnswerProductQuestionInput.safeParse(req.body ?? {});
  if (!input.success) {
    throw new HttpError(400, { error: 'validation_error', details: input.error.message });
  }
  const uid = req.userId;
  if (uid == null) throw new HttpError(401, { error: 'auth_required' });

  const [product] = await db
    .select({ id: products.id, supplierId: products.supplierId })
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  if (!product) throw new HttpError(404, { error: 'not_found' });

  const ctx = await callerContext(uid);
  if (!ctx) throw new HttpError(401, { error: 'auth_required' });

  const ownsListing = ctx.supplierId != null && ctx.supplierId === toNum(product.supplierId);
  if (!ownsListing && !ctx.isAdmin) {
    throw new HttpError(403, {
      error: 'forbidden',
      details: 'Only the supplier who owns this listing (or an admin) can answer its questions.',
    });
  }

  const [existing] = await db
    .select({ id: productQuestions.id })
    .from(productQuestions)
    .where(and(eq(productQuestions.id, qid), eq(productQuestions.productId, id)))
    .limit(1);
  if (!existing) throw new HttpError(404, { error: 'not_found' });

  const [row] = await db
    .update(productQuestions)
    .set({
      answer: input.data.answer,
      answeredById: ctx.userId,
      // On a listing the seller IS the company, so the answer is attributed to
      // the supplier's company name (same source as product.supplierName); an
      // admin moderating a listing answers under their own name.
      answeredByName: ctx.supplierName ?? ctx.name,
      answeredAt: new Date(),
      status: 'answered',
    })
    .where(and(eq(productQuestions.id, qid), eq(productQuestions.productId, id)))
    .returning();

  respond(res, c.zProductQuestion, mapProductQuestion(row));
});

/* ---------------------------------------------------------------------------
 * Listing gallery (022) — attach / detach an uploaded photo.
 *
 * Ownership, not role, on both sides:
 *   - the listing must belong to the caller's OWN supplier row (an admin may act
 *     on any listing; a plain buyer has no supplier row and gets 403);
 *   - the media row must be the caller's OWN upload (an admin may attach any
 *     upload).
 * A photo is never copied: `product_media` links the one `media` row, so the
 * same upload can serve several listings and detaching one listing does not
 * destroy the file for the others.
 * ------------------------------------------------------------------------ */

/** Next gallery slot: max(position) + 1, so the array keeps attach order. */
async function nextGalleryPosition(productId: number): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`coalesce(max(${productMedia.position}), -1)` })
    .from(productMedia)
    .where(eq(productMedia.productId, productId));
  return toNum(row?.n) + 1;
}

/**
 * POST /api/products/:id/media — attach one of the caller's uploaded photos.
 * Idempotent: attaching the same photo twice returns the existing gallery entry
 * instead of putting the same photo in the list twice.
 */
productsRouter.post('/:id/media', requireAuth, async (req, res) => {
  const id = parseId(req);
  const input = c.zAttachProductMediaInput.safeParse(req.body ?? {});
  if (!input.success) {
    throw new HttpError(400, { error: 'validation_error', details: input.error.message });
  }
  const uid = req.userId;
  if (uid == null) throw new HttpError(401, { error: 'auth_required' });

  const ctx = await callerContext(uid);
  if (!ctx) throw new HttpError(401, { error: 'auth_required' });

  const [product] = await db
    .select({ id: products.id, supplierId: products.supplierId })
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  if (!product) throw new HttpError(404, { error: 'not_found' });

  const ownsListing = ctx.supplierId != null && ctx.supplierId === toNum(product.supplierId);
  if (!ownsListing && !ctx.isAdmin) {
    throw new HttpError(403, {
      error: 'forbidden',
      details: 'Only the supplier who owns this listing (or an admin) can attach photos to it.',
    });
  }

  const [upload] = await db
    .select(mediaColumnsNoBytes)
    .from(media)
    .where(eq(media.id, input.data.mediaId))
    .limit(1);
  // An unknown upload is a 404 — the order of checks means a caller who does not
  // own the listing learns nothing about which media ids exist.
  if (!upload) throw new HttpError(404, { error: 'not_found' });
  if (toNum(upload.ownerUserId) !== ctx.userId && !ctx.isAdmin) {
    throw new HttpError(403, { error: 'forbidden', details: 'That upload belongs to another account.' });
  }

  const [already] = await db
    .select({ id: productMedia.id })
    .from(productMedia)
    .where(and(eq(productMedia.productId, id), eq(productMedia.mediaId, input.data.mediaId)))
    .limit(1);
  if (!already) {
    await db.insert(productMedia).values({
      productId: id,
      mediaId: input.data.mediaId,
      position: await nextGalleryPosition(id),
    });
  }

  respond(res, c.zMediaRef, mediaRef(upload));
});

/**
 * DELETE /api/products/:id/media/:mediaId — detach a photo from a listing.
 *
 * The gallery row is the link; the upload itself is only deleted when nothing
 * else points at it (no other listing, no shop logo) — and only by the account
 * that uploaded it, so an admin detaching someone else's photo does not destroy
 * that seller's file. A media id that is not attached to this listing is a 404.
 */
productsRouter.delete('/:id/media/:mediaId', requireAuth, async (req, res) => {
  const id = parseId(req);
  const mediaId = parseParamId(req, 'mediaId');
  const uid = req.userId;
  if (uid == null) throw new HttpError(401, { error: 'auth_required' });

  const ctx = await callerContext(uid);
  if (!ctx) throw new HttpError(401, { error: 'auth_required' });

  const [product] = await db
    .select({ id: products.id, supplierId: products.supplierId })
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  if (!product) throw new HttpError(404, { error: 'not_found' });

  const ownsListing = ctx.supplierId != null && ctx.supplierId === toNum(product.supplierId);
  if (!ownsListing && !ctx.isAdmin) {
    throw new HttpError(403, {
      error: 'forbidden',
      details: 'Only the supplier who owns this listing (or an admin) can detach its photos.',
    });
  }

  const [link] = await db
    .select({ id: productMedia.id })
    .from(productMedia)
    .where(and(eq(productMedia.productId, id), eq(productMedia.mediaId, mediaId)))
    .limit(1);
  if (!link) throw new HttpError(404, { error: 'not_found' });

  await db.delete(productMedia).where(eq(productMedia.id, toNum(link.id)));

  const [stillLinked] = await db
    .select({ n: sql<number>`count(*)` })
    .from(productMedia)
    .where(eq(productMedia.mediaId, mediaId));
  const [asLogo] = await db
    .select({ n: sql<number>`count(*)` })
    .from(suppliers)
    .where(eq(suppliers.logoMediaId, mediaId));
  if (toNum(stillLinked?.n) === 0 && toNum(asLogo?.n) === 0) {
    const [upload] = await db
      .select({ ownerUserId: media.ownerUserId })
      .from(media)
      .where(eq(media.id, mediaId))
      .limit(1);
    if (upload && toNum(upload.ownerUserId) === ctx.userId) {
      await db.delete(media).where(eq(media.id, mediaId));
    }
  }

  res.status(204).end();
});

/**
 * PATCH /api/products/:id — supplier edits their OWN listing.
 * Ownership, not role: a supplier whose row id differs from the listing's
 * supplierId gets 403 even though they hold a valid supplier token. An admin may
 * edit any listing (that is how the admin console corrects a wrong price), and
 * only an admin may edit a listing that has been PULLED — for its seller a pulled
 * listing is locked with 409 `listing_pulled`, because a moderation decision is
 * not something the moderated party silently overrides.
 */
productsRouter.patch('/:id', requireAuth, async (req, res) => {
  const id = parseId(req);
  const input = c.zUpdateProductInput.safeParse(req.body ?? {});
  if (!input.success) {
    throw new HttpError(400, { error: 'validation_error', details: input.error.message });
  }
  const uid = req.userId;
  if (uid == null) throw new HttpError(401, { error: 'auth_required' });

  const ctx = await callerContext(uid);
  if (!ctx) throw new HttpError(401, { error: 'auth_required' });

  // A buyer (no supplier profile, not an admin) is not an editor: 403.
  const mine = await ownSupplier(uid);
  if (!mine && !ctx.isAdmin) {
    throw new HttpError(403, { error: 'forbidden', details: 'No supplier profile for this account.' });
  }

  const [existing] = await db
    .select({ id: products.id, supplierId: products.supplierId, moderationStatus: products.moderationStatus })
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  if (!existing) throw new HttpError(404, { error: 'not_found' });
  const ownsListing = mine != null && toNum(existing.supplierId) === mine.id;
  if (!ownsListing && !ctx.isAdmin) {
    throw new HttpError(403, { error: 'forbidden', details: 'This listing belongs to another supplier.' });
  }
  // A pulled listing is frozen for its seller: the fix is a conversation with the
  // desk, not an edit that erases the moderation state. An admin may still edit
  // (and unpull) it.
  if (isPulled(existing) && !ctx.isAdmin) {
    throw new HttpError(409, {
      error: 'listing_pulled',
      details: 'This listing was pulled from the catalogue and cannot be edited. Contact the FactoryDepo desk.',
    });
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
  // 022: where the stock sits and how fast it ships — seller-editable.
  if (d.location !== undefined) patch.location = d.location;
  if (d.leadTimeDays !== undefined) patch.leadTimeDays = d.leadTimeDays;
  // Never patchable here: supplierId, dataSource, verified, moderationStatus /
  // pulledReason / pulledBy / pulledAt (the moderation plane is an admin act).

  if (Object.keys(patch).length > 0) {
    patch.updatedAt = new Date();
    const scope =
      ctx.isAdmin || mine == null
        ? eq(products.id, id)
        : and(eq(products.id, id), eq(products.supplierId, mine.id));
    await db.update(products).set(patch).where(scope);
  }

  const [row] = await db
    .select(productCols)
    .from(products)
    .innerJoin(suppliers, eq(products.supplierId, suppliers.id))
    .innerJoin(users, eq(suppliers.userId, users.id))
    .where(eq(products.id, id))
    .limit(1);

  const gallery = await fetchGallery([id]);
  respond(
    res,
    ctx.isAdmin || ownsListing ? zProductModerated : c.zProduct,
    mapListing(row, {
      mediaRefs: gallery.get(id) ?? [],
      includePulledReason: ctx.isAdmin || ownsListing,
    }),
  );
});

/**
 * DELETE /api/products/:id — the caller deletes their OWN listing.
 * The DELETE is scoped by supplierId too, so even a race that slipped past the
 * pre-check cannot delete another supplier's row. The id comes from
 * `requireSellerSurface` (the caller's own row, resolved from the token) with a
 * direct lookup as the fallback for a supplier the gate admitted without one.
 */
productsRouter.delete('/:id', requireAuth, requireSellerSurface, async (req, res) => {
  const id = parseId(req);
  const uid = req.userId;
  if (uid == null) throw new HttpError(401, { error: 'auth_required' });

  const mineId = req.supplierId ?? (await ownSupplier(uid))?.id ?? null;
  if (mineId == null) throw new HttpError(403, { error: 'forbidden', details: 'No supplier profile for this account.' });

  const [existing] = await db
    .select({ id: products.id, supplierId: products.supplierId })
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  if (!existing) throw new HttpError(404, { error: 'not_found' });
  if (toNum(existing.supplierId) !== mineId) {
    throw new HttpError(403, { error: 'forbidden', details: 'This listing belongs to another supplier.' });
  }

  try {
    // The listing's own telemetry goes with it. `product_views` is a counter
    // ABOUT this listing (not a record belonging to someone else) and its FK has
    // no ON DELETE CASCADE, so without this a listing that was ever opened could
    // never be deleted by its owner.
    await db.delete(productViews).where(eq(productViews.productId, id));
    await db.delete(products).where(and(eq(products.id, id), eq(products.supplierId, mineId)));
  } catch (err) {
    // Referenced by an order/offer/thread/saved-lot — deleting would break a
    // record that belongs to another party. Drizzle wraps the driver error
    // (DrizzleQueryError), so the pg code has to be read from `cause` too;
    // reading only the wrapper turned this into a 500.
    const code =
      (err as { code?: string } | null)?.code ??
      (err as { cause?: { code?: string } } | null)?.cause?.code;
    if (code === '23503') {
      throw new HttpError(409, { error: 'listing_in_use', details: 'This listing is referenced by existing orders or offers.' });
    }
    throw err;
  }

  res.status(204).end();
});
