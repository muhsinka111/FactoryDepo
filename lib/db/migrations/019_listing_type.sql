-- 019: surplus-first listing facet.
--
-- Orthogonal to `category`: a lot is steel AND surplus at the same time, so this
-- is a facet, not a taxonomy. Values are fixed and validated in code
-- (lib/api-zod -> zListingType); the DB only carries the default.
--
--   stock      : ordinary ready stock
--   surplus    : an overproduction run / excess production
--   overstock  : slow-moving accumulated inventory
--   liquidation: distressed clearance of a whole inventory
--   seconds    : factory seconds, cosmetic or minor defects
--   container  : container-ready lot, sold as a whole container
--
-- Idempotent (the boot runner re-executes every file after a checksum change).
ALTER TABLE products ADD COLUMN IF NOT EXISTS "listingType" text NOT NULL DEFAULT 'stock';
CREATE INDEX IF NOT EXISTS products_listing_type_idx ON products ("listingType");
