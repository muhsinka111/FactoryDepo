/**
 * FactoryDepo seed — idempotent demo dataset.
 *
 * Run:
 *   pnpm --filter @workspace/db exec tsx scripts/seed.ts
 *   DATABASE_URL=postgres://... pnpm --filter @workspace/db exec tsx scripts/seed.ts
 *
 * Idempotency: TRUNCATEs all 6 tables (RESTART IDENTITY CASCADE) on every run,
 * then inserts a fixed, deterministic dataset:
 *   17 users (3 demo + inspector + 2 extra buyers + 11 supplier users)
 *   12 suppliers · 40 products · 8 RFQs · 10 quotes · 2 inspections
 *
 * Demo login (all accounts): password `factorydepo`
 *   demo@factorydepo.com    (admin)
 *   buyer@factorydepo.com   (buyer)
 *   supplier@factorydepo.com(supplier)
 */
import { hashSync } from 'bcryptjs';
import { sql } from 'drizzle-orm';

import { createDb, inspections, products, quotes, rfqs, suppliers, users } from '../src/index.js';
import { demoSeedEnabled } from '../src/seed-policy.js';

// This script TRUNCATEs and rewrites the whole demo dataset, so it must refuse
// outright rather than half-run: production is not a place for demo rows.
if (!demoSeedEnabled()) {
  console.error(
    '[seed] refused: this database is production (NODE_ENV=production without SEED_DEMO=1).\n' +
      '        Nothing was truncated or inserted. Set SEED_DEMO=1 if this really is a dev database.',
  );
  process.exit(1);
}

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/factorydepo';

const db = createDb(DATABASE_URL);

const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000);
const PASSWORD = 'factorydepo';
const PASSWORD_HASH = hashSync(PASSWORD, 10);

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
type UserSeed = {
  email: string;
  role: string;
  name: string;
  company: string;
  country: string;
  trustScore: number;
};

const userSeeds: UserSeed[] = [
  // Demo trio
  { email: 'demo@factorydepo.com', role: 'admin', name: 'Demo Admin', company: 'FactoryDepo HQ', country: 'Türkiye', trustScore: 0 },
  { email: 'buyer@factorydepo.com', role: 'buyer', name: 'Ahmed K.', company: 'Gulf Trading Co', country: 'Saudi Arabia', trustScore: 0 },
  { email: 'supplier@factorydepo.com', role: 'supplier', name: 'Mehmet Demir', company: 'Anatolian Machinery A.Ş.', country: 'Türkiye', trustScore: 88 },
  // Platform inspector
  { email: 'inspector@factorydepo.com', role: 'inspector', name: 'Seda Aydın', company: 'FactoryDepo Inspections', country: 'Türkiye', trustScore: 0 },
  // Extra buyers for RFQs
  { email: 'gulf@sourcing.sa', role: 'buyer', name: 'Khalid Al-Rashid', company: 'Gulf Sourcing Co', country: 'Saudi Arabia', trustScore: 0 },
  { email: 'berlin@industries.de', role: 'buyer', name: 'Jonas Weber', company: 'Berlin Industries GmbH', country: 'Germany', trustScore: 0 },
  // Supplier users (one per supplier)
  { email: 'jiangsu@xihua.cn', role: 'supplier', name: 'Zhang Wei', company: 'Jiangsu Xihua Metal Group', country: 'China', trustScore: 93 },
  { email: 'foshan@steel.cn', role: 'supplier', name: 'Chen Jie', company: 'Foshan Steel Co', country: 'China', trustScore: 89 },
  { email: 'shandong@mining.cn', role: 'supplier', name: 'Liu Yang', company: 'Shandong Mining Group', country: 'China', trustScore: 91 },
  { email: 'zhejiang@chemtech.cn', role: 'supplier', name: 'Zhao Min', company: 'Zhejiang Chemtech Co', country: 'China', trustScore: 90 },
  { email: 'iberia@minerals.es', role: 'supplier', name: 'Javier Ortega', company: 'Iberia Minerals S.L.', country: 'Spain', trustScore: 87 },
  { email: 'bursa@aluminum.com.tr', role: 'supplier', name: 'Ali Yılmaz', company: 'Bursa Aluminum A.Ş.', country: 'Türkiye', trustScore: 86 },
  { email: 'istanbul@chemicals.com.tr', role: 'supplier', name: 'Emre Kaya', company: 'Istanbul Chemicals San.', country: 'Türkiye', trustScore: 82 },
  { email: 'ningbo@solar.cn', role: 'supplier', name: 'Xu Fang', company: 'Ningbo Solar Energy', country: 'China', trustScore: 88 },
  { email: 'brescia@castings.it', role: 'supplier', name: 'Marco Ricci', company: 'Brescia Castings S.p.A.', country: 'Italy', trustScore: 80 },
  { email: 'berlin@praezision.de', role: 'supplier', name: 'Klaus Fischer', company: 'Berlin Präzision GmbH', country: 'Germany', trustScore: 92 },
  { email: 'krakow@packaging.pl', role: 'supplier', name: 'Anna Kowalska', company: 'Kraków Packaging S.A.', country: 'Poland', trustScore: 79 },
];

// ---------------------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------------------
type SupplierSeed = {
  userEmail: string;
  companyName: string;
  country: string;
  city: string;
  description: string;
  verifiedLevel: number;
  rating: number;
  inspectionsCount: number;
  fulfillmentRate: number;
  tags: string[];
  since: number;
};

const supplierSeeds: SupplierSeed[] = [
  { userEmail: 'jiangsu@xihua.cn', companyName: 'Jiangsu Xihua Metal Group', country: 'China', city: 'Jiangsu', description: 'Integrated copper smelter with in-house anode slime refining and export-grade cathode production.', verifiedLevel: 3, rating: 4.9, inspectionsCount: 24, fulfillmentRate: 98.4, tags: ['Copper Cathode', 'Smelting', 'Anode Slime'], since: 2008 },
  { userEmail: 'foshan@steel.cn', companyName: 'Foshan Steel Co', country: 'China', city: 'Guangdong', description: 'Cold-rolling and galvanizing lines supplying HRC, CRC and coated coils to 30+ countries.', verifiedLevel: 2, rating: 4.8, inspectionsCount: 18, fulfillmentRate: 97.1, tags: ['Steel Coil', 'HRC', 'Galvanized'], since: 2012 },
  { userEmail: 'shandong@mining.cn', companyName: 'Shandong Mining Group', country: 'China', city: 'Shandong', description: 'Antimony ore mining and concentrate processing with integrated smelting partnerships.', verifiedLevel: 3, rating: 4.9, inspectionsCount: 21, fulfillmentRate: 96.8, tags: ['Antimony Ore', 'Mining', 'Concentrates'], since: 2005 },
  { userEmail: 'supplier@factorydepo.com', companyName: 'Anatolian Machinery A.Ş.', country: 'Türkiye', city: 'İzmir', description: 'CNC machining, injection molding and industrial equipment manufacturer serving EU and MENA.', verifiedLevel: 2, rating: 4.8, inspectionsCount: 15, fulfillmentRate: 97.6, tags: ['CNC', 'Injection Molding', 'Machinery'], since: 2010 },
  { userEmail: 'zhejiang@chemtech.cn', companyName: 'Zhejiang Chemtech Co', country: 'China', city: 'Zhejiang', description: 'Battery-grade lithium carbonate and specialty chemicals for the energy storage supply chain.', verifiedLevel: 2, rating: 4.7, inspectionsCount: 17, fulfillmentRate: 96.2, tags: ['Lithium Carbonate', 'Battery Chemicals'], since: 2015 },
  { userEmail: 'iberia@minerals.es', companyName: 'Iberia Minerals S.L.', country: 'Spain', city: 'Huelva', description: 'Tin and rare-earth concentrate exporter from southern Spanish mining concessions.', verifiedLevel: 2, rating: 4.8, inspectionsCount: 12, fulfillmentRate: 95.9, tags: ['Tin', 'Concentrates', 'Rare Earth'], since: 2014 },
  { userEmail: 'bursa@aluminum.com.tr', companyName: 'Bursa Aluminum A.Ş.', country: 'Türkiye', city: 'Bursa', description: 'Primary aluminum ingot casting plus extrusion and wheel production for automotive OEMs.', verifiedLevel: 2, rating: 4.7, inspectionsCount: 14, fulfillmentRate: 96.5, tags: ['Aluminum Ingot', 'Extrusion'], since: 2009 },
  { userEmail: 'istanbul@chemicals.com.tr', companyName: 'Istanbul Chemicals San.', country: 'Türkiye', city: 'Kocaeli', description: 'Construction chemicals, resins and polymer masterbatch producer in the Gebze industrial zone.', verifiedLevel: 1, rating: 4.6, inspectionsCount: 9, fulfillmentRate: 95.4, tags: ['Construction Chemicals', 'Resins'], since: 2016 },
  { userEmail: 'ningbo@solar.cn', companyName: 'Ningbo Solar Energy', country: 'China', city: 'Zhejiang', description: 'Mono PERC solar module and inverter manufacturer with 4GW annual capacity.', verifiedLevel: 2, rating: 4.8, inspectionsCount: 16, fulfillmentRate: 97.9, tags: ['Solar Panels', 'Mono PERC'], since: 2013 },
  { userEmail: 'brescia@castings.it', companyName: 'Brescia Castings S.p.A.', country: 'Italy', city: 'Brescia', description: 'Iron and alloy castings, forgings and machined components for infrastructure and automotive.', verifiedLevel: 1, rating: 4.5, inspectionsCount: 8, fulfillmentRate: 94.8, tags: ['Castings', 'Forgings'], since: 2017 },
  { userEmail: 'berlin@praezision.de', companyName: 'Berlin Präzision GmbH', country: 'Germany', city: 'Dresden', description: 'High-precision CNC turned and milled components, servo drives and industrial electronics.', verifiedLevel: 2, rating: 4.9, inspectionsCount: 11, fulfillmentRate: 98.2, tags: ['Precision Parts', 'CNC'], since: 2006 },
  { userEmail: 'krakow@packaging.pl', companyName: 'Kraków Packaging S.A.', country: 'Poland', city: 'Kraków', description: 'Corrugated packaging, kraft paper and textile packing solutions for export industries.', verifiedLevel: 1, rating: 4.6, inspectionsCount: 7, fulfillmentRate: 95.1, tags: ['Packaging', 'Corrugated'], since: 2018 },
];

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------
type ProductSeed = {
  supplierName: string;
  name: string;
  category: string;
  description: string;
  price: number;
  unit: string;
  moq: number;
  originCountry: string;
  purityGrade?: string | null;
  verified: boolean;
  spec?: Record<string, string>[];
};

const productSeeds: ProductSeed[] = [
  // ---- Metals & Minerals ----
  { supplierName: 'Jiangsu Xihua Metal Group', name: 'Copper Cathode 99.99%', category: 'Metals & Minerals', description: 'LME A-grade copper cathode, export quality, cut to 1020×1010×12mm plates.', price: 8742, unit: 'MT', moq: 25, originCountry: 'TR', purityGrade: '99.99%', verified: true, spec: [{ key: 'Purity', value: '99.99%' }, { key: 'Grade', value: 'LME A' }, { key: 'Packaging', value: 'Bundles, ~2.5 MT' }] },
  { supplierName: 'Jiangsu Xihua Metal Group', name: 'Aluminum Ingot 99.7%', category: 'Metals & Minerals', description: 'Primary aluminum ingot 99.7%, 20kg ingots, standard export packing.', price: 2980, unit: 'MT', moq: 25, originCountry: 'CN', purityGrade: '99.7%', verified: true, spec: [{ key: 'Purity', value: '99.7%' }, { key: 'Ingot', value: '20 kg' }] },
  { supplierName: 'Shandong Mining Group', name: 'Antimony Ore 50-60%', category: 'Metals & Minerals', description: 'Run-of-mine antimony ore, 50-60% Sb content, sorted and bagged.', price: 14500, unit: 'MT', moq: 50, originCountry: 'CN', purityGrade: '50-60% Sb', verified: true, spec: [{ key: 'Sb content', value: '50-60%' }, { key: 'Form', value: 'Lump ore' }] },
  { supplierName: 'Jiangsu Xihua Metal Group', name: 'Zinc Ingot 99.995%', category: 'Metals & Minerals', description: 'Special high grade zinc ingot, 99.995% Zn, 500kg strapped bundles.', price: 2650, unit: 'MT', moq: 20, originCountry: 'CN', purityGrade: '99.995%', verified: true },
  { supplierName: 'Bursa Aluminum A.Ş.', name: 'Aluminum Profiles Extrusion', category: 'Metals & Minerals', description: 'Custom 6063-T5 aluminum profiles, anodizing and powder coating available.', price: 3120, unit: 'MT', moq: 5, originCountry: 'TR', verified: true },
  // ---- Steel ----
  { supplierName: 'Foshan Steel Co', name: 'Steel Coil Cold Rolled DC01', category: 'Steel', description: 'Cold rolled steel coil DC01, 0.4-2.0mm thickness, matte finish, spangle-free.', price: 617, unit: 'MT', moq: 20, originCountry: 'TR', verified: true, spec: [{ key: 'Standard', value: 'EN 10130' }, { key: 'Thickness', value: '0.4-2.0 mm' }] },
  { supplierName: 'Foshan Steel Co', name: 'Hot Rolled Coil Q235B', category: 'Steel', description: 'Hot rolled coil Q235B, 2.0-12mm, pickled and oiled on request.', price: 545, unit: 'MT', moq: 50, originCountry: 'CN', verified: true },
  { supplierName: 'Foshan Steel Co', name: 'Galvanized Steel Coil DX51D', category: 'Steel', description: 'Hot-dip galvanized coil DX51D+Z, 80-275 g/m² zinc coating.', price: 720, unit: 'MT', moq: 25, originCountry: 'CN', verified: true },
  { supplierName: 'Foshan Steel Co', name: 'Stainless Steel Sheet 304', category: 'Steel', description: 'Stainless steel sheet 304 2B finish, 0.5-3.0mm, film-protected.', price: 2350, unit: 'MT', moq: 10, originCountry: 'CN', verified: true },
  // ---- Chemicals ----
  { supplierName: 'Zhejiang Chemtech Co', name: 'Lithium Carbonate Battery Grade', category: 'Chemicals', description: 'Battery-grade lithium carbonate Li2CO3 ≥99.5%, for cathode material production.', price: 18850, unit: 'MT', moq: 1, originCountry: 'CN', purityGrade: '≥99.5%', verified: true, spec: [{ key: 'Purity', value: '≥99.5%' }, { key: 'Grade', value: 'Battery' }] },
  { supplierName: 'Istanbul Chemicals San.', name: 'Caustic Soda Pearls 99%', category: 'Chemicals', description: 'Caustic soda pearls 99% NaOH, 25kg bags, industrial grade.', price: 480, unit: 'MT', moq: 20, originCountry: 'TR', purityGrade: '99%', verified: false },
  { supplierName: 'Istanbul Chemicals San.', name: 'Epoxy Resin Bisphenol A', category: 'Chemicals', description: 'Liquid epoxy resin BPA-based, EEW 182-192, for coatings and composites.', price: 2100, unit: 'MT', moq: 5, originCountry: 'TR', verified: false },
  { supplierName: 'Zhejiang Chemtech Co', name: 'Titanium Dioxide R-996', category: 'Chemicals', description: 'Rutile titanium dioxide R-996, 94% TiO2, for paints and plastics.', price: 2850, unit: 'MT', moq: 10, originCountry: 'CN', verified: true },
  // ---- Machinery ----
  { supplierName: 'Anatolian Machinery A.Ş.', name: 'Industrial Pump High Efficiency', category: 'Machinery', description: 'Centrifugal industrial pump, IE4 motor, 50Hz, up to 250 m³/h flow.', price: 2450, unit: 'Set', moq: 5, originCountry: 'TR', verified: true, spec: [{ key: 'Flow', value: '250 m³/h' }, { key: 'Motor', value: 'IE4' }] },
  { supplierName: 'Anatolian Machinery A.Ş.', name: 'CNC Machining Center 5-Axis', category: 'Machinery', description: '5-axis vertical machining center, 12000rpm spindle, 700×500×450mm travel.', price: 28000, unit: 'Set', moq: 1, originCountry: 'CN', verified: true, spec: [{ key: 'Axes', value: '5' }, { key: 'Spindle', value: '12000 rpm' }] },
  { supplierName: 'Anatolian Machinery A.Ş.', name: 'Injection Molding Machine 250T', category: 'Machinery', description: 'Servo-hydraulic injection molding machine, 250 ton clamp, 480g shot.', price: 68000, unit: 'Set', moq: 1, originCountry: 'CN', verified: true },
  { supplierName: 'Anatolian Machinery A.Ş.', name: 'CNC Lathe SL-20', category: 'Machinery', description: 'Slant-bed CNC lathe, 200mm chuck, 450mm turning length, Fanuc control.', price: 42000, unit: 'Set', moq: 1, originCountry: 'TR', verified: true },
  // ---- Industrial Equipment ----
  { supplierName: 'Anatolian Machinery A.Ş.', name: 'Screw Air Compressor 75kW', category: 'Industrial Equipment', description: 'Variable-speed rotary screw compressor, 75kW, 12.8 m³/min FAD.', price: 8500, unit: 'Set', moq: 2, originCountry: 'TR', verified: true },
  { supplierName: 'Brescia Castings S.p.A.', name: 'Three-Phase Induction Motor 45kW', category: 'Industrial Equipment', description: 'IE3 induction motor, 45kW, 4-pole, foot mounted, IP55.', price: 1200, unit: 'pc', moq: 10, originCountry: 'IT', verified: false },
  { supplierName: 'Brescia Castings S.p.A.', name: 'Industrial Gearbox 25:1', category: 'Industrial Equipment', description: 'Helical gearbox, ratio 25:1, torque 850 Nm, cast iron housing.', price: 3400, unit: 'pc', moq: 5, originCountry: 'IT', verified: false },
  { supplierName: 'Anatolian Machinery A.Ş.', name: 'Hydraulic Press 200T', category: 'Industrial Equipment', description: 'Four-column hydraulic press, 200 ton capacity, PLC controlled.', price: 15500, unit: 'Set', moq: 1, originCountry: 'TR', verified: true },
  // ---- Electronics ----
  { supplierName: 'Berlin Präzision GmbH', name: 'Industrial PLC Controller', category: 'Electronics', description: 'Modular industrial PLC, 32 DI / 24 DO, Ethernet/IP, DIN-rail mount.', price: 180, unit: 'pc', moq: 50, originCountry: 'DE', verified: true },
  { supplierName: 'Berlin Präzision GmbH', name: 'Servo Drive 1.5kW', category: 'Electronics', description: 'Compact servo drive, 1.5kW, 230V, with EtherCAT interface.', price: 260, unit: 'pc', moq: 20, originCountry: 'DE', verified: true },
  { supplierName: 'Berlin Präzision GmbH', name: 'Proximity Sensors M18', category: 'Electronics', description: 'Inductive proximity sensor M18, 8mm sensing distance, PNP NO.', price: 8.5, unit: 'pc', moq: 500, originCountry: 'DE', verified: true },
  // ---- Automotive ----
  { supplierName: 'Bursa Aluminum A.Ş.', name: 'Aluminum Alloy Wheel Rims 17"', category: 'Automotive', description: 'Die-cast aluminum alloy wheel, 17×7.5J, 5×114.3, silver painted.', price: 68, unit: 'pc', moq: 500, originCountry: 'TR', verified: true },
  { supplierName: 'Brescia Castings S.p.A.', name: 'Brake Disc Rotors Cast Iron', category: 'Automotive', description: 'Vented cast iron brake disc, 300mm, balanced and coated.', price: 24, unit: 'pc', moq: 1000, originCountry: 'IT', verified: false },
  { supplierName: 'Brescia Castings S.p.A.', name: 'Engine Valve Castings', category: 'Automotive', description: 'Stainless steel engine intake/exhaust valve forgings, 25-45mm head.', price: 6.8, unit: 'pc', moq: 2000, originCountry: 'IT', verified: false },
  // ---- Construction Materials ----
  { supplierName: 'Istanbul Chemicals San.', name: 'Portland Cement CEM I 42.5', category: 'Construction Materials', description: 'Portland cement CEM I 42.5R, 50kg bags, EN 197-1 certified.', price: 62, unit: 'MT', moq: 200, originCountry: 'TR', verified: false },
  { supplierName: 'Brescia Castings S.p.A.', name: 'Cast Iron Manhole Covers', category: 'Construction Materials', description: 'EN 124 D400 ductile iron manhole cover and frame, 600mm round.', price: 58, unit: 'pc', moq: 500, originCountry: 'IT', verified: false },
  { supplierName: 'Istanbul Chemicals San.', name: 'PVC Pipes 110mm', category: 'Construction Materials', description: 'uPVC pressure pipe 110mm PN10, 6m lengths, TS EN 1452.', price: 2.4, unit: 'm', moq: 1000, originCountry: 'TR', verified: false },
  { supplierName: 'Foshan Steel Co', name: 'Prefabricated Steel Structure', category: 'Construction Materials', description: 'Pre-engineered steel warehouse structure, 30×60m, hot-dip galvanized.', price: 48000, unit: 'Set', moq: 1, originCountry: 'CN', verified: true },
  // ---- Renewable Energy ----
  { supplierName: 'Ningbo Solar Energy', name: 'Solar Panel 550W Mono PERC', category: 'Renewable Energy', description: '550W mono PERC bifacial module, 182mm cells, 25-year linear warranty.', price: 0.21, unit: 'W', moq: 1000, originCountry: 'CN', verified: true, spec: [{ key: 'Power', value: '550 W' }, { key: 'Cell', value: '182 mm mono PERC' }] },
  { supplierName: 'Ningbo Solar Energy', name: 'Solar Inverter 10kW', category: 'Renewable Energy', description: 'Hybrid string inverter 10kW, 2 MPPT, IP66, Wi-Fi monitoring.', price: 520, unit: 'pc', moq: 100, originCountry: 'CN', verified: true },
  { supplierName: 'Zhejiang Chemtech Co', name: 'Lithium Battery Pack 48V 100Ah', category: 'Renewable Energy', description: 'LiFePO4 battery pack 48V 100Ah with BMS, for solar storage.', price: 890, unit: 'pc', moq: 50, originCountry: 'CN', verified: true },
  { supplierName: 'Ningbo Solar Energy', name: 'Wind Turbine Blade 55m', category: 'Renewable Energy', description: 'Fiberglass wind turbine blade 55m for 2.5MW class turbines.', price: 85000, unit: 'pc', moq: 2, originCountry: 'CN', verified: true },
  // ---- Packaging ----
  { supplierName: 'Kraków Packaging S.A.', name: 'Corrugated Boxes 3-Layer', category: 'Packaging', description: '3-layer corrugated carton boxes, custom print, 300-800g/m² board.', price: 0.9, unit: 'pc', moq: 5000, originCountry: 'PL', verified: false },
  { supplierName: 'Kraków Packaging S.A.', name: 'Kraft Paper Rolls 120gsm', category: 'Packaging', description: 'Virgin kraft paper roll, 120gsm, 1.6m width, for bag making.', price: 950, unit: 'MT', moq: 10, originCountry: 'PL', verified: false },
  // ---- Plastic & Rubber ----
  { supplierName: 'Istanbul Chemicals San.', name: 'PP Granules Homo 100% Virgin', category: 'Plastic & Rubber', description: 'Homopolymer PP granules, MFI 11, virgin, for injection and film.', price: 1150, unit: 'MT', moq: 25, originCountry: 'TR', verified: false },
  { supplierName: 'Anatolian Machinery A.Ş.', name: 'Rubber Seals EPDM', category: 'Plastic & Rubber', description: 'EPDM rubber seals and gaskets, 40-90 Shore A, custom profiles.', price: 0.35, unit: 'pc', moq: 10000, originCountry: 'CN', verified: true },
  // ---- Textiles ----
  { supplierName: 'Kraków Packaging S.A.', name: 'Polyester Yarn 150D', category: 'Textiles', description: 'Textured polyester yarn 150D/48F, SD, for weaving and knitting.', price: 1850, unit: 'MT', moq: 20, originCountry: 'PL', verified: false },
];

// ---------------------------------------------------------------------------
// RFQs
// ---------------------------------------------------------------------------
type RfqSeed = {
  buyerEmail: string;
  title: string;
  category: string;
  description: string;
  quantity: number;
  unit: string;
  targetCountry: string;
  status: string;
  deadline: Date | null;
};

const rfqSeeds: RfqSeed[] = [
  { buyerEmail: 'buyer@factorydepo.com', title: '100 Tons Copper Cathode', category: 'Metals & Minerals', description: 'Annual supply of LME A-grade copper cathode 99.99% for cable manufacturing. FOB or CIF Türkiye.', quantity: 100, unit: 'MT', targetCountry: 'Türkiye', status: 'open', deadline: daysFromNow(30) },
  { buyerEmail: 'berlin@industries.de', title: 'OEM Plastic Injection Parts', category: 'Plastic & Rubber', description: 'Custom injection-molded housings, ABS, tooling already available. 50000 pcs/year contract.', quantity: 50000, unit: 'pc', targetCountry: 'Germany', status: 'open', deadline: null },
  { buyerEmail: 'buyer@factorydepo.com', title: 'Battery-Grade Lithium 5 MT', category: 'Chemicals', description: 'Battery-grade lithium carbonate, ≥99.5%, for pilot cathode line. CIF Houston.', quantity: 5, unit: 'MT', targetCountry: 'USA', status: 'open', deadline: daysFromNow(21) },
  { buyerEmail: 'buyer@factorydepo.com', title: 'Steel Coil HRC 300 MT', category: 'Steel', description: 'Hot rolled coil Q235B 2.0-12mm, 300 MT, delivered to İzmir port over 3 shipments.', quantity: 300, unit: 'MT', targetCountry: 'Türkiye', status: 'quoted', deadline: daysFromNow(15) },
  { buyerEmail: 'berlin@industries.de', title: 'Solar Panel 550W 20000 pcs', category: 'Renewable Energy', description: '550W mono PERC modules for utility project in Sicily. Tier-1 bankability preferred.', quantity: 20000, unit: 'pc', targetCountry: 'Italy', status: 'open', deadline: daysFromNow(45) },
  { buyerEmail: 'gulf@sourcing.sa', title: 'Cast Iron Manhole Covers', category: 'Construction Materials', description: 'EN 124 D400 ductile iron covers, 600mm, 1500 pcs for municipal project.', quantity: 1500, unit: 'pc', targetCountry: 'Poland', status: 'open', deadline: null },
  { buyerEmail: 'berlin@industries.de', title: 'Aluminum Profiles Extrusion', category: 'Metals & Minerals', description: '6063-T5 custom extrusion profiles, 80 MT annual, anodized finish.', quantity: 80, unit: 'MT', targetCountry: 'Germany', status: 'quoted', deadline: daysFromNow(25) },
  { buyerEmail: 'gulf@sourcing.sa', title: 'Textile Yarn Polyester', category: 'Textiles', description: 'Polyester yarn 150D for weaving, 40 MT trial order. Closed — awarded to local mill.', quantity: 40, unit: 'MT', targetCountry: 'Portugal', status: 'closed', deadline: daysFromNow(-5) },
];

// ---------------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------------
type QuoteSeed = {
  rfqTitle: string;
  supplierName: string;
  price: number;
  leadTimeDays: number;
  notes: string;
  status: string;
};

const quoteSeeds: QuoteSeed[] = [
  { rfqTitle: '100 Tons Copper Cathode', supplierName: 'Jiangsu Xihua Metal Group', price: 8600, leadTimeDays: 30, notes: 'FOB Shanghai, LME-linked pricing, 2.5 MT bundles.', status: 'submitted' },
  { rfqTitle: 'OEM Plastic Injection Parts', supplierName: 'Anatolian Machinery A.Ş.', price: 0.42, leadTimeDays: 35, notes: 'Per-part price, ABS, includes tooling amortization over 50000 pcs.', status: 'submitted' },
  { rfqTitle: 'Battery-Grade Lithium 5 MT', supplierName: 'Zhejiang Chemtech Co', price: 17900, leadTimeDays: 25, notes: 'CIF Houston, battery grade ≥99.5%, 1 MT drums.', status: 'submitted' },
  { rfqTitle: 'Steel Coil HRC 300 MT', supplierName: 'Foshan Steel Co', price: 548, leadTimeDays: 40, notes: 'FOB Tianjin, Q235B 3.0mm, three shipments of 100 MT.', status: 'accepted' },
  { rfqTitle: 'Steel Coil HRC 300 MT', supplierName: 'Foshan Steel Co', price: 555, leadTimeDays: 45, notes: 'Alternative offer, CIF İzmir, includes port handling.', status: 'rejected' },
  { rfqTitle: 'Solar Panel 550W 20000 pcs', supplierName: 'Ningbo Solar Energy', price: 0.19, leadTimeDays: 30, notes: 'Per-Watt price, 20000 pcs = 11MW, containerized delivery.', status: 'submitted' },
  { rfqTitle: 'Cast Iron Manhole Covers', supplierName: 'Brescia Castings S.p.A.', price: 54, leadTimeDays: 50, notes: 'EN 124 D400, 600mm round, palletized, CE documents included.', status: 'submitted' },
  { rfqTitle: 'Aluminum Profiles Extrusion', supplierName: 'Bursa Aluminum A.Ş.', price: 3120, leadTimeDays: 28, notes: 'Per MT, 6063-T5, anodized, EXW Bursa.', status: 'submitted' },
  { rfqTitle: 'Aluminum Profiles Extrusion', supplierName: 'Bursa Aluminum A.Ş.', price: 3080, leadTimeDays: 35, notes: 'Volume pricing for 80 MT annual contract, tooling included.', status: 'submitted' },
  { rfqTitle: '100 Tons Copper Cathode', supplierName: 'Jiangsu Xihua Metal Group', price: 8700, leadTimeDays: 45, notes: 'CIF Mersin option, staggered monthly delivery.', status: 'submitted' },
];

// ---------------------------------------------------------------------------
// Inspections
// ---------------------------------------------------------------------------
type InspectionSeed = {
  supplierName: string;
  inspectorEmail: string;
  type: string;
  status: string;
  score: number | null;
  scheduledAt: Date | null;
  completedAt: Date | null;
  reportUrl: string | null;
};

const inspectionSeeds: InspectionSeed[] = [
  { supplierName: 'Jiangsu Xihua Metal Group', inspectorEmail: 'inspector@factorydepo.com', type: 'facility_audit', status: 'passed', score: 92, scheduledAt: daysFromNow(-40), completedAt: daysFromNow(-35), reportUrl: 'https://cdn.factorydepo.com/reports/jxmg-facility-2026-001.pdf' },
  { supplierName: 'Ningbo Solar Energy', inspectorEmail: 'inspector@factorydepo.com', type: 'production_line', status: 'scheduled', score: null, scheduledAt: daysFromNow(14), completedAt: null, reportUrl: null },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  // 1. Idempotency: wipe everything, reset identity sequences.
  await db.execute(
    sql`TRUNCATE quotes, inspections, rfqs, products, suppliers, users RESTART IDENTITY CASCADE`,
  );

  // 2. Users (single hash reused for every demo account).
  const insertedUsers = await db
    .insert(users)
    .values(
      userSeeds.map((u) => ({
        email: u.email,
        passwordHash: PASSWORD_HASH,
        name: u.name,
        role: u.role,
        company: u.company,
        country: u.country,
        trustScore: String(u.trustScore),
        emailVerified: true,
      })),
    )
    .returning({ id: users.id, email: users.email });
  const userIdByEmail = new Map(insertedUsers.map((u) => [u.email, u.id]));

  // 3. Suppliers (trustScore lives on the linked user, already set above).
  const insertedSuppliers = await db
    .insert(suppliers)
    .values(
      supplierSeeds.map((s) => ({
        userId: userIdByEmail.get(s.userEmail)!,
        companyName: s.companyName,
        country: s.country,
        city: s.city,
        description: s.description,
        verifiedLevel: s.verifiedLevel,
        rating: String(s.rating),
        inspectionsCount: s.inspectionsCount,
        fulfillmentRate: String(s.fulfillmentRate),
        tags: s.tags,
        since: s.since,
        dataSource: 'demo',
      })),
    )
    .returning({ id: suppliers.id, companyName: suppliers.companyName });
  const supplierIdByName = new Map(insertedSuppliers.map((s) => [s.companyName, s.id]));

  // 4. Products.
  await db.insert(products).values(
    productSeeds.map((p) => {
      const n = p.name.toLowerCase();
      const imageKey =
        n.includes('copper') ? '/products/copper-cathode.jpg'
        : n.includes('steel coil') || n.includes('cold rolled') ? '/products/steel-coil.jpg'
        : n.includes('lithium') ? '/products/lithium-carbonate.jpg'
        : n.includes('pump') ? '/products/industrial-pump.jpg'
        : n.includes('solar') ? '/products/solar-panel.jpg'
        : n.includes('cnc') || n.includes('machining') ? '/products/cnc-machine.jpg'
        : n.includes('aluminum') || n.includes('aluminium') || n.includes('ingot') ? '/products/aluminum-ingot.jpg'
        : n.includes('antimony') || n.includes('ore') ? '/products/antimony-ore.jpg'
        : n.includes('granule') || n.includes('plastic') ? '/products/plastic-granules.jpg'
        : n.includes('kraft') || n.includes('paper') ? '/products/kraft-paper.jpg'
        : null;
      return {
        supplierId: supplierIdByName.get(p.supplierName)!,
        name: p.name,
        category: p.category,
        description: p.description,
        spec: p.spec ?? [],
        price: String(p.price),
        currency: 'USD',
        unit: p.unit,
        moq: String(p.moq),
        originCountry: p.originCountry,
        purityGrade: p.purityGrade ?? null,
        verified: p.verified,
        imageKey,
        quantityAvailable: String(Math.max(p.moq * 20, 100)),
        status: 'active',
        dataSource: 'demo',
      };
    }),
  );

  // 5. RFQs.
  const insertedRfqs = await db
    .insert(rfqs)
    .values(
      rfqSeeds.map((r) => ({
        buyerId: userIdByEmail.get(r.buyerEmail)!,
        title: r.title,
        category: r.category,
        description: r.description,
        quantity: String(r.quantity),
        unit: r.unit,
        targetCountry: r.targetCountry,
        status: r.status,
        deadline: r.deadline,
      })),
    )
    .returning({ id: rfqs.id, title: rfqs.title });
  const rfqIdByTitle = new Map(insertedRfqs.map((r) => [r.title, r.id]));

  // 6. Quotes.
  await db.insert(quotes).values(
    quoteSeeds.map((q) => ({
      rfqId: rfqIdByTitle.get(q.rfqTitle)!,
      supplierId: supplierIdByName.get(q.supplierName)!,
      price: String(q.price),
      currency: 'USD',
      leadTimeDays: q.leadTimeDays,
      notes: q.notes,
      status: q.status,
    })),
  );

  // 7. Inspections.
  await db.insert(inspections).values(
    inspectionSeeds.map((i) => ({
      supplierId: supplierIdByName.get(i.supplierName)!,
      inspectorId: userIdByEmail.get(i.inspectorEmail)!,
      type: i.type,
      status: i.status,
      score: i.score,
      scheduledAt: i.scheduledAt,
      completedAt: i.completedAt,
      reportUrl: i.reportUrl,
    })),
  );

  // 8. Summary.
  const n = async (rows: { n: number }[]) => rows[0]?.n ?? 0;
  const summary = {
    users: await n(await db.select({ n: sql<number>`count(*)::int` }).from(users)),
    suppliers: await n(await db.select({ n: sql<number>`count(*)::int` }).from(suppliers)),
    products: await n(await db.select({ n: sql<number>`count(*)::int` }).from(products)),
    rfqs: await n(await db.select({ n: sql<number>`count(*)::int` }).from(rfqs)),
    quotes: await n(await db.select({ n: sql<number>`count(*)::int` }).from(quotes)),
    inspections: await n(await db.select({ n: sql<number>`count(*)::int` }).from(inspections)),
  };

  console.log('✅ FactoryDepo seed complete');
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Demo login (password: ${PASSWORD}):`);
  console.log('  demo@factorydepo.com     (admin)');
  console.log('  buyer@factorydepo.com    (buyer)');
  console.log('  supplier@factorydepo.com (supplier)');
}

main()
  .catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$client.end();
  });
