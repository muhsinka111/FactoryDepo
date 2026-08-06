import { Router } from 'express';
import { desc, eq, sql } from 'drizzle-orm';
import * as c from '@workspace/api-zod';
import { db, products, suppliers, users } from '../db.js';
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
};

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
