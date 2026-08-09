-- 005: supplier contact + source attribution (multi-source import support).
-- Real contact info is publicly exposed by some B2B sources (IndiaMART, Made-in-China)
-- but NOT by Alibaba; these stay NULL when the source doesn't expose them.
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS "contactEmail" TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS "contactPhone" TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS "website" TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS "source" TEXT;
