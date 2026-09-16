/**
 * FactoryDepo API server — Express 5 entry.
 * Boot order: middleware → idempotent migrations → routes → /api 404 →
 * static frontend + SPA fallback → error handler → listen.
 */
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import compression from 'compression';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { ZodError } from 'zod';
import { db } from './db.js';
import { HttpError } from './http.js';
import { bootstrapSeedIfEmpty, ensureOwnerAdmin } from './bootstrap-seed.js';
import { healthRouter } from './routes/health.js';
import { authRouter, meRouter } from './routes/auth.js';
import { productsRouter } from './routes/products.js';
import { suppliersRouter } from './routes/suppliers.js';
import { rfqsRouter } from './routes/rfqs.js';
import { ordersRouter } from './routes/orders.js';
import { offersRouter } from './routes/offers.js';
import { savedRouter } from './routes/saved.js';
import { messagesRouter } from './routes/messages.js';
import { shipmentsRouter } from './routes/shipments.js';
import { notificationsRouter } from './routes/notifications.js';
import { verificationRouter } from './routes/verification.js';
import { adminPaymentsRouter, paymentsRouter, proformaRouter } from './routes/payments.js';
import { adminRouter } from './routes/admin.js';

/* ---------- path resolution ---------- */

/** Locate lib/db/migrations (relative to bundle/src, then cwd). Null → skip. */
function findMigrationsDir(): string | null {
  const candidates = [
    fileURLToPath(new URL('../../../lib/db/migrations/', import.meta.url)),
    path.resolve(process.cwd(), 'lib/db/migrations'),
  ];
  for (const c of candidates) {
    try {
      if (existsSync(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** Locate the built frontend (artifacts/web/dist). Null → no static serving. */
function findStaticDir(): string | null {
  const candidates = [
    fileURLToPath(new URL('../../web/dist/', import.meta.url)),
    fileURLToPath(new URL('../web/dist/', import.meta.url)),
    path.resolve(process.cwd(), 'artifacts/web/dist'),
    path.resolve(process.cwd(), '../web/dist'),
    path.resolve(process.cwd(), 'web/dist'),
  ];
  for (const c of candidates) {
    try {
      if (existsSync(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/**
 * Boot-time idempotent migrations: every *.sql in the dir, sorted, executed.
 * A checksum ledger (_migrations) tracks what ran so an already-applied file
 * that was edited afterwards gets flagged — the migration itself still
 * re-runs (all files here are written to be safely re-runnable), but a
 * changed checksum on a file that already ran means someone edited history
 * instead of adding a new numbered file, which AGENTS.md says not to do.
 */
async function runMigrations(): Promise<void> {
  const dir = findMigrationsDir();
  if (!dir) {
    console.warn('[migrate] migrations dir not found — skipping (healthz reports db state)');
    return;
  }

  // The ledger tracks every other migration file's checksum; it can't track
  // itself, so it's created directly here rather than via a numbered file.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "_migrations" (
      "filename" text PRIMARY KEY,
      "checksum" text NOT NULL,
      "appliedAt" timestamptz NOT NULL DEFAULT now()
    )
  `);

  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const content = await readFile(path.join(dir, file), 'utf8');
    const checksum = createHash('sha256').update(content).digest('hex');

    const { rows } = await db.execute(sql`SELECT "checksum" FROM "_migrations" WHERE "filename" = ${file}`);
    const prevChecksum = (rows[0] as { checksum?: string } | undefined)?.checksum;
    if (prevChecksum && prevChecksum !== checksum) {
      console.warn(
        `[migrate] WARNING: ${file} was already applied but its content has changed since ` +
          '(checksum mismatch). Re-running it anyway — migrations must stay idempotent — but an ' +
          'applied file should never be edited; add a new numbered migration instead.',
      );
    }

    await db.execute(sql.raw(content));
    await db.execute(sql`
      INSERT INTO "_migrations" ("filename", "checksum")
      VALUES (${file}, ${checksum})
      ON CONFLICT ("filename") DO UPDATE SET "checksum" = EXCLUDED."checksum", "appliedAt" = now()
    `);
    console.log(`[migrate] applied ${file}`);
  }
}

/** Locate the marketing landing (Design A). Null → SPA stays at root. */
function findLandingFile(): string | null {
  const candidates = [
    fileURLToPath(new URL('../../../artifacts/landing/variants/marketplace-light.html', import.meta.url)),
    fileURLToPath(new URL('../../artifacts/landing/variants/marketplace-light.html', import.meta.url)),
    path.resolve(process.cwd(), 'artifacts/landing/variants/marketplace-light.html'),
    path.resolve(process.cwd(), 'artifacts/landing/index.html'),
  ];
  for (const c of candidates) {
    try {
      if (existsSync(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** Locate the shared image assets dir (served at /assets for the landing). */
function findAssetsDir(): string | null {
  const candidates = [
    fileURLToPath(new URL('../../../assets/', import.meta.url)),
    path.resolve(process.cwd(), 'assets'),
  ];
  for (const c of candidates) {
    try {
      if (existsSync(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/* ---------- CORS: two-tier allow-list ---------- */
//
// Anonymous catalog reads (products/suppliers/rfqs/healthz, GET only) stay
// open with ACAO:* — the static marketing landing fetches them cross-origin
// and none of it is sensitive. Everything else (auth, orders, writes) is
// restricted to SITE_URL (+ EXTRA_ORIGINS), with credentials allowed only
// for an origin on that list. This replaces the previous
// cors({origin: true, credentials: true}) which reflected any caller's
// origin — combined with credentials:true that let any site read a logged-in
// user's authenticated responses.

const isProd = process.env.NODE_ENV === 'production';
const SITE_URL = process.env.SITE_URL;
if (isProd && !SITE_URL) {
  console.error('[boot] SITE_URL must be set in production — it drives the CORS allow-list for authenticated routes.');
  process.exit(1);
}
const EXTRA_ORIGINS = (process.env.EXTRA_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const ALLOWED_ORIGINS = new Set([SITE_URL, ...EXTRA_ORIGINS].filter((v): v is string => Boolean(v)));

const PUBLIC_GET_PREFIXES = ['/api/healthz', '/api/products', '/api/suppliers', '/api/rfqs'];

function isPublicGet(req: Request): boolean {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  return PUBLIC_GET_PREFIXES.some((p) => req.path === p || req.path.startsWith(`${p}/`));
}

function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (isPublicGet(req) || (req.method === 'OPTIONS' && PUBLIC_GET_PREFIXES.some((p) => req.path === p || req.path.startsWith(`${p}/`)))) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
    return;
  }

  const origin = req.headers.origin;
  if (typeof origin === 'string' && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
}

/* ---------- rate limiting (hand-rolled, no new dependency) ---------- */
//
// In-memory fixed-window counters per client IP. Good enough for a
// single-instance deploy (this app runs one Railway service, no horizontal
// scaling yet); would need a shared store (Redis) behind a load balancer.

interface RateBucket {
  count: number;
  resetAt: number;
}

function makeRateLimiter(windowMs: number, max: number) {
  const buckets = new Map<string, RateBucket>();

  // Periodic sweep so the map doesn't grow unbounded under many distinct IPs.
  setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, windowMs).unref();

  return function rateLimit(req: Request, res: Response, next: NextFunction): void {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      next(new HttpError(429, { error: 'rate_limited' }));
      return;
    }
    next();
  };
}

const authLoginLimiter = makeRateLimiter(15 * 60 * 1000, 10); // 10 / 15min on login
const apiLimiter = makeRateLimiter(60 * 1000, 300); // 300 / min on /api overall
const writeLimiter = makeRateLimiter(60 * 1000, 30); // 30 / min on write methods

function isWriteMethod(req: Request): boolean {
  return req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH' || req.method === 'DELETE';
}

/* ---------- app ---------- */

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', true); // Railway/most PaaS sit behind a proxy — req.ip needs this for rate limiting

app.use(corsMiddleware);

// Security headers on every response.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  if (isProd) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  next();
});

app.use(compression());
app.use(express.json({ limit: '2mb' }));

app.use('/api', apiLimiter);
app.use('/api', (req, res, next) => (isWriteMethod(req) ? writeLimiter(req, res, next) : next()));
app.use('/api/auth/login', authLoginLimiter);

// request logger (method + path + duration)
app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms`);
  });
  next();
});

/* ---------- API routes ---------- */

app.use('/api/healthz', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/me', meRouter);
app.use('/api/products', productsRouter);
app.use('/api/suppliers', suppliersRouter);
app.use('/api/rfqs', rfqsRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/offers', offersRouter);
app.use('/api/saved', savedRouter);
app.use('/api/threads', messagesRouter);
app.use('/api/shipments', shipmentsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/supplier', verificationRouter);
app.use('/api/orders', proformaRouter);
app.use('/api/orders', paymentsRouter);
app.use('/api/payments', adminPaymentsRouter);
app.use('/api/admin', adminRouter);

// unknown /api/* → JSON 404
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'not_found' });
});

/* ---------- static frontend + SPA fallback (prod) ---------- */

const staticDir = findStaticDir();
const landingFile = findLandingFile();
const assetsDir = findAssetsDir();
if (assetsDir) app.use('/assets', express.static(assetsDir));
if (staticDir) {
  const indexPath = path.join(staticDir, 'index.html');
  // Marketing landing at the exact root; the app (SPA) lives under /products, /suppliers, /rfq, …
  if (landingFile) {
    app.use((req, res, next) => {
      if (req.method === 'GET' && req.path === '/') {
        res.sendFile(landingFile);
        return;
      }
      next();
    });
  }
  app.use(express.static(staticDir, { index: 'index.html', redirect: false }));
  // Express 5: no app.get('*') — use a GET fallback that skips /api.
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      if (existsSync(indexPath)) {
        res.sendFile(indexPath);
        return;
      }
    }
    next();
  });
}

/* ---------- error handler ---------- */

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    res.status(err.status).json(err.body);
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'validation_error', details: err.message });
    return;
  }
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ error: 'invalid_json' });
    return;
  }
  if (err && typeof err === 'object' && 'type' in err && (err as { type?: string }).type === 'entity.too.large') {
    res.status(413).json({ error: 'payload_too_large' });
    return;
  }
  console.error('[api] unhandled error:', err);
  res.status(500).json({ error: 'internal_error' });
});

/* ---------- boot ---------- */

const PORT = Number(process.env.PORT ?? 9090);

async function main(): Promise<void> {
  try {
    await runMigrations();
  } catch (err) {
    // DB unreachable — log and CONTINUE booting (healthz reports db:'down').
    console.warn(
      '[migrate] migration run failed (continuing boot):',
      err instanceof Error ? err.message : String(err),
    );
  }
  try {
    await bootstrapSeedIfEmpty();
  } catch (err) {
    console.warn('[seed] bootstrap failed (continuing boot):', err instanceof Error ? err.message : String(err));
  }
  try {
    await ensureOwnerAdmin();
  } catch (err) {
    console.warn('[admin] owner admin setup failed (continuing boot):', err instanceof Error ? err.message : String(err));
  }
  app.listen(PORT, () => {
    console.log(`[api] FactoryDepo API listening on http://localhost:${PORT}`);
  });
}

void main();
