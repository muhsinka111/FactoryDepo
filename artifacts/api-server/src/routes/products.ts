import { Router } from 'express';
import { and, desc, eq, gte, ilike, lte, or, sql } from 'drizzle-orm';
import * as c from '@workspace/api-zod';
import { db, products, suppliers, users } from '../db.js';
import { HttpError, mapProduct, parseId, respond, toNum } from '../http.js';

export const productsRouter = Router();

/** Columns for list + detail (supplierName via suppliers, trustScore via users). */
const productCols = {
  id: products.id,
  supplierId: products.supplierId,
  supplierName: suppliers.companyName,
  name: products.name,
  category: products.category,
  description: products.description,
  spec: products.spec,
  price: products.price,
  currency: products.currency,
  unit: products.unit,
  moq: products.moq,
  originCountry: products.originCountry,
  purityGrade: products.purityGrade,
  verified: products.verified,
  trustScore: users.trustScore,
  imageKey: products.imageKey,
  createdAt: products.createdAt,
};

/** GET /api/products — q/category/country/minPrice/maxPrice filters + pagination. */
productsRouter.get('/', async (req, res) => {
  const parsed = c.zProductListQuery.safeParse(req.query ?? {});
  if (!parsed.success) {
    throw new HttpError(400, { error: 'validation_error', details: parsed.error.message });
  }
  const { q, category, country, minPrice, maxPrice, hasImage, page, limit } = parsed.data;

  const conds: ReturnType<typeof and>[] = [];
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

/** GET /api/products/:id */
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
  respond(res, c.zProduct, mapProduct(row));
});
