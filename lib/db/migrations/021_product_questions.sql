-- ============================================================================
-- 021_product_questions.sql
-- ----------------------------------------------------------------------------
-- Product Q&A: a buyer asks the seller a question on a listing, the supplier
-- who OWNS that listing (or an admin) answers it, and the answered pairs are
-- what the product page shows as its FAQ.
--
-- The row is the whole audit trail, which is why nothing here is a flag that
-- gets overwritten:
--   askerId/askerName   the buyer who asked, snapshotted at ask time (a renamed
--                       or deleted account must not silently relabel an old
--                       question);
--   answeredById/ByName the supplier or admin who answered, same reason;
--   answeredAt          when the answer was written (NULL while pending);
--   status              pending -> the seller has not answered yet
--                       answered -> visible to everyone
--                       hidden   -> suppressed by moderation
--   dataSource          'platform' for a real question asked through
--                       POST /api/products/:id/questions. There is no seed for
--                       this table, so every row is genuinely platform data —
--                       the column exists so that stays checkable if seed or
--                       import code ever writes questions (docs/DATA_PROVENANCE.md).
--
-- `answer` is NULL and `status` is 'pending' for a new question; the answer
-- route sets both in one UPDATE. A hidden row keeps its answer text so
-- unmoderating it restores the original wording.
--
-- Idempotency: the ledger guard below, plus CREATE TABLE/INDEX IF NOT EXISTS —
-- the boot runner re-executes every file after a checksum change, and this file
-- must be a byte-level no-op on the second run.
-- ASCII-only file.
-- ============================================================================

DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM "_migrations" WHERE "filename" = '021_product_questions.sql') THEN
    RAISE NOTICE '021_product_questions: already applied, skipping';
    RETURN;
  END IF;

  CREATE TABLE IF NOT EXISTS "product_questions" (
    "id"             serial PRIMARY KEY,
    "productId"      integer NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
    "askerId"        integer NOT NULL REFERENCES "users"("id"),
    "askerName"      text NOT NULL,
    "question"       text NOT NULL,
    "answer"         text,
    "answeredById"   integer REFERENCES "users"("id"),
    "answeredByName" text,
    "answeredAt"     timestamptz,
    "status"         text NOT NULL DEFAULT 'pending'
                     CHECK ("status" IN ('pending', 'answered', 'hidden')),
    "dataSource"     text NOT NULL DEFAULT 'platform'
                     CHECK ("dataSource" IN ('platform', 'demo')),
    "createdAt"      timestamptz DEFAULT now()
  );

  -- Serves the only two reads that exist: the public listing feed
  -- (WHERE "productId" = $1, newest first, filtered by status) and the admin
  -- queue. Column order matches the listing query so the index can be used for
  -- both the equality and the ordering.
  CREATE INDEX IF NOT EXISTS product_questions_product_status_created_idx
    ON "product_questions" ("productId", "status", "createdAt");

END
$mig$;
