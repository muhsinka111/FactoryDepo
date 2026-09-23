/**
 * Imported-listing titles — POST /api/imports/title (owner directive 2026-09-22).
 *
 *   cd artifacts/api-server
 *   TEST_BASE_URL=http://localhost:9095 node --import tsx --test test/title.test.ts
 *
 * Skipped when TEST_BASE_URL is unset, exactly like api.test.ts / shop.test.ts.
 *
 * What this file proves (each an owner-facing rule, not a smoke test):
 *   1. auth is not optional on a call that costs money: anonymous 401, buyer 403,
 *      supplier 200.
 *   2. a body the contract rejects is a 400 — never a 500 and never a silent
 *      partial answer.
 *   3. with no AI key configured the deterministic composer answers: engine
 *      'fallback', a usable title built only from the record's own facts, and a
 *      note that says why.
 *   4. a source page smuggling a marketplace name, a superlative, an
 *      unverifiable certificate or a price cannot get any of it into the answer.
 *   5. uniqueness is checked against the live catalogue: a name that already
 *      exists is reported in `duplicateOf` and the returned title is made
 *      genuinely distinct from it (the row this test creates is deleted again).
 *   6. an unavailable provider is a NOTE, not a failed request: this file boots a
 *      throwaway API instance (on its own port, from source, against the same DB)
 *      with a mock OpenAI-compatible provider, and a second one pointed at an
 *      unroutable host — both must answer 200.
 *   7. the rules hold on the model's OWN answer: a naughty completion is repaired
 *      or rejected, never trusted (checked against the engine with an injected
 *      provider, so the assertion is deterministic instead of depending on what
 *      a real model feels like saying).
 *   8. a catalogue row that shares only a model number and a spec phrase with our
 *      title is still a duplicate (partial overlap), and the title comes back
 *      distinct from it — while a genuinely unrelated product stays `unique:true`.
 *   9. `variant` changes the composed title, so "Regenerate" is not a no-op when
 *      no AI key is configured.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:http';
import { connect, type AddressInfo } from 'node:net';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  catalogueProbe,
  catalogueProbes,
  composeTitle,
  generateTitle,
  repairTitle,
  type CatalogueLookup,
  type TitleInput,
} from '../src/ai/title.js';

const BASE = process.env.TEST_BASE_URL;
const skip = BASE ? false : 'TEST_BASE_URL not set — skipping integration tests';
const API_DIR = fileURLToPath(new URL('..', import.meta.url));

/**
 * Where the integration tests talk to. Normally TEST_BASE_URL. A running server
 * can predate this route (it serves a build made before the feature), in which
 * case this file boots the same source on a throwaway port instead of pretending
 * a 404 is a test failure — see `liveBase()`.
 */
let activeBase: string | undefined = BASE;

const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

interface Res {
  status: number;
  body: unknown;
  text: string;
}

async function call(method: string, pathname: string, body?: unknown, token?: string, base = activeBase): Promise<Res> {
  if (!base) throw new Error('no API base resolved — liveBase() must run first');
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${pathname}`, {
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
}

/** Register a throwaway account (memoized — the suite shares one IP bucket). */
async function register(role: 'buyer' | 'supplier', tag: string, base = activeBase): Promise<Auth> {
  const r = await call('POST', '/api/auth/register', {
    name: `Title ${role} ${tag}`,
    email: `title-${role}-${tag}@factorydepo.test`,
    password: 'integration-test-password',
    role,
    company: `Title ${tag} Ltd`,
    country: 'Türkiye',
  }, undefined, base);
  assert.equal(r.status, 201, `register ${role} failed: ${r.status} ${r.text}`);
  const b = r.body as { token: string; user: { id: number } };
  return { token: b.token, id: b.user.id };
}

let supplier: Auth | null = null;
let buyer: Auth | null = null;
const sup = async () => (supplier ??= await register('supplier', `s${uniq()}`));
const buy = async () => (buyer ??= await register('buyer', `b${uniq()}`));

/* One shared body shape: a sourced industrial listing with marketing copy on it. */
function titleBody(tag: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sourceTitle: `Alibaba Best Price 100% guarantee ISO certified ${tag} Industrial Ice Machine for cold storage`,
    category: 'Machinery',
    originCountry: 'CN',
    unit: 'Set',
    spec: [`${tag} kg/day`, 'stainless steel'],
    keywords: ['block ice'],
    description: 'Factory direct! Cheap price, hot sale, contact us for the best quotation.',
    ...extra,
  };
}

/**
 * Independent of the module's own lexicon on purpose: a title is only "clean"
 * if these do not appear, whatever src/ai/title.ts believes. `specText` is the
 * record's own spec: the certification rule is conditional on it (a standard the
 * spec carries IS a fact and may appear).
 */
const FORBIDDEN: { re: RegExp; what: string; allowWhenSpecHasIt?: boolean }[] = [
  { re: /alibaba|aliexpress|made-in-china|indiamart|dhgate|global sources|1688|taobao|amazon|ebay/i, what: 'source marketplace' },
  { re: /\bbest\b|#1|cheapest|top quality|highest quality|world[- ]class|premium/i, what: 'superlative' },
  { re: /100\s?%|\bguarantee/i, what: 'unverifiable claim' },
  { re: /\b(certified|certification|iso|ce|fda|rohs|sgs|tuv)\b/i, what: 'certificate the record does not carry', allowWhenSpecHasIt: true },
  { re: /[$€£₺¥]|\b(usd|eur|cny|rmb)\b/i, what: 'price/currency' },
  { re: /[!?]/i, what: 'sales punctuation' },
  { re: /[^\x20-\x7E]/, what: 'non-ASCII/emoji' },
  { re: /\s{2,}/, what: 'multiple spaces' },
];

function assertCleanTitle(title: string, specText = ''): void {
  assert.ok(typeof title === 'string' && title.length >= 2, `title must be usable, got ${JSON.stringify(title)}`);
  assert.ok(title.length <= 120, `title must be <= 120 chars, got ${title.length}: ${title}`);
  assert.equal(title, title.trim(), `title must not be padded: ${JSON.stringify(title)}`);
  assert.equal(title.split('\n').length, 1, `title must be one line: ${JSON.stringify(title)}`);
  for (const { re, what, allowWhenSpecHasIt } of FORBIDDEN) {
    if (allowWhenSpecHasIt && re.test(specText)) continue;
    assert.ok(!re.test(title), `title carries a ${what}: ${JSON.stringify(title)}`);
  }
  for (const token of title.split(/\s+/)) {
    const alpha = token.replace(/[^A-Za-z]/g, '');
    if (alpha.length >= 4 && alpha === alpha.toUpperCase()) {
      assert.fail(`title shouts in ALL CAPS ("${token}"): ${JSON.stringify(title)}`);
    }
  }
}

const CONTRACT_KEYS = ['duplicateOf', 'engine', 'note', 'title', 'unique'];

/* ==========================================================================
 * integration (live server)
 * ========================================================================== */

test('title: anonymous 401, buyer 403, supplier 200', { skip }, async (t) => {
  await liveBase(t);
  const anon = await call('POST', '/api/imports/title', titleBody('anon'));
  assert.equal(anon.status, 401, `anonymous must be 401 (got ${anon.status} ${anon.text})`);

  const b = await buy();
  const asBuyer = await call('POST', '/api/imports/title', titleBody('buyer'), b.token);
  assert.equal(asBuyer.status, 403, `a buyer must get 403 (got ${asBuyer.status} ${asBuyer.text})`);
  assert.equal((asBuyer.body as { error?: string })?.error, 'forbidden');

  const s = await sup();
  const asSupplier = await call('POST', '/api/imports/title', titleBody(`s${uniq()}`), s.token);
  assert.equal(asSupplier.status, 200, `a supplier must be served (got ${asSupplier.status} ${asSupplier.text})`);
});

test('title: a body the contract rejects is a 400, never a 500', { skip }, async (t) => {
  await liveBase(t);
  const s = await sup();

  const empty = await call('POST', '/api/imports/title', {}, s.token);
  assert.equal(empty.status, 400, `an empty body must be 400 (got ${empty.status} ${empty.text})`);
  assert.equal((empty.body as { error?: string })?.error, 'validation_error');

  const oversized = await call('POST', '/api/imports/title', { sourceTitle: 'x'.repeat(501) }, s.token);
  assert.equal(oversized.status, 400, `a 501-char sourceTitle must be 400 (got ${oversized.status} ${oversized.text})`);

  const tooManySpecs = await call(
    'POST',
    '/api/imports/title',
    titleBody('spec', { spec: Array.from({ length: 41 }, (_, i) => `spec ${i}`) }),
    s.token,
  );
  assert.equal(tooManySpecs.status, 400, `41 spec entries must be 400 (got ${tooManySpecs.status} ${tooManySpecs.text})`);

  const tooManyKeywords = await call(
    'POST',
    '/api/imports/title',
    titleBody('kw', { keywords: Array.from({ length: 13 }, (_, i) => `k${i}`) }),
    s.token,
  );
  assert.equal(tooManyKeywords.status, 400, `13 keywords must be 400 (got ${tooManyKeywords.status} ${tooManyKeywords.text})`);

  const badVariant = await call('POST', '/api/imports/title', titleBody('var', { variant: 99 }), s.token);
  assert.equal(badVariant.status, 400, `variant 99 must be 400 (got ${badVariant.status} ${badVariant.text})`);
});

test('title: with no AI key the composer answers, from the record, and says so', { skip }, async (t) => {
  await liveBase(t);
  const s = await sup();
  const tag = `zx${uniq()}`;
  const body = titleBody(tag);

  const r = await call('POST', '/api/imports/title', body, s.token);
  assert.equal(r.status, 200, `expected 200 (got ${r.status} ${r.text})`);
  const out = r.body as { title: string; engine: string; unique: boolean; duplicateOf: number | null; note: string };

  assert.deepEqual(Object.keys(out).sort(), CONTRACT_KEYS, 'the response must be exactly the contract shape');
  assert.equal(out.engine, 'fallback', `the test server has no AI key, so the composer must answer (got ${out.engine}: ${out.note})`);
  assert.match(out.note, /no ai key/i, `the note must name the real reason: ${out.note}`);
  assert.ok(out.note.length <= 300, `the note must fit the contract (${out.note.length} chars)`);
  assertCleanTitle(out.title, (body.spec as string[]).join(' '));

  // Built from THIS record, not invented: the type comes from the source title,
  // the spec values and the operator's term are in it, so the title is findable
  // by the product search (q matches name).
  assert.match(out.title, /Industrial Ice Machine/i, `the product type must come from the source title: ${out.title}`);
  assert.ok(out.title.includes(`${tag} kg/day`), `the concrete spec must be reflected: ${out.title}`);
  assert.ok(out.title.includes('stainless steel'), `the second spec must be reflected: ${out.title}`);
  assert.match(out.title, /block ice/i, `the operator's term must be reflected (searchability): ${out.title}`);
  assert.match(out.title, /\bCN\b/, `the origin must be reflected: ${out.title}`);
  assert.equal(out.duplicateOf, null, `nothing was compared against this unique tag: ${JSON.stringify(out)}`);

  // Regenerating the same record is stable: same record, same composer, same title.
  const again = await call('POST', '/api/imports/title', body, s.token);
  assert.equal((again.body as { title: string }).title, out.title, 'the composer is deterministic');
});

test('title: a smuggled brand, superlative and price cannot reach the answer', { skip }, async (t) => {
  await liveBase(t);
  const s = await sup();
  const smuggle: Record<string, unknown> = {
    sourceTitle: 'ALIBABA.COM BEST PRICE!!! #1 CHEAPEST 100% GUARANTEE ISO 9001 CE CERTIFIED Made-in-China Ice Machine - USD $2,500 only, free shipping',
    category: 'Machinery',
    originCountry: 'CN',
    unit: 'Set',
    spec: ['1000 kg/day', 'stainless steel'],
    keywords: ['block ice', 'Made-in-China'],
    description: 'Buy now! Alibaba gold supplier, world class quality, 5 ton/day capacity, hot sale.',
  };

  const r = await call('POST', '/api/imports/title', smuggle, s.token);
  assert.equal(r.status, 200, `expected 200 (got ${r.status} ${r.text})`);
  const out = r.body as { title: string; note: string };

  // The spec is what the certification rule is conditional on: this record's
  // spec carries no standard, so none may appear in the answer.
  assertCleanTitle(out.title, (smuggle.spec as string[]).join(' '));
  assert.ok(!/5\s?ton/i.test(out.title), `a number only the marketing copy carried must not be published: ${out.title}`);
  assert.ok(!/9001/.test(out.title), `a certificate the spec does not carry must not be published: ${out.title}`);
  // The product type still has to come through — this must not be an empty shell.
  assert.match(out.title, /Ice Machine/i, `the product type must survive the cleanup: ${out.title}`);
});

test('title: a name already in the catalogue is reported and the answer is made distinct', { skip }, async (t) => {
  await liveBase(t);
  const s = await sup();
  const tag = `uq${uniq()}`;
  const body: TitleInput = {
    sourceTitle: `Industrial Ice Machine ${tag} for cold storage`,
    category: 'Machinery',
    originCountry: 'CN',
    unit: 'Set',
    spec: [`${tag} kg/day`, 'stainless steel'],
    keywords: ['block ice'],
    variant: 0,
  };

  // (a) The probe is what the endpoint compares against the catalogue — mirrored
  // through the module's own function so the test cannot drift from the route.
  const probe = catalogueProbe(body);
  assert.ok(probe.length >= 3, `the probe must be usable: ${JSON.stringify(probe)}`);

  // (b) Nothing in the catalogue carries this tag yet.
  const before = await call('POST', '/api/imports/title', body, s.token);
  assert.equal(before.status, 200, `expected 200 (got ${before.status} ${before.text})`);
  const first = before.body as { title: string; unique: boolean; duplicateOf: number | null };
  assert.equal(first.unique, true, `a fresh tag cannot collide: ${JSON.stringify(first)}`);
  assert.equal(first.duplicateOf, null, `a fresh tag cannot collide: ${JSON.stringify(first)}`);

  // (c) Create the collision: a real listing whose name carries the probe.
  const created = await call('POST', '/api/products', {
    name: `${probe} stainless steel drum`,
    category: 'Machinery',
    description: 'title.test.ts uniqueness probe — deleted again by this test',
    price: 100,
    currency: 'USD',
    unit: 'Set',
    moq: 1,
    originCountry: 'CN',
    quantityAvailable: 1,
  }, s.token);
  assert.equal(created.status, 201, `probe listing failed: ${created.status} ${created.text}`);
  const rowId = (created.body as { id: number }).id;

  try {
    const after_ = await call('POST', '/api/imports/title', body, s.token);
    assert.equal(after_.status, 200, `expected 200 (got ${after_.status} ${after_.text})`);
    const second = after_.body as { title: string; unique: boolean; duplicateOf: number | null; note: string };

    assert.equal(second.duplicateOf, rowId, `the colliding row must be reported: ${JSON.stringify(second)}`);
    assert.equal(second.unique, true, `the answer must be made distinct when a fact allows it: ${JSON.stringify(second)}`);
    assert.notEqual(second.title, first.title, 'a colliding title must not be returned unchanged');
    assert.notEqual(
      second.title.toLowerCase(),
      `${probe} stainless steel drum`.toLowerCase(),
      'the answer must differ from the existing name',
    );

    // The API's own product search must not find that exact name again.
    const search = await call('GET', `/api/products?limit=100&q=${encodeURIComponent(second.title)}`);
    assert.equal(search.status, 200, `search failed: ${search.status} ${search.text}`);
    const items = (search.body as { items: { name: string }[] }).items ?? [];
    const clash = items.find((i) => i.name.toLowerCase() === second.title.toLowerCase());
    assert.equal(clash, undefined, `the returned title still exists as a listing name: ${JSON.stringify(clash)}`);
  } finally {
    const removed = await call('DELETE', `/api/products/${rowId}`, undefined, s.token);
    assert.ok(removed.status < 300, `cleanup failed (${removed.status} ${removed.text}) — delete listing ${rowId} by hand`);
  }

  // (d) With the collision gone the tag is unique again — the check is live, not cached.
  const settled = await call('POST', '/api/imports/title', body, s.token);
  assert.equal((settled.body as { duplicateOf: number | null }).duplicateOf, null, 'the collision was removed');
});

/**
 * The defect a driver's end-to-end run found: a row that shares only the model
 * number and the finish ("Aluminium Profile 6060 T6 — mill finish, 6 m bars")
 * was never probed for, because the probe was built from an attribute LABEL
 * ("Alloy:") and the composer head ("Mill Finish Extrusion") — so the endpoint
 * answered unique:true and the row was invisible. The source title's own head run
 * and the spec VALUE are what collide; both are probed now.
 */
test('title: a partial-overlap row is reported, and a variant changes the answer', { skip }, async (t) => {
  await liveBase(t);
  const s = await sup();
  const tag = `al${uniq()}`;
  const body: TitleInput = {
    sourceTitle: 'Aluminium Profile 6060 T6 Mill Finish 6m Extrusion for structural framing',
    category: 'Metals & Minerals',
    originCountry: 'CN',
    unit: 'ton',
    spec: ['Alloy: 6060 T6', 'Length: 6 m', 'Finish: mill'],
    variant: 0,
  };

  // A variant is the operator's "Regenerate": it must not return the same string.
  const v0 = await call('POST', '/api/imports/title', { ...body, variant: 0 }, s.token);
  const v1 = await call('POST', '/api/imports/title', { ...body, variant: 1 }, s.token);
  assert.equal(v0.status, 200, `expected 200 (got ${v0.status} ${v0.text})`);
  assert.equal(v1.status, 200, `expected 200 (got ${v1.status} ${v1.text})`);
  const first = v0.body as { title: string; engine: string };
  const second = v1.body as { title: string; engine: string; note: string };
  assert.equal(first.engine, 'fallback');
  assert.equal(second.engine, 'fallback');
  assert.notEqual(second.title, first.title, 'Regenerate must produce a genuinely different title');
  assertCleanTitle(first.title, (body.spec as string[]).join(' '));
  assertCleanTitle(second.title, (body.spec as string[]).join(' '));

  // The same product, worded differently: no label, no composer head, only the
  // model number and the finish in common with our title.
  const created = await call('POST', '/api/products', {
    name: `Aluminium Profile 6060 T6 - mill finish, 6 m bars ${tag}`,
    category: 'Metals & Minerals',
    description: 'title.test.ts partial-overlap probe — deleted again by this test',
    price: 2400,
    currency: 'USD',
    unit: 'ton',
    moq: 1,
    originCountry: 'CN',
    quantityAvailable: 5,
  }, s.token);
  assert.equal(created.status, 201, `probe listing failed: ${created.status} ${created.text}`);
  const rowId = (created.body as { id: number }).id;
  const rowName = `Aluminium Profile 6060 T6 - mill finish, 6 m bars ${tag}`;

  try {
    const after_ = await call('POST', '/api/imports/title', body, s.token);
    assert.equal(after_.status, 200, `expected 200 (got ${after_.status} ${after_.text})`);
    const out = after_.body as { title: string; unique: boolean; duplicateOf: number | null; note: string };
    assert.equal(typeof out.duplicateOf, 'number', `the partial-overlap row must be reported: ${JSON.stringify(out)}`);
    assert.notEqual(out.title.toLowerCase(), rowName.toLowerCase(), 'the returned title must differ from the existing name');
    // A collision must change the ANSWER — and there are exactly two honest answers:
    // the title adapts when an unused fact can distinguish it, or the reply says it
    // could not (`unique: false`). Demanding a different string unconditionally would
    // force an invented marker (or an internal SKU) into a buyer-facing title, which
    // is the defect this suite exists to catch. Either way the title must never BE
    // the colliding name.
    assert.notEqual(out.title.toLowerCase(), rowName.toLowerCase(), 'the answer must never be the colliding name');
    // `note === ''` marks a baseline that genuinely saw no collision — only then is
    // "the answer must change" a fair demand. This suite runs against the DEV
    // database, which may already carry a row for this product (a real push, or
    // leftovers from another run): the baseline then legitimately comes back already
    // distinguished, and repeating that same title is the correct answer.
    if (first.unique && first.note === '') {
      assert.notEqual(out.title, first.title, 'a collision must change the answer');
    } else {
      assert.ok(
        out.title !== first.title || out.unique === false,
        `a collision must change the answer or say it cannot be distinguished: ${JSON.stringify(out)}`,
      );
    }
    assertCleanTitle(out.title, (body.spec as string[]).join(' '));
  } finally {
    const removed = await call('DELETE', `/api/products/${rowId}`, undefined, s.token);
    assert.ok(removed.status < 300, `cleanup failed (${removed.status} ${removed.text}) — delete listing ${rowId} by hand`);
  }
});

/* ==========================================================================
 * the engine itself (no server, deterministic)
 * ========================================================================== */

test('composer: every word it publishes comes from the record', () => {
  const input: TitleInput = {
    sourceTitle: 'Alibaba Hot Sale 1000kg/day Industrial Ice Machine for cold storage',
    category: 'Food Machinery',
    originCountry: 'CN',
    unit: 'Set',
    spec: ['1000 kg/day', '304 stainless steel'],
    keywords: ['block ice'],
    variant: 0,
  };
  const title = composeTitle(input);
  assert.ok(title.includes('1000 kg/day'), `spec reflected: ${title}`);
  assert.ok(title.includes('block ice'), `keyword reflected: ${title}`);
  assert.ok(/\bCN\b/.test(title), `origin reflected: ${title}`);
  assert.ok(!/alibaba|hot sale/i.test(title), `marketing copy must be gone: ${title}`);
  assert.ok(title.length <= 120, `composed title must fit: ${title.length}`);

  // Nothing invented: each word of the answer appears in the record's own fields.
  const facts = new Set(
    `${input.sourceTitle} ${input.category} ${input.originCountry} ${input.unit} ${(input.spec ?? []).join(' ')} ${(input.keywords ?? []).join(' ')}`
      .toLowerCase()
      .replace(/[^a-z0-9/]+/g, ' ')
      .split(' ')
      .filter(Boolean),
  );
  for (const token of title.toLowerCase().replace(/[^a-z0-9/]+/g, ' ').split(' ').filter(Boolean)) {
    if (token === 'supply') continue; // the composer's own connector
    assert.ok(facts.has(token), `composer invented "${token}" in ${JSON.stringify(title)}`);
  }

  // A record with nothing usable still answers with something publishable.
  assert.equal(composeTitle({ sourceTitle: '!!!', variant: 0 }), 'Industrial supply');
  assert.equal(composeTitle({ sourceTitle: 'Machine', category: 'Industrial Equipment', variant: 0 }), 'Industrial Equipment');
});

test('rules: a naughty model answer is repaired, and what cannot be repaired is refused', () => {
  const input: TitleInput = {
    sourceTitle: 'Industrial Ice Machine for cold storage',
    category: 'Machinery',
    originCountry: 'CN',
    unit: 'Set',
    spec: ['1000 kg/day'],
    variant: 0,
  };

  const repaired = repairTitle(
    'BEST Alibaba Certified ICE MACHINE 1000 kg/day - $1,999 ONLY!!! 🔥 buy now',
    input,
  );
  assert.equal(repaired.ok, true, 'this answer is repairable');
  if (repaired.ok) {
    assertCleanTitle(repaired.title, '');
    assert.ok(!/\$|1999/i.test(repaired.title), `no price may survive: ${repaired.title}`);
    assert.ok(repaired.removed.length > 0, 'the repair must report what it removed');
  }

  // An invented number is removed; a number the record carries is kept.
  const invented = repairTitle('Industrial Ice Machine 1500 kg/day capacity', input);
  assert.equal(invented.ok, true);
  if (invented.ok) {
    assert.ok(!/1500/.test(invented.title), `an invented number must not survive: ${invented.title}`);
  }
  const kept = repairTitle('Industrial Ice Machine 1000 kg/day', input);
  assert.equal(kept.ok, true);
  if (kept.ok) assert.ok(/1000/.test(kept.title), `a number the spec carries is a fact: ${kept.title}`);

  // Certification is conditional on the record's own spec.
  const noSpec = repairTitle('ISO 9001 certified ice machine', input);
  assert.equal(noSpec.ok, true);
  if (noSpec.ok) assert.ok(!/iso|9001|certified/i.test(noSpec.title), `unbacked certificate survived: ${noSpec.title}`);
  const withSpec = repairTitle('ISO 9001 certified ice machine', { ...input, spec: ['ISO 9001'] });
  assert.equal(withSpec.ok, true);
  if (withSpec.ok) assert.ok(/ISO 9001/i.test(withSpec.title), `a spec-backed standard is allowed: ${withSpec.title}`);

  // Unusable answers are refused, so the endpoint falls back with a reason.
  const empty = repairTitle('   ', input);
  assert.equal(empty.ok, false, 'an empty answer cannot be repaired');
  const echo = repairTitle('Industrial Ice Machine for cold storage', input);
  assert.equal(echo.ok, false, 'an echo of the source listing must be refused');
  const letters = repairTitle('$$$', input);
  assert.equal(letters.ok, false, 'an answer with no wording must be refused');
});

test('ai: one request, the configured model, ~0.4 temperature, no marketing copy in the prompt', async () => {
  const saved = { key: process.env.AI_API_KEY, base: process.env.AI_BASE_URL, model: process.env.AI_MODEL };
  process.env.AI_API_KEY = 'unit-test-key';
  process.env.AI_BASE_URL = 'https://provider.test/v1/';
  process.env.AI_MODEL = 'unit-test-model';
  const emptyCatalogue: CatalogueLookup = {
    async byNameProbe() { return []; },
    async byExactName() { return null; },
  };
  const seen: { url: string; body: Record<string, unknown>; auth?: string; prompt: string; system: string }[] = [];
  const fakeFetch = (async (url: string, init: { headers: Record<string, string>; body: string }) => {
    const body = JSON.parse(init.body) as { messages: { role: string; content: string }[] };
    seen.push({
      url,
      body: body as unknown as Record<string, unknown>,
      auth: init.headers.Authorization,
      prompt: body.messages[1]?.content ?? '',
      system: body.messages[0]?.content ?? '',
    });
    return new Response(JSON.stringify({ choices: [{ message: { content: 'Industrial ice machine, 1000 kg/day, stainless steel' } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;

  try {
    const input: TitleInput = {
      sourceTitle: 'Alibaba Best Price Industrial Ice Machine for cold storage',
      category: 'Machinery',
      originCountry: 'CN',
      unit: 'Set',
      spec: ['1000 kg/day', 'stainless steel'],
      keywords: ['block ice'],
      description: 'Factory direct! Hot sale, contact us for the best price.',
      variant: 0,
    };
    const out = await generateTitle(input, { fetchImpl: fakeFetch, lookup: emptyCatalogue });

    assert.equal(seen.length, 1, 'exactly one provider call');
    assert.equal(seen[0].url, 'https://provider.test/v1/chat/completions', 'base URL (trailing slash stripped) + path');
    assert.equal(seen[0].auth, 'Bearer unit-test-key', 'the key travels as a Bearer token');
    assert.equal(seen[0].body.model, 'unit-test-model', 'the configured model is used');
    assert.equal(seen[0].body.temperature, 0.4, 'temperature 0.4');
    assert.equal(seen[0].body.stream, false);
    assert.match(seen[0].system, /never copy|OUR OWN/i, 'the instructions must demand our own wording');
    assert.ok(!/alibaba|hot sale|barrel/i.test(seen[0].prompt), `marketing copy must not be sent: ${seen[0].prompt}`);
    assert.ok(!/\$|best price/i.test(seen[0].prompt), `prices must not be sent: ${seen[0].prompt}`);
    assert.ok(seen[0].prompt.includes('1000 kg/day'), 'the facts are sent');
    assert.equal(out.engine, 'ai', `a clean answer is an AI title: ${JSON.stringify(out)}`);
    assert.equal(out.title, 'Industrial ice machine, 1000 kg/day, stainless steel');

    // `variant` must ask for a different candidate, so "Regenerate" differs.
    await generateTitle({ ...input, variant: 3 }, { fetchImpl: fakeFetch, lookup: emptyCatalogue });
    assert.equal(seen.length, 2);
    assert.notEqual(seen[1].prompt, seen[0].prompt, 'a different variant must produce a different request');
    assert.match(seen[1].prompt, /candidate #4|#4/i, `variant 3 must ask for candidate 4: ${seen[1].prompt}`);
  } finally {
    if (saved.key === undefined) delete process.env.AI_API_KEY; else process.env.AI_API_KEY = saved.key;
    if (saved.base === undefined) delete process.env.AI_BASE_URL; else process.env.AI_BASE_URL = saved.base;
    if (saved.model === undefined) delete process.env.AI_MODEL; else process.env.AI_MODEL = saved.model;
  }
});

test('ai: a failing provider is a note and a composed title, never an error', async () => {
  const saved = { key: process.env.AI_API_KEY, timeout: process.env.AI_TIMEOUT_MS };
  process.env.AI_API_KEY = 'unit-test-key';
  process.env.AI_TIMEOUT_MS = '300';
  const emptyCatalogue: CatalogueLookup = {
    async byNameProbe() { return []; },
    async byExactName() { return null; },
  };
  const input: TitleInput = {
    sourceTitle: 'Industrial Ice Machine for cold storage',
    category: 'Machinery',
    originCountry: 'CN',
    spec: ['1000 kg/day'],
    variant: 0,
  };

  try {
    const run = (impl: (url: string, init: { signal: AbortSignal; body: string }) => Promise<Response>) =>
      generateTitle(input, { fetchImpl: impl as unknown as typeof fetch, lookup: emptyCatalogue });

    const http503 = await run(async () => new Response('{"error":"overloaded"}', { status: 503 }));
    assert.equal(http503.engine, 'fallback', 'a provider error must fall back');
    assert.match(http503.note, /HTTP 503/, `the note must name the real reason: ${http503.note}`);
    assert.equal(http503.title, composeTitle(input), 'the fallback title is the composed one');

    const unreachable = await run(async () => {
      const err = new TypeError('fetch failed');
      (err as unknown as { cause: { code: string } }).cause = { code: 'ECONNREFUSED' };
      throw err;
    });
    assert.equal(unreachable.engine, 'fallback');
    assert.match(unreachable.note, /unreachable|ECONNREFUSED/i, `the note must name the real reason: ${unreachable.note}`);

    // The provider accepts the call and never answers: the engine's own
    // AbortController must end the wait (a real fetch rejects on that signal).
    const timedOut = await run(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('The operation was aborted')));
        }),
    );
    assert.equal(timedOut.engine, 'fallback');
    assert.match(timedOut.note, /timed out after 300 ms/i, `the note must name the real reason: ${timedOut.note}`);

    const nonsense = await run(async () => new Response(JSON.stringify({ choices: [] }), { status: 200 }));
    assert.equal(nonsense.engine, 'fallback');
    assert.match(nonsense.note, /no usable title/i, `the note must name the real reason: ${nonsense.note}`);

    // A naughty but repairable answer stays an AI title, with the repair reported.
    const naughty = await run(
      async () =>
        new Response(JSON.stringify({ choices: [{ message: { content: 'BEST Certified Ice Machine - $99!!!' } }] }), { status: 200 }),
    );
    assert.equal(naughty.engine, 'ai', `a repairable answer is still an AI title: ${JSON.stringify(naughty)}`);
    assert.match(naughty.note, /removed/i, `the repair must be reported: ${naughty.note}`);
    assertCleanTitle(naughty.title, '');
  } finally {
    if (saved.key === undefined) delete process.env.AI_API_KEY; else process.env.AI_API_KEY = saved.key;
    if (saved.timeout === undefined) delete process.env.AI_TIMEOUT_MS; else process.env.AI_TIMEOUT_MS = saved.timeout;
  }
});

test('uniqueness: a collision that cannot be escaped is reported as unique:false', async () => {
  const saved = process.env.AI_API_KEY;
  delete process.env.AI_API_KEY;
  const alwaysTaken: CatalogueLookup = {
    async byNameProbe(probe) { return [{ id: 99, name: `${probe} stainless steel drum` }]; },
    async byExactName(name) { return { id: 100, name }; },
  };
  const broken: CatalogueLookup = {
    async byNameProbe() { throw new Error('catalogue offline'); },
    async byExactName() { return null; },
  };
  const input: TitleInput = {
    sourceTitle: 'Industrial Ice Machine for cold storage',
    category: 'Machinery',
    originCountry: 'CN',
    spec: ['1000 kg/day', 'stainless steel'],
    variant: 0,
  };

  try {
    const taken = await generateTitle(input, { lookup: alwaysTaken });
    assert.equal(taken.unique, false, `unique:false is the honest answer here: ${JSON.stringify(taken)}`);
    assert.equal(taken.duplicateOf, 99, 'the row it collided with is reported');
    assert.match(taken.note, /near-identical|distinct/i, `the note must explain the collision: ${taken.note}`);

    const offline = await generateTitle(input, { lookup: broken });
    assert.equal(offline.unique, false, 'an unchecked title is not a unique title');
    assert.equal(offline.duplicateOf, null);
    assert.match(offline.note, /catalogue check could not run/i, `the note must be honest: ${offline.note}`);

    // A collision that no available fact can distinguish does not invent one.
    assert.equal(catalogueProbe(input).length > 0, true);
  } finally {
    if (saved === undefined) delete process.env.AI_API_KEY; else process.env.AI_API_KEY = saved;
  }
});

/**
 * The collision that matters is not always a near-verbatim name. A catalogue row
 * that shares only a model number and a spec phrase — "Aluminium Profile 6060 T6
 * — mill finish, 6 m bars" against our "Mill Finish Extrusion - Alloy: 6060 T6,
 * Length: 6 m - CN supply" — competes in the same search results, and the probe
 * has to find it: the source title's head noun run ("Aluminium Profile") and the
 * spec VALUE ("6060 T6"), never the label ("Alloy:") and never the composer head
 * alone ("Mill Finish Extrusion", which matches nothing in that catalogue).
 */
test('uniqueness: a row sharing a model number and a spec phrase is a duplicate too', async () => {
  const saved = process.env.AI_API_KEY;
  delete process.env.AI_API_KEY;
  const input: TitleInput = {
    sourceTitle: 'Aluminium Profile 6060 T6 Mill Finish 6m Extrusion for structural framing',
    category: 'Metals & Minerals',
    originCountry: 'CN',
    unit: 'ton',
    spec: ['Alloy: 6060 T6', 'Length: 6 m', 'Finish: mill'],
    variant: 0,
  };
  const row = { id: 6810, name: 'Aluminium Profile 6060 T6 — mill finish, 6 m bars' };
  const asked: string[] = [];
  const lookup: CatalogueLookup = {
    async byNameProbe(probe) { asked.push(probe); return [row]; },
    async byExactName() { return null; },
  };

  try {
    // The probe the endpoint leads with is the term that actually collides — the
    // source title's own words — not an attribute label.
    const probes = catalogueProbes(input);
    assert.ok(probes.length >= 2, `more than one term must be probed: ${JSON.stringify(probes)}`);
    for (const probe of probes) {
      assert.ok(!probe.trim().endsWith(':'), `a bare label is not a probe: ${JSON.stringify(probe)}`);
      assert.ok(!/^(unit|supply|product|high|quality|metals)$/i.test(probe), `filler is not a probe: ${JSON.stringify(probe)}`);
      assert.ok(probe.length >= 3, `a probe shorter than 3 chars is useless: ${JSON.stringify(probe)}`);
    }
    const all = probes.join(' | ');
    assert.match(all, /Aluminium Profile/i, `the source title's head run must be probed: ${all}`);
    assert.match(all, /6060 T6/i, `the numbered spec VALUE must be probed: ${all}`);
    assert.ok(!/\bAlloy:\s*$/.test(all), `the label must not be the probe: ${all}`);
    assert.equal(catalogueProbe(input), probes[0], 'catalogueProbe() is the first of the probes');
    assert.match(catalogueProbe(input), /Aluminium Profile/i, `the leading probe must be the colliding term: ${catalogueProbe(input)}`);

    const out = await generateTitle(input, { lookup });
    assert.equal(out.engine, 'fallback');
    assert.equal(out.duplicateOf, row.id, `the partial-overlap row must be reported: ${JSON.stringify(out)}`);
    assert.equal(out.unique, true, `a distinguishing fact exists, so the title can be unique: ${JSON.stringify(out)}`);
    assert.notEqual(out.title.toLowerCase(), row.name.toLowerCase(), 'the returned title must differ from the existing name');
    assert.notEqual(out.title, composeTitle(input), 'a collision must change the answer');
    assertCleanTitle(out.title, (input.spec as string[]).join(' '));

    // Several probes are asked, not one: the term that collides is not always the
    // head the composer leads with.
    assert.ok(asked.length >= 2, `every probe must be asked: ${JSON.stringify(asked)}`);
  } finally {
    if (saved === undefined) delete process.env.AI_API_KEY; else process.env.AI_API_KEY = saved;
  }
});

/**
 * The other half of the same rule: widening the probes and the matching must not
 * turn a different product into a duplicate. A catalogue that answers every probe
 * with rows of another product (an excavator bucket against aluminium profiles,
 * an ice machine and a steel sheet) leaves `unique:true`, `duplicateOf:null` and
 * the composer's own title untouched.
 */
test('uniqueness: an unrelated product is not turned into a duplicate', async () => {
  const saved = process.env.AI_API_KEY;
  delete process.env.AI_API_KEY;
  const input: TitleInput = {
    sourceTitle: 'Hydraulic Excavator Bucket 20t for demolition work',
    category: 'Construction Machinery',
    originCountry: 'TR',
    unit: 'unit',
    spec: ['Capacity: 1.2 m3', 'Hardox 450 steel'],
    variant: 0,
  };
  const rows = [
    { id: 6810, name: 'Aluminium Profile 6060 T6 — mill finish, 6 m bars' },
    { id: 5401, name: 'Snowkey 1-70t Tube Ice Machine Industrial Ice Machine Ice Maker Machine' },
    { id: 9, name: 'Stainless Steel Sheet 304' },
  ];
  const lookup: CatalogueLookup = {
    async byNameProbe() { return rows; },
    async byExactName() { return null; },
  };

  try {
    const out = await generateTitle(input, { lookup });
    assert.equal(out.unique, true, `shared generic words are not a collision: ${JSON.stringify(out)}`);
    assert.equal(out.duplicateOf, null, `an unrelated product must stay unreported: ${JSON.stringify(out)}`);
    assert.equal(out.title, composeTitle(input), 'the composer\'s own title must come back unchanged');
    assertCleanTitle(out.title);
  } finally {
    if (saved === undefined) delete process.env.AI_API_KEY; else process.env.AI_API_KEY = saved;
  }
});

/**
 * "Regenerate" is the operator asking for a different title. On the fallback path
 * that used to be a no-op: variant 0..3 all returned one identical string.
 */
test('composer: a variant re-arranges the record, so Regenerate is not a no-op', async () => {
  const saved = process.env.AI_API_KEY;
  delete process.env.AI_API_KEY;
  const input: TitleInput = {
    sourceTitle: 'Aluminium Profile 6060 T6 Mill Finish 6m Extrusion for structural framing',
    category: 'Metals & Minerals',
    originCountry: 'CN',
    unit: 'ton',
    spec: ['Alloy: 6060 T6', 'Length: 6 m', 'Finish: mill'],
    variant: 0,
  };
  const emptyCatalogue: CatalogueLookup = {
    async byNameProbe() { return []; },
    async byExactName() { return null; },
  };
  // Every word a variant publishes has to come from the record (as in the
  // composer test above) — a regenerate re-arranges facts, it does not invent.
  const facts = new Set(
    `${input.sourceTitle} ${input.category} ${input.originCountry} ${input.unit} ${(input.spec ?? []).join(' ')}`
      .toLowerCase()
      .replace(/[^a-z0-9/]+/g, ' ')
      .split(' ')
      .filter(Boolean),
  );

  try {
    const titles: string[] = [];
    for (const variant of [0, 1, 2, 3]) {
      const out = await generateTitle({ ...input, variant }, { lookup: emptyCatalogue });
      assert.equal(out.engine, 'fallback', `no key, so the composer answers: ${JSON.stringify(out)}`);
      assert.equal(out.unique, true);
      assertCleanTitle(out.title, (input.spec as string[]).join(' '));
      for (const token of out.title.toLowerCase().replace(/[^a-z0-9/]+/g, ' ').split(' ').filter(Boolean)) {
        if (token === 'supply') continue; // the composer's own connector
        assert.ok(facts.has(token), `variant ${variant} invented "${token}" in ${JSON.stringify(out.title)}`);
      }
      titles.push(out.title);
    }
    assert.equal(new Set(titles).size, 4, `variant 0..3 must all differ: ${JSON.stringify(titles)}`);
    assert.notEqual(titles[0], titles[1], 'variant 1 must differ from variant 0');
    // The same variant stays deterministic — a re-render is not a new title.
    const again = await generateTitle({ ...input, variant: 1 }, { lookup: emptyCatalogue });
    assert.equal(again.title, titles[1], 'the same variant must be stable');
    // And the operator is told which arrangement they are looking at.
    assert.match(again.note, /variation #2/i, `the note must name the variation: ${again.note}`);
    const zero = await generateTitle({ ...input, variant: 0 }, { lookup: emptyCatalogue });
    assert.match(zero.note, /no ai key/i, `variant 0 keeps the original note: ${zero.note}`);
    assert.ok(!/variation/i.test(zero.note), `variant 0 is not a variation: ${zero.note}`);
  } finally {
    if (saved === undefined) delete process.env.AI_API_KEY; else process.env.AI_API_KEY = saved;
  }
});

/* ==========================================================================
 * the AI path over HTTP: a throwaway instance with a mock provider
 * ========================================================================== */

/**
 * The live test server has no AI key, so the AI-through-HTTP paths are proven
 * against an instance this file boots itself: same source, same DB, its own
 * port, a mock OpenAI-compatible provider (and, for the failure case, an
 * unroutable AI_BASE_URL). The servers this file starts are stopped at the end.
 */
interface Twin {
  base: string;
  log: () => string;
  stop: () => void;
}

const twins: Twin[] = [];
let mock: { url: string; calls: { auth?: string; body: { model?: string; messages?: { content?: string }[] } }[]; setReply: (r: string | null) => void; stop: () => Promise<void> } | null = null;

/** DB URL for the booted instance: process env, repo .env, or the local dev env file. */
function envValue(key: string): string | undefined {
  if (process.env[key]) return process.env[key];
  const files = [
    fileURLToPath(new URL('../../../.env', import.meta.url)),
    path.join(process.env.LOCALAPPDATA ?? path.join(process.env.HOME ?? '', '.local', 'share'), 'Temp', 'fd-api.env'),
  ];
  for (const file of files) {
    try {
      const m = readFileSync(file, 'utf8').match(new RegExp(`^${key}=(.+)$`, 'm'));
      if (m) return m[1].trim().replace(/^"|"$/g, '');
    } catch {
      /* not there */
    }
  }
  return undefined;
}

/**
 * A port is free when nothing answers on it. Probing by binding is not reliable
 * on this platform (a wildcard-bound server and a 127.0.0.1 probe can coexist,
 * so `listen()` succeeds on a port that is already taken — that silently made a
 * throwaway instance fail to boot while the health check passed against the
 * wrong server). Connecting answers the question directly.
 */
async function portInUse(port: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const socket = connect({ host: '127.0.0.1', port });
    const finish = (used: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(used);
    };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(750, () => finish(true));
  });
}

async function freePort(): Promise<number> {
  for (let port = 9181; port < 9280; port += 1) {
    if (!(await portInUse(port))) return port;
  }
  throw new Error('no free port for the throwaway API instance');
}

let bootedPlain: (Twin & { secret: string }) | null = null;

/**
 * The live server may be running a build that predates this route, and the
 * driver's rule is never to rebuild/restart it. So: if TEST_BASE_URL does not
 * serve POST /api/imports/title, this file boots the SAME source (tsx, same DB,
 * its own port) once and tests against that, saying so out loud. When the
 * running server does serve it (CI builds first), the running server is used.
 */
async function liveBase(t: { diagnostic: (message: string) => void }): Promise<string> {
  if (!BASE) throw new Error('TEST_BASE_URL is not set');
  if (bootedPlain) return bootedPlain.base;
  const probe = await call('POST', '/api/imports/title', {}, undefined, BASE);
  if (probe.status !== 404) return BASE;
  t.diagnostic(
    `TEST_BASE_URL (${BASE}) answers 404 for POST /api/imports/title — it is running a build made before this route existed. ` +
      'Booting the same source on a throwaway port for these tests; the running server is left untouched.',
  );
  bootedPlain = await startInstance({});
  activeBase = bootedPlain.base;
  return bootedPlain.base;
}

/** A local OpenAI-compatible endpoint whose answer the test controls. */
async function startMockProvider(): Promise<void> {
  let reply: string | null = 'Industrial ice machine, 1000 kg/day, stainless steel';
  const calls: { auth?: string; body: { model?: string; messages?: { content?: string }[] } }[] = [];
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      try {
        calls.push({ auth: req.headers.authorization, body: raw ? JSON.parse(raw) : {} });
      } catch {
        calls.push({ auth: req.headers.authorization, body: {} });
      }
      if (reply === null) {
        res.writeHead(503, { 'content-type': 'application/json' });
        res.end('{"error":"provider down"}');
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: reply } }] }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  // Never let test plumbing keep the runner alive: the mock is closed in
  // `after()`, and an idle keep-alive socket must not block that.
  server.unref();
  const port = (server.address() as AddressInfo).port;
  mock = {
    url: `http://127.0.0.1:${port}/v1`,
    calls,
    setReply: (r) => { reply = r; },
    stop: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
        setTimeout(resolve, 2000).unref();
      }),
  };
}

/**
 * Boot the API server from source on a throwaway port, against the shared DB.
 * `opts.ai` configures the AI engine for that instance; without it the instance
 * has no key at all, which is what the fallback tests assert against.
 */
async function startInstance(opts: { ai?: { key: string; baseUrl: string; model: string } }): Promise<Twin & { secret: string }> {
  const port = await freePort();
  const secret = `title-test-${uniq()}${uniq()}`.padEnd(48, 'x');
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'development',
    PORT: String(port),
    RATE_LIMIT_DISABLED: '1',
    APP_SECRET: secret,
    DATABASE_URL: envValue('DATABASE_URL') ?? '',
    SITE_URL: 'http://localhost:8080',
  };
  // Never inherit a key from the developer's shell: an instance used for the
  // fallback assertions must genuinely have none.
  for (const key of ['AI_API_KEY', 'OPENAI_API_KEY', 'DEEPSEEK_API_KEY', 'AI_BASE_URL', 'AI_MODEL']) delete env[key];
  if (opts.ai) {
    env.AI_API_KEY = opts.ai.key;
    env.AI_BASE_URL = opts.ai.baseUrl;
    env.AI_MODEL = opts.ai.model;
  }

  let log = '';
  let exited = false;
  const child: ChildProcess = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: API_DIR,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.on('exit', () => { exited = true; });
  child.stdout?.on('data', (d: Buffer) => { log += d.toString(); });
  child.stderr?.on('data', (d: Buffer) => { log += d.toString(); });

  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 40_000;
  for (;;) {
    // A dead child means a wrong server could be answering on this port: never
    // let the tests run against something this file did not boot.
    if (exited) throw new Error(`the throwaway API instance died while booting.\n${log.slice(-2000)}`);
    if (Date.now() > deadline) {
      child.kill();
      throw new Error(`the throwaway API instance never became healthy.\n${log.slice(-2000)}`);
    }
    try {
      const res = await fetch(`${base}/api/healthz`);
      if (res.ok) break;
    } catch {
      /* not listening yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!log.includes('FactoryDepo API listening')) {
    child.kill();
    throw new Error(`something other than the booted instance answered on ${base}.\n${log.slice(-2000)}`);
  }
  const twin = {
    base,
    log: () => log,
    stop: () => {
      child.kill();
      // A server that ignored SIGTERM must not be able to hang the runner.
      setTimeout(() => child.kill('SIGKILL'), 1000).unref();
      child.stdout?.destroy();
      child.stderr?.destroy();
    },
    secret,
  };
  twins.push(twin);
  return twin;
}

/** Dev Bearer token for a user that exists: same HMAC scheme as src/auth.ts. */
function mintToken(userId: number, secret: string): string {
  const payload = Buffer.from(JSON.stringify({ sub: userId, v: 0, exp: Date.now() + 60 * 60 * 1000 })).toString('base64url');
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

after(async () => {
  for (const twin of twins) twin.stop();
  if (mock) await mock.stop();
});

test('title over HTTP: the model writes it, and a dead provider is only a note', { skip }, async (t) => {
  const dbUrl = envValue('DATABASE_URL');
  if (!dbUrl) {
    assert.fail('DATABASE_URL is not resolvable (env, repo .env or the local dev env file) — the AI-path instance needs the shared DB');
  }
  await liveBase(t); // resolves activeBase for the account registration below
  const account = await sup(); // the row the minted token points at lives in the shared DB
  await startMockProvider();
  if (!mock) throw new Error('mock provider did not start');

  const withAi = await startInstance({ ai: { key: 'title-test-key', baseUrl: mock.url, model: 'title-test-model' } });
  const token = mintToken(account.id, withAi.secret);
  t.diagnostic(`AI-path instance ${withAi.base} (user #${account.id}, secret len ${withAi.secret.length}, mock ${mock.url})`);

  const input = {
    sourceTitle: 'Alibaba Best Price Industrial Ice Machine for cold storage',
    category: 'Machinery',
    originCountry: 'CN',
    unit: 'Set',
    spec: ['1000 kg/day', 'stainless steel'],
    keywords: ['block ice'],
    variant: 0,
  };

  const okCall = await call('POST', '/api/imports/title', input, token, withAi.base);
  assert.equal(okCall.status, 200, `expected 200 (got ${okCall.status} ${okCall.text})\n${withAi.log().slice(-800)}`);
  const ok = okCall.body as { title: string; engine: string; unique: boolean; note: string };
  assert.deepEqual(Object.keys(ok).sort(), CONTRACT_KEYS);
  assert.equal(ok.engine, 'ai', `a configured key must use the AI engine (note: ${ok.note})`);
  assert.match(ok.note, /AI title/i, `the note must say which engine answered: ${ok.note}`);
  assertCleanTitle(ok.title, '');
  assert.equal(mock.calls.length, 1, 'exactly one provider call');
  assert.equal(mock.calls[0].auth, 'Bearer title-test-key', 'the configured key is sent to the provider');
  assert.equal(mock.calls[0].body.model, 'title-test-model', 'the configured model is sent');

  // A naughty model answer is repaired by the engine before it is published.
  mock.setReply('BEST Alibaba Certified Ice Machine - $1,999 ONLY!!!');
  const naughty = await call('POST', '/api/imports/title', { ...input, sourceTitle: 'Industrial Ice Machine for cold storage' }, token, withAi.base);
  assert.equal(naughty.status, 200, `expected 200 (got ${naughty.status} ${naughty.text})`);
  const naughtyBody = naughty.body as { title: string; engine: string; note: string };
  assert.equal(naughtyBody.engine, 'ai', `repairable, so still the AI engine: ${JSON.stringify(naughtyBody)}`);
  assertCleanTitle(naughtyBody.title, '');
  assert.match(naughtyBody.note, /removed/i, `the repair must be reported: ${naughtyBody.note}`);

  // The provider breaks mid-flight: still a 200, with the reason in the note.
  mock.setReply(null);
  const degraded = await call('POST', '/api/imports/title', { ...input, sourceTitle: 'Industrial Ice Machine for cold storage' }, token, withAi.base);
  assert.equal(degraded.status, 200, `a provider error must not fail the request (got ${degraded.status} ${degraded.text})`);
  const degradedBody = degraded.body as { title: string; engine: string; note: string };
  assert.equal(degradedBody.engine, 'fallback', `a dead provider falls back: ${JSON.stringify(degradedBody)}`);
  assert.match(degradedBody.note, /HTTP 503/, `the note must name the real reason: ${degradedBody.note}`);
  assertCleanTitle(degradedBody.title, '');

  // And a completely unroutable AI_BASE_URL behaves the same way.
  const broken = await startInstance({ ai: { key: 'title-test-key', baseUrl: 'http://127.0.0.1:9/v1', model: 'title-test-model' } });
  const brokenToken = mintToken(account.id, broken.secret);
  const unroutable = await call(
    'POST',
    '/api/imports/title',
    { ...input, sourceTitle: 'Industrial Ice Machine for cold storage' },
    brokenToken,
    broken.base,
  );
  assert.equal(unroutable.status, 200, `an unroutable provider must not fail the request (got ${unroutable.status} ${unroutable.text})`);
  const unroutableBody = unroutable.body as { title: string; engine: string; note: string };
  assert.equal(unroutableBody.engine, 'fallback');
  assert.match(unroutableBody.note, /unreachable|ECONNREFUSED/i, `the note must name the real reason: ${unroutableBody.note}`);
  assertCleanTitle(unroutableBody.title, '');
});
