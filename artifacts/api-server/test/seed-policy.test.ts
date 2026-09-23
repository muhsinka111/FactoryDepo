/**
 * The standing rule: FactoryDepo's catalogue is what its sellers actually
 * listed. Demo rows are a LOCAL-DEV convenience, and the production URL must
 * never serve one — that is why the boot seed asks this policy first, and why
 * the purge script exists at all. These are the cheap tests that keep the rule
 * from being "fixed" away by a future convenience flag.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { demoSeedEnabled, seedDecisionLine } from '@workspace/db';

const env = (o: Record<string, string | undefined>) => o as NodeJS.ProcessEnv;

test('demo seeding is off in production unless it is asked for explicitly', () => {
  assert.equal(demoSeedEnabled(env({ NODE_ENV: 'production' })), false, 'production must not seed demo rows');
  assert.equal(demoSeedEnabled(env({ NODE_ENV: 'production', SEED_DEMO: '1' })), true, 'an explicit request wins (a seeded dev box with NODE_ENV=production)');
  assert.equal(demoSeedEnabled(env({ NODE_ENV: 'production', SEED_DEMO: '0' })), false);
});

test('development seeds by default and can opt out', () => {
  assert.equal(demoSeedEnabled(env({ NODE_ENV: 'development' })), true);
  assert.equal(demoSeedEnabled(env({})), true, 'an unset NODE_ENV is a dev box, not a live one');
  assert.equal(demoSeedEnabled(env({ NODE_ENV: 'development', SEED_DEMO: '0' })), false);
});

test('the boot log states the decision, enabled or not', () => {
  assert.match(seedDecisionLine(true), /demo seeding ENABLED/);
  assert.match(seedDecisionLine(false), /demo seeding DISABLED/);
  assert.match(seedDecisionLine(false), /only rows created by real sellers/);
});

const BASE = process.env.TEST_BASE_URL;
const skip = BASE ? false : 'TEST_BASE_URL not set — integration suite skipped';

test('the catalogue-state counts are the ones the browse views show', { skip }, async () => {
  const state = await (await fetch(`${BASE}/api/products/catalogue-state`)).json();
  const list = await (await fetch(`${BASE}/api/products?limit=1`)).json();
  assert.equal(state.listings, state.realListings + state.demoListings, 'the split must add up to the whole catalogue');
  assert.equal(state.listings, list.total, 'the state count and the listing total must agree — the demo notice is derived from the first');
  assert.ok(state.realListings >= 0 && state.demoListings >= 0 && state.sellers >= 0);
});
