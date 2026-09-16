-- ============================================================================
-- remove_scraped_data.sql — one-time cleanup, run manually (NOT a boot migration)
-- ----------------------------------------------------------------------------
-- Removes rows produced by the deleted scripts/import/ scrapers (Alibaba,
-- Made-in-China, IndiaMART). See docs/DATA_PROVENANCE.md for why: the source
-- sites prohibit automated collection, the photographs belong to the
-- suppliers/platforms, and listing real companies who never agreed to be
-- there, at prices we cannot honour, is the exact failure this product
-- positions against.
--
-- Deliberately NOT placed in lib/db/migrations/ — that directory auto-runs on
-- every API boot, including in production, with no review step. A one-time
-- data deletion belongs behind a human running it on purpose. Review the
-- SELECT counts first, then run this file against the target database:
--
--   Local:  psql "$DATABASE_URL" -f scripts/remove_scraped_data.sql
--   Prod:   railway connect Postgres < scripts/remove_scraped_data.sql
--
-- Scraped rows are identifiable by suppliers.source (set only by the import
-- script) and products."imageKey" pointing at a scraped (ali_*) image. Safe
-- to re-run: once the matching rows are gone, it matches nothing.
-- ============================================================================

-- Review before running:
-- SELECT count(*) FROM suppliers WHERE source IS NOT NULL;
-- SELECT count(*) FROM products WHERE "imageKey" LIKE '/products/ali\_%' ESCAPE '\';

BEGIN;

DELETE FROM "orders" WHERE "productId" IN (
  SELECT "id" FROM "products" WHERE "imageKey" LIKE '/products/ali\_%' ESCAPE '\'
);
DELETE FROM "orders" WHERE "supplierId" IN (
  SELECT "id" FROM "suppliers" WHERE "source" IS NOT NULL
);
DELETE FROM "quotes" WHERE "supplierId" IN (
  SELECT "id" FROM "suppliers" WHERE "source" IS NOT NULL
);
DELETE FROM "products" WHERE "imageKey" LIKE '/products/ali\_%' ESCAPE '\';
DELETE FROM "products" WHERE "supplierId" IN (
  SELECT "id" FROM "suppliers" WHERE "source" IS NOT NULL
);
DELETE FROM "suppliers" WHERE "source" IS NOT NULL;
DELETE FROM "users" WHERE "email" LIKE 'supplier-%@import.local';

COMMIT;
