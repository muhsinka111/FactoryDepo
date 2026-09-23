/**
 * Boot-time maintenance switches.
 *
 * These are repairs, not features. Each is off unless the environment names it
 * exactly, each prints what it did to the boot log, and each is safe to run
 * twice — because the failure they exist for is precisely a database that
 * received data it should never have had.
 *
 * `PURGE_DEMO_ON_BOOT=1` runs scripts/purge-demo.sql once at boot. It exists
 * because the demo catalogue was `bootstrapSeedIfEmpty`'s business on ANY empty
 * database, production included: deleting the rows by hand is not enough, there
 * has to be a switch for the day a fresh database boots with SEED_DEMO set by
 * mistake — or for the database that was filled before the gate existed.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { db } from './db.js';

export interface DemoCounts {
  products: number;
  suppliers: number;
  users: number;
}

export interface PurgeOutcome {
  ran: boolean;
  line: string;
  counts: { before: DemoCounts; after: DemoCounts } | null;
}

/** On only for the exact string '1' — 'true', 'yes', '0' and '' are not requests. */
export function purgeRequested(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.PURGE_DEMO_ON_BOOT === '1';
}

/** scripts/purge-demo.sql: relative to the bundle first, then to the process cwd. */
export function resolvePurgeScript(): string | null {
  const candidates = [
    fileURLToPath(new URL('../../../scripts/purge-demo.sql', import.meta.url)),
    path.resolve(process.cwd(), 'scripts/purge-demo.sql'),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

async function demoCounts(): Promise<DemoCounts> {
  const result = await db.execute(sql`
    SELECT
      (SELECT count(*)::int FROM "products"  WHERE "dataSource" = 'demo') AS products,
      (SELECT count(*)::int FROM "suppliers" WHERE "dataSource" = 'demo') AS suppliers,
      (SELECT count(*)::int FROM "users") AS users
  `);
  const row = (result.rows?.[0] ?? {}) as Record<string, number>;
  return { products: Number(row.products ?? 0), suppliers: Number(row.suppliers ?? 0), users: Number(row.users ?? 0) };
}

/**
 * Runs the purge when — and only when — the environment asks for it. The SQL is
 * the repository's own script, executed as one batch (it opens and closes its own
 * transaction), so there is a single place that decides what "demo" means.
 */
export async function purgeDemoIfRequested(env: NodeJS.ProcessEnv = process.env): Promise<PurgeOutcome> {
  if (!purgeRequested(env)) return { ran: false, line: '', counts: null };

  const file = resolvePurgeScript();
  if (!file) {
    return {
      ran: false,
      line: '[purge] PURGE_DEMO_ON_BOOT=1 but scripts/purge-demo.sql was not found — nothing was deleted',
      counts: null,
    };
  }

  const before = await demoCounts();
  await db.execute(sql.raw(readFileSync(file, 'utf8')));
  const after = await demoCounts();

  return {
    ran: true,
    line:
      '[purge] PURGE_DEMO_ON_BOOT=1 — demo rows removed: ' +
      `products ${before.products}→${after.products}, suppliers ${before.suppliers}→${after.suppliers}, ` +
      `accounts ${before.users}→${after.users}`,
    counts: { before, after },
  };
}
