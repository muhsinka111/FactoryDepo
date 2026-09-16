/**
 * Shared route helpers (Phase 3 API surface).
 *
 * Three things every platform route needs and none of them should re-invent:
 *   1. `callerContext()` / `requireSupplier()` — resolve the caller's role and
 *      *their own* supplier row, so an ownership check can never be confused
 *      with a role check. Role alone ("is this caller a supplier?") is the bug
 *      this repo shipped with; every supplier-scoped mutation must compare the
 *      row's supplierId against `ctx.supplierId`.
 *   2. `productColumns` / `fetchProductRows()` — one product projection + mapper
 *      so an embedded `zProduct` (saved lots) and a flattened offer/shipment
 *      join can never drift from `zProduct`.
 *   3. `notify()` / `queueEmail()` — best-effort side effects: a notification
 *      row and a transactional-outbox row. Mail is only ever written to
 *      `email_outbox` (status 'queued') — no route calls a provider directly.
 *      Both swallow their own errors: a failed side effect must never turn a
 *      successful state change into a 500.
 */
import { eq, inArray, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Request, Response } from 'express';
import {
  db,
  emailOutbox,
  notifications,
  products,
  suppliers,
  users,
} from './db.js';
import { toNum } from './http.js';
import { renderEmail, type EmailTemplate } from './email.js';
import { requireAuth } from './auth.js';

/** The DB handle type, plus the transaction handle the same helpers accept. */
export type Db = typeof db;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Executor = Db | any;

/* ---------- caller context ---------- */

export interface CallerContext {
  userId: number;
  role: string;
  email: string;
  name: string;
  /** The caller's OWN supplier row id — null for a non-supplier caller. */
  supplierId: number | null;
  supplierName: string | null;
  isAdmin: boolean;
}

/**
 * Resolve the caller from `req.userId`. Returns null when the user row is gone
 * (requireAuth already 401s in that case, this is belt-and-braces).
 */
export async function callerContext(userId: number | undefined): Promise<CallerContext | null> {
  if (userId == null) return null;
  const [row] = await db
    .select({
      id: users.id,
      role: users.role,
      email: users.email,
      name: users.name,
      supplierId: suppliers.id,
      supplierName: suppliers.companyName,
    })
    .from(users)
    .leftJoin(suppliers, eq(suppliers.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) return null;
  return {
    userId: toNum(row.id),
    role: String(row.role),
    email: String(row.email),
    name: String(row.name),
    supplierId: row.supplierId == null ? null : toNum(row.supplierId),
    supplierName: row.supplierName == null ? null : String(row.supplierName),
    isAdmin: row.role === 'admin',
  };
}

/** Supplier id of the caller's own profile, or null. */
export async function ownSupplierId(userId: number): Promise<number | null> {
  const [row] = await db
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(eq(suppliers.userId, userId))
    .limit(1);
  return row ? toNum(row.id) : null;
}

/**
 * Run `requireAuth` from inside a handler.
 *
 * Some routes are public by default and only need a token for one query flag
 * (e.g. `GET /api/rfqs?mine=1`). Mounting the middleware conditionally is not
 * possible in Express, so this awaits the token check: it rejects the handler
 * with the same HttpError the middleware would have passed to `next`, which the
 * central error handler turns into the identical 401.
 */
export async function authenticate(req: Request, res: Response): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    requireAuth(req, res, (err?: unknown) => (err ? reject(err) : resolve()));
  });
}

/* ---------- product projection ---------- */

/** Drizzle selection map for a full `zProduct` (supplierName + trustScore joined). */
export const productColumns = {
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
  quantityAvailable: products.quantityAvailable,
  status: products.status,
  dataSource: products.dataSource,
  createdAt: products.createdAt,
};

/** Selection map including the raw supplier id, for ownership checks. */
export const productColumnsWithSupplier = {
  ...productColumns,
  ownerSupplierId: products.supplierId,
};

export type ProductRow = {
  id: number;
  supplierId: number;
  supplierName: string;
  name: string;
  category: string;
  description: string | null;
  spec: unknown;
  price: string;
  currency: string | null;
  unit: string;
  moq: string;
  originCountry: string;
  purityGrade: string | null;
  verified: boolean | null;
  trustScore: string | null;
  imageKey: string | null;
  quantityAvailable: string;
  status: string;
  dataSource: string;
  createdAt: Date | null;
};

/** Fetch full product rows (with supplierName/trustScore) for a set of ids. */
export async function fetchProductRows(ids: number[], ex: Executor = db): Promise<ProductRow[]> {
  if (ids.length === 0) return [];
  return (await ex
    .select(productColumns)
    .from(products)
    .innerJoin(suppliers, eq(products.supplierId, suppliers.id))
    .innerJoin(users, eq(suppliers.userId, users.id))
    .where(inArray(products.id, ids))) as ProductRow[];
}

/** Fetch a single full product row, or null. */
export async function fetchProductRow(id: number, ex: Executor = db): Promise<ProductRow | null> {
  const rows = await fetchProductRows([id], ex);
  return rows[0] ?? null;
}

/* ---------- best-effort side effects ---------- */

interface NotifyInput {
  userId: number;
  role?: string | null;
  text: string;
  type?: string | null;
  link?: string | null;
}

/**
 * Insert an in-app notification. Never throws: returns false when the insert
 * failed. Pass the transaction handle to keep it atomic with the state change.
 */
export async function notify(input: NotifyInput, ex: Executor = db): Promise<boolean> {
  try {
    await ex.insert(notifications).values({
      userId: input.userId,
      role: input.role ?? null,
      text: input.text,
      type: input.type ?? null,
      link: input.link ?? null,
    });
    return true;
  } catch (err) {
    console.error('[notify] failed (ignored):', err instanceof Error ? err.message : String(err));
    return false;
  }
}

interface EmailInput {
  toEmail: string | null | undefined;
  template: EmailTemplate;
  payload: Record<string, unknown>;
  subject?: string;
}

/**
 * Write one transactional-outbox row (status 'queued') for a template that
 * `email.ts` already knows how to render. The subject is rendered from the same
 * template the worker will use, so queued mail and sent mail agree.
 *
 * `email.ts`'s own `queueEmail()` is the non-transactional entry point; this one
 * additionally accepts a transaction handle so a state change and its
 * notification email commit or roll back together.
 */
export async function queueEmail(input: EmailInput, ex: Executor = db): Promise<boolean> {
  if (!input.toEmail) return false;
  try {
    const subject = input.subject ?? renderEmail(input.template, input.payload).subject;
    await ex.insert(emailOutbox).values({
      toEmail: input.toEmail,
      subject,
      template: input.template,
      payload: input.payload,
      status: 'queued',
    });
    return true;
  } catch (err) {
    console.error('[outbox] insert failed (ignored):', err instanceof Error ? err.message : String(err));
    return false;
  }
}

/* ---------- misc query helpers ---------- */

/** `count(*)` over a table with an optional condition. */
export async function countRows(table: unknown, where?: SQL): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = db.select({ n: sql<number>`count(*)` }).from(table as any);
  const rows = where ? await q.where(where) : await q;
  return toNum((rows[0] as { n?: unknown } | undefined)?.n);
}
