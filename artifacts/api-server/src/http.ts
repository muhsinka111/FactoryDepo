/**
 * Shared HTTP helpers: error class, param parsing, response validation,
 * and pg row → API-shape mappers (numeric/jsonb/date coercion).
 */
import type { Request, Response } from 'express';
import type { z } from 'zod';
import type * as c from '@workspace/api-zod';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: { error: string; details?: string },
  ) {
    super(body.error);
    this.name = 'HttpError';
  }
}

/** Parse an :id route param (Express 5 → req.params['id']), 400 on garbage. */
export function parseId(req: Request): number {
  const p = req.params['id'];
  const raw = Array.isArray(p) ? p[0] : p;
  const id = Number.parseInt(raw ?? '', 10);
  if (Number.isNaN(id)) throw new HttpError(400, { error: 'invalid_id' });
  return id;
}

/**
 * Validate the outgoing payload against its zod contract before sending.
 * A mapping bug → 500 + console error instead of silently emitting garbage.
 */
export function respond(res: Response, schema: z.ZodType, data: unknown): void {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    console.error('[api] response failed schema validation:', parsed.error.message);
    res.status(500).json({ error: 'internal_error' });
    return;
  }
  res.json(parsed.data);
}

/* ---------- coercion helpers (pg → JSON) ---------- */

/** pg returns numeric/bigint columns as strings — always Number() them. */
export function toNum(v: unknown): number {
  return v == null ? 0 : Number(v);
}

export function toNumOrNull(v: unknown): number | null {
  return v == null ? null : Number(v);
}

export function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  return new Date(String(v)).toISOString();
}

export function toIsoOrNull(v: unknown): string | null {
  return v == null ? null : toIso(v);
}

/** jsonb arrives pre-parsed from pg; tolerate raw strings too. */
export function toJson<T>(v: unknown): T {
  if (v == null) return [] as unknown as T;
  if (typeof v === 'string') {
    try {
      return JSON.parse(v) as T;
    } catch {
      return [] as unknown as T;
    }
  }
  return v as T;
}

/* ---------- row mappers ---------- */

export function mapUser(u: Record<string, unknown>): c.User {
  return {
    id: toNum(u.id),
    email: String(u.email),
    name: String(u.name),
    role: u.role as c.User['role'],
    company: u.company == null ? null : String(u.company),
    country: u.country == null ? null : String(u.country),
    lang: String(u.lang ?? 'en'),
    trustScore: toNum(u.trustScore),
    emailVerified: Boolean(u.emailVerified),
    createdAt: toIso(u.createdAt),
  };
}

export function mapProduct(p: Record<string, unknown>): c.Product {
  const rawSpec = (p.spec ?? []) as unknown[];
  const spec: string[] = rawSpec.map((s) =>
    typeof s === 'string'
      ? s
      : s && typeof s === 'object' && 'key' in (s as Record<string, unknown>)
        ? `${String((s as Record<string, unknown>).key)}: ${String((s as Record<string, unknown>).value ?? '')}`
        : String(s),
  );
  return {
    id: toNum(p.id),
    supplierId: toNum(p.supplierId),
    supplierName: String(p.supplierName),
    name: String(p.name),
    category: String(p.category),
    description: p.description == null ? null : String(p.description),
    spec,
    price: toNum(p.price),
    currency: String(p.currency ?? 'USD'),
    unit: String(p.unit),
    moq: toNum(p.moq),
    originCountry: String(p.originCountry),
    purityGrade: p.purityGrade == null ? null : String(p.purityGrade),
    verified: Boolean(p.verified),
    trustScore: toNum(p.trustScore),
    imageKey: p.imageKey == null ? null : String(p.imageKey),
    quantityAvailable: toNum(p.quantityAvailable),
    status: p.status as c.Product['status'],
    dataSource: p.dataSource as c.Product['dataSource'],
    createdAt: toIso(p.createdAt),
  };
}

export function mapSupplier(s: Record<string, unknown>): c.Supplier {
  return {
    id: toNum(s.id),
    companyName: String(s.companyName),
    country: String(s.country),
    city: s.city == null ? null : String(s.city),
    description: s.description == null ? null : String(s.description),
    verifiedLevel: toNum(s.verifiedLevel),
    rating: toNum(s.rating),
    inspectionsCount: toNum(s.inspectionsCount),
    fulfillmentRate: toNum(s.fulfillmentRate),
    tags: toJson<string[]>(s.tags),
    since: toNumOrNull(s.since),
    trustScore: toNum(s.trustScore),
    productCount: toNum(s.productCount),
    dataSource: s.dataSource as c.Supplier['dataSource'],
  };
}

export function mapRfq(r: Record<string, unknown>): c.Rfq {
  return {
    id: toNum(r.id),
    buyerId: toNum(r.buyerId),
    title: String(r.title),
    category: String(r.category),
    description: r.description == null ? null : String(r.description),
    quantity: toNum(r.quantity),
    unit: String(r.unit),
    targetCountry: r.targetCountry == null ? null : String(r.targetCountry),
    status: r.status as c.Rfq['status'],
    quoteCount: toNum(r.quoteCount),
    deadline: toIsoOrNull(r.deadline),
    createdAt: toIso(r.createdAt),
  };
}

export function mapQuote(q: Record<string, unknown>): c.Quote {
  return {
    id: toNum(q.id),
    rfqId: toNum(q.rfqId),
    supplierId: toNum(q.supplierId),
    supplierName: String(q.supplierName),
    price: toNum(q.price),
    currency: String(q.currency ?? 'USD'),
    leadTimeDays: toNum(q.leadTimeDays),
    notes: q.notes == null ? null : String(q.notes),
    status: q.status as c.Quote['status'],
    trustScore: toNum(q.trustScore),
    createdAt: toIso(q.createdAt),
  };
}

export function mapOrder(o: Record<string, unknown>): c.Order {
  return {
    id: toNum(o.id),
    buyerId: toNum(o.buyerId),
    productId: toNum(o.productId),
    supplierId: toNum(o.supplierId),
    productName: String(o.productName),
    supplierName: String(o.supplierName),
    quantity: toNum(o.quantity),
    unitPrice: toNum(o.unitPrice),
    currency: String(o.currency ?? 'USD'),
    total: toNum(o.total),
    status: o.status as c.Order['status'],
    shippingName: String(o.shippingName),
    shippingAddress: String(o.shippingAddress),
    shippingCity: String(o.shippingCity),
    shippingCountry: String(o.shippingCountry),
    shippingPhone: o.shippingPhone == null ? null : String(o.shippingPhone),
    notes: o.notes == null ? null : String(o.notes),
    side: o.side as c.Order['side'],
    createdAt: toIso(o.createdAt),
  };
}

/* ---------- platform-row mappers (migrations/009_platform_tables.sql) ---------- */

export function mapOffer(o: Record<string, unknown>): c.Offer {
  return {
    id: toNum(o.id),
    productId: toNum(o.productId),
    productName: String(o.productName ?? ''),
    buyerId: toNum(o.buyerId),
    buyerName: String(o.buyerName ?? ''),
    supplierId: toNum(o.supplierId),
    supplierName: String(o.supplierName ?? ''),
    quantity: toNum(o.quantity),
    unitPrice: toNum(o.unitPrice),
    currency: String(o.currency ?? 'USD'),
    parentOfferId: toNumOrNull(o.parentOfferId),
    status: o.status as c.Offer['status'],
    notes: o.notes == null ? null : String(o.notes),
    dataSource: o.dataSource as c.Offer['dataSource'],
    createdAt: toIso(o.createdAt),
  };
}

export function mapMessage(m: Record<string, unknown>): c.Message {
  return {
    id: toNum(m.id),
    threadId: toNum(m.threadId),
    senderId: toNum(m.senderId),
    senderName: String(m.senderName ?? ''),
    body: String(m.body),
    readAt: toIsoOrNull(m.readAt),
    createdAt: toIso(m.createdAt),
  };
}

export function mapThread(t: Record<string, unknown>): c.Thread {
  return {
    id: toNum(t.id),
    buyerId: toNum(t.buyerId),
    buyerName: String(t.buyerName ?? ''),
    supplierId: toNum(t.supplierId),
    supplierName: String(t.supplierName ?? ''),
    productId: toNumOrNull(t.productId),
    productName: t.productName == null ? null : String(t.productName),
    subject: t.subject == null ? null : String(t.subject),
    lastMessageAt: toIsoOrNull(t.lastMessageAt),
    messageCount: toNum(t.messageCount),
    unreadCount: toNum(t.unreadCount),
    // A thread that is not about a specific lot has no underlying provenance.
    dataSource: t.productId == null ? null : (t.dataSource as c.Thread['dataSource']),
    createdAt: toIso(t.createdAt),
  };
}

export function mapSavedLot(s: Record<string, unknown>): c.SavedLot {
  return {
    userId: toNum(s.userId),
    productId: toNum(s.productId),
    product: mapProduct(s),
    createdAt: toIso(s.createdAt),
  };
}

export function mapShipment(s: Record<string, unknown>): c.Shipment {
  const raw = toJson<Record<string, unknown>[]>(s.milestones);
  return {
    id: toNum(s.id),
    orderId: toNum(s.orderId),
    productName: String(s.productName ?? ''),
    dataSource: s.dataSource as c.Shipment['dataSource'],
    step: toNum(s.step),
    milestones: raw.map((m) => ({
      label: String(m.label ?? ''),
      at: m.at == null ? null : String(m.at),
      note: m.note == null ? null : String(m.note),
    })),
    trackingNo: s.trackingNo == null ? null : String(s.trackingNo),
    carrier: s.carrier == null ? null : String(s.carrier),
    updatedAt: toIso(s.updatedAt),
  };
}

export function mapNotification(n: Record<string, unknown>): c.Notification {
  return {
    id: toNum(n.id),
    userId: toNum(n.userId),
    role: n.role == null ? null : String(n.role),
    text: String(n.text),
    type: n.type == null ? null : String(n.type),
    read: Boolean(n.read),
    link: n.link == null ? null : String(n.link),
    createdAt: toIso(n.createdAt),
  };
}

export function mapSupplierDoc(d: Record<string, unknown>): c.SupplierDoc {
  return {
    id: toNum(d.id),
    supplierId: toNum(d.supplierId),
    docType: String(d.docType),
    status: d.status as c.SupplierDoc['status'],
    fileKey: d.fileKey == null ? null : String(d.fileKey),
    reviewedBy: toNumOrNull(d.reviewedBy),
    reviewedAt: toIsoOrNull(d.reviewedAt),
    note: d.note == null ? null : String(d.note),
    createdAt: toIso(d.createdAt),
  };
}

export function mapPayment(p: Record<string, unknown>): c.Payment {
  return {
    id: toNum(p.id),
    orderId: toNum(p.orderId),
    method: String(p.method ?? 'bank_transfer'),
    reference: p.reference == null ? null : String(p.reference),
    amount: toNum(p.amount),
    currency: String(p.currency ?? 'USD'),
    status: p.status as c.Payment['status'],
    proofKey: p.proofKey == null ? null : String(p.proofKey),
    confirmedBy: toNumOrNull(p.confirmedBy),
    confirmedAt: toIsoOrNull(p.confirmedAt),
    createdAt: toIso(p.createdAt),
  };
}

export function mapFeatureFlag(f: Record<string, unknown>): c.FeatureFlag {
  return {
    key: String(f.key),
    enabled: Boolean(f.enabled),
    label: String(f.label),
    description: f.description == null ? null : String(f.description),
    updatedAt: toIso(f.updatedAt),
  };
}

export function mapBanner(b: Record<string, unknown>): c.Banner {
  return {
    id: toNum(b.id),
    title: String(b.title),
    body: b.body == null ? null : String(b.body),
    placement: String(b.placement ?? 'home'),
    imageKey: b.imageKey == null ? null : String(b.imageKey),
    href: b.href == null ? null : String(b.href),
    active: Boolean(b.active),
    startsAt: toIsoOrNull(b.startsAt),
    endsAt: toIsoOrNull(b.endsAt),
    createdAt: toIso(b.createdAt),
  };
}

export function mapFaq(f: Record<string, unknown>): c.Faq {
  return {
    id: toNum(f.id),
    category: f.category == null ? null : String(f.category),
    question: String(f.question),
    answer: String(f.answer),
    position: toNum(f.position),
  };
}

export function mapSupportTicket(t: Record<string, unknown>): c.SupportTicket {
  return {
    id: toNum(t.id),
    userId: toNumOrNull(t.userId),
    subject: String(t.subject),
    body: t.body == null ? null : String(t.body),
    priority: String(t.priority ?? 'normal'),
    status: String(t.status ?? 'open'),
    createdAt: toIso(t.createdAt),
  };
}

export function mapAdminSupplier(s: Record<string, unknown>): c.AdminSupplier {
  return {
    id: toNum(s.id),
    companyName: String(s.companyName),
    country: String(s.country),
    city: s.city == null ? null : String(s.city),
    contactEmail: s.contactEmail == null ? null : String(s.contactEmail),
    verifiedLevel: toNum(s.verifiedLevel),
    rating: toNum(s.rating),
    trustScore: toNum(s.trustScore),
    productCount: toNum(s.productCount),
    dataSource: s.dataSource as c.AdminSupplier['dataSource'],
    attestedAt: toIsoOrNull(s.attestedAt),
    attestedBy: toNumOrNull(s.attestedBy),
    docsMissing: toNum(s.docsMissing),
    docsSubmitted: toNum(s.docsSubmitted),
    docsApproved: toNum(s.docsApproved),
    docsRejected: toNum(s.docsRejected),
    createdAt: toIso(s.createdAt),
  };
}
