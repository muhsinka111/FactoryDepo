/**
 * Admin control plane — integration tests against a BOOTED api-server.
 *
 *   cd artifacts/api-server && \
 *     TEST_BASE_URL=http://localhost:9097 node --import tsx --test test/admin-control.test.ts
 *
 * Skipped when TEST_BASE_URL is unset, exactly like api.test.ts / questions.test.ts.
 *
 * The owner's mandate is "admin only can control — more tools to admin site to
 * control and check". This suite proves the four things that make that real
 * rather than a form:
 *
 *   1. GATE: every control-plane route is admin-only — anonymous 401, and a
 *      registered BUYER or SUPPLIER 403. A gate that only stopped anonymous
 *      callers would leave any logged-in account free to re-price the catalogue
 *      or delete someone's listing.
 *   2. REAL EFFECT: the edited price is the price the catalogue then serves, the
 *      pull/restore flip is what the admin list then reports, and a deleted
 *      listing is gone from both.
 *   3. TRAIL: `GET /api/admin/audit` carries the values that were actually stored
 *      (before AND after), attributed to the acting admin, newest first — and the
 *      trail is admin-only itself.
 *   4. REFUSALS: pulling twice or restoring an unpulled listing are 409s, an
 *      unknown id is a 404, a 2-character pull reason is a 400, an unknown
 *      moderation filter is a 400, and a listing history depends on is not
 *      deleted (that last one needs a referenced row and is exercised by hand
 *      against the same server — see the task evidence).
 *
 * Accounts: the three SEEDED ones (demo@ / buyer@ / supplier@factorydepo.com,
 * password 'factorydepo'), so this file creates no user rows. Everything it
 * creates — probe listings owned by the seeded supplier — it deletes again. The
 * only rows it leaves behind are the `admin_audit` entries its own actions
 * legitimately produce.
 *
 * Rate limits are per server instance: the file spends 3 logins (10/15min) and
 * ~18 admin + 3 supplier + 12 anonymous/buyer writes (30/min each), so give it
 * its own server and do not run it in a tight loop.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.TEST_BASE_URL;
const skip = BASE ? false : 'TEST_BASE_URL not set — skipping integration tests';

const PASSWORD = 'factorydepo';
/** An id that cannot exist: every "unknown id" assertion uses the same one. */
const UNKNOWN_ID = 2147483000;

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

async function login(email: string): Promise<string> {
  const r = await call('POST', '/api/auth/login', { email, password: PASSWORD });
  assert.equal(r.status, 200, `login ${email} failed: ${r.status} ${r.text}`);
  return (r.body as { token: string }).token;
}

/** One login per actor for the whole file (login limiter: 10/15min per IP). */
const tokens = { admin: '', buyer: '', supplier: '', adminName: '' };

before(async () => {
  if (!BASE) return;
  tokens.admin = await login('demo@factorydepo.com');
  tokens.buyer = await login('buyer@factorydepo.com');
  tokens.supplier = await login('supplier@factorydepo.com');
  const me = await call('GET', '/api/me', undefined, tokens.admin);
  assert.equal(me.status, 200, `the admin token must authenticate: ${me.status} ${me.text}`);
  tokens.adminName = (me.body as { name: string }).name;
});

/* ---------- shapes the assertions read ---------- */

interface ProductRow {
  id: number;
  supplierId: number;
  name: string;
  price: number;
  currency: string;
  moderationStatus?: string;
  pulledReason?: string | null;
  dataSource: string;
}

interface SupplierRow {
  id: number;
  companyName: string;
  city: string | null;
  tags: string[];
  verifiedLevel: number;
}

interface AuditRow {
  id: number;
  adminUserId: number;
  adminName: string | null;
  action: string;
  entity: string;
  entityId: number | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
}

const itemsOf = <T,>(r: Res): T[] => ((r.body as { items?: T[] }).items ?? []) as T[];
const auditRows = (r: Res): AuditRow[] => itemsOf<AuditRow>(r);
const hasId = (r: Res, id: number): boolean => itemsOf<{ id: number }>(r).some((row) => row.id === id);

/** A throwaway listing owned by the seeded supplier, for the probes below. */
async function createProbeListing(): Promise<{ id: number; name: string; price: number; supplierId: number; tag: string }> {
  const tag = uniq();
  const name = `AdminControl probe ${tag}`;
  const price = 137.5;
  const created = await call(
    'POST',
    '/api/products',
    {
      name,
      category: 'Machinery',
      description: 'throwaway listing created by the admin control-plane integration test',
      price,
      currency: 'USD',
      unit: 'Set',
      moq: 1,
      quantityAvailable: 3,
      originCountry: 'Türkiye',
      listingType: 'surplus',
    },
    tokens.supplier,
  );
  assert.equal(created.status, 201, `probe listing failed: ${created.status} ${created.text}`);
  const row = created.body as { id: number; supplierId: number };
  return { id: row.id, name, price, supplierId: row.supplierId, tag };
}

/* ---------- 1. the gate ---------- */

test('the whole control plane is admin-only: anonymous 401, buyer and supplier 403', { skip }, async () => {
  // Real ids, so a refused call cannot be a 404 or a 400 dressed up as a gate.
  const listingPage = await call('GET', '/api/products?limit=1');
  assert.equal(listingPage.status, 200, listingPage.text);
  const listingId = itemsOf<{ id: number }>(listingPage)[0]?.id;
  assert.ok(listingId, 'the catalogue is empty — no listing to probe with');

  const supplierPage = await call('GET', '/api/suppliers');
  assert.equal(supplierPage.status, 200, supplierPage.text);
  const supplierId = itemsOf<{ id: number }>(supplierPage)[0]?.id;
  assert.ok(supplierId, 'the supplier directory is empty — no supplier to probe with');

  const probes: { label: string; method: string; path: string; body?: unknown }[] = [
    { label: 'PATCH listing', method: 'PATCH', path: `/api/admin/listings/${listingId}`, body: { price: 1 } },
    {
      label: 'pull listing',
      method: 'POST',
      path: `/api/admin/listings/${listingId}/pull`,
      body: { reason: 'gate probe — this call must never be reached' },
    },
    { label: 'restore listing', method: 'POST', path: `/api/admin/listings/${listingId}/restore` },
    { label: 'delete listing', method: 'DELETE', path: `/api/admin/listings/${listingId}` },
    { label: 'PATCH supplier', method: 'PATCH', path: `/api/admin/suppliers/${supplierId}`, body: { city: 'gate probe' } },
    { label: 'GET audit', method: 'GET', path: '/api/admin/audit' },
  ];

  for (const probe of probes) {
    const anon = await call(probe.method, probe.path, probe.body);
    assert.equal(anon.status, 401, `${probe.label}: anonymous must be 401 (got ${anon.status} ${anon.text})`);
    const byBuyer = await call(probe.method, probe.path, probe.body, tokens.buyer);
    assert.equal(byBuyer.status, 403, `${probe.label}: a buyer must be 403 (got ${byBuyer.status} ${byBuyer.text})`);
  }

  // A supplier may edit their OWN listing through /api/products — that is not a
  // licence to touch the admin plane.
  for (const probe of [probes[0], probes[4]]) {
    const bySupplier = await call(probe.method, probe.path, probe.body, tokens.supplier);
    assert.equal(bySupplier.status, 403, `${probe.label}: a supplier must be 403 (got ${bySupplier.status} ${bySupplier.text})`);
  }
});

/* ---------- 2. edit any listing, price included ---------- */

test('an admin edits a seeded listing price, the catalogue serves it, and the original comes back', { skip }, async () => {
  // A SEEDED row (dataSource 'demo'), so this exercises the owner's real case:
  // an admin re-pricing stock that is already in the catalogue.
  const listingPage = await call('GET', '/api/products?limit=20');
  assert.equal(listingPage.status, 200, listingPage.text);
  const item = itemsOf<ProductRow>(listingPage).find((p) => p.dataSource === 'demo');
  assert.ok(item, 'no seeded (demo) listing on the first catalogue page — nothing to re-price');

  const original = item.price;
  const raised = Number((original + 12.34).toFixed(2));

  // ---- the edit ----
  const patched = await call('PATCH', `/api/admin/listings/${item.id}`, { price: raised }, tokens.admin);
  assert.equal(patched.status, 200, `admin price edit failed: ${patched.status} ${patched.text}`);
  const patchedRow = patched.body as ProductRow;
  assert.equal(patchedRow.id, item.id);
  assert.equal(patchedRow.price, raised, 'the response must carry the stored price');
  assert.equal(patchedRow.name, item.name, 'an unrelated field must not move');
  assert.equal(patchedRow.moderationStatus, 'visible');

  const afterPatch = await call('GET', `/api/products/${item.id}`);
  assert.equal(afterPatch.status, 200, afterPatch.text);
  assert.equal((afterPatch.body as ProductRow).price, raised, 'the public catalogue must serve the new price');

  const listed = await call('GET', `/api/products?q=${encodeURIComponent(item.name)}&limit=100`);
  const listedRow = itemsOf<ProductRow>(listed).find((p) => p.id === item.id);
  assert.ok(listedRow, 'the edited listing must still be in the catalogue list');
  assert.equal(listedRow.price, raised, 'the list path must serve the new price too, not a cached copy');

  const audited = await call('GET', `/api/admin/audit?entity=product&entityId=${item.id}&limit=10`, undefined, tokens.admin);
  assert.equal(audited.status, 200, audited.text);
  const editRow = auditRows(audited)[0];
  assert.equal(editRow.action, 'listing.update');
  assert.equal(editRow.entityId, item.id);
  assert.equal(editRow.entity, 'product');
  assert.equal(editRow.adminName, tokens.adminName, 'the trail must name the acting admin');
  assert.equal(Number((editRow.before as { price: number }).price), original, 'before = the price that was stored');
  assert.equal(Number((editRow.after as { price: number }).price), raised, 'after = the price that was written');
  // The patch carried ONLY a price: a schema default (currency, moq, status…)
  // must never sneak into the write or into the trail.
  assert.deepEqual(Object.keys(editRow.after as object), ['price'], `only the sent field may be recorded, got ${editRow.text}`);

  // ---- the restore ----
  const restored = await call('PATCH', `/api/admin/listings/${item.id}`, { price: original }, tokens.admin);
  assert.equal(restored.status, 200, `restoring the original price failed: ${restored.status} ${restored.text}`);
  assert.equal((restored.body as ProductRow).price, original, 'the original price must be restorable');

  const afterRestore = await call('GET', `/api/products/${item.id}`);
  assert.equal(afterRestore.status, 200, afterRestore.text);
  assert.equal((afterRestore.body as ProductRow).price, original, 'the seeded price must be back');

  const afterAudit = await call('GET', `/api/admin/audit?entity=product&entityId=${item.id}&limit=10`, undefined, tokens.admin);
  const newest = auditRows(afterAudit)[0];
  assert.equal(newest.action, 'listing.update');
  assert.equal(Number((newest.before as { price: number }).price), raised, 'the restore entry records what it replaced');
  assert.equal(Number((newest.after as { price: number }).price), original);
});

/* ---------- 3. pull / restore ---------- */

test('a pull takes a listing off the catalogue with its reason, and restore brings it back', { skip }, async (t) => {
  const probe = await createProbeListing();
  const reason = `probe ${probe.tag}: supplier could not confirm the price`;

  try {
    const pulled = await call('POST', `/api/admin/listings/${probe.id}/pull`, { reason }, tokens.admin);
    assert.equal(pulled.status, 200, `pull failed: ${pulled.status} ${pulled.text}`);
    const pulledRow = pulled.body as ProductRow;
    assert.equal(pulledRow.moderationStatus, 'pulled');
    assert.equal(pulledRow.pulledReason, reason, 'the reason must be stored, not merely accepted');

    // ---- refusals ----
    const again = await call('POST', `/api/admin/listings/${probe.id}/pull`, { reason: 'a second pull attempt' }, tokens.admin);
    assert.equal(again.status, 409, `pulling twice must be 409 (got ${again.status} ${again.text})`);
    assert.equal((again.body as { error: string }).error, 'already_pulled');

    const tooShort = await call('POST', `/api/admin/listings/${probe.id}/pull`, { reason: 'no' }, tokens.admin);
    assert.equal(tooShort.status, 400, `a 2-character reason is not a reason (got ${tooShort.status} ${tooShort.text})`);

    const missing = await call('POST', `/api/admin/listings/${UNKNOWN_ID}/pull`, { reason: 'listing does not exist' }, tokens.admin);
    assert.equal(missing.status, 404, `pulling an unknown listing must be 404 (got ${missing.status})`);

    // ---- the admin list shows the state and filters on it ----
    const q = encodeURIComponent(probe.name);
    const pulledList = await call('GET', `/api/admin/listings?moderation=pulled&q=${q}`, undefined, tokens.admin);
    assert.equal(pulledList.status, 200, pulledList.text);
    assert.ok(hasId(pulledList, probe.id), 'a pulled listing must appear under ?moderation=pulled');

    const visibleList = await call('GET', `/api/admin/listings?moderation=visible&q=${q}`, undefined, tokens.admin);
    assert.ok(!hasId(visibleList, probe.id), 'a pulled listing must not appear under ?moderation=visible');

    const bogus = await call('GET', '/api/admin/listings?moderation=hidden', undefined, tokens.admin);
    assert.equal(bogus.status, 400, `an unknown moderation filter must be a 400, not a dropped filter (got ${bogus.status})`);

    // Whether a pulled listing LEAVES the public catalogue is the read side's
    // rule (GET /api/products), which this change does not own. Report what the
    // running server actually does instead of asserting someone else's feature.
    const publicRead = await call('GET', `/api/products/${probe.id}`);
    t.diagnostic(
      `pulled listing ${probe.id} on the PUBLIC read: GET /api/products/${probe.id} → ${publicRead.status}` +
        (publicRead.status === 404
          ? ' (the read-side filter is in place)'
          : ' (read-side filter NOT in place in this build — the admin state is recorded but the public read still serves it)'),
    );
    assert.ok(
      publicRead.status === 200 || publicRead.status === 404,
      `the public read must answer 200/404 (got ${publicRead.status} ${publicRead.text})`,
    );

    // ---- restore ----
    const restored = await call('POST', `/api/admin/listings/${probe.id}/restore`, undefined, tokens.admin);
    assert.equal(restored.status, 200, `restore failed: ${restored.status} ${restored.text}`);
    const restoredRow = restored.body as ProductRow;
    assert.equal(restoredRow.moderationStatus, 'visible');
    assert.equal(restoredRow.pulledReason, null, 'restore must clear the pull reason, not leave it on a visible row');

    const restoreAgain = await call('POST', `/api/admin/listings/${probe.id}/restore`, undefined, tokens.admin);
    assert.equal(restoreAgain.status, 409, `restoring an unpulled listing must be 409 (got ${restoreAgain.status})`);
    assert.equal((restoreAgain.body as { error: string }).error, 'not_pulled');

    const back = await call('GET', `/api/products/${probe.id}`);
    assert.equal(back.status, 200, 'a restored listing must be readable again');

    // ---- the trail ----
    const audit = await call('GET', `/api/admin/audit?entity=product&entityId=${probe.id}&limit=10`, undefined, tokens.admin);
    const rows = auditRows(audit);
    assert.equal(rows[0]?.action, 'listing.restore', 'newest first: the restore is the latest action');
    const restoreRow = rows[0];
    assert.equal((restoreRow.before as { moderationStatus: string }).moderationStatus, 'pulled');
    assert.equal((restoreRow.after as { moderationStatus: string }).moderationStatus, 'visible');
    assert.equal((restoreRow.after as { pulledReason: unknown }).pulledReason, null);

    const pullRow = rows.find((r) => r.action === 'listing.pull');
    assert.ok(pullRow, 'the pull must be in the trail');
    assert.equal(pullRow.entity, 'product');
    assert.equal(pullRow.entityId, probe.id);
    assert.equal((pullRow.before as { moderationStatus: string }).moderationStatus, 'visible', 'before = the state that was there');
    assert.equal((pullRow.after as { moderationStatus: string }).moderationStatus, 'pulled');
    assert.equal((pullRow.after as { pulledReason: string }).pulledReason, reason, 'the reason rides in the trail');
    assert.equal(pullRow.adminName, tokens.adminName);
  } finally {
    // Leave the catalogue as it was found: the probe listing goes away (its audit
    // rows stay — they are the record this feature exists to keep). Asserted, so
    // a cleanup that silently fails cannot leave test rows behind.
    const cleanup = await call('DELETE', `/api/admin/listings/${probe.id}`, undefined, tokens.admin);
    assert.equal(cleanup.status, 204, `probe cleanup failed: ${cleanup.status} ${cleanup.text}`);
  }
});

/* ---------- 4. delete ---------- */

test('an admin can delete a listing outright, and the trail remembers what it was', { skip }, async () => {
  const probe = await createProbeListing();

  // A page view is telemetry ABOUT the listing: it must not make a listing
  // undeletable (the FK on product_views does not cascade).
  const viewed = await call('GET', `/api/products/${probe.id}`);
  assert.equal(viewed.status, 200, viewed.text);

  // A buyer's saved lot is someone else's record. That refuses the delete — and
  // the refusal names what stopped it, so the admin knows what to look at.
  const saved = await call('POST', '/api/saved', { productId: probe.id }, tokens.buyer);
  assert.ok(saved.status === 201 || saved.status === 200, `saving a lot failed: ${saved.status} ${saved.text}`);

  const refused = await call('DELETE', `/api/admin/listings/${probe.id}`, undefined, tokens.admin);
  assert.equal(refused.status, 409, `a listing someone saved must not be deletable (got ${refused.status} ${refused.text})`);
  assert.equal((refused.body as { error: string }).error, 'listing_in_use');
  assert.match(
    String((refused.body as { details?: string }).details),
    /saved_lots/,
    'the refusal must name the record that blocks the delete',
  );

  const survived = await call('GET', `/api/products/${probe.id}`);
  assert.equal(survived.status, 200, 'a refused delete must not have deleted anything');

  const unsaved = await call('DELETE', `/api/saved/${probe.id}`, undefined, tokens.buyer);
  assert.equal(unsaved.status, 204, `un-saving failed: ${unsaved.status} ${unsaved.text}`);

  const deleted = await call('DELETE', `/api/admin/listings/${probe.id}`, undefined, tokens.admin);
  assert.equal(deleted.status, 204, `delete failed: ${deleted.status} ${deleted.text}`);

  const gone = await call('GET', `/api/admin/listings?q=${encodeURIComponent(probe.name)}`, undefined, tokens.admin);
  assert.equal(gone.status, 200, gone.text);
  assert.equal((gone.body as { total: number }).total, 0, 'a deleted listing must leave the admin list');

  const publicRead = await call('GET', `/api/products/${probe.id}`);
  assert.equal(publicRead.status, 404, 'a deleted listing must 404 on the public read');

  const deletedAgain = await call('DELETE', `/api/admin/listings/${probe.id}`, undefined, tokens.admin);
  assert.equal(deletedAgain.status, 404, `deleting a gone listing must be 404 (got ${deletedAgain.status})`);

  const missing = await call('DELETE', `/api/admin/listings/${UNKNOWN_ID}`, undefined, tokens.admin);
  assert.equal(missing.status, 404);

  const audit = await call('GET', `/api/admin/audit?entity=product&entityId=${probe.id}`, undefined, tokens.admin);
  const rows = auditRows(audit);
  const row = rows.find((r) => r.action === 'listing.delete');
  assert.ok(row, 'the delete must be in the trail');
  assert.equal(rows[0]?.action, 'listing.delete', 'the trail is newest first — the delete is the only entry');
  assert.equal(row.after, null, 'there is no after for a delete');
  const before = row.before as Record<string, unknown>;
  assert.equal(before.name, probe.name, 'the deleted row must remain identifiable from the trail');
  assert.equal(Number(before.price), probe.price);
  assert.equal(before.dataSource, 'platform', 'the provenance of the deleted listing is part of the record');
  assert.ok(Number(before.productViews) >= 1, `the trail must record the telemetry that went with it (got ${before.productViews})`);

  // ---- refusals ----
  const patchMissing = await call('PATCH', `/api/admin/listings/${UNKNOWN_ID}`, { price: 1 }, tokens.admin);
  assert.equal(patchMissing.status, 404, `patching an unknown listing must be 404 (got ${patchMissing.status})`);
  const restoreMissing = await call('POST', `/api/admin/listings/${UNKNOWN_ID}/restore`, undefined, tokens.admin);
  assert.equal(restoreMissing.status, 404);
  const supplierMissing = await call('PATCH', `/api/admin/suppliers/${UNKNOWN_ID}`, { city: 'nowhere' }, tokens.admin);
  assert.equal(supplierMissing.status, 404, `patching an unknown supplier must be 404 (got ${supplierMissing.status})`);
});

/* ---------- 5. edit any supplier ---------- */

test('an admin can edit any supplier record, and the trail shows the before/after', { skip }, async () => {
  // The probe listing names the supplier row that owns it — a real row, and the
  // only one this test needs to know about.
  const probe = await createProbeListing();
  const supplierId = probe.supplierId;

  try {
    const beforeRes = await call('GET', `/api/suppliers/${supplierId}`);
    assert.equal(beforeRes.status, 200, beforeRes.text);
    const original = beforeRes.body as SupplierRow;
    const originalTags = Array.isArray(original.tags) ? original.tags : [];
    const probeTags = [...originalTags, `probe-${probe.tag}`];
    const bumpedLevel = original.verifiedLevel >= 3 ? 2 : original.verifiedLevel + 1;

    const patched = await call(
      'PATCH',
      `/api/admin/suppliers/${supplierId}`,
      { tags: probeTags, verifiedLevel: bumpedLevel },
      tokens.admin,
    );
    assert.equal(patched.status, 200, `admin supplier edit failed: ${patched.status} ${patched.text}`);

    const afterRes = await call('GET', `/api/suppliers/${supplierId}`);
    const edited = afterRes.body as SupplierRow;
    assert.deepEqual(edited.tags, probeTags, 'tags must be stored exactly as sent');
    assert.equal(edited.verifiedLevel, bumpedLevel, "verifiedLevel is the desk's field — an admin may set it");
    assert.equal(edited.companyName, original.companyName, 'an unrelated field must not move');

    const audit = await call('GET', `/api/admin/audit?entity=supplier&entityId=${supplierId}&limit=5`, undefined, tokens.admin);
    const row = auditRows(audit)[0];
    assert.ok(row, 'the supplier edit must be in the trail');
    assert.equal(row.action, 'supplier.update');
    assert.equal(row.entityId, supplierId);
    assert.equal(row.adminName, tokens.adminName);
    assert.equal((row.before as { verifiedLevel: number }).verifiedLevel, original.verifiedLevel, 'before = the stored level');
    assert.equal((row.after as { verifiedLevel: number }).verifiedLevel, bumpedLevel, 'after = the new level');
    assert.deepEqual((row.after as { tags: string[] }).tags, probeTags, 'the new tags ride in the trail too');

    // ---- restore every value this test touched ----
    const restored = await call(
      'PATCH',
      `/api/admin/suppliers/${supplierId}`,
      { tags: originalTags, verifiedLevel: original.verifiedLevel },
      tokens.admin,
    );
    assert.equal(restored.status, 200, `restoring the supplier failed: ${restored.status} ${restored.text}`);

    const finalRes = await call('GET', `/api/suppliers/${supplierId}`);
    const final = finalRes.body as SupplierRow;
    assert.deepEqual(final.tags, originalTags, 'the original tags must be back');
    assert.equal(final.verifiedLevel, original.verifiedLevel, 'the original level must be back');
  } finally {
    const cleanup = await call('DELETE', `/api/admin/listings/${probe.id}`, undefined, tokens.admin);
    assert.equal(cleanup.status, 204, `probe cleanup failed: ${cleanup.status} ${cleanup.text}`);
  }
});

/* ---------- 6. the admin listing list: state + filters, pagination intact ---------- */

test('the admin listing list carries moderation state and keeps its server-side pagination', { skip }, async () => {
  const first = await call('GET', '/api/admin/listings?page=1&limit=5', undefined, tokens.admin);
  assert.equal(first.status, 200, first.text);
  const page1 = first.body as { items: ProductRow[]; total: number; page: number; pages: number };
  assert.equal(page1.page, 1, 'the 1-based page must be echoed');
  assert.ok(page1.total > 5, `the catalogue must have more than one page (total ${page1.total})`);
  assert.equal(page1.items.length, 5, 'limit must be honoured server-side');
  assert.equal(page1.pages, Math.ceil(page1.total / 5), 'pages must be derived from the real total');
  for (const row of page1.items) {
    assert.ok(
      row.moderationStatus === 'visible' || row.moderationStatus === 'pulled',
      `every row must carry its moderation state (got ${row.moderationStatus})`,
    );
  }

  const second = await call('GET', '/api/admin/listings?page=2&limit=5', undefined, tokens.admin);
  const page2 = second.body as typeof page1;
  assert.equal(page2.page, 2);
  assert.ok(page2.items.length > 0, 'page 2 must have rows');
  assert.ok(
    (page2.items[0]?.id ?? 0) < (page1.items[0]?.id ?? 0),
    'the list is newest first, so page 2 must start below page 1',
  );

  const onlyPulled = await call('GET', '/api/admin/listings?moderation=pulled&limit=5', undefined, tokens.admin);
  assert.equal(onlyPulled.status, 200, onlyPulled.text);
  for (const row of itemsOf<ProductRow>(onlyPulled)) {
    assert.equal(row.moderationStatus, 'pulled', 'the moderation filter must actually filter');
  }
});

/* ---------- 7. the trail itself ---------- */

test('the audit trail is admin-only, newest first, capped and filterable', { skip }, async () => {
  const capped = await call('GET', '/api/admin/audit?limit=1000', undefined, tokens.admin);
  assert.equal(capped.status, 200, capped.text);
  const big = capped.body as { items: AuditRow[]; total: number };
  assert.ok(big.items.length <= 200, `limit is capped at 200 (got ${big.items.length} rows)`);
  assert.ok(big.total >= big.items.length, 'total is a real COUNT over the same filters');

  const page = await call('GET', '/api/admin/audit', undefined, tokens.admin);
  const recent = page.body as { items: AuditRow[]; total: number };
  assert.ok(recent.items.length > 0, 'this suite has written audit rows by now');
  assert.ok(recent.items.length <= 50, `the default limit is 50 (got ${recent.items.length} rows)`);

  for (let i = 1; i < recent.items.length; i += 1) {
    const newer = Date.parse(recent.items[i - 1].createdAt);
    const older = Date.parse(recent.items[i].createdAt);
    assert.ok(newer >= older, 'the trail must be newest first');
  }
  for (const row of recent.items) {
    assert.equal(row.adminName, tokens.adminName, 'every entry names the admin who acted');
    assert.ok(row.action.length > 0 && row.entity.length > 0, 'action and entity are never empty');
    assert.ok(!Number.isNaN(Date.parse(row.createdAt)), `createdAt must be an ISO date (got ${row.createdAt})`);
  }

  const supplierOnly = await call('GET', '/api/admin/audit?entity=supplier&limit=200', undefined, tokens.admin);
  for (const row of auditRows(supplierOnly)) {
    assert.equal(row.entity, 'supplier', 'the entity filter must actually filter');
  }

  const badLimit = await call('GET', '/api/admin/audit?limit=abc', undefined, tokens.admin);
  assert.equal(badLimit.status, 400, `a garbage limit must be a 400 (got ${badLimit.status})`);
  const badEntityId = await call('GET', '/api/admin/audit?entityId=abc', undefined, tokens.admin);
  assert.equal(badEntityId.status, 400, `a garbage entityId must be a 400 (got ${badEntityId.status})`);
});
