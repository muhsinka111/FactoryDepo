/**
 * DOM + API acceptance run for FactoryDepo. No test framework: it renders each
 * route in headless Chrome, reads the DOM, and asserts the properties the owner
 * actually asked for — every internal link resolves, every category holds stock,
 * every stock type is populated, and no surface claims something the data does
 * not support.
 *
 *   node scripts/ui_smoke.mjs                      # API origin serves the built SPA
 *   BASE=https://www.factorydepo.com API=https://www.factorydepo.com node scripts/ui_smoke.mjs
 *
 * BASE defaults to the API origin on purpose: in production the api-server serves
 * `web/dist` with an SPA fallback, so testing that origin exercises the same path
 * a real visitor takes. A separate Vite dev server on :8080 is NOT used — that
 * port is shared with the owner's other project, and a run against a dead or
 * foreign port silently "passed" once because a browser error page is still full
 * of text. Every route is therefore checked for a FactoryDepo marker.
 *
 * Exit code 0 = every check passed. Any `✗` line is a real defect: fix it, do not
 * relax the assertion.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const API = process.env.API ?? 'http://localhost:9091';
const BASE = process.env.BASE ?? API;
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';

/** Routes the SPA declares in App.tsx — a link to anything else is a dead link. */
const ROUTES = [
  '/explore', '/categories', '/suppliers', '/help', '/sign-in', '/sign-up',
  '/feed', '/rfqs', '/orders', '/offers', '/shipments', '/messages', '/saved',
  '/notifications', '/profile', '/supplier/listings', '/supplier/post',
  '/supplier/offers', '/supplier/rfq-opportunities', '/supplier/verification',
  '/admin', '/admin/suppliers', '/admin/verification', '/admin/listings',
  '/admin/rfqs', '/admin/payments', '/admin/sources', '/admin/growth', '/admin/features',
];

const STOCK_TYPES = ['stock', 'surplus', 'overstock', 'liquidation', 'seconds', 'container'];

const fails = [];
let checks = 0;
const ok = (cond, message) => {
  checks += 1;
  if (!cond) fails.push(message);
};

function dom(path) {
  return execFileSync(CHROME, [
    '--headless', '--disable-gpu', '--no-sandbox',
    '--virtual-time-budget=8000', '--dump-dom', `${BASE}${path}`,
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

const get = async (url) => {
  const res = await fetch(url);
  return { status: res.status, body: res.status === 200 ? await res.json() : null };
};

/* ---------------------------------------------------------------- A. static */

// A1. the landing states that the catalogue is demo data.
const landingPath = join(ROOT, 'artifacts/landing/variants/marketplace-light.html');
if (existsSync(landingPath)) {
  const landing = readFileSync(landingPath, 'utf8');
  ok(landing.includes('class="demo-band"'), 'landing: the demo-catalogue band is missing');
  const tiles = landing.match(/\['[^']+', 'cat\.[a-z]+'/g) ?? [];
  ok(tiles.length === 25, `landing: tile grid lists ${tiles.length} categories, expected 25`);

  // A2. every cover the landing points at must exist — a broken tile is worse
  // than no tile.
  const covers = [...new Set(landing.match(/\/assets\/products\/[a-z0-9-]+\.jpg/g) ?? [])];
  const missing = covers.filter((c) => !existsSync(join(ROOT, c.replace(/^\//, ''))));
  ok(missing.length === 0, `landing: covers missing on disk: ${missing.join(', ')}`);
  ok(covers.length >= 25, `landing: only ${covers.length} distinct covers referenced, expected 25+`);
} else {
  fails.push(`landing file not found at ${landingPath}`);
}

// A3. every cover the SPA maps must exist too.
const coverMap = readFileSync(join(ROOT, 'artifacts/web/src/categoryImages.ts'), 'utf8');
const spaCovers = [...coverMap.matchAll(/'(\/products\/[a-z0-9-]+\.jpg)'/g)].map((m) => m[1]);
ok(spaCovers.length === 25, `categoryImages.ts maps ${spaCovers.length} categories, expected 25`);
const spaMissing = spaCovers.filter((c) => !existsSync(join(ROOT, 'artifacts/web/public', c.replace(/^\//, ''))));
ok(spaMissing.length === 0, `categoryImages.ts points at missing files: ${spaMissing.join(', ')}`);

/* ------------------------------------------------------------------- B. API */

const health = await get(`${API}/api/healthz`).catch(() => ({ status: 0, body: null }));
ok(health.status === 200 && health.body?.status === 'ok', `API healthz returned ${health.status}`);

// B1. every category the UI offers must return stock when clicked through.
const cats = await get(`${API}/api/products/categories`);
ok(Array.isArray(cats.body?.items), 'API: /api/products/categories did not return items');
const catItems = cats.body?.items ?? [];
ok(catItems.length === 25, `API: ${catItems.length} categories with stock, expected 25`);
for (const c of catItems) {
  const res = await get(`${API}/api/products?category=${encodeURIComponent(c.category)}&limit=1`);
  ok((res.body?.total ?? 0) > 0, `category "${c.category}" clicks through to nothing`);
}

// B2. every stock-type chip must return stock, or the filter is a lie.
for (const ty of STOCK_TYPES) {
  const res = await get(`${API}/api/products?listingType=${ty}&limit=1`);
  ok(res.status === 200, `listingType=${ty} returned HTTP ${res.status}`);
  ok((res.body?.total ?? 0) > 0, `listingType=${ty} has no listings — the chip would be empty`);
}

// B3. an unknown stock type must be rejected, not silently ignored.
const bogus = await fetch(`${API}/api/products?listingType=nonsense&limit=1`);
ok(bogus.status === 400, `an unknown listingType returned ${bogus.status}, expected 400`);

// B4. provenance is exposed wherever seeded data is served.
const products = await get(`${API}/api/products?limit=5`);
for (const p of products.body?.items ?? []) {
  ok(typeof p.listingType === 'string', 'a product row is missing listingType');
  ok(typeof p.dataSource === 'string', 'a product row is missing dataSource');
}
const rfqs = await get(`${API}/api/rfqs?limit=5`);
for (const r of rfqs.body?.items ?? []) {
  ok(typeof r.dataSource === 'string', 'an RFQ row is missing dataSource — a seeded request could read as real');
}
const demoRfqs = (rfqs.body?.items ?? []).filter((r) => r.dataSource === 'demo').length;
ok((rfqs.body?.items ?? []).length === 0 || demoRfqs > 0, 'no RFQ carries dataSource=demo');

/* ------------------------------------------------------------------- C. DOM */

// C1. every route renders OUR app with real content.
//
// The marker check is not decoration: an earlier run of this script reported
// "OK" while the port it was pointed at was dead and Chrome was dumping an error
// page — which is full of text and therefore passed a length-only assertion.
for (const r of ROUTES) {
  let html = '';
  try {
    html = dom(r);
  } catch (err) {
    fails.push(`${r}: headless Chrome failed (${String(err).slice(0, 80)})`);
    continue;
  }
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  ok(/factorydepo|factory<b>depo/i.test(html), `${r}: this is not the FactoryDepo app (no brand marker in the DOM)`);
  ok(/class="topbar"/.test(html), `${r}: the app shell (topbar) did not render`);
  ok(text.length >= 200, `${r}: rendered ${text.length} chars of text — looks empty`);
  ok(!/something went wrong|unexpected error|ERR_CONNECTION/i.test(text), `${r}: page shows an error state`);
}

// C2. every internal link the browse surfaces emit must match a declared route.
const hrefs = new Set();
for (const r of ['/explore', '/categories', '/feed', '/help']) {
  for (const m of dom(r).matchAll(/href="(\/[^"#]*)"/g)) {
    const p = m[1].split('?')[0];
    if (!p.startsWith('/api') && !p.startsWith('/assets')) hrefs.add(p);
  }
}
const known = (href) => href === '/'   // the logo link; App.tsx routes it to the caller's home
  || ROUTES.includes(href)
  || href.startsWith('/products') || href.startsWith('/suppliers/')
  || href.startsWith('/rfqs/');
for (const href of hrefs) ok(known(href), `dead link: ${href}`);

/* ------------------------------------------------------------------ report */

console.log(`${fails.length === 0 ? 'OK' : 'FAIL'} — ${checks} checks, ${hrefs.size} links, ${catItems.length} categories, ${STOCK_TYPES.length} stock types`);
for (const f of fails) console.log(`  ✗ ${f}`);
process.exit(fails.length === 0 ? 0 : 1);
