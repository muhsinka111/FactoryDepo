/**
 * Category → cover image and blurb. ONE list, consumed by the category tiles, the
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
 *
 * Language
 * --------
 * A blurb is copy, so it is written per language next to the cover it belongs to:
 * `en` is the source of truth and every other entry is its translation — no
 * claim is added in translation. `blurb` resolves the active interface language
 * (`getActiveLang()`), which is why the tile re-renders with the right text when
 * the language changes.
 */
import { getActiveLang, type LangCode } from './i18n';

/** The blurb in every language we have written one for; `en` is always present. */
export type CategoryBlurb = Partial<Record<LangCode, string>> & { en: string };

export interface CategoryCover {
  /** Category name exactly as it appears in products.category / CATEGORIES. */
  category: string;
  /** Owned image under /products. */
  image: string;
  /** Short, factual line shown under the title, in the active interface language. */
  readonly blurb: string;
  /** The same line in every language this cover carries one for. */
  readonly blurbs: CategoryBlurb;
}

interface RawCover {
  category: string;
  image: string;
  blurb: CategoryBlurb;
}

const RAW_COVERS: readonly RawCover[] = [
  { category: 'Metals & Minerals', image: '/products/copper-cathode.jpg', blurb: { en: 'Cathodes, ingots, ore and concentrates', tr: 'Katotlar, kütükler, cevher ve konsantreler' } },
  { category: 'Steel', image: '/products/hot-rolled-coil.jpg', blurb: { en: 'Coil, sheet, sections and structure', tr: 'Rulo, sac, profil ve yapı' } },
  { category: 'Chemicals', image: '/products/caustic-soda.jpg', blurb: { en: 'Industrial chemicals and additives', tr: 'Endüstriyel kimyasallar ve katkı maddeleri' } },
  { category: 'Machinery', image: '/products/cnc-machine.jpg', blurb: { en: 'Production machinery and machine tools', tr: 'Üretim makineleri ve takım tezgahları' } },
  { category: 'Industrial Equipment', image: '/products/industrial-pump.jpg', blurb: { en: 'Pumps, compressors, presses', tr: 'Pompalar, kompresörler, presler' } },
  { category: 'Electronics', image: '/products/plc-controller.jpg', blurb: { en: 'Controls, drives and sensors', tr: 'Kumanda, sürücü ve sensörler' } },
  { category: 'Automotive', image: '/products/brake-disc.jpg', blurb: { en: 'OEM and aftermarket components', tr: 'OEM ve yedek parça bileşenleri' } },
  { category: 'Construction Materials', image: '/products/cement-bags.jpg', blurb: { en: 'Cement, pipes, covers, structures', tr: 'Çimento, borular, kapaklar, yapılar' } },
  { category: 'Renewable Energy', image: '/products/wind-blade.jpg', blurb: { en: 'Blades, panels, inverters', tr: 'Kanatlar, paneller, invertörler' } },
  { category: 'Packaging', image: '/products/corrugated-boxes.jpg', blurb: { en: 'Cartons, film and protective packaging', tr: 'Kartonlar, film ve koruyucu ambalaj' } },
  { category: 'Plastic & Rubber', image: '/products/plastic-granules.jpg', blurb: { en: 'Resins, granules and compounds', tr: 'Reçineler, granüller ve bileşikler' } },
  { category: 'Textiles', image: '/products/polyester-yarn.jpg', blurb: { en: 'Yarn, fabric and finished textile stock', tr: 'İplik, kumaş ve mamul tekstil stoğu' } },
  { category: 'Agriculture', image: '/products/cat-agriculture.jpg', blurb: { en: 'Fertiliser, feed and farm inputs', tr: 'Gübre, yem ve tarımsal girdiler' } },
  { category: 'Energy', image: '/products/battery-pack.jpg', blurb: { en: 'Cells, packs and storage systems', tr: 'Hücreler, paketler ve depolama sistemleri' } },
  { category: 'Mining & Ore', image: '/products/antimony-ore.jpg', blurb: { en: 'Ore, concentrate and mine output', tr: 'Cevher, konsantre ve maden üretimi' } },
  { category: 'Paper & Pulp', image: '/products/kraft-paper.jpg', blurb: { en: 'Kraft, board and pulp', tr: 'Kraft, karton ve kağıt hamuru' } },
  { category: 'Rubber', image: '/products/rubber-seals.jpg', blurb: { en: 'Seals, hoses and rubber parts', tr: 'Contalar, hortumlar ve kauçuk parçalar' } },
  { category: 'Ceramics & Glass', image: '/products/cat-ceramics.jpg', blurb: { en: 'Tiles, refractories and glass', tr: 'Karolar, refrakterler ve cam' } },
  { category: 'Furniture & Wood', image: '/products/cat-furniture.jpg', blurb: { en: 'Contract furniture and timber stock', tr: 'Proje mobilyaları ve kereste stoğu' } },
  { category: 'Medical Supplies', image: '/products/cat-medical.jpg', blurb: { en: 'Single-use medical stock and instruments', tr: 'Tek kullanımlık medikal stok ve aletler' } },
  { category: 'Safety & PPE', image: '/products/cat-ppe.jpg', blurb: { en: 'Protective equipment and site safety', tr: 'Koruyucu ekipman ve saha güvenliği' } },
  { category: 'Food Processing', image: '/products/cat-food.jpg', blurb: { en: 'Processing lines and stainless fittings', tr: 'İşleme hatları ve paslanmaz bağlantı parçaları' } },
  { category: 'Marine & Offshore', image: '/products/cat-marine.jpg', blurb: { en: 'Deck, engine and offshore equipment', tr: 'Güverte, makine ve açık deniz ekipmanları' } },
  { category: 'Aerospace', image: '/products/cat-aerospace.jpg', blurb: { en: 'Airframe, engine and MRO parts', tr: 'Uçak gövdesi, motor ve MRO parçaları' } },
  { category: 'Hardware & Fasteners', image: '/products/cat-fasteners.jpg', blurb: { en: 'Fasteners, fixings and hand hardware', tr: 'Bağlantı elemanları, tespit parçaları ve el aletleri' } },
];

const BY_CATEGORY = new Map<string, RawCover>(RAW_COVERS.map((c) => [c.category, c]));

/**
 * The blurb for one category in an explicit language, falling back to English —
 * the same degrade-don't-blank rule the dictionary follows.
 */
export function blurbFor(category: string, lang: LangCode): string | undefined {
  const raw = BY_CATEGORY.get(category);
  if (!raw) return undefined;
  return raw.blurb[lang] ?? raw.blurb.en;
}

/**
 * The covers as the UI consumes them. `blurb` is a getter rather than a fixed
 * string so a caller that re-renders on a language change (every tile reads the
 * dictionary for its heading) picks up the new language without a second prop.
 */
export const CATEGORY_COVERS: readonly CategoryCover[] = RAW_COVERS.map((raw) => {
  const cover = { category: raw.category, image: raw.image, blurbs: raw.blurb } as CategoryCover;
  Object.defineProperty(cover, 'blurb', {
    enumerable: true,
    get: () => raw.blurb[getActiveLang()] ?? raw.blurb.en,
  });
  return cover;
});

const COVER_BY_CATEGORY = new Map<string, CategoryCover>(CATEGORY_COVERS.map((c) => [c.category, c]));

export function coverFor(category: string): CategoryCover | undefined {
  return COVER_BY_CATEGORY.get(category);
}
