-- 018_junk_names.sql
--
-- The last scrape artefacts in the catalogue are three product NAMES that are
-- markup rather than products (migration 014 fixed descriptions; names were
-- outside its scope):
--
--   id 41   "![Search icon"  — an image-alt fragment. No identifiable product.
--   id 70   "[AI Mode"       — a UI label. No identifiable product.
--   id 5329 "[Special for Romania] Mini Air Cooler Small Portable Air
--            Conditioner …" — a REAL product behind a bracketed marketing
--            prefix, so only the prefix is removed.
--
-- 41 and 70 are deleted rather than disabled: there is no name, no spec and no
-- description (014 could only quote the markup back), so there is nothing to
-- present and marking them "sold out" would leave gibberish in the catalogue.
-- They are only removed when nothing references them, and the statement is a
-- no-op on a second run.

DELETE FROM products p
WHERE p.id IN (41, 70)
  AND NOT EXISTS (SELECT 1 FROM orders        o WHERE o."productId" = p.id)
  AND NOT EXISTS (SELECT 1 FROM offers        f WHERE f."productId" = p.id)
  AND NOT EXISTS (SELECT 1 FROM saved_lots    s WHERE s."productId" = p.id)
  AND NOT EXISTS (SELECT 1 FROM product_views v WHERE v."productId" = p.id);

-- Strip a leading bracketed marketing prefix, keeping the real product name.
-- "Mini Air Cooler Small Portable Air Conditioner" survives intact.
UPDATE products
SET name = btrim(regexp_replace(name, '^[[:space:]]*\[[^]]*\][[:space:]]*', ''))
WHERE name ~ '^[[:space:]]*\[[^]]*\][[:space:]]*[^[:space:]]';
