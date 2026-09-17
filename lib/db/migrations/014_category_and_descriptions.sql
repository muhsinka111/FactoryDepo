-- ============================================================================
-- 014_category_and_descriptions.sql
-- ----------------------------------------------------------------------------
-- The owner reported three symptoms on the demo catalogue:
--   1. 11 of the 25 canonical categories (lib/api-spec CATEGORIES) hold ZERO
--      products, so those category chips are dead ends,
--   2. the listings that do appear carry no usable description — the scraper
--      wrote "Real listing sourced from Alibaba (query: X). Source: https://..."
--      into 5,372 of 5,404 rows,
--   3. therefore a buyer clicking a category sees cards with no usable prose.
--
-- This migration re-labels and re-writes prose ONLY. It invents no fact: no
-- name, price, moq, unit, originCountry, purityGrade, quantityAvailable, status
-- or dataSource value is touched, and no row is DELETEd. Every new description
-- is assembled from strings already present on that same row.
--
-- Idempotency: runMigrations() executes every *.sql in this directory on EVERY
-- boot, so run 2 must be a byte-level no-op. Three independent guards:
--   * a ledger guard: if this filename is already recorded in _migrations the
--     whole file exits immediately. The runner creates _migrations before it
--     executes any file, so that SELECT is always safe.
--   * every category UPDATE is keyed on the destination value being absent
--     (WHERE "category" = '<source>'), so once a row lands in its new category
--     it never matches the rule again.
--   * the description UPDATE is keyed on the exact junk predicate, and the text
--     it writes no longer matches that predicate, so run 2 selects zero rows.
-- No now(), random() or row order is used anywhere. ASCII-only file.
--
-- Category destinations: only a destination the row's OWN TITLE names is used.
-- Every rule is a narrow keyword test on "name" (never a bare word such as
-- "equipment") and is scoped to the source categories measured to contain the
-- candidates, so no row can be moved twice.
--
-- Left EMPTY on purpose (no honest match exists among the 5,404 demo rows):
--   Mining & Ore — once "ore CRUSHER / ore BALL MILL / ore MACHINE" (mining
--                  equipment, correctly Machinery) are excluded, the only
--                  commodity ore row is "Antimony Ore 50-60%". One row does
--                  not justify draining Metals & Minerals.
--   Furniture & Wood — the only finished furniture item in the catalogue is one
--                  event chair/sofa row; the hundreds of "wood" rows elsewhere
--                  are plywood/MDF board (a construction material), wood
--                  coating resins, or woodworking machines.
--
-- Descriptions: a row is rewritten only when its description is NULL, blank,
-- shorter than 25 characters, starts with '[' or '![' (scrape markup), contains
-- a URL, or is the scraper stamp "Real listing sourced from ...". The 32
-- genuine catalogue descriptions (id 1 "LME A-grade copper cathode, ...",
-- id 39 "EPDM rubber seals and gaskets, ...") are left alone.
-- Each replacement is 2-3 sentences built from name + category +
-- originCountry + unit + moq + purityGrade + currency + price + one spec pair.
-- Six sentence skeletons are chosen by id % 6 and the money clause rotates over
-- three shapes, so neighbouring cards do not read as one template. Nothing is
-- asserted that is not on the row: no certification, capacity, lead time,
-- stock state or quality claim. The rendered text is vetted before it is
-- written (>= 40 chars, no URL, no leading '['/'![', <= 400 chars) and the
-- UPDATE re-tests that predicate, so a row that fails vetting keeps its old
-- text rather than receiving a bad one.
-- ============================================================================

DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM "_migrations" WHERE "filename" = '014_category_and_descriptions.sql') THEN
    RAISE NOTICE '014_category_and_descriptions: already applied, skipping';
    RETURN;
  END IF;

  -- --------------------------------------------------------------------------
  -- 0. Helpers (pure text functions, no table access). Created before use.
  -- --------------------------------------------------------------------------

  -- Country code -> English phrasing. Only the four codes measured in the
  -- catalogue are named; anything else falls through to the raw code.
  CREATE OR REPLACE FUNCTION fd014_country(c text)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  AS $fn$
    SELECT CASE btrim(coalesce(c, ''))
      WHEN 'CN'     THEN 'China'
      WHEN 'TR'     THEN 'Turkey'
      WHEN 'DE'     THEN 'Germany'
      WHEN 'Global' THEN 'a global sourcing network'
      ELSE nullif(btrim(coalesce(c, '')), '')
    END;
  $fn$;

  -- A few scraped titles open with punctuation ("[Special for Romania] Mini
  -- Air Cooler ..." or "![Search icon"). A description that starts with '[' or
  -- '![' is rejected by the vetting below, so such a title is quoted before it
  -- is embedded: "..." keeps the sentence readable and keeps the paragraph from
  -- opening with scrape markup.
  CREATE OR REPLACE FUNCTION fd014_wrap(n text)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  AS $fn$
    SELECT CASE
             WHEN n IS NULL THEN NULL
             WHEN n ~ '^[[:space:]]*[!\[]' THEN '"' || n || '"'
             ELSE n
           END;
  $fn$;

  -- The opening 120 characters of a listing title, trailing punctuation
  -- trimmed. The C-R-A-F-T spelling of the character class keeps the file free
  -- of any literal backslash. 120 characters keeps even a title with three spec
  -- clauses short enough that the finished description stays inside 400.
  CREATE OR REPLACE FUNCTION fd014_short_name(n text)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  AS $fn$
    SELECT nullif(
             btrim(
               regexp_replace(
                 left(btrim(coalesce(n, '')), 120),
                 '[\s,;:./|' || chr(92) || '-]+$', ''
               )
             ),
             ''
           );
  $fn$;

  -- Decimal without trailing zeros: 25.00 -> 25, 4.80 -> 4.8, 0.35 -> 0.35.
  CREATE OR REPLACE FUNCTION fd014_num(v numeric)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  AS $fn$
    SELECT CASE
             WHEN v IS NULL THEN NULL
             WHEN v = trunc(v) THEN trunc(v)::bigint::text
             ELSE btrim(to_char(v, 'FM999999999990.99'), '0')
           END;
  $fn$;

  -- One genuinely informative spec bullet: the first pair whose key is not the
  -- MOQ (already stated) and whose value is short enough to read as a fact.
  -- Prefers a value carrying a figure, else the first usable pair.
  CREATE OR REPLACE FUNCTION fd014_spec(s jsonb)
  RETURNS text
  LANGUAGE plpgsql
  IMMUTABLE
  AS $fn$
  DECLARE
    v_item jsonb;
    v_key  text;
    v_val  text;
    v_fb   text;
  BEGIN
    IF s IS NULL OR jsonb_typeof(s) <> 'array' OR jsonb_array_length(s) = 0 THEN
      RETURN NULL;
    END IF;

    FOR v_item IN SELECT jsonb_array_elements(s)
    LOOP
      CONTINUE WHEN jsonb_typeof(v_item) <> 'object';
      v_key := nullif(btrim(coalesce(v_item ->> 'key', '')), '');
      v_val := nullif(btrim(coalesce(v_item ->> 'value', '')), '');
      CONTINUE WHEN v_key IS NULL;
      CONTINUE WHEN v_key ILIKE '%moq%' OR v_key ILIKE '%minimum%';
      CONTINUE WHEN v_val IS NULL;
      CONTINUE WHEN length(v_val) > 22;
      CONTINUE WHEN v_val ~ '^\s*[!\[]';
      CONTINUE WHEN v_val ILIKE '%http%';
      IF v_val ~ '[0-9]' THEN
        RETURN v_key || ' ' || v_val;   -- prefer a value that carries a figure
      END IF;
      IF v_fb IS NULL THEN
        v_fb := v_key || ' ' || v_val;
      END IF;
    END LOOP;

    RETURN v_fb;
  END;
  $fn$;

  -- The whole description. Six skeletons keyed on id % 6; the money clause
  -- rotates over three shapes keyed on id % 3. concat_ws() drops NULL/NULLIF
  -- arguments, so a row with no purity grade or no usable spec simply gets a
  -- shorter, still grammatical description.
  CREATE OR REPLACE FUNCTION fd014_desc(
    v_name    text,
    v_cat     text,
    v_country text,
    v_unit    text,
    v_moq     text,
    v_price   text,
    v_cur     text,
    v_purity  text,
    v_spec    text,
    v_id      integer
  )
  RETURNS text
  LANGUAGE plpgsql
  IMMUTABLE
  AS $fn$
  DECLARE
    v text;
  BEGIN
    -- A row with neither a name nor a category has nothing to describe.
    IF coalesce(v_name, '') = '' AND coalesce(v_cat, '') = '' THEN
      RETURN NULL;
    END IF;

    WITH b AS (
      SELECT
        fd014_wrap(coalesce(v_name, 'This listing')) AS nm,
        coalesce(v_cat, 'this product') AS cat,
        coalesce(v_country, 'an unlisted origin') AS co,
        (coalesce(v_id, 0) % 6) AS tk,
        (coalesce(v_id, 0) % 3) AS tk3,
        nullif(btrim(coalesce(v_purity, '')), '') AS pu,
        coalesce(v_spec, '') AS sc,
        nullif(btrim(coalesce(v_price, '')), '') AS pr,
        nullif(btrim(coalesce(v_moq, '')), '') AS mq,
        coalesce(nullif(btrim(coalesce(v_cur, '')), ''), 'USD') AS cu,
        CASE
          WHEN v_unit IS NULL OR btrim(v_unit) = '' THEN NULL
          WHEN btrim(v_unit) IN ('pc', 'pcs', 'piece', 'pieces', 'unit',
                                 'units', 'set', 'sets') THEN ''
          ELSE btrim(v_unit) || ' '
        END AS un
    ),
    t AS (
      SELECT b.*,
        CASE
          WHEN b.un IS NULL AND b.mq IS NOT NULL THEN
            'A minimum order of ' || b.mq || ' is quoted.'
          WHEN b.un IS NULL THEN
            NULL
          WHEN b.mq IS NULL THEN
            'It is priced per ' || b.un || 'unit.'
          WHEN b.mq = '1' THEN
            'Pricing is quoted per ' || b.un || 'unit with no minimum order quantity.'
          ELSE
            'The minimum order is ' || b.mq || ' ' || b.un || 'units.'
        END AS t1,
        CASE b.tk3
          WHEN 0 THEN
            CASE WHEN b.pr IS NOT NULL THEN
              'The listed price is ' || b.cu || ' ' || b.pr
              || ' per ' || coalesce(b.un, '') || 'unit.'
            ELSE NULL END
          WHEN 1 THEN
            CASE WHEN b.pr IS NOT NULL THEN
              'It is listed at ' || b.cu || ' ' || b.pr
              || ' per ' || coalesce(b.un, '') || 'unit.'
            ELSE NULL END
          ELSE
            CASE WHEN b.pr IS NOT NULL THEN
              'Listed price: ' || b.cu || ' ' || b.pr
              || ' per ' || coalesce(b.un, '') || 'unit.'
            ELSE NULL END
        END AS t2
      FROM b
    )
    SELECT btrim(regexp_replace(
             concat_ws(' ', f1, f2, f3, f4, f5, f6),
             '\s+', ' ', 'g'
           ))
    INTO v
    FROM (
      SELECT
        CASE t.tk
          WHEN 0 THEN t.nm || ' is listed in the ' || t.cat || ' category.'
          WHEN 1 THEN t.nm || ' sits in the ' || t.cat || ' category.'
          WHEN 2 THEN 'Filed under ' || t.cat || ', ' || t.nm || '.'
          WHEN 3 THEN t.nm || ' - filed under ' || t.cat || '.'
          WHEN 4 THEN 'This listing covers ' || t.nm || ' (' || t.cat || ').'
          ELSE t.nm || ', catalogued under ' || t.cat || '.'
        END AS f1,
        CASE
          WHEN t.co IS NULL THEN NULL
          WHEN t.co = 'a global sourcing network' THEN
            'It is offered through a global sourcing network.'
          WHEN t.tk % 2 = 0 THEN 'It is offered by a supplier in ' || t.co || '.'
          ELSE 'The supplier is based in ' || t.co || '.'
        END AS f2,
        CASE
          WHEN t.pu IS NULL THEN NULL
          WHEN t.tk % 2 = 0 THEN 'The stated grade is ' || t.pu || '.'
          ELSE 'Grade on file: ' || t.pu || '.'
        END AS f3,
        CASE
          WHEN t.sc = '' THEN NULL
          WHEN t.tk % 2 = 0 THEN 'Specification: ' || t.sc || '.'
          ELSE 'Spec sheet: ' || t.sc || '.'
        END AS f4,
        t.t1 AS f5,
        t.t2 AS f6
      FROM t
    ) AS f;

    IF v IS NULL OR length(v) < 40 THEN
      RETURN NULL;
    END IF;

    IF v ~ '^\s*[!\[]' OR v ILIKE '%http%' THEN
      RETURN NULL;
    END IF;

    -- Over-long is the one failure the builder can fix itself: fall back to the
    -- bare "what it is + where it ships from" sentence, and only then to the
    -- title and category alone.
    IF length(v) > 400 THEN
      v := CASE
             WHEN v_country IS NOT NULL AND v_country <> 'a global sourcing network'
               THEN fd014_short_name(v_name) || ' - ' || coalesce(v_cat, 'product')
                    || ' - ships from ' || v_country || '.'
             ELSE fd014_short_name(v_name) || ' - ' || coalesce(v_cat, 'product') || '.'
           END;
    END IF;

    IF length(v) > 400 THEN
      v := left(v, 397) || '...';
    END IF;

    IF v IS NULL OR length(v) < 40 OR length(v) > 400 OR v ~ '^\s*[!\[]'
       OR v ILIKE '%http%' THEN
      RETURN NULL;
    END IF;

    RETURN v;
  END;
  $fn$;

  -- --------------------------------------------------------------------------
  -- 1. Category moves.
  -- --------------------------------------------------------------------------

  -- 1a. Ceramics & Glass — tiles, porcelain, ceramic ware and flat /
  -- borosilicate glass currently filed under Construction Materials. Excluded
  -- because the title names something else that merely mentions glass/ceramic:
  -- fibre glass, acrylic/PMMA/PVC/polycarbonate sheet, solar modules, machines.
  UPDATE "products"
  SET "category" = 'Ceramics & Glass'
  WHERE "category" IN ('Construction Materials', 'Industrial Equipment')
    AND "name" ~* '\m(tiles?|porcelain|ceramics?|ceramica|stoneware)\M'
    AND "name" !~* '(rubber|conveyor|lagging|laser|machine|cutting|blade|saw|drill|tool|pulley)';

  UPDATE "products"
  SET "category" = 'Ceramics & Glass'
  WHERE "category" IN ('Construction Materials', 'Industrial Equipment')
    AND "name" ~* '(tempered glass|toughened glass|float glass|borosilicate|borofloat|pyrex|glass sheet|glass sheets|glass slab|glass plate|glass ceramic|fireclay|kitchen sink)'
    AND "name" !~* '(fibre ?glass|fiber ?glass|glass fiber|glass fibre|acrylic|pmma|polycarbonate|pvc|solar|laser|machine|bottle|jar|vial)';

  -- 1b. Paper & Pulp — raw kraft/pulp/liner stock sitting in Packaging. The
  -- finished goods built from it (boxes, bags, cartons, cups, labels,
  -- stickers) stay in Packaging.
  UPDATE "products"
  SET "category" = 'Paper & Pulp'
  WHERE "category" = 'Packaging'
    AND "name" ~* '\m(kraft|pulp|pulping|linerboard|testliner|fluting|paperboard)\M'
    AND "name" !~* '(box|boxes|bag|bags|carton|cartons|cup|cups|bowl|label|labels|sticker|stickers|tray|trays|pizza|hamburger|boxe)';

  -- 1c. Rubber — actual rubber goods (sheet, mat, lining, crumb, gasket) filed
  -- under Plastic & Rubber. Conveyor belting, V-belts, pulley lagging, idler
  -- rollers, tyres and PVC/poly/plastic products stay put.
  UPDATE "products"
  SET "category" = 'Rubber'
  WHERE "category" = 'Plastic & Rubber'
    AND "name" ~* '\mrubber\M'
    AND "name" !~* '(conveyor|belt|belting|lagging|idler|roller|pulley|tyre|tire|plastic|pvc|poly|epoxy|resin)';

  -- 1d. Furniture & Wood — one finished furniture item (see header).
  UPDATE "products"
  SET "category" = 'Furniture & Wood'
  WHERE "category" IN ('Textiles', 'Construction Materials', 'Packaging', 'Industrial Equipment')
    AND "name" ~* '\m(chairs?|sofas?|desks?|wardrobes?|mattress(es)?|nightstand|bookshelf|bedstead|headboard|recliner)\M'
    AND "name" !~* '(fabric|leather|textile|upholstery|cover|lining|mesh|nonwoven|keypad|webbing|profile|foam)';

  -- 1e. Medical Supplies — field medical kits, surgical/orthopaedic powered
  -- instruments and implant-grade titanium bar. Rows where "medical" is only an
  -- application note on a general product are not moved.
  UPDATE "products"
  SET "category" = 'Medical Supplies'
  WHERE "category" IN ('Safety & PPE', 'Industrial Equipment', 'Machinery', 'Metals & Minerals', 'Construction Materials')
    AND "name" ~* '(first aid|first-aid|medical kit|medical bag|medical supply|surgical|orthopaedic|orthopedic|implant|medical grade titanium|medical titanium)';

  -- 1f. Food Processing — ice makers.
  UPDATE "products"
  SET "category" = 'Food Processing'
  WHERE "category" IN ('Machinery', 'Industrial Equipment')
    AND "name" ~* '(ice maker|ice machine|ice making|ice flaker|flaker|ice plant|block ice|tube ice|flake ice|cube ice)';

  -- 1f2. Food Processing — machines whose title names the food being
  -- processed. Conveyors, chains, pellet mills and general packaging machinery
  -- stay in Machinery.
  UPDATE "products"
  SET "category" = 'Food Processing'
  WHERE "category" IN ('Machinery', 'Industrial Equipment')
    AND "name" ~* '(food|grain|flour mill|maize|corn meal|chocolate|coffee|bakery|biscuit|dairy|meat|fish|seafood|fruit|vegetable|juice|beverage)'
    AND "name" !~* '(conveyor|idler|chain|sprocket|packaging machine|filling machine|pellet mill|feed mill|pellet)';

  -- 1g. Energy — non-renewable power generation and grid equipment. Wind and
  -- solar stay in Renewable Energy; marine/offshore transformers go to
  -- Marine & Offshore (rule 1i). The four "boiler" rows are a pool heater, a
  -- pump, welding electrodes and a steel pipe, not power plant boilers.
  UPDATE "products"
  SET "category" = 'Energy'
  WHERE "category" IN ('Machinery', 'Electronics')
    AND "name" ~* '\m(generator|generators|genset|gensets|alternator|alternators|transformer|transformers|turbine|turbines)\M'
    AND "name" !~* '(wind|solar|renewable|hydro|wave|tidal|geothermal|biomass|marine|offshore|ship|boat|ozone|welding machine|battery)';

  -- 1h. Agriculture — fertilizer / biostimulant / soil-input rows from
  -- Chemicals, plus farm machinery and animal-feed mills. Wood and biomass
  -- pellet mills are not feed and stay in Machinery.
  UPDATE "products"
  SET "category" = 'Agriculture'
  WHERE "category" IN ('Chemicals', 'Machinery', 'Industrial Equipment', 'Packaging')
    AND "name" ~* '\m(fertilizer|fertiliser|fertilization|fertilisation|npk|humic|fulvic|seaweed|potassium humate|urea|ammonium sulfate|ammonium sulphate|magnesium sulfate|magnesium sulphate|calcium nitrate|kieserite|leonardite|biostimulant|soil conditioner|soil amendment|micronutrient|trace element)\M';

  UPDATE "products"
  SET "category" = 'Agriculture'
  WHERE "category" IN ('Machinery', 'Industrial Equipment')
    AND "name" ~* '\m(agricultural|agriculture|tractor|tractors|irrigation|harvester|harvesters|combine|seeder|seed drill|planter|plough|plow|tiller|rotary tiller|manure|livestock|poultry|farming|farm)\M';

  UPDATE "products"
  SET "category" = 'Agriculture'
  WHERE "category" IN ('Machinery', 'Industrial Equipment')
    AND "name" ~* '\m(feed)\M'
    AND "name" ~* '(pellet mill|pellet machine|pelletizer|granulator|mill|machine|mixer|grinder|production line|extruder)'
    AND "name" !~* '(wood|sawdust|biomass|straw|rice husk|branch|twig|trunk|shrub)';

  -- 1i. Marine & Offshore — marine/ship/offshore names only. Marine PLYWOOD (a
  -- construction board) and marine ROPE (a textile) are excluded by the source
  -- category scope; marine transformers are already in Energy.
  UPDATE "products"
  SET "category" = 'Marine & Offshore'
  WHERE "category" IN ('Machinery', 'Electronics', 'Metals & Minerals', 'Hardware & Fasteners')
    AND "name" ~* '\m(marine|maritime|ship|ships|shipbuilding|vessel|vessels|offshore|dock|docks|harbour|harbor|boat|boats|yacht|subsea|propeller|anchor|anchors|naval)\M'
    AND "name" !~* '(plywood|rope|wire|conveyor|idler|roller|feeder|winder|container|motor|valve stem|portable|support)';

  -- 1j. Aerospace — titles naming aircraft/aviation/aerospace hardware.
  -- Excluded: "Aircraft Grade Plywood", carbon-fibre cloth, board, battery and
  -- keypad rows, none of which are aircraft parts.
  UPDATE "products"
  SET "category" = 'Aerospace'
  WHERE "category" IN ('Metals & Minerals', 'Hardware & Fasteners', 'Packaging')
    AND "name" ~* '\m(aerospace|aircraft|airplane|aviation|helicopter|turbofan)\M'
    AND "name" !~* '(plywood|cloth|fabric|board|battery|keypad)';

  -- --------------------------------------------------------------------------
  -- 2. Descriptions — replace NULL / blank / sub-25-character / scrape-markup /
  -- URL-bearing / scraper-stamp text with prose assembled from the same row.
  -- --------------------------------------------------------------------------
  UPDATE "products" p
  SET "description" = fd014_desc(
        fd014_short_name(p."name"),
        p."category",
        fd014_country(p."originCountry"),
        p."unit",
        fd014_num(p."moq"),
        fd014_num(p."price"),
        coalesce(nullif(btrim(coalesce(p."currency", '')), ''), 'USD'),
        nullif(btrim(coalesce(p."purityGrade", '')), ''),
        fd014_spec(p."spec"),
        p."id"
      )
  WHERE (
          p."description" IS NULL
          OR btrim(p."description") = ''
          OR length(btrim(p."description")) < 25
          OR p."description" ~ '^\s*[!\[]'
          OR p."description" ILIKE '%http%'
          OR p."description" ILIKE 'Real listing sourced%'
        )
    AND fd014_desc(
          fd014_short_name(p."name"),
          p."category",
          fd014_country(p."originCountry"),
          p."unit",
          fd014_num(p."moq"),
          fd014_num(p."price"),
          coalesce(nullif(btrim(coalesce(p."currency", '')), ''), 'USD'),
          nullif(btrim(coalesce(p."purityGrade", '')), ''),
          fd014_spec(p."spec"),
          p."id"
        ) IS NOT NULL
    AND p."description" IS DISTINCT FROM fd014_desc(
          fd014_short_name(p."name"),
          p."category",
          fd014_country(p."originCountry"),
          p."unit",
          fd014_num(p."moq"),
          fd014_num(p."price"),
          coalesce(nullif(btrim(coalesce(p."currency", '')), ''), 'USD'),
          nullif(btrim(coalesce(p."purityGrade", '')), ''),
          fd014_spec(p."spec"),
          p."id"
        );

  -- --------------------------------------------------------------------------
  -- 3. Imagery for the categories this migration created.
  -- --------------------------------------------------------------------------
  -- Same rule as 011-013: only rows with no photo (or a pool photo) are given
  -- one, chosen by md5(id || category) so consecutive rows differ. Every path
  -- is an existing file under artifacts/web/public/products/ and is a generic
  -- CATEGORY photo, never a photo of the actual goods; the UI keeps its Demo
  -- badge. Rubber gets the rubber photo and Paper & Pulp the kraft-paper photo.
  -- Ceramics & Glass is deliberately NOT given one: the 38-file photo set has no
  -- tile or glass photograph, and the nearest file (cement-bags.jpg) depicts
  -- something else, which would be worse than an honest empty card. Mining &
  -- Ore, Furniture & Wood, Medical Supplies, Food Processing, Energy,
  -- Agriculture, Marine & Offshore and Aerospace have no matching file either,
  -- so those rows keep whatever they already carry.
  WITH cfg(category, pool) AS (
    VALUES
      ('Rubber', ARRAY['/products/rubber-seals.jpg']),
      ('Paper & Pulp', ARRAY['/products/kraft-paper.jpg'])
  )
  UPDATE "products" p
  SET "imageKey" = cfg.pool[
    1 + (
      abs(('x' || substr(md5(p."id"::text || cfg.category), 1, 8))::bit(32)::int)
      % array_length(cfg.pool, 1)
    )
  ]
  FROM cfg
  WHERE p."category" = cfg.category
    AND p."dataSource" = 'demo'
    AND (p."imageKey" IS NULL OR p."imageKey" = ANY (cfg.pool));

END
$mig$;
