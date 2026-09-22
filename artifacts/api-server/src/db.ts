/**
 * DB instance + table re-exports.
 *
 * The schema + client factory live in @workspace/db (lib/db) — this module is
 * the single seam between the API server and the database layer. Every table a
 * route needs is re-exported here so route files never reach into
 * '@workspace/db' directly.
 */
import {
  createDb,
  users,
  suppliers,
  products,
  rfqs,
  quotes,
  inspections,
  orders,
  offers,
  threads,
  messages,
  savedLots,
  shipments,
  notifications,
  supplierDocs,
  featureFlags,
  banners,
  faqs,
  supportTickets,
  productViews,
  productQuestions,
  payments,
  emailOutbox,
} from '@workspace/db';

const connectionString =
  process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/factorydepo';

export const db = createDb(connectionString);

export {
  users,
  suppliers,
  products,
  rfqs,
  quotes,
  inspections,
  orders,
  offers,
  threads,
  messages,
  savedLots,
  shipments,
  notifications,
  supplierDocs,
  featureFlags,
  banners,
  faqs,
  supportTickets,
  productViews,
  productQuestions,
  payments,
  emailOutbox,
};

/** Convenience namespace for call sites that prefer a grouped import. */
export const tables = {
  users,
  suppliers,
  products,
  rfqs,
  quotes,
  inspections,
  orders,
  offers,
  threads,
  messages,
  savedLots,
  shipments,
  notifications,
  supplierDocs,
  featureFlags,
  banners,
  faqs,
  supportTickets,
  productViews,
  payments,
  emailOutbox,
};
