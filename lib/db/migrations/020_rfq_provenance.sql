-- 020: RFQ provenance, mirroring products/suppliers.
--
-- The owner asked for ~100 buyer requests spread across the categories. Those are
-- seed rows, not real demand, so every row must be able to say so — the same rule
-- products already follow (docs/DATA_PROVENANCE.md). Without this column a seeded
-- request is indistinguishable from a buyer who genuinely asked for a quotation.
--
--   platform : a real request, posted through POST /api/rfqs
--   demo     : bootstrap seed data (scripts/seed-demo-rfqs.mjs)
--
-- Idempotent: the boot runner re-executes every file after a checksum change.
ALTER TABLE rfqs ADD COLUMN IF NOT EXISTS "dataSource" text NOT NULL DEFAULT 'platform';
CREATE INDEX IF NOT EXISTS rfqs_data_source_idx ON rfqs ("dataSource");
