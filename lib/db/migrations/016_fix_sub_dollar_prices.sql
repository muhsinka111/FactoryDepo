-- ============================================================================
-- 016_fix_sub_dollar_prices.sql
-- ----------------------------------------------------------------------------
-- One cosmetic defect in the 014-generated prose, found while sampling it:
-- fd014_num() strips every leading zero after to_char(), so a listing priced at
-- USD 0.58 (there are 718 rows priced below USD 1) rendered as
--
--   "The listed price is USD .58 per unit."
--
-- The figure is correct, but the missing leading zero is not what a trade
-- catalogue should show. This migration repairs ONLY the affected substrings;
-- it touches no other stored text.
--
-- 014 itself cannot be edited: it is already recorded in the checksum ledger,
-- and editing an applied migration is exactly what that ledger warns about. Its
-- internally declared fd014_num() is therefore wrong for good, and every future
-- file that wants a correctly formatted price needs its own copy — hence
-- fd016_num() here, which is fd014_num() plus the leading zero.
--
-- The repair rewrites the money clauses that fd014_desc() produced, using
-- fd016_num() to regenerate the same four strings, so a row is only touched
-- when the corrected description is identical to the stored one except for the
-- price. Any row whose stored text differs in some other way is left alone.
-- Deliberately does NOT use the old './\d' text pattern: the two genuinely
-- hand-written descriptions (id 1 "cut to 1020x1010x12mm plates", id 9
-- "0.5-3.0mm, film-protected") must never be rewritten, and matching strings
-- is a weaker test than regenerating the whole sentence.
--
-- Idempotency: the ledger guard, plus the fact that no row matches once the
-- leading zero is present (`replace(x, 'USD .', 'USD 0.') = x`).
-- ASCII-only file.
-- ============================================================================

DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM "_migrations" WHERE "filename" = '016_fix_sub_dollar_prices.sql') THEN
    RAISE NOTICE '016_fix_sub_dollar_prices: already applied, skipping';
    RETURN;
  END IF;

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

  CREATE OR REPLACE FUNCTION fd016_num(v numeric)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  AS $fn$
    SELECT CASE
             WHEN v IS NULL THEN NULL
             WHEN v = trunc(v) THEN trunc(v)::bigint::text
             WHEN btrim(to_char(v, 'FM999999999990.99'), '0') LIKE '.%'
               THEN '0' || btrim(to_char(v, 'FM999999999990.99'), '0')
             ELSE btrim(to_char(v, 'FM999999999990.99'), '0')
           END;
  $fn$;

  -- The generated paragraph is selected by the exact expression 014 used, with
  -- fd014_num() replaced by fd016_num(). In a standard-conforming database '\s'
  -- inside a plain literal is a backslash and an 's', so this is the same
  -- regexp_replace() call 014 made.
  CREATE OR REPLACE FUNCTION fd016_desc(
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
  LANGUAGE sql
  IMMUTABLE
  AS $fn$
    SELECT btrim(regexp_replace(
             concat_ws(' ', f1, f2, f3, f4, f5, f6),
             '\s+', ' ', 'g'
           ))
    FROM (
      SELECT
        CASE (coalesce(v_id, 0) % 6)
          WHEN 0 THEN fd014_wrap(coalesce(v_name, 'This listing')) || ' is listed in the ' || coalesce(v_cat, 'this product') || ' category.'
          WHEN 1 THEN fd014_wrap(coalesce(v_name, 'This listing')) || ' sits in the ' || coalesce(v_cat, 'this product') || ' category.'
          WHEN 2 THEN 'Filed under ' || coalesce(v_cat, 'this product') || ', ' || fd014_wrap(coalesce(v_name, 'This listing')) || '.'
          WHEN 3 THEN fd014_wrap(coalesce(v_name, 'This listing')) || ' - filed under ' || coalesce(v_cat, 'this product') || '.'
          WHEN 4 THEN 'This listing covers ' || fd014_wrap(coalesce(v_name, 'This listing')) || ' (' || coalesce(v_cat, 'this product') || ').'
          ELSE fd014_wrap(coalesce(v_name, 'This listing')) || ', catalogued under ' || coalesce(v_cat, 'this product') || '.'
        END AS f1,
        CASE
          WHEN v_country IS NULL THEN NULL
          WHEN v_country = 'a global sourcing network' THEN
            'It is offered through a global sourcing network.'
          WHEN (coalesce(v_id, 0) % 6) % 2 = 0 THEN
            'It is offered by a supplier in ' || coalesce(v_country, 'an unlisted origin') || '.'
          ELSE 'The supplier is based in ' || coalesce(v_country, 'an unlisted origin') || '.'
        END AS f2,
        CASE
          WHEN nullif(btrim(coalesce(v_purity, '')), '') IS NULL THEN NULL
          WHEN (coalesce(v_id, 0) % 6) % 2 = 0 THEN
            'The stated grade is ' || btrim(v_purity) || '.'
          ELSE 'Grade on file: ' || btrim(v_purity) || '.'
        END AS f3,
        CASE
          WHEN coalesce(v_spec, '') = '' THEN NULL
          WHEN (coalesce(v_id, 0) % 6) % 2 = 0 THEN
            'Specification: ' || v_spec || '.'
          ELSE 'Spec sheet: ' || v_spec || '.'
        END AS f4,
        CASE
          WHEN nullif(btrim(coalesce(v_unit, '')), '') IS NULL
               AND nullif(btrim(coalesce(v_moq, '')), '') IS NOT NULL THEN
            'A minimum order of ' || btrim(v_moq) || ' is quoted.'
          WHEN nullif(btrim(coalesce(v_unit, '')), '') IS NULL THEN
            NULL
          WHEN nullif(btrim(coalesce(v_moq, '')), '') IS NULL THEN
            'It is priced per ' || CASE WHEN btrim(v_unit) IN ('pc', 'pcs', 'piece', 'pieces', 'unit', 'units', 'set', 'sets') THEN '' ELSE btrim(v_unit) || ' ' END || 'unit.'
          WHEN btrim(v_moq) = '1' THEN
            'Pricing is quoted per ' || CASE WHEN btrim(v_unit) IN ('pc', 'pcs', 'piece', 'pieces', 'unit', 'units', 'set', 'sets') THEN '' ELSE btrim(v_unit) || ' ' END || 'unit with no minimum order quantity.'
          ELSE
            'The minimum order is ' || btrim(v_moq) || ' ' || CASE WHEN btrim(v_unit) IN ('pc', 'pcs', 'piece', 'pieces', 'unit', 'units', 'set', 'sets') THEN '' ELSE btrim(v_unit) || ' ' END || 'units.'
        END AS f5,
        CASE (coalesce(v_id, 0) % 3)
          WHEN 0 THEN
            CASE WHEN nullif(btrim(coalesce(v_price, '')), '') IS NOT NULL THEN
              'The listed price is ' || coalesce(nullif(btrim(coalesce(v_cur, '')), ''), 'USD') || ' ' || btrim(v_price) || ' per ' || CASE WHEN btrim(coalesce(v_unit, '')) IN ('pc', 'pcs', 'piece', 'pieces', 'unit', 'units', 'set', 'sets') THEN '' ELSE btrim(coalesce(v_unit, '')) || ' ' END || 'unit.'
            ELSE NULL END
          WHEN 1 THEN
            CASE WHEN nullif(btrim(coalesce(v_price, '')), '') IS NOT NULL THEN
              'It is listed at ' || coalesce(nullif(btrim(coalesce(v_cur, '')), ''), 'USD') || ' ' || btrim(v_price) || ' per ' || CASE WHEN btrim(coalesce(v_unit, '')) IN ('pc', 'pcs', 'piece', 'pieces', 'unit', 'units', 'set', 'sets') THEN '' ELSE btrim(coalesce(v_unit, '')) || ' ' END || 'unit.'
            ELSE NULL END
          ELSE
            CASE WHEN nullif(btrim(coalesce(v_price, '')), '') IS NOT NULL THEN
              'Listed price: ' || coalesce(nullif(btrim(coalesce(v_cur, '')), ''), 'USD') || ' ' || btrim(v_price) || ' per ' || CASE WHEN btrim(coalesce(v_unit, '')) IN ('pc', 'pcs', 'piece', 'pieces', 'unit', 'units', 'set', 'sets') THEN '' ELSE btrim(coalesce(v_unit, '')) || ' ' END || 'unit.'
            ELSE NULL END
        END AS f6
    ) AS f;
  $fn$;

  -- Regenerated text with the OLD price formatting, so the comparison below is
  -- "before" vs "after" of the leading zero only.
  CREATE OR REPLACE FUNCTION fd016_desc_old(
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
  LANGUAGE sql
  IMMUTABLE
  AS $fn$
    SELECT replace(
             replace(
               fd016_desc(v_name, v_cat, v_country, v_unit, v_moq, v_price, v_cur,
                          v_purity, v_spec, v_id),
               'USD 0.', 'USD .'
             ),
             'USD 0.', 'USD .'
           );
  $fn$;

  UPDATE "products" p
  SET "description" = fd016_desc(
        fd014_short_name(p."name"),
        p."category",
        fd014_country(p."originCountry"),
        p."unit",
        fd014_num(p."moq"),
        fd016_num(p."price"),
        coalesce(nullif(btrim(coalesce(p."currency", '')), ''), 'USD'),
        nullif(btrim(coalesce(p."purityGrade", '')), ''),
        fd014_spec(p."spec"),
        p."id"
      )
  WHERE p."price" > 0
    AND p."price" < 1
    AND p."description" IS NOT NULL
    -- exactly the stored text, except for the missing leading zero
    AND p."description" = fd016_desc_old(
          fd014_short_name(p."name"),
          p."category",
          fd014_country(p."originCountry"),
          p."unit",
          fd014_num(p."moq"),
          fd016_num(p."price"),
          coalesce(nullif(btrim(coalesce(p."currency", '')), ''), 'USD'),
          nullif(btrim(coalesce(p."purityGrade", '')), ''),
          fd014_spec(p."spec"),
          p."id"
        );

END
$mig$;
