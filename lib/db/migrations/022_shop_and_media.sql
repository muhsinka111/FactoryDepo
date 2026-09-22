-- 022_shop_and_media.sql
-- Seller shop tools + durable media + admin control plane (owner directive 2026-09-22).
--
-- Idempotent by the house pattern (see 016/017): the runner re-executes every file on
-- every boot, so the whole body is guarded by the _migrations ledger and every DDL
-- statement is IF NOT EXISTS.
DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM "_migrations" WHERE "filename" = '022_shop_and_media.sql') THEN
    RAISE NOTICE '022: already applied, skipping';
    RETURN;
  END IF;

  -- ---------------------------------------------------------------------------
  -- Seller shop profile: fields a supplier may publish about their own company.
  -- (companyName/city/description/contactEmail/contactPhone/website already exist.)
  -- ---------------------------------------------------------------------------
  ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS "addressLine" text;
  ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS "logoMediaId" integer;
  ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS "incoterms" text;
  ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS "leadTimeDays" integer;
  ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS "paymentTerms" text;

  -- ---------------------------------------------------------------------------
  -- Listing-side additions: where the stock physically sits, its lead time, and
  -- the moderation plane (an admin can pull a listing without destroying it).
  -- ---------------------------------------------------------------------------
  ALTER TABLE products ADD COLUMN IF NOT EXISTS "location" text;
  ALTER TABLE products ADD COLUMN IF NOT EXISTS "leadTimeDays" integer;
  ALTER TABLE products ADD COLUMN IF NOT EXISTS "moderationStatus" text NOT NULL DEFAULT 'visible';
  ALTER TABLE products ADD COLUMN IF NOT EXISTS "pulledReason" text;
  ALTER TABLE products ADD COLUMN IF NOT EXISTS "pulledBy" integer;
  ALTER TABLE products ADD COLUMN IF NOT EXISTS "pulledAt" timestamp with time zone;
  ALTER TABLE products ADD COLUMN IF NOT EXISTS "updatedAt" timestamp with time zone DEFAULT now();

  -- ---------------------------------------------------------------------------
  -- Durable media. The Railway container filesystem is ephemeral (every deploy
  -- resets it), so an uploaded file lives in the database and is streamed back by
  -- GET /api/media/:id. Bytes are capped in the route, not here.
  -- ---------------------------------------------------------------------------
  CREATE TABLE IF NOT EXISTS media (
    id serial PRIMARY KEY,
    "ownerUserId" integer NOT NULL REFERENCES users(id),
    filename text NOT NULL,
    "contentType" text NOT NULL,
    "sizeBytes" integer NOT NULL,
    bytes bytea NOT NULL,
    "createdAt" timestamp with time zone NOT NULL DEFAULT now()
  );

  -- Ordered gallery: one listing may carry several uploaded photos.
  CREATE TABLE IF NOT EXISTS product_media (
    id serial PRIMARY KEY,
    "productId" integer NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    "mediaId" integer NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    position integer NOT NULL DEFAULT 0,
    "createdAt" timestamp with time zone NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS product_media_product_idx ON product_media ("productId", position);

  -- ---------------------------------------------------------------------------
  -- Admin audit: every admin action that changes someone else's data is recorded.
  -- ---------------------------------------------------------------------------
  CREATE TABLE IF NOT EXISTS admin_audit (
    id serial PRIMARY KEY,
    "adminUserId" integer NOT NULL REFERENCES users(id),
    action text NOT NULL,
    entity text NOT NULL,
    "entityId" integer,
    before jsonb,
    after jsonb,
    "createdAt" timestamp with time zone NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS admin_audit_created_idx ON admin_audit ("createdAt");
END
$mig$;
