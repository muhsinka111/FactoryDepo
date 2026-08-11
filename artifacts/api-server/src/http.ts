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
    createdAt: toIso(o.createdAt),
  };
}
