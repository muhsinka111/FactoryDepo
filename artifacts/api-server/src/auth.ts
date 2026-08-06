/**
 * HMAC-signed Bearer tokens (node:crypto — no JWT lib) + auth middleware.
 * Token format: base64url(JSON payload) "." base64url(HMAC-SHA256(secret, payloadPart))
 * Payload: { sub: userId, exp: epochMs (now + 30d) }
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db, users } from './db.js';
import { HttpError } from './http.js';

const SECRET = process.env.APP_SECRET ?? 'dev-secret-change-me';
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface TokenPayload {
  sub: number;
  exp: number;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

export function signToken(userId: number): string {
  const payload: TokenPayload = { sub: userId, exp: Date.now() + TTL_MS };
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
    if (typeof payload.sub !== 'number' || typeof payload.exp !== 'number') return null;
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

/** Verify the Bearer token; on failure → 401 {error:'auth_required'}. Sets req.userId. */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = extractToken(req);
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    next(new HttpError(401, { error: 'auth_required' }));
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
