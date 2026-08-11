/**
 * DB instance + table re-exports.
 *
 * The schema + client factory live in @workspace/db (lib/db) — this module is
 * the single seam between the API server and the database layer.
 */
import { createDb, users, suppliers, products, rfqs, quotes, orders } from '@workspace/db';

const connectionString =
  process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/factorydepo';

export const db = createDb(connectionString);

export { users, suppliers, products, rfqs, quotes, orders };

/** Convenience namespace for call sites that prefer a grouped import. */
export const tables = { users, suppliers, products, rfqs, quotes, orders };
