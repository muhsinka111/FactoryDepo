/**
 * Seed 125 buyer requests — five per category, across all 25 categories.
 *
 * WHY THEY ARE LABELLED: these are bootstrap seed rows, not real demand. Every
 * row is written with dataSource='demo' (migration 020) so the API and the UI can
 * say so, and RfqCard renders a Demo tag on them. A seeded request that read as a
 * real buyer enquiry would be exactly the dishonesty this project forbids.
 *
 * Idempotent: a row is inserted only when no RFQ with the same title exists, so
 * re-running adds nothing. Requests are spread round-robin over the existing
 * buyer accounts.
 *
 *   node scripts/seed-demo-rfqs.mjs
 *   node scripts/seed-demo-rfqs.mjs --dry-run     # print the SQL, insert nothing
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const PSQL = process.env.PSQL ?? 'C:/Program Files/PostgreSQL/16/bin/psql.exe';
const DB = process.env.FD_DB ?? 'factorydepo';
const DRY = process.argv.includes('--dry-run');

/**
 * [title, quantity, unit, target country] per category.
 * Target countries stay inside the marketplace's scope (TR / CN / US / EU) — the
 * owner's hard rule — and quantities are ordinary lot sizes for that trade.
 */
const SEEDS = {
  'Metals & Minerals': [
    ['Copper cathode Grade A, 25 t lots', 300, 't', 'China'],
    ['Aluminium ingot A7, surplus from a closed line', 150, 't', 'Germany'],
    ['Zinc ingot 99.995%, container-ready', 80, 't', 'Netherlands'],
    ['Antimony ore concentrate, 60% Sb', 120, 't', 'Türkiye'],
    ['Titanium dioxide rutile, overstocked drums', 45, 't', 'Italy'],
  ],
  Steel: [
    ['Hot-rolled coil 3 mm, 1,200 t available', 1200, 't', 'USA'],
    ['Cold-rolled sheet DC01, factory seconds', 240, 't', 'Poland'],
    ['Stainless sheet 304 2B, 1.5 mm', 90, 't', 'Germany'],
    ['Steel structure beams IPE 300, excess project stock', 180, 't', 'Türkiye'],
    ['Galvanised pipe 2", surplus run', 60, 't', 'Spain'],
  ],
  Chemicals: [
    ['Caustic soda flakes 99%, 25 kg bags', 400, 't', 'Netherlands'],
    ['Epoxy resin, overstocked 200 L drums', 30, 't', 'Italy'],
    ['Citric acid monohydrate food grade', 60, 't', 'France'],
    ['Sodium metabisulphite, liquidation lot', 80, 't', 'Türkiye'],
    ['Titanium dioxide for coatings, 25 t lots', 100, 't', 'USA'],
  ],
  Machinery: [
    ['CNC vertical machining centre, 3 units', 3, 'unit', 'Türkiye'],
    ['Injection moulding machine 250 t, used but running', 2, 'unit', 'Poland'],
    ['Industrial gearbox reducers, overstock', 40, 'unit', 'Germany'],
    ['Hydraulic press 100 t, plant closure', 1, 'unit', 'Italy'],
    ['Air compressor 75 kW screw type, surplus', 6, 'unit', 'USA'],
  ],
  'Industrial Equipment': [
    ['Centrifugal pump sets 50 m³/h, surplus stock', 25, 'unit', 'Türkiye'],
    ['Induction motors 22 kW IE3, factory excess', 60, 'unit', 'Germany'],
    ['Manhole covers D400 ductile iron', 500, 'unit', 'Netherlands'],
    ['PLC controller kits, unopened overstock', 120, 'unit', 'USA'],
    ['Proximity sensors M18 inductive, liquidation', 2000, 'unit', 'China'],
  ],
  Electronics: [
    ['Servo drives 2 kW, overstocked pallets', 80, 'unit', 'Germany'],
    ['Battery packs LiFePO4 48 V, surplus run', 200, 'unit', 'USA'],
    ['Solar inverters 20 kW three-phase', 60, 'unit', 'Netherlands'],
    ['Proximity sensor sets M12, factory seconds', 5000, 'unit', 'China'],
    ['Industrial HMI panels 7", surplus stock', 150, 'unit', 'Türkiye'],
  ],
  Automotive: [
    ['Alloy wheels 17", overstock of a cancelled OEM order', 2000, 'unit', 'Germany'],
    ['Brake discs vented, factory seconds', 3000, 'unit', 'Poland'],
    ['Engine valves, surplus production run', 20000, 'unit', 'Türkiye'],
    ['Turbocharger cartridges, liquidation', 400, 'unit', 'Italy'],
    ['Automotive wiring harnesses, excess stock', 5000, 'unit', 'Spain'],
  ],
  'Construction Materials': [
    ['Cement bags CEM I 42.5, palletised', 2000, 't', 'Türkiye'],
    ['PVC pipes 110 mm, surplus run', 30, 'km', 'Poland'],
    ['Steel structure sections, project overstock', 400, 't', 'USA'],
    ['Manhole covers and frames, overstocked', 800, 'unit', 'Netherlands'],
    ['Insulation panels PIR 80 mm, liquidation', 4000, 'm2', 'Germany'],
  ],
  'Renewable Energy': [
    ['Solar panels 550 W mono, container-ready', 5000, 'unit', 'Netherlands'],
    ['Wind blade sections, cancelled project', 12, 'unit', 'Germany'],
    ['Solar inverters 50 kW, overstock', 40, 'unit', 'Spain'],
    ['Mounting rails and clamps, surplus stock', 20000, 'unit', 'Türkiye'],
    ['Lithium storage racks 100 kWh, liquidation', 20, 'unit', 'USA'],
  ],
  Packaging: [
    ['Corrugated boxes, overstock of a seasonal run', 200000, 'unit', 'Poland'],
    ['PET preforms 28 mm, factory excess', 500000, 'unit', 'Türkiye'],
    ['Shrink film rolls, surplus stock', 40, 't', 'Germany'],
    ['Kraft paper bags, liquidation lot', 300000, 'unit', 'Italy'],
    ['Pallet wrapping film, overstocked pallets', 60, 't', 'Netherlands'],
  ],
  'Plastic & Rubber': [
    ['PP granules virgin, overstocked silo bags', 200, 't', 'Germany'],
    ['PVC resin SG-5, surplus from a closed line', 300, 't', 'China'],
    ['HDPE regrind, factory seconds', 120, 't', 'Poland'],
    ['Rubber seals O-ring sets, overstock', 100000, 'unit', 'Türkiye'],
    ['ABS granules, liquidation stock', 80, 't', 'Italy'],
  ],
  Textiles: [
    ['Polyester yarn 150D, surplus production run', 60, 't', 'Türkiye'],
    ['Cotton fabric rolls, cancelled order', 120000, 'm', 'Germany'],
    ['Denim fabric seconds, liquidation', 40000, 'm', 'Netherlands'],
    ['Knit fabric overstock, container-ready', 25, 't', 'Spain'],
    ['Home textile stock, overstocked warehouse', 30000, 'unit', 'USA'],
  ],
  Agriculture: [
    ['Urea 46% fertiliser, big bags', 1500, 't', 'Türkiye'],
    ['Drip irrigation tubing, surplus stock', 400, 'km', 'Italy'],
    ['Animal feed pellets, overstocked silo', 800, 't', 'Netherlands'],
    ['Woven fertiliser sacks, liquidation', 500000, 'unit', 'Poland'],
    ['Seed grain, surplus of a certified lot', 300, 't', 'Germany'],
  ],
  Energy: [
    ['Battery packs LiFePO4, overstock', 300, 'unit', 'USA'],
    ['Diesel generator sets 500 kVA, surplus', 8, 'unit', 'Türkiye'],
    ['Transformer units 1 MVA, liquidation', 5, 'unit', 'Poland'],
    ['Power cables XLPE 11 kV, overstocked drums', 40, 'km', 'Germany'],
    ['Switchgear panels, plant closure stock', 20, 'unit', 'Italy'],
  ],
  'Mining & Ore': [
    ['Antimony ore 60% Sb, container loads', 500, 't', 'China'],
    ['Chrome ore concentrate, surplus stock', 2000, 't', 'Türkiye'],
    ['Iron ore fines, overstocked stockpile', 5000, 't', 'China'],
    ['Copper concentrate, liquidation lot', 800, 't', 'Germany'],
    ['Barite powder, surplus production', 1200, 't', 'USA'],
  ],
  'Paper & Pulp': [
    ['Kraft paper rolls 120 gsm, overstock', 400, 't', 'Germany'],
    ['Fluting medium rolls, surplus run', 300, 't', 'Poland'],
    ['Bleached pulp bales, liquidation', 500, 't', 'Netherlands'],
    ['Duplex board sheets, factory excess', 250, 't', 'Italy'],
    ['Recycled paper stock, container-ready', 600, 't', 'Türkiye'],
  ],
  Rubber: [
    ['Rubber seals and gaskets, overstocked bins', 200000, 'unit', 'Germany'],
    ['EPDM rubber sheets, surplus stock', 40, 't', 'Netherlands'],
    ['Hydraulic hoses, overstock of a cancelled order', 15000, 'm', 'Poland'],
    ['Silicone tubing, factory seconds', 20, 't', 'USA'],
    ['Conveyor belt offcuts, liquidation', 60, 't', 'Türkiye'],
  ],
  'Ceramics & Glass': [
    ['Ceramic tiles 60x60, overstock of a discontinued line', 12000, 'm2', 'Italy'],
    ['Refractory bricks, plant closure stock', 400, 't', 'Germany'],
    ['Glass bottles 500 ml, surplus run', 800000, 'unit', 'Poland'],
    ['Sanitaryware seconds, liquidation', 2000, 'unit', 'Türkiye'],
    ['Lab glassware, overstocked crates', 5000, 'unit', 'Netherlands'],
  ],
  'Furniture & Wood': [
    ['Contract chairs, overstock of a hotel project', 3000, 'unit', 'Germany'],
    ['Flat-packed desks, cancelled order', 1500, 'unit', 'Poland'],
    ['Plywood sheets 18 mm, surplus stock', 800, 'unit', 'Türkiye'],
    ['Timber battens, liquidation lot', 60, 'm3', 'Netherlands'],
    ['Warehouse racking beams, plant closure', 400, 'unit', 'Italy'],
  ],
  'Medical Supplies': [
    ['Nitrile gloves boxed, overstock', 200000, 'unit', 'Germany'],
    ['Sterile gauze packs, surplus run', 500000, 'unit', 'USA'],
    ['Disposable syringes 5 ml, liquidation', 1000000, 'unit', 'Poland'],
    ['Surgical masks, overstocked pallets', 800000, 'unit', 'Türkiye'],
    ['Hospital bed linen, factory excess', 20000, 'unit', 'Netherlands'],
  ],
  'Safety & PPE': [
    ['Safety helmets EN 397, overstock', 20000, 'unit', 'Germany'],
    ['High-visibility vests, surplus stock', 50000, 'unit', 'Poland'],
    ['Cut-resistant gloves, factory seconds', 100000, 'pair', 'Türkiye'],
    ['Safety goggles, liquidation lot', 40000, 'unit', 'Italy'],
    ['Ear defenders, overstocked crates', 15000, 'unit', 'USA'],
  ],
  'Food Processing': [
    ['Stainless conveyor belt sections, plant closure', 120, 'm', 'Germany'],
    ['Sanitary pump heads, surplus stock', 40, 'unit', 'Netherlands'],
    ['Stainless fittings 316, overstock', 8000, 'unit', 'Türkiye'],
    ['Cold-room panels, liquidation', 1500, 'm2', 'Poland'],
    ['Industrial flake ice machines, overstock', 6, 'unit', 'China'],
  ],
  'Marine & Offshore': [
    ['Marine shackles and cleats, surplus stock', 3000, 'unit', 'Netherlands'],
    ['Anchor chain sections, liquidation', 400, 'm', 'Germany'],
    ['Marine turnbuckles, overstocked bins', 5000, 'unit', 'Türkiye'],
    ['Deck winches, vessel refit surplus', 12, 'unit', 'Italy'],
    ['Offshore safety equipment, cancelled order', 600, 'unit', 'USA'],
  ],
  Aerospace: [
    ['Titanium fastener sets, surplus production', 50000, 'unit', 'USA'],
    ['Airframe brackets, overstock of a cancelled order', 8000, 'unit', 'Germany'],
    ['Turbine blade blanks, liquidation', 300, 'unit', 'France'],
    ['Aerospace aluminium plate 7075, surplus', 40, 't', 'Netherlands'],
    ['MRO tooling sets, plant closure', 200, 'unit', 'Türkiye'],
  ],
  'Hardware & Fasteners': [
    ['Hex bolts M16 grade 8.8, overstock', 500000, 'unit', 'Germany'],
    ['Wood screws boxed, surplus run', 2000000, 'unit', 'Poland'],
    ['Washers and nuts, liquidation lot', 800000, 'unit', 'Türkiye'],
    ['Stainless fasteners A2, factory excess', 300000, 'unit', 'Italy'],
    ['Hand tools sets, overstocked pallets', 12000, 'unit', 'USA'],
  ],
};

function sqlLiteral(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}

function buildSql() {
  const rows = [];
  let n = 0;
  for (const [category, entries] of Object.entries(SEEDS)) {
    for (const [title, quantity, unit, target] of entries) {
      n += 1;
      // Deadlines spread over 14–75 days so the board is not a wall of one date.
      const days = 14 + ((n * 7) % 62);
      const description =
        `${category}: buyer request for ${quantity.toLocaleString('en-US')} ${unit}. ` +
        `Deliver to ${target}. Seeded example — not a real enquiry.`;
      rows.push(
        `  (${sqlLiteral(title)}, ${sqlLiteral(category)}, ${sqlLiteral(description)}, ` +
        `${quantity}, ${sqlLiteral(unit)}, ${sqlLiteral(target)}, ${days})`,
      );
    }
  }

  return `-- Seed buyer requests: five per category, all labelled demo.
BEGIN;

CREATE TEMP TABLE seed_rfq (
  title text, category text, description text, quantity numeric,
  unit text, target text, days int
) ON COMMIT DROP;

INSERT INTO seed_rfq (title, category, description, quantity, unit, target, days) VALUES
${rows.join(',\n')};

-- Buyers are the existing buyer accounts, assigned round-robin. Test accounts
-- are excluded on purpose: the integration suite registers *@factorydepo.test
-- buyers, and assigning seed rows to them meant a later test-cleanup deleted the
-- seed along with the throwaway data.
INSERT INTO rfqs ("buyerId", title, category, description, quantity, unit, "targetCountry", status, deadline, "dataSource")
SELECT
  (ARRAY(SELECT id FROM users WHERE role = 'buyer' AND email NOT LIKE '%@factorydepo.test' ORDER BY id))[
    1 + ((row_number() OVER (ORDER BY s.title))::int - 1)
        % GREATEST((SELECT count(*) FROM users WHERE role = 'buyer' AND email NOT LIKE '%@factorydepo.test'), 1)
  ],
  s.title, s.category, s.description, s.quantity, s.unit, s.target,
  'open', now() + (s.days || ' days')::interval, 'demo'
FROM seed_rfq s
WHERE NOT EXISTS (SELECT 1 FROM rfqs r WHERE r.title = s.title)
  AND EXISTS (SELECT 1 FROM users WHERE role = 'buyer' AND email NOT LIKE '%@factorydepo.test');

SELECT count(*) AS demo_rfqs FROM rfqs WHERE "dataSource" = 'demo';
SELECT count(DISTINCT category) AS categories_covered FROM rfqs WHERE "dataSource" = 'demo';
COMMIT;
`;
}

const sql = buildSql();
const out = process.env.LOCALAPPDATA + '/Temp/seed-demo-rfqs.sql';
writeFileSync(out, sql);
console.log(`SQL written: ${out} (${Object.values(SEEDS).flat().length} requests, ${Object.keys(SEEDS).length} categories)`);

if (DRY) {
  console.log('--dry-run: nothing inserted');
  process.exit(0);
}

const result = execFileSync(
  PSQL,
  ['-h', 'localhost', '-U', 'postgres', '-d', DB, '-v', 'ON_ERROR_STOP=1', '-f', out],
  { env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD ?? 'postgres' }, encoding: 'utf8' },
);
console.log(result.trim());
