-- ============================================================================
-- 001_init.sql — FactoryDepo bootstrap schema (idempotent)
-- ----------------------------------------------------------------------------
-- Executed on every API boot in filename order. All statements are
-- IF NOT EXISTS so re-runs are no-ops. Column names are camelCase and quoted
-- to match the Drizzle schema in src/schema/index.ts exactly.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "users" (
  "id" serial PRIMARY KEY,
  "email" text NOT NULL UNIQUE,
  "passwordHash" text NOT NULL,
  "name" text NOT NULL,
  "role" text NOT NULL DEFAULT 'buyer' CHECK ("role" IN ('buyer', 'supplier', 'inspector', 'lab', 'logistics', 'admin')),
  "company" text,
  "country" text,
  "lang" text DEFAULT 'en',
  "trustScore" numeric(5, 2) DEFAULT 0,
  "emailVerified" boolean DEFAULT false,
  "createdAt" timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "suppliers" (
  "id" serial PRIMARY KEY,
  "userId" integer NOT NULL UNIQUE REFERENCES "users"("id"),
  "companyName" text NOT NULL,
  "country" text NOT NULL,
  "city" text,
  "description" text,
  "verifiedLevel" integer DEFAULT 0,
  "rating" numeric(2, 1) DEFAULT 0,
  "inspectionsCount" integer DEFAULT 0,
  "fulfillmentRate" numeric(5, 1) DEFAULT 0,
  "tags" jsonb DEFAULT '[]',
  "since" integer,
  "createdAt" timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "products" (
  "id" serial PRIMARY KEY,
  "supplierId" integer NOT NULL REFERENCES "suppliers"("id"),
  "name" text NOT NULL,
  "category" text NOT NULL,
  "description" text,
  "spec" jsonb DEFAULT '[]',
  "price" numeric(14, 2) NOT NULL,
  "currency" text DEFAULT 'USD',
  "unit" text NOT NULL,
  "moq" numeric(14, 2) NOT NULL,
  "originCountry" text NOT NULL,
  "purityGrade" text,
  "verified" boolean DEFAULT false,
  "imageKey" text,
  "createdAt" timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "rfqs" (
  "id" serial PRIMARY KEY,
  "buyerId" integer NOT NULL REFERENCES "users"("id"),
  "title" text NOT NULL,
  "category" text NOT NULL,
  "description" text,
  "quantity" numeric(14, 2) NOT NULL,
  "unit" text NOT NULL,
  "targetCountry" text,
  "status" text DEFAULT 'open' CHECK ("status" IN ('open', 'quoted', 'closed')),
  "deadline" timestamptz,
  "createdAt" timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "quotes" (
  "id" serial PRIMARY KEY,
  "rfqId" integer NOT NULL REFERENCES "rfqs"("id"),
  "supplierId" integer NOT NULL REFERENCES "suppliers"("id"),
  "price" numeric(14, 2) NOT NULL,
  "currency" text DEFAULT 'USD',
  "leadTimeDays" integer NOT NULL,
  "notes" text,
  "status" text DEFAULT 'submitted' CHECK ("status" IN ('submitted', 'accepted', 'rejected')),
  "createdAt" timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "inspections" (
  "id" serial PRIMARY KEY,
  "supplierId" integer NOT NULL REFERENCES "suppliers"("id"),
  "inspectorId" integer REFERENCES "users"("id"),
  "type" text NOT NULL CHECK ("type" IN ('facility_audit', 'production_line', 'lab_test', 'pre_shipment')),
  "status" text DEFAULT 'scheduled' CHECK ("status" IN ('scheduled', 'in_progress', 'passed', 'failed')),
  "score" integer,
  "scheduledAt" timestamptz,
  "completedAt" timestamptz,
  "reportUrl" text,
  "createdAt" timestamptz DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- Hot-path lookup indexes (idempotent)
-- ----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS "idx_products_category" ON "products" ("category");
CREATE INDEX IF NOT EXISTS "idx_products_origin_country" ON "products" ("originCountry");
CREATE INDEX IF NOT EXISTS "idx_rfqs_status" ON "rfqs" ("status");
CREATE INDEX IF NOT EXISTS "idx_quotes_rfq_id" ON "quotes" ("rfqId");
CREATE INDEX IF NOT EXISTS "idx_suppliers_country" ON "suppliers" ("country");
