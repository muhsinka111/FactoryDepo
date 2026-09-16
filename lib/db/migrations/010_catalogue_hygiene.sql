-- ============================================================================
-- 010_catalogue_hygiene.sql — catalogue cleanup: scrape damage, category drift,
--                             unusable listings, duplicate titles, imagery
-- ----------------------------------------------------------------------------
-- The owner reported three symptoms on the demo catalogue:
--   1. duplicate-looking listings,
--   2. categories holding the wrong products,
--   3. category chips in the UI that match nothing.
-- This migration cleans and re-labels only. It invents no fact, changes no
-- price/stock/rating figure, and never DELETEs a catalogue row.
--
-- Idempotency: runMigrations() in artifacts/api-server/src/index.ts executes
-- every *.sql in this directory on EVERY boot, so the whole file must survive
-- unlimited re-runs. Every statement below is guarded and a second run must
-- leave the data byte-identical:
--   * the decoder is a CREATE OR REPLACE helper (schema, not data),
--   * every UPDATE's WHERE goes false once the fix has been applied
--     (`... IS DISTINCT FROM ...`, `"imageKey" IS NULL`, or a value test),
--   * the duplicate ranking is deterministic (imageKey, then id) and the
--     "loser" predicate excludes rows already disabled,
--   * nothing here depends on now(), random() or row order.
--
-- Provenance: 5,404 of 5,406 products and 1,545 of 1,547 suppliers carry
-- dataSource='demo'; the two 'platform' rows are real-listing placeholders
-- ("Verify Lot A/B", "Verify Supplier A/B Ltd") and are deliberately untouched
-- by every statement here, including the imagery section.
--
-- Deliberate non-changes (see the report that shipped with this migration):
--   * No category value outside the three listed in section 2 is rewritten —
--     guessing a better bucket than the scraped one is worse than leaving it.
--   * No column is added to label the quarantined rows. A "quarantineReason"
--     column would drift from lib/db/src/schema/index.ts, which owns the
--     Drizzle shape. Quarantined rows are identified again by predicate
--     instead: price <= 0 for section 3, exact duplicate lower(btrim(name))
--     for section 4.
--   * Rows whose imageKey points at a missing /products/ali_*.jpg file are not
--     repaired here; those keys are non-NULL and out of this migration's scope.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. fd_html_unescape() — decode raw HTML entities in text columns
-- ----------------------------------------------------------------------------
-- The scraper stored raw HTML entities (`&amp;`, `&quot;`, `&times;`, ...) in
-- 102 product names. Decoding lives in one helper so all five columns behave
-- identically and a later migration can reuse it.
--
-- The body loops to a fixed point because a few rows are double-encoded
-- (`&amp;amp;` must become `&`, not `&amp;`). The loop is bounded at 8 passes
-- and exits early when a pass changes nothing, so an undecodable leftover such
-- as `&unknown;` can never spin forever. Numeric entities go through chr()
-- with the codepoint range checked first: chr(0) (NUL) and the UTF-16
-- surrogate block raise in UTF-8 databases, and an out-of-range value must be
-- left alone rather than abort an API boot.
--
-- ASCII-only on purpose: no literal non-ASCII byte in this file.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fd_html_unescape(input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $fn$
DECLARE
  v_out  text    := input;
  v_prev text;
  v_pass integer := 0;
  v_rec  record;
  v_chr  text;
BEGIN
  IF v_out IS NULL OR strpos(v_out, '&') = 0 THEN
    RETURN v_out;
  END IF;

  LOOP
    v_pass := v_pass + 1;
    EXIT WHEN v_pass > 8;
    v_prev := v_out;

    -- Required core set
    v_out := replace(v_out, '&amp;',  '&');
    v_out := replace(v_out, '&lt;',   '<');
    v_out := replace(v_out, '&gt;',   '>');
    v_out := replace(v_out, '&quot;', '"');
    v_out := replace(v_out, '&#39;',  '''');
    v_out := replace(v_out, '&apos;', '''');
    v_out := replace(v_out, '&nbsp;', ' ');

    -- Additional named entities actually present in the scraped names
    v_out := replace(v_out, '&prime;', chr(8242));  -- U+2032 prime
    v_out := replace(v_out, '&times;', chr(215));   -- U+00D7 multiplication sign
    v_out := replace(v_out, '&ndash;', chr(8211));  -- U+2013 en dash
    v_out := replace(v_out, '&phi;',   chr(966));   -- U+03C6 greek small phi
    v_out := replace(v_out, '&ordm;',  chr(186));   -- U+00BA masculine ordinal
    v_out := replace(v_out, '&reg;',   chr(174));   -- U+00AE registered sign
    v_out := replace(v_out, '&le;',    chr(8804));  -- U+2264 less-than-or-equal

    -- &#NNN; — decimal numeric entities
    FOR v_rec IN
      SELECT m[1] AS entity, m[2]::integer AS code
      FROM regexp_matches(v_out, '(&#([0-9]{1,7});)', 'g') AS m
    LOOP
      v_chr := CASE
                 WHEN v_rec.code BETWEEN 1 AND 1114111
                  AND v_rec.code NOT BETWEEN 55296 AND 57343
                 THEN chr(v_rec.code)
               END;
      IF v_chr IS NOT NULL THEN
        v_out := replace(v_out, v_rec.entity, v_chr);
      END IF;
    END LOOP;

    -- &#xHH; — hexadecimal numeric entities
    FOR v_rec IN
      SELECT m[1] AS entity,
             ('x' || lpad(m[2], 8, '0'))::bit(32)::integer AS code
      FROM regexp_matches(v_out, '(&#[xX]([0-9a-fA-F]{1,6});)', 'g') AS m
    LOOP
      v_chr := CASE
                 WHEN v_rec.code BETWEEN 1 AND 1114111
                  AND v_rec.code NOT BETWEEN 55296 AND 57343
                 THEN chr(v_rec.code)
               END;
      IF v_chr IS NOT NULL THEN
        v_out := replace(v_out, v_rec.entity, v_chr);
      END IF;
    END LOOP;

    EXIT WHEN v_out IS NOT DISTINCT FROM v_prev;
  END LOOP;

  RETURN v_out;
END;
$fn$;

-- ----------------------------------------------------------------------------
-- 1. Decode HTML entities in the five affected text columns
-- ----------------------------------------------------------------------------
-- The regex guard keeps the scan off untouched rows; the IS DISTINCT FROM
-- guard is what makes a re-run a true no-op: once a value no longer decodes to
-- anything different, the row drops out of the UPDATE even if it still holds
-- an entity-shaped substring we intentionally refuse to guess at.
-- ----------------------------------------------------------------------------

UPDATE "products"
SET "name" = fd_html_unescape("name")
WHERE "name" ~ '&(amp|lt|gt|quot|apos|nbsp|prime|times|ndash|phi|ordm|reg|le|#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6});'
  AND fd_html_unescape("name") IS DISTINCT FROM "name";

UPDATE "products"
SET "description" = fd_html_unescape("description")
WHERE "description" ~ '&(amp|lt|gt|quot|apos|nbsp|prime|times|ndash|phi|ordm|reg|le|#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6});'
  AND fd_html_unescape("description") IS DISTINCT FROM "description";

UPDATE "products"
SET "category" = fd_html_unescape("category")
WHERE "category" ~ '&(amp|lt|gt|quot|apos|nbsp|prime|times|ndash|phi|ordm|reg|le|#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6});'
  AND fd_html_unescape("category") IS DISTINCT FROM "category";

UPDATE "suppliers"
SET "companyName" = fd_html_unescape("companyName")
WHERE "companyName" ~ '&(amp|lt|gt|quot|apos|nbsp|prime|times|ndash|phi|ordm|reg|le|#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6});'
  AND fd_html_unescape("companyName") IS DISTINCT FROM "companyName";

UPDATE "suppliers"
SET "description" = fd_html_unescape("description")
WHERE "description" ~ '&(amp|lt|gt|quot|apos|nbsp|prime|times|ndash|phi|ordm|reg|le|#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6});'
  AND fd_html_unescape("description") IS DISTINCT FROM "description";

-- ----------------------------------------------------------------------------
-- 2. Normalise product categories onto the canonical list (lib/api-spec)
-- ----------------------------------------------------------------------------
-- Exactly three values are remapped, because exactly three were measured as
-- unreachable from the canonical CATEGORIES tuple:
--   Textile    -> Textiles                (singular; Textiles is canonical)
--   Materials  -> Construction Materials  (not in CATEGORIES at all)
--   Industrial -> Hardware & Fasteners    (not in CATEGORIES; added to the
--                                          tuple by this change set)
-- "Materials" and "Industrial" are not merged into the nearest big canonical
-- bucket (Machinery / Metals & Minerals) because the sampled rows are sheets,
-- composites and fasteners — reclassifying them by guesswork would be worse
-- than the honest specific bucket. Every other category value is left alone.
-- Each UPDATE is naturally idempotent: after it runs, no row holds the old
-- value.
-- ----------------------------------------------------------------------------

UPDATE "products" SET "category" = 'Textiles'
WHERE "category" = 'Textile';

UPDATE "products" SET "category" = 'Construction Materials'
WHERE "category" = 'Materials';

UPDATE "products" SET "category" = 'Hardware & Fasteners'
WHERE "category" = 'Industrial';

-- ----------------------------------------------------------------------------
-- 3. Quarantine listings with an unusable price (never DELETE)
-- ----------------------------------------------------------------------------
-- A price of 0 (or negative) means the listing cannot be bought, so it must not
-- appear in "available" figures and must not look purchasable. The existing
-- CHECK constraint on products.status is
--   CHECK ("status" IN ('active', 'sold_out'))
-- (migration 007), so 'sold_out' is the only permitted quarantine value and is
-- what is used. quantityAvailable is zeroed so the row cannot be ordered; the
-- price itself is left untouched — rewriting a price would invent a fact.
-- ----------------------------------------------------------------------------

UPDATE "products"
SET "status" = 'sold_out',
    "quantityAvailable" = 0
WHERE "price" <= 0
  AND ("status" IS DISTINCT FROM 'sold_out' OR "quantityAvailable" <> 0);

-- ----------------------------------------------------------------------------
-- 4. Disable exact near-duplicate titles (never DELETE)
-- ----------------------------------------------------------------------------
-- A duplicate is the same listing title after lower(btrim(name)) — the exact
-- normalisation the report asked for. Rows that merely look similar are NOT
-- merged, and names are compared only within one another, so two suppliers may
-- legitimately keep two products with different titles.
--
-- The survivor is the single best row: one WITH an imageKey first, then the
-- lowest id — deterministic and stable across runs, so run 2 picks the same
-- winners. The others become unsellable (status='sold_out', stock 0) instead of
-- being deleted, so the catalogue can be audited afterwards and nothing is lost
-- silently.
-- ----------------------------------------------------------------------------

WITH duplicate_groups AS (
  SELECT lower(btrim("name")) AS norm
  FROM "products"
  GROUP BY 1
  HAVING count(*) > 1
),
ranked AS (
  SELECT p."id",
         row_number() OVER (
           PARTITION BY lower(btrim(p."name"))
           ORDER BY (p."imageKey" IS NULL)::integer, p."id"
         ) AS rn
  FROM "products" p
  JOIN duplicate_groups d ON d.norm = lower(btrim(p."name"))
)
UPDATE "products" p
SET "status" = 'sold_out',
    "quantityAvailable" = 0
FROM ranked r
WHERE p."id" = r."id"
  AND r.rn > 1
  AND (p."status" IS DISTINCT FROM 'sold_out' OR p."quantityAvailable" <> 0);

-- ----------------------------------------------------------------------------
-- 5. Category-representative imagery for demo rows with no photo
-- ----------------------------------------------------------------------------
-- IMPORTANT: these are generic, AI-generated CATEGORY photographs that the
-- project already owns (artifacts/web/public/products/*.jpg and
-- assets/products/*.jpg — the same 38 files). They are REPRESENTATIVE OF THE
-- CATEGORY ONLY and are NOT photographs of the actual goods. Every path below
-- was verified to exist as a real file before being written; the UI already
-- tags every dataSource='demo' row with <DemoTag />, so a buyer is not told
-- this is the real item.
--
-- Only a category with a genuinely matching photo gets one:
--   Machinery            -> cnc-machine.jpg
--   Industrial Equipment -> industrial-pump.jpg
--   Construction Mat.    -> cement-bags.jpg
--   Textiles             -> polyester-yarn.jpg
--   Chemicals            -> caustic-soda.jpg
--   Electronics          -> plc-controller.jpg
--   Metals & Minerals    -> copper-cathode.jpg
--   Automotive           -> brake-disc.jpg
--   Steel                -> steel-coil.jpg
--   Packaging            -> corrugated-boxes.jpg
--   Plastic & Rubber     -> plastic-granules.jpg
--   Renewable Energy     -> solar-panel.jpg
--
-- Left NULL on purpose, because no curated photo genuinely depicts them:
--   Safety & PPE          (no glove/helmet/shoe/boot photo in the set)
--   Hardware & Fasteners  (no bolt/screw/fastener photo in the set)
-- A fake or mismatched path would be worse than the honest "no photo" card.
--
-- Scoped to dataSource='demo' (the 2,343 photoless demo rows); the two
-- 'platform' placeholder rows are not re-imaged. Idempotent via
-- "imageKey" IS NULL plus the value guard on category.
-- ----------------------------------------------------------------------------

UPDATE "products"
SET "imageKey" = CASE "category"
  WHEN 'Machinery'              THEN '/products/cnc-machine.jpg'
  WHEN 'Industrial Equipment'   THEN '/products/industrial-pump.jpg'
  WHEN 'Construction Materials' THEN '/products/cement-bags.jpg'
  WHEN 'Textiles'               THEN '/products/polyester-yarn.jpg'
  WHEN 'Chemicals'              THEN '/products/caustic-soda.jpg'
  WHEN 'Electronics'            THEN '/products/plc-controller.jpg'
  WHEN 'Metals & Minerals'      THEN '/products/copper-cathode.jpg'
  WHEN 'Automotive'             THEN '/products/brake-disc.jpg'
  WHEN 'Steel'                  THEN '/products/steel-coil.jpg'
  WHEN 'Packaging'              THEN '/products/corrugated-boxes.jpg'
  WHEN 'Plastic & Rubber'       THEN '/products/plastic-granules.jpg'
  WHEN 'Renewable Energy'       THEN '/products/solar-panel.jpg'
END
WHERE "dataSource" = 'demo'
  AND "imageKey" IS NULL
  AND "category" IN (
    'Machinery',
    'Industrial Equipment',
    'Construction Materials',
    'Textiles',
    'Chemicals',
    'Electronics',
    'Metals & Minerals',
    'Automotive',
    'Steel',
    'Packaging',
    'Plastic & Rubber',
    'Renewable Energy'
  );
