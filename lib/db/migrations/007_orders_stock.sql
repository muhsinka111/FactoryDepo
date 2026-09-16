-- ============================================================================
-- 007_orders_stock.sql — sellable stock + revocable auth tokens
-- ----------------------------------------------------------------------------
-- Without a quantity column a product could be sold an unlimited number of
-- times and "available now" was unverifiable. Adds quantityAvailable (with a
-- non-negative CHECK so a buggy decrement can never go below zero) and a
-- status column that orders.ts flips to 'sold_out' automatically.
--
-- The backfill below is a stand-in, not real inventory: GREATEST(moq*20, 100)
-- keeps the existing demo catalog sellable instead of dead-on-arrival at
-- deploy. Replace with real stock figures as suppliers confirm them.
--
-- Also adds users.tokenVersion so a Bearer token can be revoked (bumping the
-- column invalidates every outstanding token for that user immediately,
-- instead of waiting out the 24h TTL).
-- ============================================================================

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "quantityAvailable" numeric(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'active';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_quantity_available_nonneg'
  ) THEN
    ALTER TABLE "products" ADD CONSTRAINT "products_quantity_available_nonneg" CHECK ("quantityAvailable" >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_status_check'
  ) THEN
    ALTER TABLE "products" ADD CONSTRAINT "products_status_check" CHECK ("status" IN ('active', 'sold_out'));
  END IF;
END $$;

-- One-time backfill: only rows still at the just-added default (0) get seeded
-- stock, so this never overwrites real figures entered after this migration
-- first ran.
UPDATE "products" SET
  "quantityAvailable" = GREATEST("moq" * 20, 100),
  "status" = 'active'
WHERE "quantityAvailable" = 0;

CREATE INDEX IF NOT EXISTS "idx_products_status" ON "products" ("status");

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tokenVersion" integer NOT NULL DEFAULT 0;
