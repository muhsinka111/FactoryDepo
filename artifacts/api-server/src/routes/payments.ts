/**
 * routes/payments.ts — proforma invoices and bank-transfer settlement.
 *
 * Access rules
 *  - POST /api/orders/:id/proforma      : the order's buyer, its supplier, or an
 *                                         admin. Assigns `orders.proformaNumber`
 *                                         once (deterministic FD-<year>-<id>) and
 *                                         changes nothing else.
 *  - GET  /api/orders/:id/proforma      : same parties; returns printable HTML
 *                                         (bank transfer only — no card flow).
 *  - POST /api/orders/:id/payments      : the order's buyer only. Records a
 *                                         `payments` row with status 'awaiting'.
 *                                         The path id is authoritative; an
 *                                         `orderId` in the body is ignored.
 *  - POST /api/payments/:id/confirm     : admin only. Sets the payment confirmed,
 *  - POST /api/payments/:id/reject        and on confirm sets the order to
 *                                         paymentStatus 'paid' + paidAt + status
 *                                         'paid', in ONE transaction.
 *  - GET  /api/payments                 : admin only.
 *
 * Money is never computed in JS floats: totals come from Postgres numeric
 * columns, and any arithmetic is delegated to Postgres ROUND(...::numeric).
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import * as c from '@workspace/api-zod';
import { db, orders, payments, products, suppliers, users } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';
import { HttpError, mapOrder, mapPayment, parseId, respond, toNum } from '../http.js';
import { callerContext, notify, queueEmail } from '../helpers.js';

export const paymentsRouter = Router();
export const proformaRouter = Router();
export const adminPaymentsRouter = Router();

/** Columns for a full `zOrder` (side is filled per-caller). */
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
  // Not in zOrder but needed to render/assign the proforma.
  proformaNumber: orders.proformaNumber,
  paymentStatus: orders.paymentStatus,
};

async function loadOrder(id: number) {
  const [row] = await db
    .select(orderCols)
    .from(orders)
    .innerJoin(products, eq(orders.productId, products.id))
    .innerJoin(suppliers, eq(orders.supplierId, suppliers.id))
    .where(eq(orders.id, id))
    .limit(1);
  return row ?? null;
}

function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** `FD-<year>-<zero-padded order id>` — deterministic, assigned at most once. */
function proformaNumberFor(orderId: number, createdAt: unknown): string {
  const year = new Date(String(createdAt ?? Date.now())).getUTCFullYear();
  return `FD-${year}-${String(orderId).padStart(6, '0')}`;
}

/**
 * POST /api/orders/:id/proforma — buyer/supplier/admin party. Idempotent: the
 * number is derived from the order id, so a second call returns the same one.
 */
proformaRouter.post('/:id/proforma', requireAuth, async (req, res) => {
  const id = parseId(req);
  const ctx = await callerContext(req.userId);
  if (!ctx) throw new HttpError(401, { error: 'auth_required' });

  const row = await loadOrder(id);
  if (!row) throw new HttpError(404, { error: 'not_found' });
  const isParty =
    row.buyerId === ctx.userId || (ctx.supplierId != null && row.supplierId === ctx.supplierId) || ctx.isAdmin;
  if (!isParty) throw new HttpError(403, { error: 'forbidden' });

  if (!row.proformaNumber) {
    await db
      .update(orders)
      .set({ proformaNumber: proformaNumberFor(toNum(row.id), row.createdAt) })
      .where(eq(orders.id, id));
  }

  const updated = await loadOrder(id);
  respond(res, c.zOrder, mapOrder({ ...updated, side: updated?.buyerId === ctx.userId ? 'buying' : 'selling' }));
});

/**
 * GET /api/orders/:id/proforma — printable proforma invoice (HTML).
 * Bank-transfer instructions only: this platform does not process cards, so the
 * document tells the buyer to wire the funds and quote the proforma number.
 */
proformaRouter.get('/:id/proforma', requireAuth, async (req, res) => {
  const id = parseId(req);
  const ctx = await callerContext(req.userId);
  if (!ctx) throw new HttpError(401, { error: 'auth_required' });

  const row = await loadOrder(id);
  if (!row) throw new HttpError(404, { error: 'not_found' });
  const isParty =
    row.buyerId === ctx.userId || (ctx.supplierId != null && row.supplierId === ctx.supplierId) || ctx.isAdmin;
  if (!isParty) throw new HttpError(403, { error: 'forbidden' });

  const number = row.proformaNumber ?? proformaNumberFor(toNum(row.id), row.createdAt);
  // Totals come from the numeric column; formatting only, no float arithmetic.
  const total = toNum(row.total);
  const unitPrice = toNum(row.unitPrice);
  const quantity = toNum(row.quantity);
  const currency = String(row.currency ?? 'USD');
  const issued = new Date(String(row.createdAt ?? Date.now())).toISOString().slice(0, 10);
  const siteUrl = process.env.SITE_URL ?? '';

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Proforma ${esc(number)}</title>
<style>
  body{margin:0;padding:32px 16px;background:#f7f8fa;color:#1a2432;
       font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6}
  .doc{max-width:780px;margin:0 auto;background:#fff;border:1px solid #e6e9ee;border-radius:8px;padding:28px}
  h1{margin:0 0 4px;font-size:20px;letter-spacing:-.3px}
  .muted{color:#7b8794;font-size:12.5px}
  .head{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #132238;padding-bottom:14px}
  .brand{font-weight:700;font-size:18px;color:#132238}
  .brand span{color:#f5a623}
  table{width:100%;border-collapse:collapse;margin:18px 0}
  th,td{text-align:left;padding:9px 8px;border-bottom:1px solid #f1f3f6}
  th{font-size:12px;text-transform:uppercase;letter-spacing:.4px;color:#7b8794}
  td.num,th.num{text-align:right}
  tfoot td{font-weight:700;border-bottom:none;border-top:2px solid #132238}
  .bank{background:#fbfaf5;border:1px solid #f0e6c8;border-radius:6px;padding:14px 16px;margin-top:18px}
  .bank h2{margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:.4px;color:#7b8794}
  .grid{display:flex;gap:32px;flex-wrap:wrap;margin-top:12px}
  .grid > div{min-width:220px}
  @media print{body{background:#fff;padding:0}.doc{border:none;border-radius:0;padding:0}.no-print{display:none}}
</style></head>
<body><div class="doc">
  <div class="head">
    <div>
      <div class="brand">factory<span>depo</span></div>
      <div class="muted">Global industrial marketplace${siteUrl ? ` — ${esc(siteUrl)}` : ''}</div>
    </div>
    <div style="text-align:right">
      <h1>Proforma invoice</h1>
      <div class="muted">Number <strong>${esc(number)}</strong></div>
      <div class="muted">Issued ${esc(issued)}</div>
      <div class="muted">Order #${esc(row.id)} — payment status: ${esc(row.paymentStatus ?? 'unpaid')}</div>
    </div>
  </div>

  <div class="grid">
    <div>
      <div class="muted">Billed to (buyer)</div>
      <div><strong>${esc(row.shippingName)}</strong></div>
      <div>${esc(row.shippingAddress)}</div>
      <div>${esc(row.shippingCity)}, ${esc(row.shippingCountry)}</div>
      ${row.shippingPhone ? `<div>${esc(row.shippingPhone)}</div>` : ''}
    </div>
    <div>
      <div class="muted">Supplier (seller)</div>
      <div><strong>${esc(row.supplierName)}</strong></div>
      <div class="muted">Listing #${esc(row.productId)}</div>
    </div>
  </div>

  <table>
    <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th></tr></thead>
    <tbody>
      <tr>
        <td>${esc(row.productName)}</td>
        <td class="num">${esc(quantity)}</td>
        <td class="num">${esc(currency)} ${esc(unitPrice.toFixed(2))}</td>
        <td class="num">${esc(currency)} ${esc(total.toFixed(2))}</td>
      </tr>
    </tbody>
    <tfoot>
      <tr><td colspan="3" class="num">Total due</td><td class="num">${esc(currency)} ${esc(total.toFixed(2))}</td></tr>
    </tfoot>
  </table>

  <div class="bank">
    <h2>Payment instructions — bank transfer only</h2>
    <p style="margin:0 0 8px">FactoryDepo does not process card payments. Please wire the total amount and quote
      <strong>${esc(number)}</strong> as the payment reference so the transfer can be matched.</p>
    <div class="muted">Beneficiary: FactoryDepo Ltd. · Bank details are issued by your account manager on request.
      The order is marked paid only after an administrator confirms the funds have cleared.</div>
  </div>

  <p class="muted" style="margin-top:18px">This proforma is not a tax invoice. A commercial invoice is issued with the shipment.</p>
  <p class="no-print" style="margin-top:10px"><button onclick="window.print()">Print</button></p>
</div></body></html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(html);
});

/** Body of POST /api/orders/:id/payments — `orderId` is accepted and ignored. */
const zRecordPaymentBody = c.zRecordPaymentInput.partial({ orderId: true }).extend({
  orderId: z.number().int().positive().optional(),
  method: z.string().max(40).default('bank_transfer'),
  amount: z.coerce.number().positive(),
  currency: z.string().max(8).default('USD'),
  reference: z.string().max(120).optional(),
  proofKey: z.string().max(300).optional(),
});

/**
 * POST /api/orders/:id/payments — the order's buyer records a bank transfer.
 * Creates an 'awaiting' payment; an admin confirms it later (nothing is ever
 * auto-marked paid). The `orderId` echoed in the body is deliberately ignored —
 * the path segment is authoritative.
 */
paymentsRouter.post('/:id/payments', requireAuth, async (req, res) => {
  const id = parseId(req);
  const input = zRecordPaymentBody.safeParse(req.body ?? {});
  if (!input.success) {
    throw new HttpError(400, { error: 'validation_error', details: input.error.message });
  }
  const ctx = await callerContext(req.userId);
  if (!ctx) throw new HttpError(401, { error: 'auth_required' });

  const row = await loadOrder(id);
  if (!row) throw new HttpError(404, { error: 'not_found' });
  // Only the buyer funds their own order; a supplier cannot record a payment
  // against someone else's purchase.
  if (row.buyerId !== ctx.userId && !ctx.isAdmin) throw new HttpError(403, { error: 'forbidden' });

  const { method, reference, amount, currency, proofKey } = input.data;

  const [inserted] = await db
    .insert(payments)
    .values({
      orderId: id,
      method,
      reference: reference ?? null,
      // numeric(14,2) column: pass the decimal as a string, no JS float math.
      amount: String(amount),
      currency,
      status: 'awaiting',
      proofKey: proofKey ?? null,
    })
    .returning({ id: payments.id });

  await db.update(orders).set({ paymentStatus: 'awaiting' }).where(eq(orders.id, id));
  await notify({
    userId: row.buyerId,
    role: 'buyer',
    text: `Payment of ${currency} ${amount} recorded for order #${id} — awaiting confirmation.`,
    type: 'payment',
    link: `/orders/${id}`,
  });
  const adminEmails = await db.select({ email: users.email }).from(users).where(eq(users.role, 'admin'));
  for (const a of adminEmails) {
    await queueEmail({
      toEmail: a.email,
      template: 'payment-recorded',
      payload: { orderId: id, reference: reference ?? '', amount, currency },
    });
  }

  const [paymentRow] = await db.select().from(payments).where(eq(payments.id, toNum(inserted?.id))).limit(1);
  res.status(201);
  respond(res, c.zPayment, mapPayment(paymentRow));
});

/**
 * Shared confirm/reject. Admin only. Confirming settles the order in the SAME
 * transaction: the payment row, the order's paymentStatus/paidAt and its
 * fulfilment status move together or not at all.
 */
async function settlePayment(req: Request, res: Response, next: 'confirmed' | 'rejected'): Promise<void> {
  const id = parseId(req);
  const ctx = await callerContext(req.userId);
  if (!ctx) throw new HttpError(401, { error: 'auth_required' });
  if (!ctx.isAdmin) throw new HttpError(403, { error: 'forbidden' });

  let settledOrderId = 0;
  let settledAmount = 0;
  let settledCurrency = 'USD';
  let buyerId = 0;

  await db.transaction(async (tx) => {
    const [payment] = await tx.select().from(payments).where(eq(payments.id, id)).for('update').limit(1);
    if (!payment) throw new HttpError(404, { error: 'not_found' });
    if (payment.status === 'confirmed' || payment.status === 'rejected' || payment.status === 'refunded') {
      throw new HttpError(409, { error: 'payment_final', details: `Payment is already ${payment.status}.` });
    }

    const [order] = await tx
      .select({ id: orders.id, buyerId: orders.buyerId, status: orders.status })
      .from(orders)
      .where(eq(orders.id, toNum(payment.orderId)))
      .for('update')
      .limit(1);
    if (!order) throw new HttpError(404, { error: 'order_not_found' });

    await tx
      .update(payments)
      .set({ status: next, confirmedBy: ctx.userId, confirmedAt: new Date(), reference: payment.reference })
      .where(eq(payments.id, id));

    if (next === 'confirmed') {
      await tx
        .update(orders)
        .set({ paymentStatus: 'paid', paidAt: new Date(), status: 'paid' })
        .where(eq(orders.id, toNum(order.id)));
    } else {
      await tx.update(orders).set({ paymentStatus: 'unpaid' }).where(eq(orders.id, toNum(order.id)));
    }

    settledOrderId = toNum(order.id);
    settledAmount = toNum(payment.amount);
    settledCurrency = String(payment.currency ?? 'USD');
    buyerId = toNum(order.buyerId);

    await notify(
      {
        userId: toNum(order.buyerId),
        role: 'buyer',
        text:
          next === 'confirmed'
            ? `Payment for order #${toNum(order.id)} was confirmed.`
            : `Payment for order #${toNum(order.id)} was rejected.`,
        type: 'payment',
        link: `/orders/${toNum(order.id)}`,
      },
      tx,
    );
    const [buyer] = await tx.select({ email: users.email }).from(users).where(eq(users.id, toNum(order.buyerId))).limit(1);
    await queueEmail(
      {
        toEmail: buyer?.email,
        template: next === 'confirmed' ? 'payment-confirmed' : 'payment-recorded',
        payload: { orderId: toNum(order.id), amount: settledAmount, currency: settledCurrency },
      },
      tx,
    );
  });

  void settledOrderId;
  void buyerId;

  const [row] = await db.select().from(payments).where(eq(payments.id, id)).limit(1);
  respond(res, c.zPayment, mapPayment(row));
}

/** POST /api/payments/:id/confirm — admin only; settles the order too. */
adminPaymentsRouter.post('/:id/confirm', requireAuth, requireRole('admin'), async (req, res) => {
  await settlePayment(req, res, 'confirmed');
});

/** POST /api/payments/:id/reject — admin only. */
adminPaymentsRouter.post('/:id/reject', requireAuth, requireRole('admin'), async (req, res) => {
  await settlePayment(req, res, 'rejected');
});

/** GET /api/payments — admin only, newest first. */
adminPaymentsRouter.get('/', requireAuth, requireRole('admin'), async (_req, res) => {
  const rows = await db.select().from(payments).orderBy(desc(payments.id));
  respond(res, c.zPaymentList, { items: rows.map(mapPayment), total: rows.length });
});
