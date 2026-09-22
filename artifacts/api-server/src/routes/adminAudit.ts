/**
 * routes/adminAudit.ts — the ONE place an admin action against someone else's
 * data is written down (migration 022's `admin_audit` table).
 *
 * Why this is a shared module instead of an inline `db.insert()` per route:
 *
 *  1. The audit row is written in the SAME transaction as the change it
 *     describes, so a change can never commit without its audit entry and a
 *     refused change (400/403/404/409) leaves no misleading row behind. Pass the
 *     transaction handle from the route as `ex` to get that guarantee.
 *  2. `before`/`after` are built by DIFFING THE STORED ROW against the validated
 *     patch — never reconstructed from the request body. The trail therefore
 *     states the values that were actually in the table, and only the fields
 *     that actually changed (re-sending the same price is not a change and
 *     writes no entry).
 *  3. One module knows the row shape, so the trail cannot drift per action.
 *
 * `entity` is the table the action touched ('product' | 'supplier'), `action` is
 * a dotted verb ('listing.pull', 'supplier.update', …) and both are plain text
 * by design — the audit table must be able to record a new action without a
 * migration, and an unknown action string is still evidence.
 *
 * Note on imports: this file takes the `adminAudit` table straight from
 * `@workspace/db` instead of the local `./db.js` re-export seam. `src/db.ts` is a
 * shared file that other workstreams edit concurrently, and a clobbered
 * re-export line would surface as a runtime `insert(undefined)` — not worth the
 * seam here, since the helper is self-contained.
 */
import type { Request } from 'express';
import { adminAudit } from '@workspace/db';
import { db } from '../db.js';
import { HttpError, toIso, toNumOrNull } from '../http.js';
import type { Executor } from '../helpers.js';
import type * as c from '@workspace/api-zod';

/**
 * The admin who is acting: the token's user id, never a body field.
 * `requireAuth` already rejected an anonymous caller, so a missing id here is an
 * internal inconsistency — 401 rather than a row with a null author.
 */
export function actingAdminId(req: Request): number {
  const uid = req.userId;
  if (uid == null) throw new HttpError(401, { error: 'auth_required' });
  return uid;
}

/** How a column's value is normalised for the trail (pg → JSON). */
export type FieldKind = 'string' | 'number' | 'json';

export interface AuditEntry {
  /** The acting admin's user id (from the token). */
  adminUserId: number;
  /** Dotted verb, e.g. 'listing.update' | 'listing.pull' | 'supplier.update'. */
  action: string;
  /** The table the action touched: 'product' | 'supplier'. */
  entity: string;
  entityId: number;
  /** The fields as they were stored before the change (only the changed ones). */
  before?: Record<string, unknown> | null;
  /** The fields as they are stored after the change (only the changed ones). */
  after?: Record<string, unknown> | null;
}

/** Write one audit row. Throws on failure — pass a transaction handle to tie it
 *  to the change it describes. */
export async function recordAdminAction(entry: AuditEntry, ex: Executor = db): Promise<void> {
  await ex.insert(adminAudit).values({
    adminUserId: entry.adminUserId,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    before: entry.before ?? null,
    after: entry.after ?? null,
  });
}

/* ---------- value normalisation + diffing ---------- */

/** pg hands back `numeric` as a string and dates as Date — the trail carries a
 *  number and an ISO string so the entry reads the same for every action. */
function norm(value: unknown, kind: FieldKind): unknown {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (kind === 'number') return Number(value);
  return value;
}

/** Equality in the trail's own terms: '250.00' (pg) and 250 (JSON) are the same
 *  price, so re-sending it is not recorded as a change. */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === null || b === null) return a === b;
  if (typeof a === 'number' && typeof b === 'number') return Object.is(a, b);
  if (typeof a === 'object' || typeof b === 'object') {
    if (typeof a !== typeof b) return false;
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return String(a) === String(b);
}

export interface AuditDiff {
  /** The changed fields and their stored (previous) values. */
  before: Record<string, unknown>;
  /** The same fields with their incoming values. */
  after: Record<string, unknown>;
  /** The names of the fields that change — empty means "nothing to do". */
  changed: string[];
}

/**
 * Compare the row as stored against a validated patch and return ONLY the fields
 * that change. A field the patch does not carry is never considered, so an
 * omitted field cannot be recorded (or written) as a change.
 */
export function auditDiff(
  stored: Record<string, unknown>,
  patch: Record<string, unknown>,
  kinds: Record<string, FieldKind> = {},
): AuditDiff {
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  const changed: string[] = [];

  for (const [key, nextRaw] of Object.entries(patch)) {
    if (nextRaw === undefined) continue;
    const kind = kinds[key] ?? 'string';
    const prev = norm(stored[key], kind);
    const next = norm(nextRaw, kind);
    if (sameValue(prev, next)) continue;
    before[key] = prev;
    after[key] = next;
    changed.push(key);
  }

  return { before, after, changed };
}

/**
 * A fixed snapshot of the named columns of a row — for actions that have no
 * "after" (a delete) or whose before/after are the moderation columns rather
 * than a patch (pull/restore). Values are normalised exactly like a diff's.
 */
export function auditSnapshot(
  row: Record<string, unknown>,
  keys: readonly string[],
  kinds: Record<string, FieldKind> = {},
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) out[key] = norm(row[key], kinds[key] ?? 'string');
  return out;
}

/**
 * Only the fields the caller actually SENT. The write schemas are partials built
 * with `.partial()` over shapes that carry `.default(...)`, so `parsed.data` can
 * hold a value the request never mentioned; applying or recording such a value
 * would put a change in the trail that the admin never asked for.
 */
export function submittedFields(
  parsed: Record<string, unknown>,
  rawBody: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(rawBody)) {
    if (key in parsed && parsed[key] !== undefined) out[key] = parsed[key];
  }
  return out;
}

/** One `admin_audit` row for the API: `adminName` is null when the admin's user
 *  row is gone (the audit row outlives the account — that is the point). */
export function mapAdminAuditRow(r: Record<string, unknown>): c.AdminAuditRow {
  return {
    id: toNumOrNull(r.id) ?? 0,
    adminUserId: toNumOrNull(r.adminUserId) ?? 0,
    adminName: r.adminName == null ? null : String(r.adminName),
    action: String(r.action),
    entity: String(r.entity),
    entityId: toNumOrNull(r.entityId),
    before: r.before ?? null,
    after: r.after ?? null,
    createdAt: toIso(r.createdAt),
  };
}
