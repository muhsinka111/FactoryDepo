/**
 * Category → cover image. ONE list, consumed by the category tiles, the
 * /categories index and the category strip.
 *
 * HONESTY RULE (see styles.css `.ph-empty` and docs/DATA_PROVENANCE.md):
 * a cover is CATEGORY-level art. It is NEVER used as a listing's photograph —
 * a lot with no picture of its own keeps the neutral placeholder tile, because
 * showing a picture of something the lot is not is exactly the dishonesty this
 * product exists to prevent.
 *
 * Every path below exists in artifacts/web/public/products/:
 *   • the product photographs are the FactoryDepo-owned category photography
 *     already shipped with the app;
 *   • the `cat-*.jpg` covers are FactoryDepo-owned, AI-generated category art
 *     created for the categories that had no representative photograph.
 * There is no third-party image in this list.
 *
 * The existence of every path is asserted by scripts/ui_smoke.mjs, so a typo
 * fails the acceptance run instead of shipping a broken tile.
 */
export interface CategoryCover {
  /** Category name exactly as it appears in products.category / CATEGORIES. */
  category: string;
  /** Owned image under /products. */
  image: string;
  /** Short, factual line shown under the title. */
  blurb: string;
}

export const CATEGORY_COVERS: readonly CategoryCover[] = [
  { category: 'Metals & Minerals', image: '/products/copper-cathode.jpg', blurb: 'Cathodes, ingots, ore and concentrates' },
  { category: 'Steel', image: '/products/hot-rolled-coil.jpg', blurb: 'Coil, sheet, sections and structure' },
  { category: 'Chemicals', image: '/products/caustic-soda.jpg', blurb: 'Industrial chemicals and additives' },
  { category: 'Machinery', image: '/products/cnc-machine.jpg', blurb: 'Production machinery and machine tools' },
  { category: 'Industrial Equipment', image: '/products/industrial-pump.jpg', blurb: 'Pumps, compressors, presses' },
  { category: 'Electronics', image: '/products/plc-controller.jpg', blurb: 'Controls, drives and sensors' },
  { category: 'Automotive', image: '/products/brake-disc.jpg', blurb: 'OEM and aftermarket components' },
  { category: 'Construction Materials', image: '/products/cement-bags.jpg', blurb: 'Cement, pipes, covers, structures' },
  { category: 'Renewable Energy', image: '/products/wind-blade.jpg', blurb: 'Blades, panels, inverters' },
  { category: 'Packaging', image: '/products/corrugated-boxes.jpg', blurb: 'Cartons, film and protective packaging' },
  { category: 'Plastic & Rubber', image: '/products/plastic-granules.jpg', blurb: 'Resins, granules and compounds' },
  { category: 'Textiles', image: '/products/polyester-yarn.jpg', blurb: 'Yarn, fabric and finished textile stock' },
  { category: 'Agriculture', image: '/products/cat-agriculture.jpg', blurb: 'Fertiliser, feed and farm inputs' },
  { category: 'Energy', image: '/products/battery-pack.jpg', blurb: 'Cells, packs and storage systems' },
  { category: 'Mining & Ore', image: '/products/antimony-ore.jpg', blurb: 'Ore, concentrate and mine output' },
  { category: 'Paper & Pulp', image: '/products/kraft-paper.jpg', blurb: 'Kraft, board and pulp' },
  { category: 'Rubber', image: '/products/rubber-seals.jpg', blurb: 'Seals, hoses and rubber parts' },
  { category: 'Ceramics & Glass', image: '/products/cat-ceramics.jpg', blurb: 'Tiles, refractories and glass' },
  { category: 'Furniture & Wood', image: '/products/cat-furniture.jpg', blurb: 'Contract furniture and timber stock' },
  { category: 'Medical Supplies', image: '/products/cat-medical.jpg', blurb: 'Single-use medical stock and instruments' },
  { category: 'Safety & PPE', image: '/products/cat-ppe.jpg', blurb: 'Protective equipment and site safety' },
  { category: 'Food Processing', image: '/products/cat-food.jpg', blurb: 'Processing lines and stainless fittings' },
  { category: 'Marine & Offshore', image: '/products/cat-marine.jpg', blurb: 'Deck, engine and offshore equipment' },
  { category: 'Aerospace', image: '/products/cat-aerospace.jpg', blurb: 'Airframe, engine and MRO parts' },
  { category: 'Hardware & Fasteners', image: '/products/cat-fasteners.jpg', blurb: 'Fasteners, fixings and hand hardware' },
];

const BY_CATEGORY = new Map(CATEGORY_COVERS.map((c) => [c.category, c]));

export function coverFor(category: string): CategoryCover | undefined {
  return BY_CATEGORY.get(category);
}
