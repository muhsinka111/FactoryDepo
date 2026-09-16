-- 011_image_variety.sql
--
-- Two image problems left after migration 010:
--
--  1. BROKEN REFERENCES. The alicdn photographs were deleted from the repo in
--     the data-provenance purge (commit 111c5c8), but 627 product rows still
--     point at /products/ali_*.jpg. Those rendered as broken images.
--
--  2. CLUSTERING. 010 filled every photoless row with ONE photo per category,
--     so 807 listings shared cnc-machine.jpg and 420 shared industrial-pump.jpg.
--     A browse page looked like the same listing repeated.
--
-- The project owns 38 AI-generated category photographs (see
-- docs/DATA_PROVENANCE.md) — these are representative category shots on DEMO
-- rows, not photographs of the actual goods, and the UI marks those rows with a
-- Demo chip. So we rotate each demo row through a per-category pool keyed on its
-- id, which spreads the photos across a grid instead of stacking them.
--
-- Deterministic and therefore idempotent: a second run writes the same value.
-- Never deletes a row and never invents a fact. Rows that already carried a
-- distinct curated photo are left alone (only NULL, dead, or 010-default keys
-- are rewritten).

-- ---------------------------------------------------------------------------
-- 1. Clear references to photographs that no longer exist.
-- ---------------------------------------------------------------------------
UPDATE products
SET "imageKey" = NULL
WHERE "imageKey" ~ '^/products/ali_[0-9a-f]+\.(jpg|jpeg|png|webp)$';

-- ---------------------------------------------------------------------------
-- 2. Spread a per-category pool across demo rows, keyed on id for stability.
--    `dflt` is the single photo migration 010 assigned to the whole category;
--    rows still holding it are the ones that need spreading.
-- ---------------------------------------------------------------------------
WITH cfg(category, dflt, pool) AS (
  VALUES
    ('Machinery', '/products/cnc-machine.jpg', ARRAY[
      '/products/cnc-machine.jpg', '/products/injection-machine.jpg', '/products/hydraulic-press.jpg',
      '/products/gearbox.jpg', '/products/induction-motor.jpg', '/products/air-compressor.jpg',
      '/products/servo-drive.jpg']),
    ('Industrial Equipment', '/products/industrial-pump.jpg', ARRAY[
      '/products/industrial-pump.jpg', '/products/hydraulic-press.jpg', '/products/air-compressor.jpg',
      '/products/induction-motor.jpg', '/products/gearbox.jpg', '/products/proximity-sensors.jpg',
      '/products/servo-drive.jpg']),
    ('Metals & Minerals', '/products/copper-cathode.jpg', ARRAY[
      '/products/copper-cathode.jpg', '/products/aluminum-ingot.jpg', '/products/zinc-ingot.jpg',
      '/products/antimony-ore.jpg', '/products/stainless-steel-sheet.jpg', '/products/titanium-dioxide.jpg']),
    ('Steel', '/products/steel-coil.jpg', ARRAY[
      '/products/steel-coil.jpg', '/products/hot-rolled-coil.jpg', '/products/stainless-steel-sheet.jpg',
      '/products/steel-structure.jpg', '/products/manhole-cover.jpg']),
    ('Chemicals', '/products/caustic-soda.jpg', ARRAY[
      '/products/caustic-soda.jpg', '/products/lithium-carbonate.jpg', '/products/titanium-dioxide.jpg',
      '/products/epoxy-resin.jpg']),
    ('Electronics', '/products/plc-controller.jpg', ARRAY[
      '/products/plc-controller.jpg', '/products/proximity-sensors.jpg', '/products/servo-drive.jpg',
      '/products/battery-pack.jpg', '/products/solar-inverter.jpg']),
    ('Automotive', '/products/brake-disc.jpg', ARRAY[
      '/products/brake-disc.jpg', '/products/engine-valves.jpg', '/products/alloy-wheel.jpg',
      '/products/battery-pack.jpg', '/products/rubber-seals.jpg']),
    ('Construction Materials', '/products/cement-bags.jpg', ARRAY[
      '/products/cement-bags.jpg', '/products/pvc-pipes.jpg', '/products/steel-structure.jpg',
      '/products/manhole-cover.jpg', '/products/aluminum-profile.jpg']),
    ('Textiles', '/products/polyester-yarn.jpg', ARRAY[
      '/products/polyester-yarn.jpg', '/products/kraft-paper.jpg', '/products/rubber-seals.jpg']),
    ('Packaging', '/products/corrugated-boxes.jpg', ARRAY[
      '/products/corrugated-boxes.jpg', '/products/kraft-paper.jpg', '/products/plastic-granules.jpg']),
    ('Plastic & Rubber', '/products/plastic-granules.jpg', ARRAY[
      '/products/plastic-granules.jpg', '/products/pvc-pipes.jpg', '/products/rubber-seals.jpg',
      '/products/epoxy-resin.jpg']),
    ('Renewable Energy', '/products/solar-panel.jpg', ARRAY[
      '/products/solar-panel.jpg', '/products/solar-inverter.jpg', '/products/wind-blade.jpg',
      '/products/battery-pack.jpg'])
)
UPDATE products p
SET "imageKey" = cfg.pool[1 + (p.id % array_length(cfg.pool, 1))]
FROM cfg
WHERE p.category = cfg.category
  AND p."dataSource" = 'demo'
  AND (
    p."imageKey" IS NULL
    OR p."imageKey" ~ '^/products/ali_'
    OR p."imageKey" = cfg.dflt
  );

-- Note: 'Safety & PPE' and 'Hardware & Fasteners' have no photograph in the
-- owned set that genuinely depicts gloves/helmets or fasteners, so their rows
-- keep a NULL imageKey and the UI renders a neutral category tile. Inventing a
-- picture of something the listing is not would be worse than showing none.
