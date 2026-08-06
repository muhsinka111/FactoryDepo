-- 002_product_images.sql — assign real product photography to catalog rows (idempotent)
UPDATE products SET "imageKey" = CASE
  WHEN lower(name) LIKE '%copper%'     THEN '/products/copper-cathode.jpg'
  WHEN lower(name) LIKE '%steel coil%' OR lower(name) LIKE '%cold rolled%' THEN '/products/steel-coil.jpg'
  WHEN lower(name) LIKE '%lithium%'    THEN '/products/lithium-carbonate.jpg'
  WHEN lower(name) LIKE '%pump%'       THEN '/products/industrial-pump.jpg'
  WHEN lower(name) LIKE '%solar%'      THEN '/products/solar-panel.jpg'
  WHEN lower(name) LIKE '%cnc%' OR lower(name) LIKE '%machining%' THEN '/products/cnc-machine.jpg'
  WHEN lower(name) LIKE '%aluminum%' OR lower(name) LIKE '%aluminium%' OR lower(name) LIKE '%ingot%' THEN '/products/aluminum-ingot.jpg'
  WHEN lower(name) LIKE '%antimony%' OR lower(name) LIKE '%ore%' THEN '/products/antimony-ore.jpg'
  WHEN lower(name) LIKE '%granule%' OR lower(name) LIKE '%pp %' OR lower(name) LIKE '%plastic%' THEN '/products/plastic-granules.jpg'
  WHEN lower(name) LIKE '%kraft%' OR lower(name) LIKE '%paper%' THEN '/products/kraft-paper.jpg'
  ELSE NULL
END
WHERE "imageKey" IS NULL;
