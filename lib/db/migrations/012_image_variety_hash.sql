-- 012_image_variety_hash.sql
--
-- Migration 011 spread photos across demo rows with `id % pool_size`. Because
-- product ids are sequential and the browse grid is seven columns wide, that
-- placed the SAME photo in the same column on every row — a regular repeating
-- pattern that still reads as "duplicated images", which is exactly what the
-- owner reported.
--
-- Assign by a multiplicative hash of the id instead, so the sequence scatters
-- instead of cycling. Still fully deterministic, so re-running is a no-op, and
-- it deliberately leaves rows carrying a genuine curated photo untouched (only
-- NULL keys and keys already coming from the pool are rewritten).
--
-- These remain representative category photographs on DEMO rows — not pictures
-- of the actual goods — and the UI keeps its Demo badge on them.

WITH cfg(category, pool) AS (
  VALUES
    ('Machinery', ARRAY[
      '/products/cnc-machine.jpg', '/products/injection-machine.jpg', '/products/hydraulic-press.jpg',
      '/products/gearbox.jpg', '/products/induction-motor.jpg', '/products/air-compressor.jpg',
      '/products/servo-drive.jpg']),
    ('Industrial Equipment', ARRAY[
      '/products/industrial-pump.jpg', '/products/hydraulic-press.jpg', '/products/air-compressor.jpg',
      '/products/induction-motor.jpg', '/products/gearbox.jpg', '/products/proximity-sensors.jpg',
      '/products/servo-drive.jpg']),
    ('Metals & Minerals', ARRAY[
      '/products/copper-cathode.jpg', '/products/aluminum-ingot.jpg', '/products/zinc-ingot.jpg',
      '/products/antimony-ore.jpg', '/products/stainless-steel-sheet.jpg', '/products/titanium-dioxide.jpg']),
    ('Steel', ARRAY[
      '/products/steel-coil.jpg', '/products/hot-rolled-coil.jpg', '/products/stainless-steel-sheet.jpg',
      '/products/steel-structure.jpg', '/products/manhole-cover.jpg']),
    ('Chemicals', ARRAY[
      '/products/caustic-soda.jpg', '/products/lithium-carbonate.jpg', '/products/titanium-dioxide.jpg',
      '/products/epoxy-resin.jpg']),
    ('Electronics', ARRAY[
      '/products/plc-controller.jpg', '/products/proximity-sensors.jpg', '/products/servo-drive.jpg',
      '/products/battery-pack.jpg', '/products/solar-inverter.jpg']),
    ('Automotive', ARRAY[
      '/products/brake-disc.jpg', '/products/engine-valves.jpg', '/products/alloy-wheel.jpg',
      '/products/battery-pack.jpg', '/products/rubber-seals.jpg']),
    ('Construction Materials', ARRAY[
      '/products/cement-bags.jpg', '/products/pvc-pipes.jpg', '/products/steel-structure.jpg',
      '/products/manhole-cover.jpg', '/products/aluminum-profile.jpg']),
    ('Textiles', ARRAY[
      '/products/polyester-yarn.jpg', '/products/kraft-paper.jpg', '/products/rubber-seals.jpg']),
    ('Packaging', ARRAY[
      '/products/corrugated-boxes.jpg', '/products/kraft-paper.jpg', '/products/plastic-granules.jpg']),
    ('Plastic & Rubber', ARRAY[
      '/products/plastic-granules.jpg', '/products/pvc-pipes.jpg', '/products/rubber-seals.jpg',
      '/products/epoxy-resin.jpg']),
    ('Renewable Energy', ARRAY[
      '/products/solar-panel.jpg', '/products/solar-inverter.jpg', '/products/wind-blade.jpg',
      '/products/battery-pack.jpg'])
)
UPDATE products p
SET "imageKey" = cfg.pool[
  1 + ((p.id::bigint * 2654435761) % array_length(cfg.pool, 1))::int
]
FROM cfg
WHERE p.category = cfg.category
  AND p."dataSource" = 'demo'
  AND (p."imageKey" IS NULL OR p."imageKey" = ANY (cfg.pool));
