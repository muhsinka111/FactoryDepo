/**
 * Bootstrap seed — runs ONCE on boot when the products table is empty.
 * Gives a fresh Railway/prod database a working demo marketplace without
 * ever touching real user data (only fires when there is nothing to lose).
 * Full dev dataset lives in lib/db/scripts/seed.ts.
 */
import { hashSync } from 'bcryptjs';
import { sql } from 'drizzle-orm';
import { db, users, suppliers, products, rfqs, quotes } from './db.js';

const PW = 'factorydepo';
const PH = hashSync(PW, 10);

export async function bootstrapSeedIfEmpty(): Promise<boolean> {
  try {
    const res = await db.execute(sql`SELECT count(*) AS c FROM products`);
    const count = Number((res.rows[0] as { c?: string } | undefined)?.c ?? 0);
    if (count > 0) return false; // already has data — never touch it
  } catch {
    return false; // DB unreachable — skip
  }

  console.log('[seed] empty database detected — bootstrapping demo dataset…');

  // ---- users (all share password `factorydepo`) ----
  const userSeeds = [
    { email: 'demo@factorydepo.com', name: 'Demo Admin', role: 'admin', company: 'FactoryDepo HQ', country: 'Türkiye', trust: '0' },
    { email: 'buyer@factorydepo.com', name: 'Ahmed K.', role: 'buyer', company: 'Gulf Trading Co', country: 'Saudi Arabia', trust: '0' },
    { email: 'supplier@factorydepo.com', name: 'Mehmet Demir', role: 'supplier', company: 'Anatolian Machinery A.Ş.', country: 'Türkiye', trust: '88' },
    { email: 'jiangsu@xihua.cn', name: 'Zhang Wei', role: 'supplier', company: 'Jiangsu Xihua Metal Group', country: 'China', trust: '93' },
    { email: 'foshan@steel.cn', name: 'Chen Jie', role: 'supplier', company: 'Foshan Steel Co', country: 'China', trust: '89' },
    { email: 'shandong@mining.cn', name: 'Liu Yang', role: 'supplier', company: 'Shandong Mining Group', country: 'China', trust: '91' },
    { email: 'zhejiang@chemtech.cn', name: 'Zhao Min', role: 'supplier', company: 'Zhejiang Chemtech Co', country: 'China', trust: '90' },
    { email: 'vietnam@minerals.vn', name: 'Nguyen Van Hieu', role: 'supplier', company: 'Vietnam Minerals JSC', country: 'Vietnam', trust: '87' },
    { email: 'berlin@praezision.de', name: 'Kai Müller', role: 'supplier', company: 'Berlin Präzision GmbH', country: 'Germany', trust: '92' },
    { email: 'bursa@aluminum.com.tr', name: 'Ali Yılmaz', role: 'supplier', company: 'Bursa Aluminum A.Ş.', country: 'Türkiye', trust: '86' },
  ] as const;

  const insertedUsers = await db
    .insert(users)
    .values(
      userSeeds.map((u) => ({
        email: u.email,
        passwordHash: PH,
        name: u.name,
        role: u.role,
        company: u.company,
        country: u.country,
        lang: 'en',
        trustScore: u.trust,
      })),
    )
    .returning({ id: users.id, email: users.email });

  const uid = (email: string) => insertedUsers.find((u) => u.email === email)?.id ?? 1;

  // ---- suppliers (one per supplier user) ----
  const supRows = await db
    .insert(suppliers)
    .values([
      { userId: uid('supplier@factorydepo.com'), companyName: 'Anatolian Machinery A.Ş.', country: 'Türkiye', city: 'İzmir', description: 'Precision CNC machining and injection molding since 2010.', verifiedLevel: 2, rating: '4.8', inspectionsCount: 15, fulfillmentRate: '97.6', tags: ['CNC', 'Injection Molding', 'Machinery'], since: 2010 },
      { userId: uid('jiangsu@xihua.cn'), companyName: 'Jiangsu Xihua Metal Group', country: 'China', city: 'Jiangsu', description: 'Copper cathode smelter with 24 completed inspections.', verifiedLevel: 3, rating: '4.9', inspectionsCount: 24, fulfillmentRate: '98.4', tags: ['Copper Cathode', 'Smelting', 'Anode Slime'], since: 2008 },
      { userId: uid('foshan@steel.cn'), companyName: 'Foshan Steel Co', country: 'China', city: 'Guangdong', description: 'Cold rolled and galvanized steel coil producer.', verifiedLevel: 2, rating: '4.8', inspectionsCount: 18, fulfillmentRate: '97.1', tags: ['Steel Coil', 'HRC', 'Galvanized'], since: 2012 },
      { userId: uid('shandong@mining.cn'), companyName: 'Shandong Mining Group', country: 'China', city: 'Shandong', description: 'Antimony ore mining and concentration.', verifiedLevel: 3, rating: '4.9', inspectionsCount: 21, fulfillmentRate: '96.8', tags: ['Antimony Ore', 'Mining', 'Concentrates'], since: 2005 },
      { userId: uid('zhejiang@chemtech.cn'), companyName: 'Zhejiang Chemtech Co', country: 'China', city: 'Zhejiang', description: 'Battery-grade lithium carbonate producer.', verifiedLevel: 2, rating: '4.7', inspectionsCount: 17, fulfillmentRate: '96.2', tags: ['Lithium Carbonate', 'Battery Chemicals'], since: 2015 },
      { userId: uid('vietnam@minerals.vn'), companyName: 'Vietnam Minerals JSC', country: 'Vietnam', city: 'Lao Cai', description: 'Tin concentrate and rare earth minerals.', verifiedLevel: 2, rating: '4.8', inspectionsCount: 12, fulfillmentRate: '95.9', tags: ['Tin', 'Concentrates', 'Rare Earth'], since: 2014 },
      { userId: uid('berlin@praezision.de'), companyName: 'Berlin Präzision GmbH', country: 'Germany', city: 'Dresden', description: 'Precision parts and CNC machining.', verifiedLevel: 2, rating: '4.9', inspectionsCount: 11, fulfillmentRate: '98.2', tags: ['Precision Parts', 'CNC'], since: 2006 },
      { userId: uid('bursa@aluminum.com.tr'), companyName: 'Bursa Aluminum A.Ş.', country: 'Türkiye', city: 'Bursa', description: 'Aluminum ingot and extrusion profiles.', verifiedLevel: 2, rating: '4.7', inspectionsCount: 14, fulfillmentRate: '96.5', tags: ['Aluminum Ingot', 'Extrusion'], since: 2009 },
    ])
    .returning({ id: suppliers.id });

  const S = (i: number) => supRows[i]?.id ?? supRows[0].id;

  // ---- products ----
  await db.insert(products).values([
    { supplierId: S(1), name: 'Copper Cathode', category: 'Metals & Minerals', description: 'LME Grade A, 99.99% purity, bundled.', spec: ['Purity: 99.99%', 'Grade: LME A', 'Packaging: Bundles ~2.5 MT'], price: '8742', unit: 'MT', moq: '25', originCountry: 'China', purityGrade: '99.99%', verified: true },
    { supplierId: S(2), name: 'Steel Coil Cold Rolled', category: 'Steel', description: 'DC01 cold rolled coil, EN 10130.', spec: ['Standard: EN 10130', 'Thickness: 0.4-2.0 mm'], price: '617', unit: 'MT', moq: '20', originCountry: 'Türkiye', verified: true },
    { supplierId: S(3), name: 'Antimony Ore', category: 'Metals & Minerals', description: 'Lump ore, 50-60% Sb content.', spec: ['Sb content: 50-60%', 'Form: Lump ore'], price: '14500', unit: 'MT', moq: '50', originCountry: 'China', purityGrade: '50-60%', verified: true },
    { supplierId: S(4), name: 'Lithium Carbonate', category: 'Chemicals', description: 'Battery grade, 99.5% min.', spec: ['Purity: ≥99.5%', 'Grade: Battery'], price: '18850', unit: 'MT', moq: '1', originCountry: 'China', purityGrade: '99.5%', verified: true },
    { supplierId: S(0), name: 'Industrial Pump', category: 'Industrial Equipment', description: 'High efficiency centrifugal pump.', spec: ['Efficiency: IE4', 'Material: SS316'], price: '2450', unit: 'Set', moq: '5', originCountry: 'Türkiye', verified: true },
    { supplierId: S(6), name: 'CNC Machining Center', category: 'Machinery', description: '5-axis machining center, 20k rpm.', spec: ['Axes: 5', 'Spindle: 20,000 rpm'], price: '28000', unit: 'Set', moq: '1', originCountry: 'Germany', verified: true },
    { supplierId: S(3), name: 'Solar Panel 550W', category: 'Renewable Energy', description: 'Mono PERC half-cut, 550W.', spec: ['Cell: Mono PERC', 'Power: 550W'], price: '0.21', unit: 'Watt', moq: '1000', originCountry: 'China', verified: true },
    { supplierId: S(7), name: 'Aluminum Ingot', category: 'Metals & Minerals', description: '99.7% primary aluminum ingot, 20kg.', spec: ['Purity: 99.7%', 'Ingot: 20 kg'], price: '2980', unit: 'MT', moq: '25', originCountry: 'Türkiye', purityGrade: '99.7%', verified: true },
  ]);

  // ---- RFQs + quotes ----
  const buyerId = uid('buyer@factorydepo.com');
  const rfqRows = await db
    .insert(rfqs)
    .values([
      { buyerId, title: '100 Tons Copper Cathode', category: 'Metals & Minerals', description: 'LME Grade A, delivery Izmir port.', quantity: '100', unit: 'MT', targetCountry: 'Türkiye', status: 'quoted' },
      { buyerId, title: 'OEM Plastic Injection Parts', category: 'Plastic & Rubber', description: '50,000 pcs, ABS, tooling needed.', quantity: '50000', unit: 'pcs', targetCountry: 'Germany', status: 'open' },
      { buyerId, title: 'Battery-Grade Lithium 5 MT', category: 'Chemicals', description: '99.5% min, CIF Houston.', quantity: '5', unit: 'MT', targetCountry: 'USA', status: 'open' },
      { buyerId, title: 'Steel Coil HRC 300 MT', category: 'Steel', description: 'S235JR, 2.0mm, ex-works.', quantity: '300', unit: 'MT', targetCountry: 'Türkiye', status: 'open' },
      { buyerId, title: 'Solar Panel 550W 20,000 pcs', category: 'Renewable Energy', description: 'Mono PERC, CIF Genoa.', quantity: '20000', unit: 'pcs', targetCountry: 'Italy', status: 'open' },
    ])
    .returning({ id: rfqs.id });

  if (rfqRows.length > 0) {
    await db.insert(quotes).values([
      { rfqId: rfqRows[0].id, supplierId: S(1), price: '8500', leadTimeDays: 30, notes: 'FOB Tianjin, sample available.', status: 'accepted' },
      { rfqId: rfqRows[0].id, supplierId: S(3), price: '8620', leadTimeDays: 25, notes: 'CIF Izmir, LME-linked pricing.' },
      { rfqId: rfqRows[0].id, supplierId: S(2), price: '8742', leadTimeDays: 35, notes: 'Factory direct, inspection included.' },
    ]);
  }

  console.log('[seed] bootstrap complete: users, suppliers, products, RFQs, quotes.');
  return true;
}
