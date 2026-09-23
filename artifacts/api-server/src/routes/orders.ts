import { Router } from 'express';
import { desc, eq, or, sql } from 'drizzle-orm';
import * as c from '@workspace/api-zod';
import { db, orders, products, productViews, quotes, rfqs, savedLots, suppliers, users } from '../db.js';
import { requireAuth } from '../auth.js';
import { HttpError, mapOrder, respond, toNum } from '../http.js';
import { seedShipmentForOrder } from './shipments.js';
import { callerContext, notify, queueEmail } from '../helpers.js';

export const ordersRouter = Router();

/**
 * Buy-now / dropshipping orders. Buyer creates an order against a product;
 * the price & MOQ are snapshotted at order time. GET /api/orders returns
 * every order the caller is party to — as buyer and/or as their supplier
 * profile's seller — each labelled side: 'buying' | 'selling'.
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

/**
 * POST /api/orders — authenticated user places a buy-now order.
 * Runs inside a transaction with SELECT ... FOR UPDATE on the product row so
 * concurrent buyers can't both pass the stock check against the same units:
 * the check, the insert, and the stock decrement all happen atomically.
 */
ordersRouter.post('/', requireAuth, async (req, res) => {
  const input = c.zCreateOrderInput.safeParse(req.body ?? {});
  if (!input.success) {
    throw new HttpError(400, { error: 'validation_error', details: input.error.message });
  }
  const uid = req.userId;
  if (uid == null) throw new HttpError(401, { error: 'auth_required' });

  const { productId, quantity, shippingName, shippingAddress, shippingCity, shippingCountry, shippingPhone, notes } = input.data;
  const qty = toNum(quantity);

  const { inserted, productName, supplierName, supplierUserId, supplierEmail } = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        productId: products.id,
        supplierId: products.supplierId,
        name: products.name,
        price: products.price,
        currency: products.currency,
        unit: products.unit,
        moq: products.moq,
        quantityAvailable: products.quantityAvailable,
        status: products.status,
        supplierName: suppliers.companyName,
        supplierUserId: suppliers.userId,
        supplierEmail: users.email,
      })
      .from(products)
      .innerJoin(suppliers, eq(products.supplierId, suppliers.id))
      .innerJoin(users, eq(suppliers.userId, users.id))
      .where(eq(products.id, productId))
      .for('update')
      .limit(1);

    if (!row) throw new HttpError(404, { error: 'not_found' });
    if (qty < toNum(row.moq)) {
      throw new HttpError(400, { error: 'below_moq', details: `Minimum order quantity is ${row.moq} ${row.unit}` });
    }
    const available = toNum(row.quantityAvailable);
    if (row.status === 'sold_out' || available < qty) {
      throw new HttpError(409, { error: 'insufficient_stock', details: `Only ${available} ${row.unit} available` });
    }

    const remaining = available - qty;
    await tx
      .update(products)
      .set({ quantityAvailable: String(remaining), status: remaining <= 0 ? 'sold_out' : row.status })
      .where(eq(products.id, row.productId));

    const [insertedRow] = await tx
      .insert(orders)
      .values({
        buyerId: uid,
        productId: row.productId,
        supplierId: row.supplierId,
        quantity: String(qty),
        unitPrice: String(row.price),
        currency: row.currency ?? 'USD',
        // Computed in Postgres (not JS float64) against the numeric(14,2) columns.
        total: sql`ROUND(${row.price}::numeric * ${qty}::numeric, 2)`,
        status: 'pending',
        shippingName,
        shippingAddress,
        shippingCity,
        shippingCountry,
        shippingPhone: shippingPhone ?? null,
        notes: notes ?? null,
      })
      .returning();

    return { inserted: insertedRow, productName: row.name, supplierName: row.supplierName, supplierUserId: row.supplierUserId, supplierEmail: row.supplierEmail };
  });

  // Every order gets a trackable shipment at step 0 (nothing reached yet), so
  // the supplier can advance milestones without a separate "create shipment"
  // call. Same transaction boundary as the order: a failed seed must not leave
  // an order that cannot be tracked.
  await seedShipmentForOrder(toNum(inserted?.id));

  // Best-effort side effects. Placing an order previously produced no
  // notification and no email at all, so a supplier could receive an order
  // without ever being told. Both helpers swallow their own errors, so a mail
  // or notification failure can never fail the order itself.
  const newOrderId = toNum(inserted?.id);
  if (newOrderId) {
    const buyer = await callerContext(uid);
    const total = inserted?.total;

    void notify({
      userId: supplierUserId,
      role: 'supplier',
      text: `New order #${newOrderId} for ${productName}`,
      type: 'order',
      link: '/orders',
    });
    void queueEmail({
      toEmail: supplierEmail,
      template: 'order-placed',
      payload: { orderId: newOrderId, productName, quantity: qty, total, currency: inserted?.currency },
    });
    if (buyer?.email) {
      void queueEmail({
        toEmail: buyer.email,
        template: 'order-placed',
        payload: { orderId: newOrderId, productName, quantity: qty, total, currency: inserted?.currency },
      });
    }
  }

  res.status(201);
  respond(
    res,
    c.zOrder,
    mapOrder({ ...inserted, productName, supplierName, side: 'buying' }),
  );
});

/** GET /api/orders — every order the caller is party to, each labelled side: 'buying' | 'selling'. */
ordersRouter.get('/', requireAuth, async (req, res) => {
  const uid = req.userId;
  if (uid == null) throw new HttpError(401, { error: 'auth_required' });

  const [me] = await db
    .select({ supplierId: suppliers.id })
    .from(users)
    .leftJoin(suppliers, eq(suppliers.userId, users.id))
    .where(eq(users.id, uid))
    .limit(1);
  if (!me) throw new HttpError(401, { error: 'auth_required' });

  const where =
    me.supplierId != null
      ? or(eq(orders.buyerId, uid), eq(orders.supplierId, me.supplierId))
      : eq(orders.buyerId, uid);

  const rows = await db
    .select(orderCols)
    .from(orders)
    .innerJoin(products, eq(orders.productId, products.id))
    .innerJoin(suppliers, eq(orders.supplierId, suppliers.id))
    .where(where)
    .orderBy(desc(orders.createdAt));

  const items = rows.map((r) => mapOrder({ ...r, side: r.buyerId === uid ? 'buying' : 'selling' }));
  respond(res, c.zOrderList, { items, total: items.length });
});

/**
 * GET /api/orders/stats — dashboard metrics (listings, offers, views, orders).
 *
 * The seller side of these figures is chosen by the caller's OWN supplier ROW,
 * not by the role name: the account that controls the console AND sells stock
 * (role 'admin' with a supplier row) must read its own shop's numbers here, and
 * a caller with no row is a buyer — the same rule GET /api/orders already uses.
 */
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

  const isSupplier = me.supplierId != null;

  // totalListings: products for suppliers, RFQs for buyers.
  const [listingsRow] = isSupplier
    ? await db.select({ n: sql<number>`count(*)` }).from(products).where(eq(products.supplierId, me.supplierId as number))
    : await db.select({ n: sql<number>`count(*)` }).from(rfqs).where(eq(rfqs.buyerId, uid));

  // activeOffers: quotes received (supplier) or quote count on buyer's RFQs.
  const [offersRow] = isSupplier
    ? await db.select({ n: sql<number>`count(*)` }).from(quotes).where(eq(quotes.supplierId, me.supplierId as number))
    : await db
        .select({ n: sql<number>`count(*)` })
        .from(quotes)
        .innerJoin(rfqs, eq(quotes.rfqId, rfqs.id))
        .where(eq(rfqs.buyerId, uid));

  // orders: caller's orders; soldItems: delivered+ orders for suppliers.
  const [ordersRow] = await db
    .select({ n: sql<number>`count(*)` })
    .from(orders)
    .where(isSupplier ? eq(orders.supplierId, me.supplierId as number) : eq(orders.buyerId, uid));

  const [soldRow] = isSupplier
    ? await db
        .select({ n: sql<number>`count(*)` })
        .from(orders)
        .where(sql`${orders.supplierId} = ${me.supplierId as number} AND ${orders.status} IN ('shipped','delivered')`)
    : await db.select({ n: sql<number>`0` }).from(orders).where(sql`false`);

  // totalViews is a REAL count of product_views rows for the caller's own scope:
  // a supplier's views are the views of their listings, a buyer's are the views
  // of the listings they saved. No rows yet → an honest 0.
  const [viewsRow] = isSupplier
    ? await db
        .select({ n: sql<number>`count(*)` })
        .from(productViews)
        .innerJoin(products, eq(productViews.productId, products.id))
        .where(eq(products.supplierId, me.supplierId as number))
    : await db
        .select({ n: sql<number>`count(*)` })
        .from(productViews)
        .innerJoin(savedLots, eq(productViews.productId, savedLots.productId))
        .where(eq(savedLots.userId, uid));

  respond(res, c.zDashboardStats, {
    totalListings: toNum(listingsRow?.n),
    activeOffers: toNum(offersRow?.n),
    totalViews: toNum(viewsRow?.n),
    orders: toNum(ordersRow?.n),
    soldItems: toNum(soldRow?.n),
  });
});
