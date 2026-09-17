-- ============================================================================
-- 017_fix_anchor_false_positive.sql
-- ----------------------------------------------------------------------------
-- 014_category_and_descriptions.sql moved rows into "Marine & Offshore" on a
-- keyword test that included the bare word "anchor". One row was swept up by it
-- that is not marine at all:
--
--   id 2839 "Expansion Anchor Bolts and Nuts Wedge Undercut Anchor Through Bolt
--            Zinc Plated"  -> a construction/structural fastener
--
-- It belongs in Hardware & Fasteners, which is where it was before 014. The
-- genuine anchor-derived marine row ("Anchor Chain Hot DIP Galvanized DIN766
-- Welded Steel Link Chain") stays, because a welded anchor chain is ship's
-- ground tackle.
--
-- 014 is already recorded in the checksum ledger, so it is not edited; this file
-- is a forward correction, exactly what AGENTS.md asks for. It is self-contained
-- and declares no helper functions.
--
-- The stored description has to move with the row, otherwise it would keep
-- saying "sits in the Marine & Offshore category". The only repair needed is the
-- category name inside that one sentence, and it is applied only while the row
-- still carries the old value in both columns, so a hand-written or already
-- corrected description can never be damaged.
--
-- Idempotency: the ledger guard, the `"category" = 'Marine & Offshore'` filter,
-- and the `description LIKE '%Marine & Offshore%'` filter all go false after the
-- first run. A second run is a byte-level no-op. ASCII-only file.
-- ============================================================================

DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM "_migrations" WHERE "filename" = '017_fix_anchor_false_positive.sql') THEN
    RAISE NOTICE '017_fix_anchor_false_positive: already applied, skipping';
    RETURN;
  END IF;

  UPDATE "products"
  SET "category"    = 'Hardware & Fasteners',
      "description" = replace("description", 'Marine & Offshore', 'Hardware & Fasteners')
  WHERE "id" = 2839
    AND "category" = 'Marine & Offshore'
    AND "name" ~* '(anchor bolt|anchor through bolt|expansion anchor)'
    AND "description" LIKE '%Marine & Offshore%'
    AND "description" NOT LIKE '%Hardware & Fasteners%';

END
$mig$;
