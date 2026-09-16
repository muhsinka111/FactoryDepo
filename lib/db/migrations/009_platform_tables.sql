-- ============================================================================
-- 009_platform_tables.sql — platform tables behind the three role dashboards
-- ----------------------------------------------------------------------------
-- Everything the buyer / supplier / admin dashboards need that the 001–007
-- schema does not cover yet:
--   * negotiation      — offers (lot-by-lot, with counters via parentOfferId)
--   * messaging        — threads, messages, saved_lots
--   * fulfilment       — shipments (milestone jsonb), payments (bank transfer)
--   * admin ops        — notifications, feature_flags, banners, faqs,
--                        support_tickets, supplier_docs (verification desk)
--   * honesty          — product_views (real view tracking, so totalViews can
--                        stop being a permanent 0 per AGENTS.md) and
--                        email_outbox (transactional outbox, so a mail
--                        provider outage never loses a message)
--
-- Idempotent by construction: CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT
-- EXISTS, CREATE INDEX IF NOT EXISTS. runMigrations() in
-- artifacts/api-server/src/index.ts executes every *.sql in this directory on
-- every boot, so this file must survive unlimited re-runs. No statement here
-- alters or drops existing data: the only ALTERs are ADD COLUMN with either no
-- default (NULL) or a safe NOT NULL DEFAULT.
--
-- Conventions match 001_init.sql: camelCase quoted column names, plain text +
-- CHECK instead of pg enums, serial primary keys, timestamptz.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. offers — lot-by-lot negotiation with counters
-- ----------------------------------------------------------------------------
-- A counter-offer is a new row pointing at the offer it answers through
-- "parentOfferId" (self-referencing FK), so the negotiation is an immutable
-- chain instead of a mutated single row. A countered parent flips to
-- 'countered'; nothing is ever deleted.
CREATE TABLE IF NOT EXISTS "offers" (
  "id" serial PRIMARY KEY,
  "productId" integer NOT NULL REFERENCES "products"("id"),
  "buyerId" integer NOT NULL REFERENCES "users"("id"),
  "supplierId" integer NOT NULL REFERENCES "suppliers"("id"),
  "quantity" numeric(14, 2) NOT NULL,
  "unitPrice" numeric(14, 2) NOT NULL,
  "currency" text DEFAULT 'USD',
  "parentOfferId" integer REFERENCES "offers"("id"),
  "status" text NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'countered', 'accepted', 'rejected', 'withdrawn')),
  "notes" text,
  "createdAt" timestamptz DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 2. threads — one buyer↔supplier conversation (optionally about a product)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "threads" (
  "id" serial PRIMARY KEY,
  "buyerId" integer NOT NULL REFERENCES "users"("id"),
  "supplierId" integer NOT NULL REFERENCES "suppliers"("id"),
  "productId" integer REFERENCES "products"("id"),
  "subject" text,
  "lastMessageAt" timestamptz,
  "createdAt" timestamptz DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 3. messages — the messages inside a thread
-- ----------------------------------------------------------------------------
-- "readAt" NULL means unread, so a read receipt carries a timestamp instead of
-- losing when it was read.
CREATE TABLE IF NOT EXISTS "messages" (
  "id" serial PRIMARY KEY,
  "threadId" integer NOT NULL REFERENCES "threads"("id"),
  "senderId" integer NOT NULL REFERENCES "users"("id"),
  "body" text NOT NULL,
  "readAt" timestamptz,
  "createdAt" timestamptz DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 4. saved_lots — a buyer's shortlist (composite PK = natural uniqueness)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "saved_lots" (
  "userId" integer NOT NULL REFERENCES "users"("id"),
  "productId" integer NOT NULL REFERENCES "products"("id"),
  "createdAt" timestamptz DEFAULT now(),
  PRIMARY KEY ("userId", "productId")
);

-- ----------------------------------------------------------------------------
-- 5. shipments — milestone-tracked fulfilment for an order
-- ----------------------------------------------------------------------------
-- "step" is the position in the milestone list and "milestones" the ordered
-- jsonb array of {label, at, note} entries, so the UI can render partial
-- progress without a table per milestone.
CREATE TABLE IF NOT EXISTS "shipments" (
  "id" serial PRIMARY KEY,
  "orderId" integer NOT NULL REFERENCES "orders"("id"),
  "step" integer NOT NULL DEFAULT 0,
  "milestones" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "trackingNo" text,
  "carrier" text,
  "updatedAt" timestamptz DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 6. notifications — in-app notification feed
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "notifications" (
  "id" serial PRIMARY KEY,
  "userId" integer NOT NULL REFERENCES "users"("id"),
  "role" text,
  "text" text NOT NULL,
  "type" text,
  "read" boolean NOT NULL DEFAULT false,
  "link" text,
  "createdAt" timestamptz DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 7. supplier_docs — verification desk document checklist
-- ----------------------------------------------------------------------------
-- One row per required document per supplier. 'missing' is the default so a
-- checklist can be materialised before anything is uploaded; "fileKey" stays
-- NULL until then.
CREATE TABLE IF NOT EXISTS "supplier_docs" (
  "id" serial PRIMARY KEY,
  "supplierId" integer NOT NULL REFERENCES "suppliers"("id"),
  "docType" text NOT NULL,
  "status" text NOT NULL DEFAULT 'missing' CHECK ("status" IN ('missing', 'submitted', 'approved', 'rejected')),
  "fileKey" text,
  "reviewedBy" integer REFERENCES "users"("id"),
  "reviewedAt" timestamptz,
  "note" text,
  "createdAt" timestamptz DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 8. feature_flags — admin kill switches (key is the natural PK)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "feature_flags" (
  "key" text PRIMARY KEY,
  "enabled" boolean NOT NULL DEFAULT true,
  "label" text NOT NULL,
  "description" text,
  "updatedAt" timestamptz DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 9. banners — admin-managed promotional placements
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "banners" (
  "id" serial PRIMARY KEY,
  "title" text NOT NULL,
  "body" text,
  "placement" text NOT NULL DEFAULT 'home',
  "imageKey" text,
  "href" text,
  "active" boolean NOT NULL DEFAULT false,
  "startsAt" timestamptz,
  "endsAt" timestamptz,
  "createdAt" timestamptz DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 10. faqs — help centre content
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "faqs" (
  "id" serial PRIMARY KEY,
  "category" text,
  "question" text NOT NULL,
  "answer" text NOT NULL,
  "position" integer NOT NULL DEFAULT 0
);

-- ----------------------------------------------------------------------------
-- 11. support_tickets — help centre tickets
-- ----------------------------------------------------------------------------
-- "userId" is nullable: a logged-out visitor can still file a ticket.
CREATE TABLE IF NOT EXISTS "support_tickets" (
  "id" serial PRIMARY KEY,
  "userId" integer REFERENCES "users"("id"),
  "subject" text NOT NULL,
  "body" text,
  "priority" text NOT NULL DEFAULT 'normal',
  "status" text NOT NULL DEFAULT 'open',
  "createdAt" timestamptz DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 12. product_views — real view tracking (honest totalViews)
-- ----------------------------------------------------------------------------
-- AGENTS.md: never render an invented number. Before this table totalViews was
-- a hardcoded 0 because nothing tracked views. One row per view event;
-- "userId" is NULL for anonymous browsing.
CREATE TABLE IF NOT EXISTS "product_views" (
  "id" serial PRIMARY KEY,
  "productId" integer NOT NULL REFERENCES "products"("id"),
  "userId" integer REFERENCES "users"("id"),
  "createdAt" timestamptz DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 13. payments — bank transfer / proforma settlement
-- ----------------------------------------------------------------------------
-- Proof of transfer is an uploaded file key, confirmed manually by an admin
-- ("confirmedBy"/"confirmedAt"), so a payment is never auto-marked paid.
CREATE TABLE IF NOT EXISTS "payments" (
  "id" serial PRIMARY KEY,
  "orderId" integer NOT NULL REFERENCES "orders"("id"),
  "method" text NOT NULL DEFAULT 'bank_transfer',
  "reference" text,
  "amount" numeric(14, 2) NOT NULL,
  "currency" text NOT NULL DEFAULT 'USD',
  "status" text NOT NULL DEFAULT 'awaiting' CHECK ("status" IN ('awaiting', 'confirmed', 'rejected', 'refunded')),
  "proofKey" text,
  "confirmedBy" integer REFERENCES "users"("id"),
  "confirmedAt" timestamptz,
  "createdAt" timestamptz DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 14. email_outbox — transactional outbox (email survives provider outages)
-- ----------------------------------------------------------------------------
-- Mail is written here first and delivered by a later worker, so a request
-- never fails (and a message is never lost) because the mail provider is down.
-- 'attempts'/'lastError' make retries observable instead of silent.
CREATE TABLE IF NOT EXISTS "email_outbox" (
  "id" serial PRIMARY KEY,
  "toEmail" text NOT NULL,
  "subject" text NOT NULL,
  "template" text NOT NULL,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" text NOT NULL DEFAULT 'queued' CHECK ("status" IN ('queued', 'sent', 'failed')),
  "attempts" integer NOT NULL DEFAULT 0,
  "lastError" text,
  "sentAt" timestamptz,
  "createdAt" timestamptz DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- New columns on existing tables (additive only — no data is altered)
-- ----------------------------------------------------------------------------
-- users: password reset + email verification tokens. Both expire, so a leaked
-- token is not valid forever.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "passwordResetToken" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "passwordResetExpires" timestamptz;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "emailVerifyToken" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "emailVerifyExpires" timestamptz;

-- orders: proforma (bank transfer) number + payment state, separate from the
-- existing fulfilment "status" column (pending → paid → shipped → delivered).
-- "unpaid" is the safe default for the rows that already exist.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "proformaNumber" text;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "paymentStatus" text NOT NULL DEFAULT 'unpaid';
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "paidAt" timestamptz;

-- suppliers: attestation (who signed off the verification materials, and when).
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "attestedAt" timestamptz;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "attestedBy" integer REFERENCES "users"("id");

-- ----------------------------------------------------------------------------
-- Hot-path indexes (idempotent; names follow the 006/007 "<table>_<col>_idx" style)
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "offers_buyerId_idx" ON "offers" ("buyerId");
CREATE INDEX IF NOT EXISTS "offers_supplierId_idx" ON "offers" ("supplierId");
CREATE INDEX IF NOT EXISTS "offers_productId_idx" ON "offers" ("productId");
CREATE INDEX IF NOT EXISTS "messages_threadId_idx" ON "messages" ("threadId");
CREATE INDEX IF NOT EXISTS "threads_buyerId_idx" ON "threads" ("buyerId");
CREATE INDEX IF NOT EXISTS "threads_supplierId_idx" ON "threads" ("supplierId");
CREATE INDEX IF NOT EXISTS "notifications_userId_idx" ON "notifications" ("userId");
-- Unread badge: every notification query filters on (userId, read = false).
CREATE INDEX IF NOT EXISTS "notifications_userId_read_idx" ON "notifications" ("userId", "read");
CREATE INDEX IF NOT EXISTS "shipments_orderId_idx" ON "shipments" ("orderId");
CREATE INDEX IF NOT EXISTS "product_views_productId_idx" ON "product_views" ("productId");
CREATE INDEX IF NOT EXISTS "payments_orderId_idx" ON "payments" ("orderId");
-- Outbox worker drains the queue by status.
CREATE INDEX IF NOT EXISTS "email_outbox_status_idx" ON "email_outbox" ("status");
CREATE INDEX IF NOT EXISTS "supplier_docs_supplierId_idx" ON "supplier_docs" ("supplierId");
