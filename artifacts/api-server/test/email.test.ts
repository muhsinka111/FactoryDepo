/**
 * Unit tests for the transactional email renderer.
 *
 * Pure functions only — no database, no provider, no network. These run anywhere
 * (`node --import tsx --test test/email.test.ts`) and guard the two things that
 * have actually bitten this project: an unknown template name silently sending
 * nothing, and unescaped user data landing in HTML.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderEmail } from '../src/email.js';

/** Every template this app can send. */
const TEMPLATES = [
  'verify-email',
  'password-reset',
  'rfq-received',
  'rfq-quoted',
  'offer-received',
  'offer-countered',
  'offer-accepted',
  'offer-rejected',
  'order-placed',
  'order-status',
  'order-delivered',
  'shipment-milestone',
  'shipment-advanced',
  'payment-recorded',
  'payment-confirmed',
  'thread-created',
  'message-received',
  'supplier-approved',
  'supplier-rejected',
] as const;

test('every template renders a non-empty subject and html', () => {
  for (const t of TEMPLATES) {
    const { subject, html } = renderEmail(t, {});
    assert.ok(subject.length > 0, `${t} produced an empty subject`);
    assert.ok(html.includes('<html'), `${t} produced html without a document shell`);
    assert.ok(html.includes('factory'), `${t} lost the brand header`);
  }
});

test('snake_case names are accepted and identical to kebab-case', () => {
  assert.deepEqual(renderEmail('offer_countered', { productName: 'X' }), renderEmail('offer-countered', { productName: 'X' }));
  assert.deepEqual(renderEmail('thread_created', {}), renderEmail('thread-created', {}));
  assert.deepEqual(renderEmail('order_delivered', {}), renderEmail('order-delivered', {}));
});

test('an unknown template falls back instead of throwing or sending nothing', () => {
  const { subject, html } = renderEmail('not-a-real-template' as never, {});
  assert.ok(subject.length > 0);
  assert.ok(html.length > 0);
});

test('user-supplied values are HTML-escaped (no injection into the mail body)', () => {
  const attack = '<script>alert(1)</script>';
  const { html } = renderEmail('rfq-received', { title: attack, category: attack, unit: attack });
  assert.ok(!html.includes('<script>'), 'raw <script> reached the rendered email');
  assert.ok(html.includes('&lt;script&gt;'), 'expected the value to be escaped');
});

test('quotes and ampersands in a company name are escaped', () => {
  const { html } = renderEmail('rfq-quoted', { supplierName: 'D&R "Metals" <Ltd>' });
  assert.ok(html.includes('&amp;'), 'ampersand should be escaped');
  assert.ok(html.includes('&quot;'), 'quote should be escaped');
  assert.ok(!html.includes('<Ltd>'), 'angle brackets should be escaped');
});

test('required business detail reaches the body', () => {
  const { html } = renderEmail('order-placed', {
    orderId: 4242,
    productName: 'Copper Cathode',
    quantity: 25,
    total: 218550,
    currency: 'USD',
  });
  assert.ok(html.includes('4242'), 'order id missing');
  assert.ok(html.includes('Copper Cathode'), 'listing name missing');
  assert.ok(html.includes('218550'), 'total missing');
});

test('a null payload does not throw for any template', () => {
  for (const t of TEMPLATES) {
    assert.doesNotThrow(() => renderEmail(t, { productName: null, quantity: null, total: null }));
  }
});
