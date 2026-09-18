/**
 * Spread the six stock types across the existing demo catalogue.
 *
 * WHY THIS IS ACCEPTABLE AND STILL HONEST: every row it touches is already
 * labelled dataSource='demo' and renders a Demo tag. Types are assigned
 * deterministically (id modulo) so the run is reproducible. A real listing must
 * always carry the type its seller chose, so the SQL below refuses to run at all
 * if any non-demo listing exists — this can never relabel real supply.
 *
 * WHY IT WRITES A FILE FIRST: passing the SQL inline with `-c` failed on this
 * host ("invalid byte sequence for encoding UTF8: 0x97") because the comment's
 * em-dash reached psql in the console code page. UTF-8 in a file, read with `-f`,
 * is byte-exact. The generated SQL is ASCII-only for the same reason.
 *
 * Deliberately NOT a boot migration: it rewrites data, and migrations must stay
 * safe to auto-run against production.
 *
 *   node scripts/seed-listing-types.mjs --dry-run
 *   node scripts/seed-listing-types.mjs
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const PSQL = process.env.PSQL ?? 'C:/Program Files/PostgreSQL/16/bin/psql.exe';
const DB = process.env.FD_DB ?? 'factorydepo';
const DRY = process.argv.includes('--dry-run');

const SQL = `BEGIN;

-- Refuse to touch a catalogue that contains real supply: relabelling a platform
-- listing's stock type would be inventing a claim about someone else's goods.
DO $$
DECLARE real_rows int;
BEGIN
  SELECT count(*) INTO real_rows FROM products WHERE "dataSource" <> 'demo';
  IF real_rows > 0 THEN
    RAISE EXCEPTION 'refusing: % non-demo listings present - this script is for the demo catalogue only', real_rows;
  END IF;
END $$;

UPDATE products
SET "listingType" = (ARRAY['stock','stock','surplus','overstock','liquidation','seconds','container'])[(id % 7) + 1]
WHERE "dataSource" = 'demo';

SELECT "listingType", count(*) AS rows
FROM products GROUP BY 1 ORDER BY 2 DESC;

SELECT count(DISTINCT category) AS categories_with_non_stock
FROM products WHERE "listingType" <> 'stock';

COMMIT;
`;

if (DRY) {
  console.log(SQL);
  console.log('--dry-run: nothing written');
  process.exit(0);
}

const out = process.env.LOCALAPPDATA + '/Temp/seed-listing-types.sql';
writeFileSync(out, SQL, 'utf8');
console.log(`SQL written: ${out}`);

const result = execFileSync(
  PSQL,
  ['-h', 'localhost', '-U', 'postgres', '-d', DB, '-v', 'ON_ERROR_STOP=1', '-f', out],
  { env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD ?? 'postgres' }, encoding: 'utf8' },
);
console.log(result.trim());
