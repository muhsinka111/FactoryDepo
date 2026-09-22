/**
 * Integration tests — run against a BOOTED api-server.
 *
 *   TEST_BASE_URL=http://localhost:9090 node --import tsx --test test/api.test.ts
 *
 * They are skipped when TEST_BASE_URL is unset, so a developer with no server
 * running gets a clean skip instead of a wall of connection errors. CI boots the
 * built server against a throwaway Postgres and sets the variable.
 *
 * The suite covers the failures this project has actually shipped: forgeable
 * tokens, an unscoped catalogue, a supplier editing someone else's listing, and
 * two buyers overselling the same stock.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.TEST_BASE_URL;
const skip = BASE ? false : 'TEST_BASE_URL not set — skipping integration tests';

const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

interface Res {
  status: number;
  body: unknown;
  text: string;
}

async function call(method: string, path: string, body?: unknown, token?: string): Promise<Res> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON (e.g. the printable proforma) — keep the raw text */
  }
  return { status: res.status, body: parsed, text };
}

interface Auth {
  token: string;
  id: number;
}

async function register(role: 'buyer' | 'supplier', tag: string): Promise<Auth> {
  const email = `it-${role}-${tag}@factorydepo.test`;
  const r = await call('POST', '/api/auth/register', {
    name: `IT ${role} ${tag}`,
    email,
    password: 'integration-test-password',
    role,
    company: `IT ${tag} Ltd`,
    country: 'Türkiye',
  });
  assert.equal(r.status, 201, `register ${role} failed: ${r.status} ${r.text}`);
  const b = r.body as { token: string; user: { id: number } };
  return { token: b.token, id: b.user.id };
}

test('healthz reports the database is up', { skip }, async () => {
  const r = await call('GET', '/api/healthz');
  assert.equal(r.status, 200);
  const b = r.body as { status: string; db: string };
  assert.equal(b.status, 'ok');
  assert.equal(b.db, 'up');
});

test('the public catalogue stays anonymous and CORS-open', { skip }, async () => {
  const res = await fetch(`${BASE}/api/products?limit=1`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  const b = (await res.json()) as { items: unknown[]; total: number };
  assert.ok(Array.isArray(b.items));
  assert.ok(b.total > 0, 'expected a non-empty catalogue');
});

test('every protected route rejects an anonymous caller with 401', { skip }, async () => {
  const paths = [
    '/api/me', '/api/offers', '/api/saved', '/api/threads', '/api/shipments',
    '/api/notifications', '/api/supplier/docs', '/api/payments', '/api/admin/overview',
  ];
  for (const p of paths) {
    const r = await call('GET', p);
    assert.equal(r.status, 401, `${p} should be 401 anonymously, got ${r.status}`);
  }
});

test('a forged bearer token is rejected', { skip }, async () => {
  const r = await call('GET', '/api/me', undefined, 'not.a.real.token');
  assert.equal(r.status, 401);
});

test('register -> login -> me round-trips the account', { skip }, async () => {
  const tag = uniq();
  const email = `it-roundtrip-${tag}@factorydepo.test`;
  const reg = await call('POST', '/api/auth/register', {
    name: 'Round Trip', email, password: 'integration-test-password', role: 'buyer',
  });
  assert.equal(reg.status, 201, reg.text);

  const login = await call('POST', '/api/auth/login', { email, password: 'integration-test-password' });
  assert.equal(login.status, 200, login.text);
  const token = (login.body as { token: string }).token;

  const me = await call('GET', '/api/me', undefined, token);
  assert.equal(me.status, 200);
  assert.equal((me.body as { email: string }).email, email);
});

test('a duplicate email is refused with 409', { skip }, async () => {
  const tag = uniq();
  const email = `it-dupe-${tag}@factorydepo.test`;
  const payload = { name: 'Dupe', email, password: 'integration-test-password', role: 'buyer' };
  assert.equal((await call('POST', '/api/auth/register', payload)).status, 201);
  assert.equal((await call('POST', '/api/auth/register', payload)).status, 409);
});

test('a buyer cannot reach the admin console', { skip }, async () => {
  const buyer = await register('buyer', uniq());
  const r = await call('GET', '/api/admin/overview', undefined, buyer.token);
  assert.equal(r.status, 403, `expected 403 for a buyer, got ${r.status}`);
});

test('?mine=1 scopes listings and requires a token', { skip }, async () => {
  assert.equal((await call('GET', '/api/products?mine=1')).status, 401);

  const supplier = await register('supplier', uniq());
  const mine = await call('GET', '/api/products?mine=1', undefined, supplier.token);
  assert.equal(mine.status, 200);
  assert.equal((mine.body as { total: number }).total, 0, 'a brand-new supplier owns no listings');

  const buyer = await register('buyer', uniq());
  const asBuyer = await call('GET', '/api/products?mine=1', undefined, buyer.token);
  assert.equal(asBuyer.status, 200);
  assert.equal((asBuyer.body as { total: number }).total, 0, 'a buyer must not see the catalogue under "mine"');
});

test('?supplierId= scopes the public catalogue to one supplier', { skip }, async () => {
  const supplier = await register('supplier', `sp${uniq()}`);
  const created = await call('POST', '/api/products', {
    name: `IT supplier-scope probe ${uniq()}`,
    category: 'Machinery',
    description: 'created by integration test',
    price: 42,
    currency: 'USD',
    unit: 'Set',
    moq: 1,
    quantityAvailable: 3,
    originCountry: 'Türkiye',
  }, supplier.token);
  assert.equal(created.status, 201, `product create failed: ${created.status} ${created.text}`);
  const created2 = created.body as { id: number; supplierId: number };

  // The filter is public: listing a supplier's published stock needs no token.
  const scoped = await call('GET', `/api/products?supplierId=${created2.supplierId}&limit=100`);
  assert.equal(scoped.status, 200, `public supplierId filter failed: ${scoped.status} ${scoped.text}`);
  const items = (scoped.body as { items: { id: number; supplierId: number }[] }).items;
  assert.ok(items.length > 0, 'the supplier we just listed under must have at least one listing');
  assert.ok(
    items.every((p) => p.supplierId === created2.supplierId),
    'every row must belong to the requested supplier',
  );
  assert.ok(items.some((p) => p.id === created2.id), 'the new listing must be in its own supplier scope');

  // A non-numeric id is a validation error, not a silent full-catalogue read.
  const bad = await call('GET', '/api/products?supplierId=abc');
  assert.equal(bad.status, 400, 'an invalid supplierId must be rejected');

  const cleanup = await call('DELETE', `/api/products/${created2.id}`, undefined, supplier.token);
  assert.ok(cleanup.status === 204 || cleanup.status === 200, `cleanup failed: ${cleanup.status}`);
});

test('a supplier cannot edit or delete another supplier\'s listing', { skip }, async () => {
  const a = await register('supplier', `a${uniq()}`);
  const b = await register('supplier', `b${uniq()}`);

  const created = await call('POST', '/api/products', {
    name: `IT ownership probe ${uniq()}`,
    category: 'Machinery',
    description: 'created by integration test',
    price: 100,
    currency: 'USD',
    unit: 'Set',
    moq: 1,
    quantityAvailable: 10,
    originCountry: 'Türkiye',
  }, a.token);
  assert.equal(created.status, 201, `product create failed: ${created.status} ${created.text}`);
  const productId = (created.body as { id: number }).id;

  const patchByB = await call('PATCH', `/api/products/${productId}`, { price: 999 }, b.token);
  assert.ok(
    patchByB.status === 403 || patchByB.status === 404,
    `supplier B must not edit supplier A's listing (got ${patchByB.status})`,
  );

  const deleteByB = await call('DELETE', `/api/products/${productId}`, undefined, b.token);
  assert.ok(
    deleteByB.status === 403 || deleteByB.status === 404,
    `supplier B must not delete supplier A's listing (got ${deleteByB.status})`,
  );

  // The owner can still edit it, which proves the check is ownership and not a blanket denial.
  const patchByA = await call('PATCH', `/api/products/${productId}`, { price: 123 }, a.token);
  assert.equal(patchByA.status, 200, `owner should be able to edit: ${patchByA.status} ${patchByA.text}`);

  // Clean up so repeated local runs do not accumulate probe listings.
  const cleanup = await call('DELETE', `/api/products/${productId}`, undefined, a.token);
  assert.ok(cleanup.status === 204 || cleanup.status === 200, `cleanup failed: ${cleanup.status}`);
});

test('concurrent orders can never oversell the stock (the oversell test)', { skip }, async () => {
  const supplier = await register('supplier', `s${uniq()}`);
  const buyer = await register('buyer', `c${uniq()}`);

  const STOCK = 100;
  const PER_ORDER = 25;
  const ATTEMPTS = 8; // 8 x 25 = 200 against 100 in stock -> exactly 4 may succeed

  const created = await call('POST', '/api/products', {
    name: `IT oversell probe ${uniq()}`,
    category: 'Metals & Minerals',
    description: 'created by integration test',
    price: 10,
    currency: 'USD',
    unit: 'MT',
    moq: 1,
    quantityAvailable: STOCK,
    originCountry: 'Türkiye',
  }, supplier.token);
  assert.equal(created.status, 201, `probe product failed: ${created.status} ${created.text}`);
  const productId = (created.body as { id: number }).id;

  const shipping = {
    shippingName: 'IT Buyer',
    shippingAddress: '1 Test Street',
    shippingCity: 'Istanbul',
    shippingCountry: 'Türkiye',
  };

  const results = await Promise.all(
    Array.from({ length: ATTEMPTS }, () =>
      call('POST', '/api/orders', { productId, quantity: PER_ORDER, ...shipping }, buyer.token),
    ),
  );

  const ok = results.filter((r) => r.status === 201).length;
  const conflict = results.filter((r) => r.status === 409).length;

  assert.equal(ok, STOCK / PER_ORDER, `expected exactly ${STOCK / PER_ORDER} successful orders, got ${ok}`);
  assert.equal(conflict, ATTEMPTS - ok, `expected ${ATTEMPTS - ok} conflicts, got ${conflict}`);

  // The shelf must be empty and the listing marked sold out — never negative.
  const after = await call('GET', `/api/products/${productId}`);
  assert.equal(after.status, 200);
  const p = after.body as { quantityAvailable: number; status: string };
  assert.equal(p.quantityAvailable, 0, `stock should be exactly 0, got ${p.quantityAvailable}`);
  assert.ok(p.quantityAvailable >= 0, 'stock must never go negative');
  assert.equal(p.status, 'sold_out', `expected sold_out, got ${p.status}`);
});

test('the printable proforma is party-only', { skip }, async () => {
  const outsider = await register('buyer', `o${uniq()}`);
  // Order 1 exists in the seeded dataset; a stranger must not be able to open it.
  const r = await call('GET', '/api/orders/1/proforma', undefined, outsider.token);
  assert.ok(r.status === 403 || r.status === 404, `expected 403/404 for a non-party, got ${r.status}`);
});

test('the listingType facet filters and is always present', { skip }, async () => {
  // A known value is accepted…
  const ok = await call('GET', '/api/products?listingType=surplus&limit=1');
  assert.equal(ok.status, 200);
  const list = ok.body as { items: { listingType: string }[]; total: number };
  assert.ok(Array.isArray(list.items));
  for (const p of list.items) {
    assert.equal(p.listingType, 'surplus', 'a filtered row must carry the filtered value');
  }

  // …an unknown one is REJECTED rather than silently ignored. Silently ignoring
  // it would show a full catalogue under a filter that claims to be applied.
  const bad = await call('GET', '/api/products?listingType=nonsense&limit=1');
  assert.equal(bad.status, 400, `expected 400 for an unknown stock type, got ${bad.status}`);

  // Every unfiltered row still carries the field, so the UI can label it.
  const all = await call('GET', '/api/products?limit=5');
  const any = all.body as { items: { listingType: string }[] };
  for (const p of any.items) assert.equal(typeof p.listingType, 'string');
});

test('a buyer can become a supplier, once, and can then list stock', { skip }, async () => {
  const buyer = await register('buyer', `bs${uniq()}`);

  const up = await call('POST', '/api/me/become-supplier', undefined, buyer.token);
  assert.equal(up.status, 200, `expected 200, got ${up.status}`);
  assert.equal((up.body as { role: string }).role, 'supplier');

  // The supplier profile that listings hang off must now exist, or the upgrade
  // would be cosmetic.
  const created = await call('POST', '/api/products', {
    name: 'IT surplus coil lot',
    category: 'Steel',
    price: 120,
    unit: 't',
    moq: 1,
    originCountry: 'Türkiye',
    quantityAvailable: 5,
    listingType: 'surplus',
  }, buyer.token);
  assert.equal(created.status, 201, `expected 201 creating a listing, got ${created.status}: ${created.text}`);
  assert.equal((created.body as { listingType: string }).listingType, 'surplus');

  // Idempotent: a second call must not 500 or duplicate the profile.
  const again = await call('POST', '/api/me/become-supplier', undefined, buyer.token);
  assert.equal(again.status, 200);
  assert.equal((again.body as { role: string }).role, 'supplier');

  // And the escalation stays one-way: role must not be self-settable via PATCH.
  const escalate = await call('PATCH', '/api/me', { role: 'admin' }, buyer.token);
  assert.equal(escalate.status, 400, 'PATCH /api/me must reject a role field outright');
});

/* ---------------------------------------------------------------------------
 * Market counts vs the market filter.
 *
 * `GET /api/products/countries` feeds the header strip, and every figure links
 * to `?country=<code>`. Both sides must be derived from the same alias map, so
 * the number a user clicks equals the rows they get. The defect this section
 * pins down: the strip merged 'TR' + 'Türkiye' (29) while the filter matched a
 * single spelling (13) — a figure whose own link could not return it, and a
 * listing published with the long form unreachable from the code-based link.
 * ------------------------------------------------------------------------ */

interface CountryCount {
  country: string;
  count: number;
}

/** The market strip exactly as the UI consumes it. */
async function countries(): Promise<{ items: CountryCount[]; total: number }> {
  const r = await call('GET', '/api/products/countries');
  assert.equal(r.status, 200, `GET /api/products/countries failed: ${r.status} ${r.text}`);
  return r.body as { items: CountryCount[]; total: number };
}

/** The `total` of the public product envelope for one `?country=` spelling. */
async function totalFor(country: string): Promise<number> {
  const r = await call('GET', `/api/products?country=${encodeURIComponent(country)}&limit=1`);
  assert.equal(r.status, 200, `GET /api/products?country=${country} failed: ${r.status} ${r.text}`);
  return (r.body as { total: number }).total;
}

/**
 * Markets whose advertised count disagrees with their own filter. Returned
 * rather than asserted so the caller can re-check: the sibling suite creates and
 * deletes probe listings with originCountry 'Türkiye' while this file runs.
 */
async function countMismatches(): Promise<string[]> {
  const strip = await countries();
  const bad: string[] = [];
  for (const item of strip.items) {
    const total = await totalFor(item.country);
    if (total !== item.count) {
      bad.push(`${item.country}: strip advertises ${item.count}, ?country=${item.country} returns ${total}`);
    }
  }
  return bad;
}

test('the market strip is ordered, positive, summed and every item finds its own rows', { skip }, async () => {
  const strip = await countries();

  assert.ok(strip.items.length > 0, 'the seeded catalogue must expose at least one origin market');
  for (let i = 1; i < strip.items.length; i += 1) {
    const prev = strip.items[i - 1];
    const cur = strip.items[i];
    assert.ok(
      prev.count >= cur.count,
      `markets must be ordered by count descending: ${prev.country} (${prev.count}) then ${cur.country} (${cur.count})`,
    );
  }
  for (const item of strip.items) {
    assert.equal(typeof item.country, 'string', 'a market needs a country key');
    assert.ok(item.country.length > 0, 'a market needs a non-empty country key');
    assert.ok(item.count > 0, `${item.country} is listed with a meaningless count of ${item.count}`);
  }
  assert.equal(
    strip.total,
    strip.items.reduce((n, r) => n + r.count, 0),
    'total must be the sum of the market counts',
  );

  // The seeded catalogue's biggest market is CN, so it must be listed…
  assert.ok(
    strip.items.some((i) => i.country === 'CN'),
    'the seeded catalogue must list the CN market',
  );
  // …and no strip entry may be a dead link: whatever it advertises has to exist.
  for (const item of strip.items) {
    const total = await totalFor(item.country);
    assert.ok(total > 0, `?country=${item.country} returned no rows while the strip advertises ${item.count}`);
  }
});

test('every market count is exactly what its own country filter returns', { skip }, async () => {
  let bad = await countMismatches();
  // A concurrent probe listing can move a count between the two requests; a real
  // disagreement survives a second, settled snapshot.
  if (bad.length > 0) bad = await countMismatches();
  assert.deepEqual(bad, [], `the market strip and the country filter disagree — ${bad.join('; ')}`);
});

test('the country filter is alias-aware: TR and Türkiye are one market', { skip }, async () => {
  const tr = await totalFor('TR');
  const turkiye = await totalFor('Türkiye');
  const turkey = await totalFor('Turkey');

  assert.ok(tr > 0, 'the TR market must not be empty in the seeded catalogue');
  assert.equal(turkiye, tr, 'the long spelling must resolve to exactly the same market as the code');
  assert.equal(turkey, tr, 'the English spelling must resolve to the same market as the code');

  const listed = (await countries()).items.find((i) => i.country === 'TR');
  assert.ok(listed, 'the merged market must be listed under its code');
  assert.equal(listed.count, tr, 'the advertised TR count must equal the rows ?country=TR returns');

  // A spelling that maps to no market stays literal — it can never inherit one.
  assert.equal(await totalFor('Narnia'), 0, 'an unrecognised market must not be merged into a real one');
});
