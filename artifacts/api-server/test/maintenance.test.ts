/**
 * The purge switch is a repair tool, so its tests are about the two ways it
 * could do damage: firing when nobody asked, and deleting something a real
 * seller made. The second is checked against the script's own text, because
 * that text is what the server executes — there is no second implementation
 * that could drift away from it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { purgeRequested, resolvePurgeScript } from '../src/maintenance.js';

test('maintenance: the purge runs only when the environment names it exactly', () => {
  assert.equal(purgeRequested({}), false, 'no variable at all');
  assert.equal(purgeRequested({ PURGE_DEMO_ON_BOOT: '' }), false, 'empty string');
  assert.equal(purgeRequested({ PURGE_DEMO_ON_BOOT: '0' }), false);
  assert.equal(purgeRequested({ PURGE_DEMO_ON_BOOT: 'true' }), false, 'not a truthy-string reader');
  assert.equal(purgeRequested({ PURGE_DEMO_ON_BOOT: 'yes' }), false);
  assert.equal(purgeRequested({ PURGE_DEMO_ON_BOOT: '1' }), true);
});

test('maintenance: the boot finds the purge script it claims to run', () => {
  const file = resolvePurgeScript();
  assert.ok(file, 'scripts/purge-demo.sql must be resolvable from the server bundle');
  assert.ok(existsSync(file), `${file} must exist`);
  assert.ok(readFileSync(file, 'utf8').trim().length > 500, 'the script must actually hold the statements');
});

test('maintenance: every delete in the purge script is scoped to a demo row', () => {
  const file = resolvePurgeScript();
  assert.ok(file);
  const text = readFileSync(file, 'utf8');

  // One transaction: a half-finished purge is worse than none.
  assert.match(text, /^BEGIN;/m);
  assert.match(text, /^COMMIT;/m);

  // The demo sets are built once, by name, and every delete is confined to them.
  for (const set of ['demo_u', 'demo_s', 'demo_p', 'demo_o', 'demo_r', 'demo_t']) {
    assert.ok(text.includes(`CREATE TEMP TABLE ${set}`), `${set} must be defined`);
  }
  const deletes = text.split('\n').filter((line) => /^DELETE FROM/.test(line));
  assert.ok(deletes.length >= 15, `expected the full cascade, found ${deletes.length} deletes`);
  for (const line of deletes) {
    assert.ok(/demo_[usport]/.test(line), `unscoped delete would take real rows with it: ${line}`);
  }
  // And the one table that must never lose a real row keeps exactly that promise.
  assert.match(text, /-- Kept: .*dataSource='platform'/);
});
