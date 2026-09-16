/**
 * routes/shipments.ts — milestone-tracked fulfilment for an order.
 *
 * Access rules
 *  - GET  /api/shipments            : role-aware. A buyer sees the shipments of
 *                                     their own orders; a supplier sees the
 *                                     shipments of orders placed against their
 *                                     OWN supplier row; an admin sees all.
 *  - POST /api/shipments/:id/advance: the order's buyer, the order's supplier or
 *                                     an admin. Increments `step` by one and,
 *                                     when the last milestone is reached, moves
 *                                     the order to 'delivered'. One transaction.
 *
 * A shipment row is seeded when an order is placed (routes/orders.ts) and is
 * also created lazily here, so an order placed before this code shipped still
 * has a trackable shipment and `milestones.length` always defines "how many
 * steps until delivered".
 */
import { Router } from 'express';
import { and, desc, eq, sql } from 'drizzle-orm';
import * as c from '@workspace/api-zod';
import { db, orders, products, shipments, suppliers, users } from '../db.js';
import { requireAuth } from '../auth.js';
import { HttpError, mapShipment, parseId, respond, toJson, toNum } from '../http.js';
import { callerContext, notify, queueEmail, type Executor } from '../helpers.js';

export const shipmentsRouter = Router();

/**
 * Default milestone ladder for a new shipment. `zShipment.step` counts reached
 * milestones, so step 0 = nothing done yet and step === milestones.length means
 * the goods are delivered.
 */
export const DEFAULT_MILESTONES = [
  'Order confirmed',
  'Quality check passed',
  'Handed to carrier',
  'In transit',
  'Customs cleared',
  'Delivered',
] as const;

export interface Milestone {
  label: string;
  at: string | null;
  note: string | null;
}

export function templateMilestones(): Milestone[] {
  return DEFAULT_MILESTONES.map((label) => ({ label, at: null, note: null }));
}

/** Seed a shipment for a freshly placed order (step 0, nothing reached yet). */
export async function seedShipmentForOrder(orderId: number, ex: Executor = db): Promise<void> {
  await ex.insert(shipments).values({ orderId, step: 0, milestones: templateMilestones() });
}

function shipmentCols() {
  return {
    id: shipments.id,
    orderId: shipments.orderId,
    step: shipments.step,
    milestones: shipments.milestones,
    trackingNo: shipments.trackingNo,
    carrier: shipments.carrier,
    updatedAt: shipments.updatedAt,
    productName: products.name,
    dataSource: products.dataSource,
  };
}

/** GET /api/shipments — shipments the caller is entitled to see. */
shipmentsRouter.get('/', requireAuth, async (req, res) => {
  const ctx = await callerContext(req.userId);
  if (!ctx) throw new HttpError(401, { error: 'auth_required' });

  const where = ctx.isAdmin
    ? undefined
    : ctx.supplierId != null
      ? sql`(${orders.buyerId} = ${ctx.userId} OR ${orders.supplierId} = ${ctx.supplierId})`
      : eq(orders.buyerId, ctx.userId);

  const base = db
    .select(shipmentCols())
    .from(shipments)
    .innerJoin(orders, eq(shipments.orderId, orders.id))
    .innerJoin(products, eq(orders.productId, products.id));

  const rows = await (where ? base.where(where) : base).orderBy(desc(shipments.id));
  const items = rows.map(mapShipment);
  respond(res, c.zShipmentList, { items, total: items.length });
});

/**
 * POST /api/shipments/:id/advance — move the shipment one milestone forward.
 * Buyer, the order's own supplier, or an admin. Locks the shipment row so two
 * concurrent advances cannot skip a milestone or double-flip the order.
 */
shipmentsRouter.post('/:id/advance', requireAuth, async (req, res) => {
  const id = parseId(req);
  const input = c.zAdvanceShipmentInput.safeParse(req.body ?? {});
  if (!input.success) {
    throw new HttpError(400, { error: 'validation_error', details: input.error.message });
  }
  const ctx = await callerContext(req.userId);
  if (!ctx) throw new HttpError(401, { error: 'auth_required' });

  let touchedOrderId = 0;
  let buyerId = 0;
  let delivered = false;

  await db.transaction(async (tx) => {
    // Row-lock the order first: it is the row that decides who may advance.
    const [order] = await tx
      .select({
        id: orders.id,
        buyerId: orders.buyerId,
        supplierId: orders.supplierId,
        status: orders.status,
      })
      .from(orders)
      .where(
        eq(
          orders.id,
          // A shipment may be replaced over an order's life; the row being
          // advanced is the authority for which order is affected.
          sql`(SELECT s."orderId" FROM "shipments" s WHERE s."id" = ${id})`,
        ),
      )
      .for('update')
      .limit(1);

    if (!order) throw new HttpError(404, { error: 'not_found' });

    // Ownership: the order's supplier (must be the caller's OWN supplier row),
    // its buyer, or an admin. A different supplier gets 403.
    const isOwnerSupplier = ctx.supplierId != null && order.supplierId === ctx.supplierId;
    const isBuyer = order.buyerId === ctx.userId;
    if (!ctx.isAdmin && !isOwnerSupplier && !isBuyer) {
      throw new HttpError(403, { error: 'forbidden' });
    }

    const [shipmentRow] = await tx.select().from(shipments).where(eq(shipments.id, id)).for('update').limit(1);
    if (!shipmentRow) throw new HttpError(404, { error: 'not_found' });

    const existing = toJson<Milestone[]>(shipmentRow.milestones);
    const milestones: Milestone[] = existing.length > 0 ? existing : templateMilestones();
    const last = milestones.length - 1;
    const current = toNum(shipmentRow.step);
    if (current >= milestones.length) {
      throw new HttpError(409, { error: 'shipment_complete', details: 'All milestones are already reached.' });
    }

    const now = new Date().toISOString();
    const nextStep = current + 1;
    const idx = Math.min(current, last);
    const updated = milestones.map((m, i) =>
      i === idx ? { label: input.data.label ?? m.label, at: now, note: input.data.note ?? m.note } : m,
    );

    await tx
      .update(shipments)
      .set({
        step: nextStep,
        milestones: updated,
        trackingNo: input.data.trackingNo ?? shipmentRow.trackingNo,
        carrier: input.data.carrier ?? shipmentRow.carrier,
        updatedAt: new Date(),
      })
      .where(eq(shipments.id, id));

    // Reaching the final milestone means the goods arrived: the order follows.
    if (nextStep >= milestones.length && order.status !== 'delivered') {
      await tx.update(orders).set({ status: 'delivered' }).where(eq(orders.id, toNum(order.id)));
      delivered = true;
    }

    touchedOrderId = toNum(order.id);
    buyerId = toNum(order.buyerId);
  });

  // Side effects after commit: informational only, never fail the request.
  const [orderInfo] = await db
    .select({
      supplierUserId: suppliers.userId,
      supplierEmail: users.email,
      buyerEmail: sql<string>`(SELECT u2."email" FROM "users" u2 WHERE u2."id" = ${buyerId})`,
    })
    .from(orders)
    .innerJoin(suppliers, eq(orders.supplierId, suppliers.id))
    .innerJoin(users, eq(suppliers.userId, users.id))
    .where(eq(orders.id, touchedOrderId))
    .limit(1);

  await notify({
    userId: buyerId,
    role: 'buyer',
    text: delivered ? `Order #${touchedOrderId} was delivered.` : `Shipment for order #${touchedOrderId} advanced.`,
    type: 'shipment',
    link: `/orders/${touchedOrderId}`,
  });
  if (orderInfo?.supplierUserId != null && toNum(orderInfo.supplierUserId) !== ctx.userId) {
    await notify({
      userId: toNum(orderInfo.supplierUserId),
      role: 'supplier',
      text: `Shipment for order #${touchedOrderId} advanced.`,
      type: 'shipment',
      link: '/supplier/orders',
    });
  }
  await queueEmail({
    toEmail: orderInfo?.buyerEmail,
    subject: delivered ? `Order #${touchedOrderId} delivered` : `Order #${touchedOrderId} shipment updated`,
    template: delivered ? 'order_delivered' : 'shipment_advanced',
    payload: { orderId: touchedOrderId, shipmentId: id },
  });

  const [updatedRow] = await db
    .select(shipmentCols())
    .from(shipments)
    .innerJoin(orders, eq(shipments.orderId, orders.id))
    .innerJoin(products, eq(orders.productId, products.id))
    .where(eq(shipments.id, id))
    .limit(1);

  respond(res, c.zShipment, mapShipment(updatedRow));
});

/** Latest shipment id for an order (used by the seed helper's callers/tests). */
export async function latestShipmentIdForOrder(orderId: number): Promise<number | null> {
  const [row] = await db
    .select({ id: shipments.id })
    .from(shipments)
    .where(and(eq(shipments.orderId, orderId)))
    .orderBy(desc(shipments.id))
    .limit(1);
  return row ? toNum(row.id) : null;
}
