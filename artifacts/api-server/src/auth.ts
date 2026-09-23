/**
 * HMAC-signed Bearer tokens (node:crypto — no JWT lib) + auth middleware.
 * Token format: base64url(JSON payload) "." base64url(HMAC-SHA256(secret, payloadPart))
 * Payload: { sub: userId, v: tokenVersion, exp: epochMs (now + 24h) }
 *
 * `v` is the user's tokenVersion at signing time; requireAuth rejects a token
 * whose `v` no longer matches the row in the DB, so bumping tokenVersion
 * (password change, "log out everywhere") revokes every outstanding token
 * immediately instead of waiting out the TTL.
 *
 * Role gates (`requireRole`) answer for the admin plane; the seller surface uses
 * `requireSellerSurface`, which admits a supplier OR an admin that owns a
 * supplier row — see the doc on that helper.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db, suppliers, users } from './db.js';
import { HttpError } from './http.js';

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Values that must never be trusted as a real production secret, even if set.
const WEAK_SECRETS = new Set(['dev-secret-change-me', 'change-me-in-production', 'secret', 'changeme', '']);

function loadSecret(): string {
  const secret = process.env.APP_SECRET ?? '';
  const isWeak = secret.length < 32 || WEAK_SECRETS.has(secret);
  if (isWeak) {
    if (process.env.NODE_ENV === 'production') {
      console.error(
        '[boot] APP_SECRET is missing, too short (<32 chars), or a known placeholder. ' +
          'Refusing to start in production — every Bearer token would be forgeable. ' +
          'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
      );
      process.exit(1);
    }
    console.warn('[auth] APP_SECRET is weak or unset — OK for local dev, but production boot will refuse to start like this.');
  }
  return secret || 'dev-secret-change-me';
}

const SECRET = loadSecret();

interface TokenPayload {
  sub: number;
  v: number;
  exp: number;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

export function signToken(userId: number, tokenVersion: number): string {
  const payload: TokenPayload = { sub: userId, v: tokenVersion, exp: Date.now() + TTL_MS };
  const encoded = b64url(JSON.stringify(payload));
  const sig = b64url(createHmac('sha256', SECRET).update(encoded).digest());
  return `${encoded}.${sig}`;
}

export function verifyToken(token: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;

  const expected = createHmac('sha256', SECRET).update(encoded).digest();
  let received: Buffer;
  try {
    received = Buffer.from(sig, 'base64url');
  } catch {
    return null;
  }
  if (received.length !== expected.length) return null;
  if (!timingSafeEqual(expected, received)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as TokenPayload;
    if (typeof payload.sub !== 'number' || typeof payload.v !== 'number' || typeof payload.exp !== 'number') return null;
    if (payload.exp < Date.now()) return null; // expired
    return payload;
  } catch {
    return null;
  }
}

/** Read the caller's Bearer token from either supported header. Exported so the
 *  rate limiter can key authenticated writes per user instead of per IP. */
export function extractToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    const t = auth.slice(7).trim();
    if (t) return t;
  }
  const alt = req.headers['x-auth-token'];
  if (typeof alt === 'string' && alt.length > 0) return alt.trim();
  return null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: number;
      /**
       * Set by `requireSellerSurface`: the caller's OWN supplier row id, resolved
       * from the Bearer token (never from a path, query or body id). Absent for
       * a caller the seller surface did not resolve a row for.
       */
      supplierId?: number;
    }
  }
}

/**
 * Verify the Bearer token; on failure → 401 {error:'auth_required'}. Sets req.userId.
 * Also checks the token's tokenVersion against the DB so a revoked/superseded
 * token (password change, logout-everywhere) is rejected before its TTL expires.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = extractToken(req);
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    next(new HttpError(401, { error: 'auth_required' }));
    return;
  }
  try {
    const [row] = await db
      .select({ tokenVersion: users.tokenVersion })
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);
    if (!row || (row.tokenVersion ?? 0) !== payload.v) {
      next(new HttpError(401, { error: 'auth_required' }));
      return;
    }
  } catch (err) {
    next(err);
    return;
  }
  req.userId = payload.sub;
  next();
}

/** Compose after requireAuth: 401 if user gone, 403 {error:'forbidden'} on role mismatch. */
export function requireRole(role: string) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const uid = req.userId;
      if (uid == null) {
        next(new HttpError(401, { error: 'auth_required' }));
        return;
      }
      const [row] = await db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, uid))
        .limit(1);
      if (!row) {
        next(new HttpError(401, { error: 'auth_required' }));
        return;
      }
      if (row.role !== role) {
        next(new HttpError(403, { error: 'forbidden' }));
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * The SELLER surface — publishing, editing and deleting the caller's OWN
 * listings, their shop profile, their verification checklist, a quote on an RFQ.
 *
 * These routes used to be gated on the role NAME (`requireRole('supplier')`),
 * which made the two surfaces mutually exclusive: the official FactoryDepo
 * account (`sales@factorydepo.com`) owns every listing the desk sources, so it
 * is a seller AND the admin who runs the console — and whichever single role it
 * carried, it lost half of its job. The gate is therefore the caller's own
 * SUPPLIER ROW, not the role string:
 *
 *   - role 'supplier'                            → seller surface. The handler
 *     resolves the row exactly as before (a supplier with no row yet still gets
 *     its 403 `no_supplier` / 404 from the handler, not from here).
 *   - role 'admin' WITH a supplier row            → the same surface, for THAT
 *     row only: it can publish as itself, never as somebody else.
 *   - role 'admin' with NO supplier row           → 403. There is no shop to act
 *     under, and inventing one would let the console publish stock in a
 *     seller's name. (`POST /api/me/become-supplier` is the path to get a row.)
 *   - every other role (buyer, inspector, lab, …) → 403, exactly what
 *     `requireRole('supplier')` answered before.
 *
 * The caller's own row id is attached as `req.supplierId` so a handler can use
 * it without a second lookup — and it comes from the token alone. No body,
 * query or path id is ever read here, so ownership stays the handler's business
 * and the id it checks against can still only be the caller's own.
 *
 * This deliberately does NOT gate the admin plane: `/api/admin/*` stays
 * `requireRole('admin')` (a supplier gets 403 there), and it does not touch the
 * listing routes whose ownership rule already covers a row-less admin
 * (PATCH /api/products/:id, the media routes) — those are owner-or-admin, and
 * the admin branch is the console's correction path.
 */
export async function requireSellerSurface(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const uid = req.userId;
    if (uid == null) {
      next(new HttpError(401, { error: 'auth_required' }));
      return;
    }
    const [row] = await db
      .select({ role: users.role, supplierId: suppliers.id })
      .from(users)
      .leftJoin(suppliers, eq(suppliers.userId, users.id))
      .where(eq(users.id, uid))
      .limit(1);
    if (!row) {
      next(new HttpError(401, { error: 'auth_required' }));
      return;
    }

    const supplierId = row.supplierId == null ? null : Number(row.supplierId);
    if (supplierId != null) req.supplierId = supplierId;

    const role = String(row.role);
    if (role === 'supplier') {
      next();
      return;
    }
    if (role === 'admin' && supplierId != null) {
      next();
      return;
    }
    next(
      new HttpError(403, {
        error: 'forbidden',
        details:
          role === 'admin'
            ? 'This admin account owns no supplier profile — there is no shop to act under.'
            : 'This is a seller action and this account does not sell.',
      }),
    );
  } catch (err) {
    next(err);
  }
}
