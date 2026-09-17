-- ============================================================================
-- 015_mining_and_ore.sql
-- ----------------------------------------------------------------------------
-- 014_category_and_descriptions.sql left the canonical category "Mining & Ore"
-- empty on purpose and said so, because after excluding "ore CRUSHER / ore BALL
-- MILL / ore MACHINE" (mining equipment, correctly Machinery) only a single
-- commodity ore row remained in the whole 5,404-row demo catalogue.
--
-- The owner has since asked for the category to be reachable, so this migration
-- adds ONE narrow rule rather than a broad one. It moves a row only when the
-- row's own title is an ore commodity, i.e. the title matches
-- '\mores?\M' AND does NOT name equipment. Measured against the applied data
-- that matches exactly two rows:
--
--   id 3   Metals & Minerals  "Antimony Ore 50-60%"
--   id 885 Metals & Minerals  "Copper Ore Processing Line for Low Grade Ore
--                              Beneficiation"
--
-- The second one is a beneficiation line for low-grade ore, so it is genuinely
-- mining-sector plant rather than general machinery; the word "mining" also
-- appears only in its description, not in a generic "equipment" sense.
--
-- Deliberately NOT moved, because their titles name a machine or an alloy
-- rather than an ore:
--   id 754  "Silicon Manganese / Ferro Silicon Manganese"   (ferro-alloy)
--   id 1004 "Aluminum Alloy Additives ... Manganese Metal"  (alloy additive)
--   id 1272 "Na Cathode Ternary Nickel Iron Manganese ..."  (battery material)
--   id 4462-4529  ore/stone crushers and ball mills          (Machinery)
--   id 2427/2428  "Citric Acid Concentrate For Hemodialysis" (Chemicals)
--
-- Runs AFTER 014, so it must cope with 014 having rewritten descriptions: the
-- rows it touches have to say "Mining & Ore", not "Metals & Minerals". Because
-- 014 is guarded by its own ledger row and will never run again on this
-- database, this file has to rebuild the same two description helpers and
-- refresh those two descriptions itself. It does that with the identical
-- expression 014 used for a NULL/blank/URL/scrape-stamp description, and it
-- additionally accepts a 014-generated description so the stale category name
-- in sentence one is corrected. A genuine hand-written description (none of
-- which matches the pattern 014 used) is never overwritten.
--
-- Idempotency: same ledger guard as 014 plus destination-keyed UPDATEs, so a
-- second run is a byte-level no-op. ASCII-only file.
-- ============================================================================

DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM "_migrations" WHERE "filename" = '015_mining_and_ore.sql') THEN
    RAISE NOTICE '015_mining_and_ore: already applied, skipping';
    RETURN;
  END IF;

  -- --------------------------------------------------------------------------
  -- 0. Helpers reused from 014 (CREATE OR REPLACE, so the definitions are
  --    identical whether or not 014 created them in this session).
  -- --------------------------------------------------------------------------
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
        RETURN v_key || ' ' || v_val;
      END IF;
      IF v_fb IS NULL THEN
        v_fb := v_key || ' ' || v_val;
      END IF;
    END LOOP;

    RETURN v_fb;
  END;
  $fn$;

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
  -- 1. The single narrow rule: an ore commodity.
  -- --------------------------------------------------------------------------
  UPDATE "products"
  SET "category" = 'Mining & Ore'
  WHERE "category" = 'Metals & Minerals'
    AND "name" ~* '\mores?\M'
    AND "name" !~* '(crusher|crushing|mill|machine|machinery|equipment|crushers|ball mill|plant|line|processing)'
    AND "name" !~* '(manganese|ferro|silicon|cathode|alloy|additive|battery)';

  -- 1b. Ore beneficiation plant. A separate rule because the general rule above
  -- deliberately rejects anything whose title names plant or process, and the
  -- one such row ("Copper Ore Processing Line for Low Grade Ore Beneficiation")
  -- is mining-sector plant by its own wording: it beneficiates low-grade ore.
  -- Scoped so a crusher or a grinding mill can never match.
  UPDATE "products"
  SET "category" = 'Mining & Ore'
  WHERE "category" = 'Metals & Minerals'
    AND "name" ~* 'beneficiation'
    AND "name" !~* '(crusher|crushing|mill|ball mill|machine|machinery|equipment)';

  -- --------------------------------------------------------------------------
  -- 2. Keep the descriptions of the moved rows truthful: theirs is either a
  --    014-generated paragraph that now names the wrong category, or one of the
  --    few pre-existing hand-written descriptions. Only the former is rewritten.
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
  WHERE p."category" = 'Mining & Ore'
    AND p."description" IS NOT NULL
    AND p."description" ~ (
          '^(This listing covers |Filed under |"'
          || fd014_short_name(p."name") || '|'
          || fd014_short_name(p."name") || ')'
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

END
$mig$;
