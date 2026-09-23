/**
 * Product Q&A integration tests — run against a BOOTED api-server.
 *
 *   TEST_BASE_URL=http://localhost:9095 node --import tsx --test test/questions.test.ts
 *
 * Skipped when TEST_BASE_URL is unset, exactly like api.test.ts, so a developer
 * with no server running gets a clean skip instead of connection errors.
 *
 * The suite proves the four rules the feature exists for:
 *   1. the public sees a question only AFTER the seller answered it — a pending
 *      question is visible to its asker, nobody else (anonymous or registered);
 *   2. only the supplier who OWNS the listing may answer it — a different
 *      supplier gets 403, and so does the asker answering their own question;
 *   3. the moderation queue is admin-only.
 *   4. moderation is a status change, never a deletion: an admin can hide an
 *      answered question (it leaves the public list) and republish it with the
 *      original answer intact, but publishing an UNANSWERED question is refused
 *      (409) — 'answered' is what makes a question public.
 *
 * Every row it creates hangs off a throwaway listing that the owning supplier
 * deletes at the end (product_questions cascades on product delete), and the
 * accounts the file registered are deleted in `after()` — a local run leaves the
 * database as it found it.
 *
 * The moderation test needs a real admin. No API mints one (registration refuses
 * `role:'admin'`), and the seeded demo admin is not a fixture of this suite, so a
 * fresh registration is promoted through the database (`UPDATE users SET
 * role='admin'`) — a real admin, exactly like the console's. Registration returns
 * the token, so no login is spent (the login bucket stays where it belongs).
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from 'pg';

const BASE = process.env.TEST_BASE_URL;
const skip = BASE ? false : 'TEST_BASE_URL not set — skipping integration tests';
const DB_URL =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/factorydepo';

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
  name: string;
}

/** Accounts this file created; removed in `after()`. */
const createdUserIds: number[] = [];

/** Run `fn` against the local DB; null when it is not reachable. */
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

async function register(role: 'buyer' | 'supplier', tag: string): Promise<Auth> {
  const email = `qa-${role}-${tag}@factorydepo.test`;
  const name = `QA ${role} ${tag}`;
  const r = await call('POST', '/api/auth/register', {
    name,
    email,
    password: 'integration-test-password',
    role,
    company: `QA ${tag} Ltd`,
    country: 'Türkiye',
  });
  assert.equal(r.status, 201, `register ${role} failed: ${r.status} ${r.text}`);
  const b = r.body as { token: string; user: { id: number } };
  createdUserIds.push(b.user.id);
  return { token: b.token, id: b.user.id, email, name };
}

/** A throwaway listing owned by `supplier`, so the Q&A below has a home. */
async function createListing(supplier: Auth, tag: string): Promise<number> {
  const created = await call(
    'POST',
    '/api/products',
    {
      name: `QA probe listing ${tag}`,
      category: 'Machinery',
      description: 'created by the product Q&A integration test',
      price: 250,
      currency: 'USD',
      unit: 'Set',
      moq: 1,
      quantityAvailable: 5,
      originCountry: 'Türkiye',
    },
    supplier.token,
  );
  assert.equal(created.status, 201, `probe listing failed: ${created.status} ${created.text}`);
  return (created.body as { id: number }).id;
}

interface QuestionRow {
  id: number;
  productId: number;
  question: string;
  askerName: string;
  askedAt: string;
  answer: string | null;
  answeredAt: string | null;
  answeredByName: string | null;
  status: string;
}

const items = (r: Res): QuestionRow[] => (r.body as { items: QuestionRow[] }).items;
const contains = (r: Res, id: number): boolean => items(r).some((q) => q.id === id);

test('an anonymous caller cannot ask a question', { skip }, async () => {
  const r = await call('POST', '/api/products/1/questions', {
    question: 'Is this lot still available in the listed quantity?',
  });
  assert.equal(r.status, 401, `expected 401, got ${r.status} ${r.text}`);
});

test('asking about an unknown listing is a 404, not an orphan row', { skip }, async () => {
  const buyer = await register('buyer', uniq());
  const r = await call(
    'POST',
    '/api/products/2147483000/questions',
    { question: 'Does this listing exist at all?' },
    buyer.token,
  );
  assert.equal(r.status, 404, `expected 404, got ${r.status} ${r.text}`);
});

test('a question is too short to be one', { skip }, async () => {
  const buyer = await register('buyer', uniq());
  const supplier = await register('supplier', uniq());
  const productId = await createListing(supplier, uniq());

  const short = await call('POST', `/api/products/${productId}/questions`, { question: 'price?' }, buyer.token);
  assert.equal(short.status, 400, `expected 400 for a 6-character question, got ${short.status} ${short.text}`);

  const ok = await call(
    'POST',
    `/api/products/${productId}/questions`,
    { question: '   What is the minimum order quantity?   ' },
    buyer.token,
  );
  assert.equal(ok.status, 201, `expected 201, got ${ok.status} ${ok.text}`);
  assert.equal(
    (ok.body as QuestionRow).question,
    'What is the minimum order quantity?',
    'the stored question must be the trimmed text',
  );

  await call('DELETE', `/api/products/${productId}`, undefined, supplier.token);
});

test('only the owning supplier can answer, and only answered questions are public', { skip }, async () => {
  const tag = uniq();
  const owner = await register('supplier', `owner${tag}`);
  const rival = await register('supplier', `rival${tag}`);
  const asker = await register('buyer', `asker${tag}`);
  const stranger = await register('buyer', `stranger${tag}`);
  const productId = await createListing(owner, tag);

  // A brand-new listing has no questions — the counter cannot be inherited.
  const before = await call('GET', `/api/products/${productId}/questions`);
  assert.equal(before.status, 200, before.text);
  assert.equal((before.body as { total: number }).total, 0, 'a fresh listing starts with an empty Q&A');

  // ---- ask ----
  const question = `Does this lot ship in 20ft containers, tag ${tag}?`;
  const asked = await call('POST', `/api/products/${productId}/questions`, { question }, asker.token);
  assert.equal(asked.status, 201, `ask failed: ${asked.status} ${asked.text}`);
  const row = asked.body as QuestionRow;
  const qid = row.id;
  assert.equal(row.status, 'pending', `a new question must be pending, got ${row.status}`);
  assert.equal(row.answer, null, 'a pending question has no answer');
  assert.equal(row.answeredAt, null);
  assert.equal(row.answeredByName, null);
  assert.equal(row.productId, productId);
  assert.equal(row.question, question);
  assert.equal(row.askerName, asker.name, "askerName must be a snapshot of the caller's name");
  assert.ok(!Number.isNaN(Date.parse(row.askedAt)), `askedAt must be an ISO date, got ${row.askedAt}`);

  // ---- pending is private ----
  const anon = await call('GET', `/api/products/${productId}/questions`);
  assert.equal(anon.status, 200);
  assert.equal((anon.body as { total: number }).total, 0, 'a pending question must not be public');
  assert.ok(!contains(anon, qid), 'the anonymous listing has the pending question in it');

  const otherBuyer = await call('GET', `/api/products/${productId}/questions`, undefined, stranger.token);
  assert.equal(otherBuyer.status, 200);
  assert.ok(!contains(otherBuyer, qid), 'another buyer must not see someone else\'s pending question');

  const mine = await call('GET', `/api/products/${productId}/questions`, undefined, asker.token);
  assert.equal(mine.status, 200);
  const ownRow = items(mine).find((q) => q.id === qid);
  assert.ok(ownRow, 'the asker must still see their own pending question');
  assert.equal(ownRow.status, 'pending');

  // ---- only the owner may answer ----
  const byRival = await call(
    'POST',
    `/api/products/${productId}/questions/${qid}/answer`,
    { answer: 'Sure, we can ship that for you.' },
    rival.token,
  );
  assert.equal(byRival.status, 403, `another supplier must not answer (got ${byRival.status} ${byRival.text})`);

  const byAsker = await call(
    'POST',
    `/api/products/${productId}/questions/${qid}/answer`,
    { answer: 'Answering my own question here.' },
    asker.token,
  );
  assert.equal(byAsker.status, 403, `a buyer must never answer their own question (got ${byAsker.status} ${byAsker.text})`);

  const anonAnswer = await call('POST', `/api/products/${productId}/questions/${qid}/answer`, { answer: 'Anonymous.' });
  assert.equal(anonAnswer.status, 401, `anonymous answering must be 401, got ${anonAnswer.status}`);

  // ---- the owner answers ----
  const answer = `Yes — 22 pallets fit a 20ft container, tag ${tag}.`;
  const answered = await call(
    'POST',
    `/api/products/${productId}/questions/${qid}/answer`,
    { answer },
    owner.token,
  );
  assert.equal(answered.status, 200, `owner answer failed: ${answered.status} ${answered.text}`);
  const answeredRow = answered.body as QuestionRow;
  assert.equal(answeredRow.status, 'answered');
  assert.equal(answeredRow.answer, answer);
  assert.equal(answeredRow.answeredByName, `QA owner${tag} Ltd`, 'the answer is attributed to the supplier company');
  assert.ok(answeredRow.answeredAt && !Number.isNaN(Date.parse(answeredRow.answeredAt)), 'answeredAt must be set');

  // ---- now it is public, with the answer ----
  const after = await call('GET', `/api/products/${productId}/questions`);
  assert.equal(after.status, 200);
  const publicRow = items(after).find((q) => q.id === qid);
  assert.ok(publicRow, 'the answered question must be public');
  assert.equal(publicRow.answer, answer);
  assert.equal(publicRow.status, 'answered');
  assert.equal(publicRow.askerName, asker.name, 'the public row keeps the asker name snapshot');
  assert.equal(publicRow.answeredByName, `QA owner${tag} Ltd`);
  assert.equal((after.body as { total: number }).total, 1);

  // An unknown question id on a known listing is a 404, not a 500.
  const missing = await call(
    'POST',
    `/api/products/${productId}/questions/2147483000/answer`,
    { answer: 'Answering a question that does not exist.' },
    owner.token,
  );
  assert.equal(missing.status, 404, `expected 404 for an unknown question, got ${missing.status}`);

  // ---- cleanup: the listing takes its questions with it (ON DELETE CASCADE) ----
  const cleanup = await call('DELETE', `/api/products/${productId}`, undefined, owner.token);
  assert.ok(cleanup.status === 204 || cleanup.status === 200, `cleanup failed: ${cleanup.status} ${cleanup.text}`);
});

test('the Q&A moderation queue is admin-only', { skip }, async () => {
  const buyer = await register('buyer', uniq());

  const list = await call('GET', '/api/admin/questions', undefined, buyer.token);
  assert.equal(list.status, 403, `a buyer must not read the moderation queue (got ${list.status})`);

  const patch = await call('PATCH', '/api/admin/questions/1', { status: 'hidden' }, buyer.token);
  assert.equal(patch.status, 403, `a buyer must not moderate (got ${patch.status})`);

  const anon = await call('GET', '/api/admin/questions');
  assert.equal(anon.status, 401, `anonymous must be 401, got ${anon.status}`);
});

/**
 * A real admin for the moderation calls: register a throwaway account, then
 * promote the row through the DB. `requireRole` reads `users.role` per request,
 * so the token issued at registration becomes an admin credential the moment the
 * row is promoted — no login, and no seeded account to depend on. The account is
 * deleted again in `after()`.
 */
async function makeAdmin(tag: string): Promise<string> {
  const account = await register('buyer', `admin${tag}`);
  const promoted = await withDb((c) =>
    c.query<{ id: number }>('UPDATE users SET role = $2 WHERE id = $1 RETURNING id', [account.id, 'admin']),
  );
  assert.ok(promoted, 'the local DB must be reachable to promote the test admin — the API itself needs that database');
  assert.equal(promoted.rowCount, 1, `promoting user ${account.id} to admin affected ${promoted.rowCount} rows`);
  return account.token;
}

test('an admin can hide and republish an answered question, but cannot publish an unanswered one', { skip }, async () => {
  const tag = uniq();
  const owner = await register('supplier', `mod${tag}`);
  const asker = await register('buyer', `modask${tag}`);
  const productId = await createListing(owner, tag);
  const admin = await makeAdmin(tag);

  try {
    const question = `Moderation probe, tag ${tag}: does this lot ship in 20ft containers?`;
    const asked = await call('POST', `/api/products/${productId}/questions`, { question }, asker.token);
    assert.equal(asked.status, 201, `ask failed: ${asked.status} ${asked.text}`);
    const qid = (asked.body as QuestionRow).id;

    const answer = `Moderation probe answer, tag ${tag}: yes, 22 pallets per 20ft container.`;
    const answered = await call(
      'POST',
      `/api/products/${productId}/questions/${qid}/answer`,
      { answer },
      owner.token,
    );
    assert.equal(answered.status, 200, `answer failed: ${answered.status} ${answered.text}`);

    const published = await call('GET', `/api/products/${productId}/questions`);
    assert.ok(contains(published, qid), 'the answered question must be public before moderation');

    // ---- the admin hides it: it leaves the public list ----
    const hide = await call('PATCH', `/api/admin/questions/${qid}`, { status: 'hidden' }, admin);
    assert.equal(hide.status, 200, `hiding failed: ${hide.status} ${hide.text}`);
    assert.equal((hide.body as QuestionRow).status, 'hidden');

    const afterHide = await call('GET', `/api/products/${productId}/questions`);
    assert.equal(afterHide.status, 200);
    assert.ok(!contains(afterHide, qid), 'a hidden question must not be public');
    assert.equal((afterHide.body as { total: number }).total, 0, 'the public list must be empty once hidden');

    // Suppression is not deletion — the owner still sees the row and its answer.
    const ownerView = await call('GET', `/api/products/${productId}/questions`, undefined, owner.token);
    const hiddenRow = items(ownerView).find((q) => q.id === qid);
    assert.ok(hiddenRow, 'the owning supplier must still see the hidden question');
    assert.equal(hiddenRow.status, 'hidden');
    assert.equal(hiddenRow.answer, answer, 'hiding must keep the answer text');

    // ---- the admin republishes it: the original answer comes back ----
    const republish = await call('PATCH', `/api/admin/questions/${qid}`, { status: 'answered' }, admin);
    assert.equal(republish.status, 200, `republishing failed: ${republish.status} ${republish.text}`);
    const republishedRow = republish.body as QuestionRow;
    assert.equal(republishedRow.status, 'answered');
    assert.equal(republishedRow.answer, answer, 'republishing must restore the answer, not a stub');

    const afterRepublish = await call('GET', `/api/products/${productId}/questions`);
    const back = items(afterRepublish).find((q) => q.id === qid);
    assert.ok(back, 'the republished question must be public again');
    assert.equal(back.answer, answer);
    assert.equal(back.answeredByName, `QA mod${tag} Ltd`, 'republishing must keep the original attribution');

    // ---- an UNANSWERED question cannot be published (409) ----
    const second = await call(
      'POST',
      `/api/products/${productId}/questions`,
      { question: `Moderation probe 2, tag ${tag}: what is the minimum order quantity?` },
      asker.token,
    );
    assert.equal(second.status, 201, `second ask failed: ${second.status} ${second.text}`);
    const secondId = (second.body as QuestionRow).id;

    const refused = await call('PATCH', `/api/admin/questions/${secondId}`, { status: 'answered' }, admin);
    assert.equal(
      refused.status,
      409,
      `publishing an unanswered question must be refused with 409 (got ${refused.status} ${refused.text})`,
    );
    assert.equal((refused.body as { error: string }).error, 'unanswered_question');

    // …and the refusal left it unpublished: a 409 that still showed the row would
    // be the same defect with a nicer status code.
    const stillPrivate = await call('GET', `/api/products/${productId}/questions`);
    assert.ok(!contains(stillPrivate, secondId), 'a refused publication must not appear anyway');

    // Hiding an unanswered question is allowed — moderation must be able to
    // suppress junk that has no answer to preserve.
    const hideUnanswered = await call('PATCH', `/api/admin/questions/${secondId}`, { status: 'hidden' }, admin);
    assert.equal(hideUnanswered.status, 200, `hiding an unanswered question failed: ${hideUnanswered.status}`);
  } finally {
    // product_questions cascades on product delete — the file leaves no rows.
    await call('DELETE', `/api/products/${productId}`, undefined, owner.token);
  }
});

/* ---------- the file's own cleanup ---------- */

/**
 * Fixture cleanup: the throwaway accounts this file registered are deleted, in
 * foreign-key order (no delete-account route exists, deliberately). The listings
 * the tests created are already gone — the products and suppliers deletes below
 * are the safety net for a run that failed halfway, and product_questions
 * cascades with its listing. Everything is asserted, so a half-done cleanup
 * fails loudly instead of leaving test accounts behind.
 */
after(async () => {
  if (!BASE) return;
  const state = await withDb(async (c) => {
    await c.query(
      `DELETE FROM product_views WHERE "productId" IN (
         SELECT id FROM products WHERE "supplierId" IN (SELECT id FROM suppliers WHERE "userId" = ANY($1::int[]))
       )`,
      [createdUserIds],
    );
    await c.query(
      `DELETE FROM products WHERE "supplierId" IN (SELECT id FROM suppliers WHERE "userId" = ANY($1::int[]))`,
      [createdUserIds],
    );
    await c.query('DELETE FROM saved_lots WHERE "userId" = ANY($1::int[])', [createdUserIds]);
    await c.query('DELETE FROM product_views WHERE "userId" = ANY($1::int[])', [createdUserIds]);
    await c.query('DELETE FROM notifications WHERE "userId" = ANY($1::int[])', [createdUserIds]);
    await c.query('DELETE FROM suppliers WHERE "userId" = ANY($1::int[])', [createdUserIds]);
    const removed = await c.query<{ id: number }>('DELETE FROM users WHERE id = ANY($1::int[]) RETURNING id', [
      createdUserIds,
    ]);
    const left = await c.query<{ n: number }>('SELECT count(*)::int AS n FROM users WHERE id = ANY($1::int[])', [
      createdUserIds,
    ]);
    return { removedUsers: removed.rows.length, usersLeft: Number(left.rows[0]?.n ?? -1) };
  });

  assert.ok(state, "the local DB must be reachable to clean up this file's fixtures");
  assert.equal(state.removedUsers, createdUserIds.length, 'every account this file created must be deleted');
  assert.equal(state.usersLeft, 0, 'no test account may survive the run');
});
