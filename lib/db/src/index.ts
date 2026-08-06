export * from './schema/index.js';

import { type NodePgDatabase, drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from './schema/index.js';

/** Fully-typed Drizzle database handle bound to the FactoryDepo schema. */
export type Db = ReturnType<typeof drizzle<typeof schema>>;

/** Lowercase alias kept for call sites that prefer `db` as the type name. */
export type db = Db;

/**
 * Create a Drizzle client backed by a `pg` connection Pool.
 *
 * ```ts
 * const db = createDb(process.env.DATABASE_URL!);
 * await db.select().from(users);
 * ```
 *
 * The caller owns the pool lifecycle — call `(db.$client as Pool).end()` to close.
 */
export function createDb(databaseUrl: string): Db {
  const pool = new Pool({ connectionString: databaseUrl });
  return drizzle({ client: pool, schema });
}
