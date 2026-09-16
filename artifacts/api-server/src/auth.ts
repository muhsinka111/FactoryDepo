/**
 * HMAC-signed Bearer tokens (node:crypto — no JWT lib) + auth middleware.
 * Token format: base64url(JSON payload) "." base64url(HMAC-SHA256(secret, payloadPart))
 * Payload: { sub: userId, v: tokenVersion, exp: epochMs (now + 24h) }
 *
 * `v` is the user's tokenVersion at signing time; requireAuth rejects a token
 * whose `v` no longer matches the row in the DB, so bumping tokenVersion
 * (password change, "log out everywhere") revokes every outstanding token
 * immediately instead of waiting out the TTL.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db, users } from './db.js';
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

function extractToken(req: Request): string | null {
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
