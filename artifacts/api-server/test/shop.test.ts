/**
 * Seller shop, media and moderation-plane integration tests (migration 022).
 *
 *   cd artifacts/api-server
 *   TEST_BASE_URL=http://localhost:9096 node --import tsx --test test/shop.test.ts
 *
 * Skipped when TEST_BASE_URL is unset, exactly like api.test.ts / questions.test.ts,
 * so a developer with no server running gets a clean skip instead of connection
 * errors.
 *
 * What this file proves (each is a rule, not a smoke test):
 *   1. the shop profile is IDENTITY-FROM-TOKEN: anonymous is 401, a buyer is 403,
 *      and a body carrying someone else's id cannot move the write;
 *   2. `verifiedLevel` / `dataSource` / the attestation columns are not
 *      self-writable — a supplier cannot verify itself;
 *   3. the upload path stores only images, refuses >2 MB and an empty decode, and
 *      serves the exact bytes back with the stored content type;
 *   4. attaching a photo is owner-or-admin on BOTH sides (the listing and the
 *      upload), the gallery is ordered, and detaching garbage-collects the upload
 *      only when nothing references it any more;
 *   5. a PULLED listing leaves the public catalogue (list + detail) while its
 *      owner and an admin still read it, and its seller cannot edit it (409).
 *
 * Accounts: the file registers its own throwaway users (no seeded password, no
 * login — the 10/15min login bucket is shared with other tasks). The moderation
 * test needs to flip `moderationStatus` by hand, so it opens a local DB
 * connection and SKIPS itself when that DB is unreachable; the admin token is
 * minted with the same HMAC scheme `src/auth.ts` uses and verified with /api/me.
 *
 * Cleanup: every listing it creates is deleted through the API, and the media
 * rows it uploaded are removed from the DB at the end — a local run leaves the
 * catalogue as it found it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';

const BASE = process.env.TEST_BASE_URL;
const skip = BASE ? false : 'TEST_BASE_URL not set — skipping integration tests';
/**
 * The DB the probes below run against must be the one the SERVER under test uses:
 * `TEST_DATABASE_URL` when the runner names one explicitly, else the job/shell
 * `DATABASE_URL` (what CI and a seeded local run export), else the local dev
 * default. Falling straight to the dev default — as this file used to — made a
 * seeded run probe a DIFFERENT database than the API answered from, and the
 * `withDb` assertions below silently skipped instead of testing anything.
 */
const DB_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgres://postgres:postgres@localhost:5432/factorydepo';

const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** A real 1x1 RGBA PNG (70 bytes) — the happy-path upload. */
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';

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
  const email = `shop-${role}-${tag}@factorydepo.test`;
  const r = await call('POST', '/api/auth/register', {
    name: `Shop ${role} ${tag}`,
    email,
    password: 'integration-test-password',
    role,
    company: `Shop ${tag} Ltd`,
    country: 'Türkiye',
  });
  assert.equal(r.status, 201, `register ${role} failed: ${r.status} ${r.text}`);
  const b = r.body as { token: string; user: { id: number } };
  return { token: b.token, id: b.user.id, email };
}

/* One account per role for the whole file — registrations are anonymous writes
   against the shared IP bucket, so they are memoized. */
let supplierA: Auth | null = null;
let supplierB: Auth | null = null;
let buyerC: Auth | null = null;
const supA = async () => (supplierA ??= await register('supplier', `a${uniq()}`));
const supB = async () => (supplierB ??= await register('supplier', `b${uniq()}`));
const buyC = async () => (buyerC ??= await register('buyer', `c${uniq()}`));

interface MyShop {
  id: number;
  companyName: string;
  country: string;
  city: string | null;
  addressLine: string | null;
  description: string | null;
  contactEmail: string | null;
  incoterms: string | null;
  leadTimeDays: number | null;
  paymentTerms: string | null;
  logoMediaId: number | null;
  verifiedLevel: number | null;
  dataSource: string;
  listingCount?: number;
}

interface MediaRef {
  id: number;
  filename: string;
  contentType: string;
  sizeBytes: number;
  url: string;
}

interface Listing {
  id: number;
  supplierId: number;
  name: string;
  price: number;
  location?: string | null;
  leadTimeDays?: number | null;
  moderationStatus?: string;
  pulledReason?: string | null;
  media?: MediaRef[];
}

/** A throwaway listing owned by `auth`. */
async function createListing(
  auth: Auth,
  tag: string,
  extra: Record<string, unknown> = {},
): Promise<Listing> {
  const created = await call(
    'POST',
    '/api/products',
    {
      name: `Shop probe listing ${tag}`,
      category: 'Machinery',
      description: 'created by the shop/media integration test',
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

/** Upload one image and return its ref. */
async function upload(
  auth: Auth,
  opts: { b64?: string; contentType?: string; filename?: string } = {},
): Promise<Res> {
  return call(
    'POST',
    '/api/media',
    {
      filename: opts.filename ?? 'probe.png',
      contentType: opts.contentType ?? 'image/png',
      dataBase64: opts.b64 ?? PNG_B64,
    },
    auth.token,
  );
}

/** Run `fn` against the local DB; null when the DB is not reachable (→ skip). */
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

/**
 * Dev Bearer token, same HMAC scheme as src/auth.ts (no login-bucket cost).
 *
 * The secret must be the one the SERVER was booted with. Prefer the environment;
 * fall back to the repo `.env`, because the local server is normally started with
 * that file loaded while a bare `pnpm test` shell has no APP_SECRET exported — the
 * mismatch otherwise shows up as a confusing 401 on a freshly minted token.
 */
function loadSecret(): string | null {
  if (process.env.APP_SECRET) return process.env.APP_SECRET;
  try {
    const file = readFileSync(new URL('../../../.env', import.meta.url), 'utf8');
    return (file.match(/^APP_SECRET=(.+)$/m) ?? [])[1]?.trim() ?? null;
  } catch {
    return null;
  }
}

function mintToken(userId: number, tokenVersion: number): string | null {
  const secret = loadSecret();
  if (!secret) return null;
  const payload = Buffer.from(
    JSON.stringify({ sub: userId, v: tokenVersion, exp: Date.now() + 60 * 60 * 1000 }),
  ).toString('base64url');
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

/* media rows and listings this run created, removed by the last test. */
const createdMedia: number[] = [];
const createdListings: { id: number; token: string }[] = [];

test('the shop profile is identity-from-token: anonymous 401, buyer 403, body ids ignored', { skip }, async () => {
  const email = `shop-guard-${uniq()}@factorydepo.test`;

  const anonPatch = await call('PATCH', '/api/suppliers/me', { companyName: 'Hijack Inc' });
  assert.equal(anonPatch.status, 401, `anonymous PATCH must be 401 (got ${anonPatch.status})`);

  const anonGet = await call('GET', '/api/suppliers/me');
  assert.equal(anonGet.status, 401, `anonymous GET must be 401 (got ${anonGet.status})`);

  const buyer = await buyC();
  const buyerPatch = await call('PATCH', '/api/suppliers/me', { companyName: 'Buyer Inc' }, buyer.token);
  assert.equal(buyerPatch.status, 403, `a buyer has no shop to edit (got ${buyerPatch.status} ${buyerPatch.text})`);
  const buyerGet = await call('GET', '/api/suppliers/me', undefined, buyer.token);
  assert.equal(buyerGet.status, 403, `a buyer must not read a shop (got ${buyerGet.status})`);

  const a = await supA();
  const b = await supB();

  const mine = await call('GET', '/api/suppliers/me', undefined, a.token);
  assert.equal(mine.status, 200, `supplier GET /me failed: ${mine.status} ${mine.text}`);
  const shop = mine.body as MyShop;
  assert.ok(shop.id > 0, 'the shop must carry its own supplier id');
  assert.equal(typeof shop.listingCount, 'number', 'listingCount must be a real number');
  assert.equal(shop.listingCount, 0, 'a brand-new supplier owns no listings');
  assert.ok(typeof shop.companyName === 'string' && shop.companyName.length > 0, 'companyName must be filled');

  // The other supplier's own shop is a DIFFERENT row: the token selects it.
  const other = await call('GET', '/api/suppliers/me', undefined, b.token);
  assert.equal(other.status, 200, other.text);
  assert.notEqual((other.body as MyShop).id, shop.id, 'two suppliers must resolve to two different rows');

  // A body carrying someone else's id cannot move the write: the row edited and
  // returned is still the caller's own.
  const injected = await call(
    'PATCH',
    '/api/suppliers/me',
    {
      companyName: `Shop A renamed ${email}`,
      id: (other.body as MyShop).id,
      supplierId: (other.body as MyShop).id,
      userId: b.id,
    },
    a.token,
  );
  assert.equal(injected.status, 200, `owner PATCH failed: ${injected.status} ${injected.text}`);
  const patched = injected.body as MyShop;
  assert.equal(patched.id, shop.id, 'the body-supplied id must be ignored: the caller edits their OWN row');
  assert.equal(patched.companyName, `Shop A renamed ${email}`, 'the allowed field must be written');

  // …and the other supplier's row is untouched.
  const bAfter = await call('GET', '/api/suppliers/me', undefined, b.token);
  assert.notEqual((bAfter.body as MyShop).companyName, `Shop A renamed ${email}`, "supplier B's row must not change");
});

test('a supplier cannot self-grant verification or provenance', { skip }, async () => {
  const a = await supA();
  const before = (await call('GET', '/api/suppliers/me', undefined, a.token)).body as MyShop;

  const r = await call(
    'PATCH',
    '/api/suppliers/me',
    {
      description: 'Self-described shop',
      leadTimeDays: 7,
      incoterms: 'FOB',
      // None of these may be written through the seller route.
      verifiedLevel: 3,
      dataSource: 'demo',
      attestedBy: 1,
      attestedAt: '2020-01-01T00:00:00.000Z',
    },
    a.token,
  );
  assert.equal(r.status, 200, `PATCH failed: ${r.status} ${r.text}`);
  const after = r.body as MyShop;

  assert.equal(after.verifiedLevel, before.verifiedLevel, 'verifiedLevel must never be self-writable');
  assert.equal(after.dataSource, before.dataSource, 'dataSource is a provenance fact, not an input');
  // The editable fields DID change, so the refusal above is a field rule and not
  // a blanket no-op.
  assert.equal(after.description, 'Self-described shop');
  assert.equal(after.leadTimeDays, 7);
  assert.equal(after.incoterms, 'FOB');

  const reread = (await call('GET', '/api/suppliers/me', undefined, a.token)).body as MyShop;
  assert.equal(reread.verifiedLevel, before.verifiedLevel, 'the stored row must still carry the old level');
});

test('uploads: images only, ≤2 MB, empty decode refused, exact bytes served back', { skip }, async () => {
  const a = await supA();

  const anon = await call('POST', '/api/media', { filename: 'x.png', contentType: 'image/png', dataBase64: PNG_B64 });
  assert.equal(anon.status, 401, `anonymous upload must be 401 (got ${anon.status})`);

  const ok = await upload(a, { filename: 'happy.png' });
  assert.equal(ok.status, 201, `upload failed: ${ok.status} ${ok.text}`);
  const ref = ok.body as MediaRef;
  createdMedia.push(ref.id);
  assert.equal(ref.contentType, 'image/png');
  assert.equal(ref.sizeBytes, Buffer.from(PNG_B64, 'base64').length, 'sizeBytes must be the DECODED size');
  assert.equal(ref.url, `/api/media/${ref.id}`, 'the url must be the public media route');

  const served = await fetch(`${BASE}${ref.url}`);
  assert.equal(served.status, 200, `GET ${ref.url} must be 200`);
  assert.equal(served.headers.get('content-type'), 'image/png', 'the stored content type must be served');
  assert.match(String(served.headers.get('cache-control')), /immutable/, 'an immutable photo must be cacheable');
  const bytes = Buffer.from(await served.arrayBuffer());
  assert.ok(bytes.equals(Buffer.from(PNG_B64, 'base64')), 'the served bytes must be the uploaded bytes');

  const missing = await call('GET', '/api/media/2147483000');
  assert.equal(missing.status, 404, 'an unknown media id must be a 404, never an empty 200');

  const notImage = await upload(a, { contentType: 'text/plain', b64: Buffer.from('hello').toString('base64') });
  assert.equal(notImage.status, 415, `a non-image must be 415 (got ${notImage.status} ${notImage.text})`);
  assert.equal((notImage.body as { error: string }).error, 'unsupported_media_type');

  const empty = await upload(a, { b64: 'x' });
  assert.equal(empty.status, 400, `a decode with no bytes must be 400 (got ${empty.status})`);
  assert.equal((empty.body as { error: string }).error, 'invalid_image');

  const tooBig = await upload(a, { b64: Buffer.alloc(2 * 1024 * 1024 + 1024, 7).toString('base64') });
  assert.equal(tooBig.status, 413, `an over-2MB image must be 413 (got ${tooBig.status} ${tooBig.text})`);
  assert.equal((tooBig.body as { error: string }).error, 'payload_too_large');
});

test('gallery: attach is owner-or-admin on both sides, ordered, and detach collects the unreferenced upload', { skip }, async () => {
  const a = await supA();
  const b = await supB();
  const buyer = await buyC();
  const tag = uniq();

  const listing = await createListing(a, tag, { location: 'Izmir, TR', leadTimeDays: 21 });
  createdListings.push({ id: listing.id, token: a.token });
  assert.equal(listing.location, 'Izmir, TR', 'a created listing must carry its location');
  assert.equal(listing.leadTimeDays, 21, 'a created listing must carry its lead time');
  assert.deepEqual(listing.media, [], 'a brand-new listing has an empty gallery');

  const first = (await upload(a, { filename: 'one.png' })).body as MediaRef;
  const second = (await upload(a, { filename: 'two.png' })).body as MediaRef;
  createdMedia.push(first.id, second.id);

  const attach = await call('POST', `/api/products/${listing.id}/media`, { mediaId: first.id }, a.token);
  assert.equal(attach.status, 200, `attach failed: ${attach.status} ${attach.text}`);

  const again = await call('POST', `/api/products/${listing.id}/media`, { mediaId: first.id }, a.token);
  assert.equal(again.status, 200, `re-attaching the same photo must be idempotent (got ${again.status})`);
  const pubAfterFirst = (await call('GET', `/api/products/${listing.id}`)).body as Listing;
  assert.equal(pubAfterFirst.media?.length, 1, 'the same photo must not appear twice in the gallery');
  assert.equal(pubAfterFirst.media?.[0].url, first.url, 'the public gallery must carry the media url');

  const attach2 = await call('POST', `/api/products/${listing.id}/media`, { mediaId: second.id }, a.token);
  assert.equal(attach2.status, 200, attach2.text);
  const ordered = (await call('GET', `/api/products/${listing.id}`)).body as Listing;
  assert.deepEqual(
    ordered.media?.map((m) => m.id),
    [first.id, second.id],
    'the gallery must come back in attach (position) order',
  );

  // The list endpoint omits the gallery but still reports location / lead time.
  const list = await call('GET', `/api/products?q=${encodeURIComponent(`Shop probe listing ${tag}`)}&limit=5`);
  const listed = (list.body as { items: Listing[] }).items.find((p) => p.id === listing.id);
  assert.ok(listed, 'the listing must be in the public list');
  assert.equal(listed.location, 'Izmir, TR');
  assert.equal(listed.leadTimeDays, 21);

  // ---- refusals ----
  const buyerUpload = (await upload(buyer, { filename: 'buyer.png' })).body as MediaRef;
  createdMedia.push(buyerUpload.id);

  const foreignMedia = await call('POST', `/api/products/${listing.id}/media`, { mediaId: buyerUpload.id }, a.token);
  assert.equal(foreignMedia.status, 403, `another account's upload must be 403 (got ${foreignMedia.status})`);

  const bListing = await createListing(b, `${tag}b`);
  createdListings.push({ id: bListing.id, token: b.token });
  const foreignListing = await call('POST', `/api/products/${bListing.id}/media`, { mediaId: first.id }, a.token);
  assert.equal(foreignListing.status, 403, `another supplier's listing must be 403 (got ${foreignListing.status})`);

  const buyerAttach = await call('POST', `/api/products/${listing.id}/media`, { mediaId: buyerUpload.id }, buyer.token);
  assert.equal(buyerAttach.status, 403, `a plain buyer must never attach (got ${buyerAttach.status})`);

  const unknownListing = await call('POST', '/api/products/2147483000/media', { mediaId: first.id }, a.token);
  assert.equal(unknownListing.status, 404, 'an unknown listing must be 404');

  // ---- detach ----
  const detach = await call('DELETE', `/api/products/${listing.id}/media/${second.id}`, undefined, a.token);
  assert.ok(detach.status === 204 || detach.status === 200, `detach failed: ${detach.status} ${detach.text}`);
  const afterDetach = (await call('GET', `/api/products/${listing.id}`)).body as Listing;
  assert.deepEqual(afterDetach.media?.map((m) => m.id), [first.id], 'the gallery must shrink by exactly one');
  const gone = await call('GET', `/api/media/${second.id}`);
  assert.equal(gone.status, 404, 'an upload referenced by nothing must be deleted with its last link');

  const detachAgain = await call('DELETE', `/api/products/${listing.id}/media/${second.id}`, undefined, a.token);
  assert.equal(detachAgain.status, 404, 'detaching an unlinked photo must be 404');

  const buyerDetach = await call('DELETE', `/api/products/${listing.id}/media/${first.id}`, undefined, buyer.token);
  assert.equal(buyerDetach.status, 403, 'a non-owner must not detach');

  // Detaching the last link of a still-referenced upload must NOT delete it:
  // attach it to a second listing of the same seller first.
  const secondListing = await createListing(a, `${tag}-2`);
  createdListings.push({ id: secondListing.id, token: a.token });
  await call('POST', `/api/products/${secondListing.id}/media`, { mediaId: first.id }, a.token);
  await call('DELETE', `/api/products/${listing.id}/media/${first.id}`, undefined, a.token);
  const stillThere = await call('GET', `/api/media/${first.id}`);
  assert.equal(stillThere.status, 200, 'an upload still attached to another listing must survive');
});

test('a pulled listing leaves the public catalogue but stays visible to its owner and an admin', { skip }, async () => {
  const a = await supA();
  const buyer = await buyC();
  const tag = uniq();

  const listing = await createListing(a, tag, { location: 'Izmir, TR', leadTimeDays: 10 });
  createdListings.push({ id: listing.id, token: a.token });
  const search = `/api/products?q=${encodeURIComponent(`Shop probe listing ${tag}`)}&limit=5`;
  const inList = async (token?: string): Promise<boolean> => {
    const r = await call('GET', search, undefined, token);
    assert.equal(r.status, 200, r.text);
    return (r.body as { items: Listing[] }).items.some((p) => p.id === listing.id);
  };
  assert.equal(await inList(), true, 'the listing must be public before the pull');

  // Pull it by hand (that is what the admin route will do) — needs the DB.
  const pulled = await withDb(async (c) => {
    const original = await c.query<{ moderationStatus: string; pulledReason: string | null }>(
      'SELECT "moderationStatus", "pulledReason" FROM products WHERE id = $1',
      [listing.id],
    );
    await c.query(
      `UPDATE products SET "moderationStatus" = 'pulled', "pulledReason" = $2, "pulledBy" = 1, "pulledAt" = now() WHERE id = $1`,
      [listing.id, `integration probe pull ${tag}`],
    );
    return original.rows[0];
  });
  if (!pulled) {
    console.log('shop.test: no local DB reachable — skipping the pulled-listing assertions');
    return;
  }

  try {
    assert.equal(await inList(), false, 'a pulled listing must leave the public list');
    assert.equal(await inList(buyer.token), false, 'a pulled listing must not be listed for a buyer either');

    const anonDetail = await call('GET', `/api/products/${listing.id}`);
    assert.equal(anonDetail.status, 404, `a pulled listing must 404 publicly (got ${anonDetail.status})`);
    const buyerDetail = await call('GET', `/api/products/${listing.id}`, undefined, buyer.token);
    assert.equal(buyerDetail.status, 404, `a pulled listing must 404 for a buyer (got ${buyerDetail.status})`);

    // The owner still sees it — with the moderation state and the reason.
    const ownerView = await call('GET', `/api/products/${listing.id}`, undefined, a.token);
    assert.equal(ownerView.status, 200, `the owner must still read their pulled listing (got ${ownerView.status})`);
    const ownerListing = ownerView.body as Listing;
    assert.equal(ownerListing.moderationStatus, 'pulled', 'the owner must see that it was pulled');
    assert.equal(ownerListing.pulledReason, `integration probe pull ${tag}`, 'the owner must see WHY it was pulled');

    const ownerList = await call('GET', '/api/products?mine=1&limit=100', undefined, a.token);
    assert.ok(
      (ownerList.body as { items: Listing[] }).items.some((p) => p.id === listing.id),
      'the seller dashboard (?mine=1) must still list it',
    );

    // …and cannot edit it away.
    const patch = await call('PATCH', `/api/products/${listing.id}`, { price: 1 }, a.token);
    assert.equal(patch.status, 409, `editing a pulled listing must be 409 (got ${patch.status} ${patch.text})`);
    assert.equal((patch.body as { error: string }).error, 'listing_pulled');

    // An admin still sees it (and may edit it).
    const adminRow = await withDb(async (c) =>
      (
        await c.query<{ id: number; tokenVersion: number }>(
          `SELECT id, "tokenVersion" FROM users WHERE role = 'admin' ORDER BY id LIMIT 1`,
        )
      ).rows[0],
    );
    const adminToken = adminRow ? mintToken(adminRow.id, adminRow.tokenVersion ?? 0) : null;
    // A silent skip here would hide the admin view from the gate entirely, so the
    // token has to be obtainable — minted from the server's APP_SECRET (above). A
    // refused mint means the shell and the server disagree on the secret, and there
    // is no seeded admin to log in as (the catalogue is real), so that is a hard
    // failure carrying the diagnosis rather than a fallback to a demo account.
    assert.ok(adminToken, 'the admin credential must be mintable — APP_SECRET must match the running server');
    if (adminToken) {
      const me = await call('GET', '/api/me', undefined, adminToken);
      assert.equal(
        me.status,
        200,
        `the minted admin credential must be accepted (got ${me.status} ${me.text}) — APP_SECRET must match the running server`,
      );
      const adminView = await call('GET', `/api/products/${listing.id}`, undefined, adminToken);
      assert.equal(adminView.status, 200, 'an admin must still read a pulled listing');
      assert.equal((adminView.body as Listing).moderationStatus, 'pulled');
      const adminPatch = await call('PATCH', `/api/products/${listing.id}`, { price: 321 }, adminToken);
      assert.equal(adminPatch.status, 200, `an admin may edit a pulled listing (got ${adminPatch.status})`);
    } else {
      console.log('shop.test: no mintable admin token — skipping the admin-side assertions');
    }
  } finally {
    // Put the row back exactly as it was found.
    await withDb((c) =>
      c.query(
        `UPDATE products SET "moderationStatus" = $2, "pulledReason" = $3, "pulledBy" = NULL, "pulledAt" = NULL WHERE id = $1`,
        [listing.id, pulled.moderationStatus, pulled.pulledReason],
      ),
    );
  }

  assert.equal(await inList(), true, 'restoring the row must put it back in the public catalogue');
  const back = await call('GET', `/api/products/${listing.id}`);
  assert.equal(back.status, 200, 'the restored listing must be readable again');
});

test('leftover cleanup: this run leaves no listings or uploads behind', { skip }, async () => {
  for (const l of createdListings) {
    const r = await call('DELETE', `/api/products/${l.id}`, undefined, l.token);
    assert.ok(r.status === 204 || r.status === 200 || r.status === 404, `cleanup failed for ${l.id}: ${r.status} ${r.text}`);
  }
  createdListings.length = 0;

  if (createdMedia.length > 0) {
    const removed = await withDb((c) =>
      c.query('DELETE FROM media WHERE id = ANY($1::int[])', [createdMedia]),
    );
    if (removed === null) {
      console.log('shop.test: no local DB reachable — media rows left for scripts/cleanup-test-rows.sql');
    }
    createdMedia.length = 0;
  }

  // The throwaway accounts own nothing any more.
  const a = await supA();
  const shop = (await call('GET', '/api/suppliers/me', undefined, a.token)).body as MyShop;
  assert.equal(shop.listingCount, 0, 'the test supplier must own no listings at the end');
});
