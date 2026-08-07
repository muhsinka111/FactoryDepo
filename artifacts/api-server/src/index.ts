/**
 * FactoryDepo API server — Express 5 entry.
 * Boot order: middleware → idempotent migrations → routes → /api 404 →
 * static frontend + SPA fallback → error handler → listen.
 */
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import compression from 'compression';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { ZodError } from 'zod';
import { db } from './db.js';
import { HttpError } from './http.js';
import { bootstrapSeedIfEmpty } from './bootstrap-seed.js';
import { healthRouter } from './routes/health.js';
import { authRouter, meRouter } from './routes/auth.js';
import { productsRouter } from './routes/products.js';
import { suppliersRouter } from './routes/suppliers.js';
import { rfqsRouter } from './routes/rfqs.js';

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

/** Boot-time idempotent migrations: every *.sql in the dir, sorted, executed. */
async function runMigrations(): Promise<void> {
  const dir = findMigrationsDir();
  if (!dir) {
    console.warn('[migrate] migrations dir not found — skipping (healthz reports db state)');
    return;
  }
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const content = await readFile(path.join(dir, file), 'utf8');
    await db.execute(sql.raw(content));
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

/* ---------- app ---------- */

const app = express();

// Public-read CORS: the static marketing landing fetches catalog/RFQ data cross-origin.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.disable('x-powered-by');

app.use(cors({ origin: true, credentials: true }));
app.use(compression());
app.use(express.json({ limit: '2mb' }));

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
  app.listen(PORT, () => {
    console.log(`[api] FactoryDepo API listening on http://localhost:${PORT}`);
  });
}

void main();
