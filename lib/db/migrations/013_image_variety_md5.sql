-- 013_image_variety_md5.sql
--
-- Migrations 011 and 012 both failed to break the visible repeat, and the reason
-- is arithmetic rather than bad luck:
--   * 011 used `id % pool_size`  -> an exact cycle of length pool_size.
--   * 012 used `id * K % pool_size` -> still a LINEAR map, so still a cycle; 7
--     photos and a 7-column browse grid meant every row repeated the row above.
--
-- A non-linear hash breaks it. The pool index now comes from md5(id || category),
-- which has real avalanche, so consecutive products get unrelated photos and the
-- sequence has no short period for a column grid to lock onto.
--
-- Still deterministic (md5 of a fixed string), so re-running changes nothing, and
-- it still only rewrites rows whose photo came from the pool — a row carrying its
-- own genuine curated photo is left alone. These remain representative category
-- photographs on DEMO rows, and the UI keeps its Demo badge on them.

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
  1 + (
    abs(('x' || substr(md5(p.id::text || cfg.category), 1, 8))::bit(32)::int)
    % array_length(cfg.pool, 1)
  )
]
FROM cfg
WHERE p.category = cfg.category
  AND p."dataSource" = 'demo'
  AND (p."imageKey" IS NULL OR p."imageKey" = ANY (cfg.pool));
