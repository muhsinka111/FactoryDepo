import { Router } from 'express';
import { and, count, desc, eq, sql } from 'drizzle-orm';
import * as c from '@workspace/api-zod';
import { db, orders, products, quotes, rfqs, suppliers, users } from '../db.js';
import { requireAuth } from '../auth.js';
import { HttpError, mapOrder, respond, toNum } from '../http.js';

export const ordersRouter = Router();

/**
 * Buy-now / dropshipping orders. Buyer creates an order against a product;
 * the price & MOQ are snapshotted at order time. GET /api/orders returns the
 * caller's own orders (buyer sees purchases; supplier sees incoming orders).
 */

const orderCols = {
  id: orders.id,
  buyerId: orders.buyerId,
  productId: orders.productId,
  supplierId: orders.supplierId,
  productName: products.name,
  supplierName: suppliers.companyName,
  quantity: orders.quantity,
  unitPrice: orders.unitPrice,
  currency: orders.currency,
  total: orders.total,
  status: orders.status,
  shippingName: orders.shippingName,
  shippingAddress: orders.shippingAddress,
  shippingCity: orders.shippingCity,
  shippingCountry: orders.shippingCountry,
  shippingPhone: orders.shippingPhone,
  notes: orders.notes,
  createdAt: orders.createdAt,
};

/** POST /api/orders — authenticated user (buyer or supplier) places a buy-now order. */
ordersRouter.post('/', requireAuth, async (req, res) => {
  const input = c.zCreateOrderInput.safeParse(req.body ?? {});
  if (!input.success) {
    throw new HttpError(400, { error: 'validation_error', details: input.error.message });
  }
  const uid = req.userId;
  if (uid == null) throw new HttpError(401, { error: 'auth_required' });

  const { productId, quantity, shippingName, shippingAddress, shippingCity, shippingCountry, shippingPhone, notes } = input.data;

  // Load product + its supplier with price/MOQ snapshot.
  const [row] = await db
    .select({
      productId: products.id,
      supplierId: products.supplierId,
      name: products.name,
      price: products.price,
      currency: products.currency,
      unit: products.unit,
      moq: products.moq,
      supplierName: suppliers.companyName,
    })
    .from(products)
    .innerJoin(suppliers, eq(products.supplierId, suppliers.id))
    .where(eq(products.id, productId))
    .limit(1);

  if (!row) throw new HttpError(404, { error: 'not_found' });
  if (toNum(quantity) < toNum(row.moq)) {
    throw new HttpError(400, { error: 'below_moq', details: `Minimum order quantity is ${row.moq} ${row.unit}` });
  }

  const unitPrice = toNum(row.price);
  const total = Number((unitPrice * toNum(quantity)).toFixed(2));

  const [inserted] = await db
    .insert(orders)
    .values({
      buyerId: uid,
      productId: row.productId,
      supplierId: row.supplierId,
      quantity: String(quantity),
      unitPrice: String(unitPrice),
      currency: row.currency ?? 'USD',
      total: String(total),
      status: 'pending',
      shippingName,
      shippingAddress,
      shippingCity,
      shippingCountry,
      shippingPhone: shippingPhone ?? null,
      notes: notes ?? null,
    })
    .returning();

  res.status(201);
  respond(
    res,
    c.zOrder,
    mapOrder({ ...inserted, productName: row.name, supplierName: row.supplierName }),
  );
});

/** GET /api/orders — caller's own orders (buyer: purchases; supplier: incoming). */
ordersRouter.get('/', requireAuth, async (req, res) => {
  const uid = req.userId;
  if (uid == null) throw new HttpError(401, { error: 'auth_required' });

  // Resolve role: supplier sees orders where their supplier profile is the seller.
  const [me] = await db
    .select({ role: users.role, supplierId: suppliers.id })
    .from(users)
    .leftJoin(suppliers, eq(suppliers.userId, users.id))
    .where(eq(users.id, uid))
    .limit(1);
  if (!me) throw new HttpError(401, { error: 'auth_required' });

  const isSupplier = me.role === 'supplier' && me.supplierId != null;
  const where = isSupplier ? eq(orders.supplierId, me.supplierId as number) : eq(orders.buyerId, uid);

  const rows = await db
    .select(orderCols)
    .from(orders)
    .innerJoin(products, eq(orders.productId, products.id))
    .innerJoin(suppliers, eq(orders.supplierId, suppliers.id))
    .where(where)
    .orderBy(desc(orders.createdAt));

  respond(res, c.zOrderList, { items: rows.map(mapOrder), total: rows.length });
});

/** GET /api/orders/stats — dashboard metrics (listings, offers, views, orders). */
ordersRouter.get('/stats', requireAuth, async (req, res) => {
  const uid = req.userId;
  if (uid == null) throw new HttpError(401, { error: 'auth_required' });

  const [me] = await db
    .select({ role: users.role, supplierId: suppliers.id })
    .from(users)
    .leftJoin(suppliers, eq(suppliers.userId, users.id))
    .where(eq(users.id, uid))
    .limit(1);
  if (!me) throw new HttpError(401, { error: 'auth_required' });

  const isSupplier = me.role === 'supplier' && me.supplierId != null;

  // totalListings: products for suppliers, RFQs for buyers.
  const [listingsRow] = isSupplier
    ? await db.select({ n: count() }).from(products).where(eq(products.supplierId, me.supplierId as number))
    : await db.select({ n: count() }).from(rfqs).where(eq(rfqs.buyerId, uid));

  // activeOffers: quotes received (supplier) or quote count on buyer's RFQs.
  const [offersRow] = isSupplier
    ? await db.select({ n: count() }).from(quotes).where(eq(quotes.supplierId, me.supplierId as number))
    : await db
        .select({ n: count() })
        .from(quotes)
        .innerJoin(rfqs, eq(quotes.rfqId, rfqs.id))
        .where(eq(rfqs.buyerId, uid));

  // orders: caller's orders; soldItems: delivered+ orders for suppliers.
  const [ordersRow] = await db
    .select({ n: count() })
    .from(orders)
    .where(isSupplier ? eq(orders.supplierId, me.supplierId as number) : eq(orders.buyerId, uid));

  const [soldRow] = isSupplier
    ? await db
        .select({ n: count() })
        .from(orders)
        .where(and(eq(orders.supplierId, me.supplierId as number), sql`${orders.status} IN ('shipped','delivered')`))
    : await db.select({ n: sql<number>`0` }).from(orders).where(sql`false`);

  respond(res, c.zDashboardStats, {
    totalListings: toNum(listingsRow?.n),
    activeOffers: toNum(offersRow?.n),
    totalViews: 0, // honest: view tracking not implemented yet
    orders: toNum(ordersRow?.n),
    soldItems: toNum(soldRow?.n),
  });
});
