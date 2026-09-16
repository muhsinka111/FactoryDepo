-- ============================================================================
-- 008_data_provenance.sql — label listings by provenance
-- ----------------------------------------------------------------------------
-- 'platform' (a real listing, created through the app) vs 'demo' (bootstrap
-- seed data). Metrics must be honest (AGENTS.md) — the demo catalog should
-- read as demo, not as real supply. Scraped-import rows are removed
-- separately via scripts/remove_scraped_data.sql (a manual, reviewed
-- one-off, not a boot migration — see docs/DATA_PROVENANCE.md).
--
-- Each backfill is wrapped in a DO block keyed on the column not existing
-- yet, so it runs exactly once at column-creation time. A later boot never
-- re-runs it, so a real platform listing created afterwards keeps its label
-- instead of being silently relabeled 'demo' on the next deploy.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'dataSource'
  ) THEN
    ALTER TABLE "products" ADD COLUMN "dataSource" text NOT NULL DEFAULT 'platform';
    -- Until product CRUD ships, every existing row here is bootstrap-seed data.
    UPDATE "products" SET "dataSource" = 'demo';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'suppliers' AND column_name = 'dataSource'
  ) THEN
    ALTER TABLE "suppliers" ADD COLUMN "dataSource" text NOT NULL DEFAULT 'platform';
    UPDATE "suppliers" SET "dataSource" = 'demo';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_data_source_check'
  ) THEN
    ALTER TABLE "products" ADD CONSTRAINT "products_data_source_check" CHECK ("dataSource" IN ('platform', 'demo'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_data_source_check'
  ) THEN
    ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_data_source_check" CHECK ("dataSource" IN ('platform', 'demo'));
  END IF;
END $$;
