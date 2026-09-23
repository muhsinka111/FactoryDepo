/**
 * ONE ACCOUNT, BOTH ROLES — the owner's directive for `sales@factorydepo.com`.
 *
 *   TEST_BASE_URL=http://localhost:9095 node --import tsx --test test/seller-surface.test.ts
 *
 * Skipped when TEST_BASE_URL is unset, exactly like api.test.ts / shop.test.ts.
 *
 * The account owns every listing the desk sources through the extension AND runs
 * the control plane, so it carries `admin` while a supplier row hangs off it
 * (`suppliers."userId" = users.id`). Until now those two surfaces were mutually
 * exclusive: the seller routes were gated on `role='supplier'`, the console on
 * `role='admin'`, so whichever single role the login carried it lost half its
 * job. The seller gate is now the caller's OWN SUPPLIER ROW
 * (`requireSellerSurface` in src/auth.ts), and this file proves the four rules
 * that make that safe rather than a widening of privilege:
 *
 *   (a) an admin that OWNS a supplier row publishes and edits a listing of its
 *       own — and a body naming somebody else's supplierId cannot move the row
 *       it is created under;
 *   (b) an admin that owns NO supplier row is refused (403) on the same routes,
 *       and `GET /api/me` reports its `supplierId` as null;
 *   (c) a supplier still gets 403 from the admin plane, row or no row;
 *   (d) a supplier still cannot edit another supplier's listing.
 *
 * Sessions are real accounts registered through the API; there is no path to
 * mint an admin, so the promotion happens through the database (the same
 * `UPDATE users SET role='admin'` the operator does by hand), and the admin's
 * supplier row is created through `POST /api/me/become-supplier` — the door a
 * real account uses.
 *
 * Accounts: throwaway `*@factorydepo.test` users, no login (the 10/15min login
 * bucket is shared with the other files). The database it promotes through is
 * the one the RUNNING SERVER uses — `TEST_DATABASE_URL`, else `DATABASE_URL`
 * (the seeded-suite harness exports it), else the local dev default — because a
 * promotion applied to a different database than the API's would silently test
 * nothing. When no database is reachable the assertions that need the promotion
 * skip themselves, like the rest of the suite.
 *
 * Cleanup: every listing is deleted through the API, and the two promoted
 * accounts (with their supplier rows) are removed in `after()` — a run leaves
 * neither catalogue rows nor an extra admin behind.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from 'pg';

const BASE = process.env.TEST_BASE_URL;
const skip = BASE ? false : 'TEST_BASE_URL not set — skipping integration tests';
const DB_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgres://postgres:***@localhost:5432/factorydepo';

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
    /* non-JSON — keep the raw text for the assertion message */
  }
  return { status: res.status, body: parsed, text };
}

interface Auth {
  token: string;
  id: number;
  email: string;
}

async function register(role: 'buyer' | 'supplier', tag: string): Promise<Auth> {
  const email = `seller-surface-${role}-${tag}@factorydepo.test`;
  const r = await call('POST', '/api/auth/register', {
    name: `SellerSurface ${role} ${tag}`,
    email,
    password: 'integration-test-password',
    role,
    company: `SellerSurface ${tag} Ltd`,
    country: 'Türkiye',
  });
  assert.equal(r.status, 201, `register ${role} failed: ${r.status} ${r.text}`);
  const b = r.body as { token: string; user: { id: number } };
  return { token: b.token, id: b.user.id, email };
}

/** Run `fn` against the database the server under test is using; null when unreachable. */
async function withDb<T>(fn: (c: Client) => Promise<T>): Promise<T | null> {
  const client = new Client({ connectionString: DB_URL });
  try {
    await client.connect();
  } catch {
    return null;
  }
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

interface MyShop {
  id: number;
  companyName: string;
}

interface Listing {
  id: number;
  supplierId: number;
  name: string;
  price: number;
}

/** A throwaway listing owned by `auth`. */
async function createListing(auth: Auth, tag: string, extra: Record<string, unknown> = {}): Promise<Listing> {
  const created = await call(
    'POST',
    '/api/products',
    {
      name: `Seller-surface probe listing ${tag}`,
      category: 'Machinery',
      description: 'created by the one-account-both-roles integration test',
      price: 250,
      currency: 'USD',
      unit: 'Set',
      moq: 1,
      quantityAvailable: 5,
      originCountry: 'TR',
      ...extra,
    },
    auth.token,
  );
  assert.equal(created.status, 201, `probe listing failed: ${created.status} ${created.text}`);
  return created.body as Listing;
}

/** A valid create-listing body for a call whose expected answer is NOT 201. */
function productBody(): Record<string, unknown> {
  return {
    name: `Seller-surface refused probe ${uniq()}`,
    category: 'Machinery',
    description: 'body of a call that must be refused by the seller gate',
    price: 111,
    currency: 'USD',
    unit: 'Set',
    moq: 1,
    quantityAvailable: 2,
    originCountry: 'TR',
  };
}

/**
 * Promote a registered account to admin — the API deliberately has no path for
 * this. The email is part of the WHERE clause on purpose: an id on its own would
 * promote whatever stranger happens to own that id if this file ever ran against
 * a different database than the one the API is using.
 */
async function promoteToAdmin(c: Client, account: Auth): Promise<number> {
  const r = await c.query<{ id: number }>(
    "UPDATE users SET role = 'admin' WHERE id = $1 AND email = $2 RETURNING id",
    [account.id, account.email],
  );
  return r.rowCount ?? 0;
}

/* Throwaway accounts whose listings this run creates, deleted by the last test. */
const createdListings: { id: number; token: string }[] = [];
/* The accounts this run created (and promoted), removed in `after()` — by EMAIL,
   the key this file itself created, so a cleanup pointed at the wrong database
   can never delete a stranger. */
const createdAccounts: Auth[] = [];

test('one account, both roles: an admin that owns a supplier row keeps the seller surface, and only that', { skip }, async () => {
  const tag = uniq();
  const seller = await register('supplier', `a${tag}`);
  createdAccounts.push(seller);
  const other = (await call('GET', '/api/suppliers/me', undefined, seller.token)).body as MyShop;
  assert.ok(other.id > 0, 'the fixture supplier must own a row, to be "somebody else" for the ownership probes');

  /* ---------- (a) an admin that OWNS a supplier row sells as itself ---------- */

  const withRow = await register('buyer', `seller-admin${tag}`);
  createdAccounts.push(withRow);
  const promoted = await withDb((c) => promoteToAdmin(c, withRow));
  if (promoted === null) {
    console.log('seller-surface.test: no database reachable — skipping the one-account-both-roles assertions');
    createdAccounts.length = 0;
    return;
  }
  assert.equal(promoted, 1, `promoting user ${withRow.id} to admin affected ${promoted} rows`);

  // The supplier row comes from the door a real account uses.
  const became = await call('POST', '/api/me/become-supplier', undefined, withRow.token);
  assert.equal(became.status, 200, `become-supplier failed: ${became.status} ${became.text}`);
  assert.equal((became.body as { role: string }).role, 'admin', 'starting to sell must not demote an admin');

  const myShop = await call('GET', '/api/suppliers/me', undefined, withRow.token);
  assert.equal(myShop.status, 200, `an admin that owns a shop must read it (got ${myShop.status} ${myShop.text})`);
  const ownSupplierId = (myShop.body as MyShop).id;
  assert.ok(ownSupplierId > 0, 'the promoted admin must own a supplier row');
  assert.notEqual(ownSupplierId, other.id, "the admin's shop must be its own row, not the fixture's");

  // The session says it can sell: /api/me reports the caller's OWN supplier row.
  const me = await call('GET', '/api/me', undefined, withRow.token);
  assert.equal(me.status, 200, me.text);
  assert.equal(
    (me.body as { supplierId: number | null }).supplierId,
    ownSupplierId,
    "GET /api/me must carry the caller's own supplierId — the client decides from it whether the seller doors exist",
  );

  // Publish. The body names ANOTHER supplier's row — it must be ignored.
  const created = await createListing(withRow, tag, { supplierId: other.id });
  createdListings.push({ id: created.id, token: withRow.token });
  assert.equal(
    created.supplierId,
    ownSupplierId,
    "a listing must be created under the CALLER's own supplier row — the body's supplierId is not an input",
  );

  // Edit its own listing — the row the seller surface resolved is the one that owns it.
  const patched = await call('PATCH', `/api/products/${created.id}`, { price: 4242 }, withRow.token);
  assert.equal(patched.status, 200, `editing its own listing must work (got ${patched.status} ${patched.text})`);
  assert.equal((patched.body as Listing).price, 4242, 'the stored price must be the one that was written');

  // The seller pages' own data sources: ?mine=1 and the dashboard stats.
  const listed = await call('GET', '/api/products?mine=1&limit=100', undefined, withRow.token);
  assert.equal(listed.status, 200, listed.text);
  assert.ok(
    (listed.body as { items: Listing[] }).items.some((p) => p.id === created.id),
    "the seller dashboard (?mine=1) must list the admin's own listing",
  );
  const stats = await call('GET', '/api/orders/stats', undefined, withRow.token);
  assert.equal(stats.status, 200, stats.text);
  assert.ok(
    (stats.body as { totalListings: number }).totalListings >= 1,
    'the dashboard numbers must count the seller row, not the role name',
  );

  // Deleting its own listing goes through the same gate.
  const disposable = await createListing(withRow, `${tag}-trash`);
  const removedByOwner = await call('DELETE', `/api/products/${disposable.id}`, undefined, withRow.token);
  assert.equal(removedByOwner.status, 204, `deleting its own listing must work (got ${removedByOwner.status})`);

  // …and it keeps the other half of the job: the console still answers.
  const consoleView = await call('GET', '/api/admin/overview', undefined, withRow.token);
  assert.equal(consoleView.status, 200, `an admin must still reach the control plane (got ${consoleView.status})`);

  /* ---------- (b) an admin that owns NO supplier row is refused ------------- */

  const noRow = await register('buyer', `admin-no-shop${tag}`);
  createdAccounts.push(noRow);
  const promotedNoRow = await withDb((c) => promoteToAdmin(c, noRow));
  assert.equal(promotedNoRow, 1, 'the row-less admin must really be promoted to admin');

  const noRowMe = await call('GET', '/api/me', undefined, noRow.token);
  assert.equal(noRowMe.status, 200, noRowMe.text);
  assert.equal(
    (noRowMe.body as { supplierId: number | null }).supplierId,
    null,
    "an account with no shop reports supplierId null — not 0, not somebody else's row",
  );

  // Publishing is refused outright, even with a body that names a real row.
  const publish = await call('POST', '/api/products', { ...productBody(), supplierId: other.id }, noRow.token);
  assert.equal(publish.status, 403, `an admin with no supplier row must not publish (got ${publish.status} ${publish.text})`);
  assert.equal((publish.body as { error: string }).error, 'forbidden');

  // Every other door of the seller surface is refused the same way.
  const noRowShop = await call('GET', '/api/suppliers/me', undefined, noRow.token);
  assert.equal(noRowShop.status, 403, `no shop to read (got ${noRowShop.status})`);
  const noRowShopPatch = await call('PATCH', '/api/suppliers/me', { companyName: 'Hijack Inc' }, noRow.token);
  assert.equal(noRowShopPatch.status, 403, `no shop to edit (got ${noRowShopPatch.status})`);
  const noRowDocs = await call('POST', '/api/supplier/docs', { docType: 'business_license' }, noRow.token);
  assert.equal(noRowDocs.status, 403, `no shop to document (got ${noRowDocs.status})`);
  const noRowDelete = await call('DELETE', `/api/products/${created.id}`, undefined, noRow.token);
  assert.equal(noRowDelete.status, 403, `an admin with no row must not delete a seller's listing (got ${noRowDelete.status})`);

  // The refused delete really was a refusal, not a failure that happened to 403.
  const survived = await call('GET', `/api/products/${created.id}`, undefined, withRow.token);
  assert.equal(survived.status, 200, 'the refused DELETE must leave the listing in place');
  assert.equal((survived.body as Listing).price, 4242, 'and its stored values untouched');

  /* ---------- (c) a supplier still gets 403 from the admin plane ------------ */

  const adminProbes: { label: string; method: string; path: string; body?: unknown }[] = [
    { label: 'overview', method: 'GET', path: '/api/admin/overview' },
    { label: 'suppliers', method: 'GET', path: '/api/admin/suppliers' },
    { label: 'listings', method: 'GET', path: '/api/admin/listings' },
    { label: 'audit', method: 'GET', path: '/api/admin/audit' },
    { label: 'PATCH listing', method: 'PATCH', path: `/api/admin/listings/${created.id}`, body: { price: 5 } },
  ];
  for (const probe of adminProbes) {
    const r = await call(probe.method, probe.path, probe.body, seller.token);
    assert.equal(r.status, 403, `a supplier must get 403 on ${probe.label} (got ${r.status} ${r.text})`);
    assert.equal((r.body as { error: string }).error, 'forbidden');
  }
  // The refused admin PATCH must not have moved the price either.
  const afterAdminProbes = await call('GET', `/api/products/${created.id}`, undefined, withRow.token);
  assert.equal((afterAdminProbes.body as Listing).price, 4242, 'the refused admin PATCH must not have changed anything');

  /* ---------- (d) a supplier still cannot edit another supplier's listing --- */

  const second = await register('supplier', `b${tag}`);
  createdAccounts.push(second);
  const secondListing = await createListing(second, `other${tag}`);
  createdListings.push({ id: secondListing.id, token: second.token });
  const cross = await call('PATCH', `/api/products/${secondListing.id}`, { price: 7 }, seller.token);
  assert.equal(cross.status, 403, `a supplier must not edit another supplier's listing (got ${cross.status} ${cross.text})`);
  assert.equal((cross.body as { error: string }).error, 'forbidden');
  const secondReread = await call('GET', `/api/products/${secondListing.id}`, undefined, second.token);
  assert.equal((secondReread.body as Listing).price, secondListing.price, "the other supplier's row must be untouched");

  // NOTE on PATCH /api/products/:id: it is owner-or-admin by ROW (never
  // role-gated), and the admin branch is the console's correction path — the
  // shop/media suite asserts that an admin may edit a listing it does not own.
  // What this gate changes is who may act as a SELLER: with no supplier row,
  // there is nothing to publish, edit as one's own, or delete, and that is what
  // (b) pins down.
});

test('seller-surface cleanup: this run leaves no listings behind', { skip }, async () => {
  for (const l of createdListings) {
    const r = await call('DELETE', `/api/products/${l.id}`, undefined, l.token);
    assert.ok(r.status === 204 || r.status === 200 || r.status === 404, `cleanup failed for ${l.id}: ${r.status} ${r.text}`);
  }
  createdListings.length = 0;
});

after(async () => {
  if (!BASE || createdAccounts.length === 0) return;
  const emails = createdAccounts.map((a) => a.email);
  try {
    const removed = await withDb(async (c) => {
      // Resolve the ids FROM THE EMAILS in this database — never reuse an id the
      // API reported, so nothing here can touch an account this file did not make.
      const mine = await c.query<{ id: number }>('SELECT id FROM users WHERE email = ANY($1::text[])', [emails]);
      const userIds = mine.rows.map((r) => r.id);
      if (userIds.length > 0) {
        const shops = await c.query<{ id: number }>('SELECT id FROM suppliers WHERE "userId" = ANY($1::int[])', [userIds]);
        const shopIds = shops.rows.map((r) => r.id);
        if (shopIds.length > 0) {
          await c.query(
            'DELETE FROM product_views WHERE "productId" IN (SELECT id FROM products WHERE "supplierId" = ANY($1::int[]))',
            [shopIds],
          );
          await c.query('DELETE FROM products WHERE "supplierId" = ANY($1::int[])', [shopIds]);
          await c.query('DELETE FROM supplier_docs WHERE "supplierId" = ANY($1::int[])', [shopIds]);
          await c.query('DELETE FROM suppliers WHERE id = ANY($1::int[])', [shopIds]);
        }
        await c.query('DELETE FROM users WHERE id = ANY($1::int[])', [userIds]);
      }
      return true;
    });
    if (removed === null) {
      console.log('seller-surface.test: no database reachable — the test accounts stay behind (nothing they own does)');
    }
  } catch (err) {
    console.log(
      'seller-surface.test: could not remove the test accounts (their catalogue rows are gone):',
      err instanceof Error ? err.message : String(err),
    );
  }
  createdAccounts.length = 0;
});
