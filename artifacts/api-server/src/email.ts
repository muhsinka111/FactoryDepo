/**
 * Transactional email — Resend, behind a database outbox.
 *
 * Nothing in this codebase sends mail inline. Callers write a row to
 * `email_outbox` and a worker drains it, so a provider outage (or a missing
 * RESEND_API_KEY) never loses a notification, and an HTTP request never waits
 * on a third party.
 *
 * With no RESEND_API_KEY set the worker stays idle and rows simply accumulate
 * as 'queued' — that is the intended state until the provider is configured.
 */
import { and, asc, eq, sql } from 'drizzle-orm';
import { db, emailOutbox } from './db.js';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const FROM = process.env.EMAIL_FROM ?? 'FactoryDepo <no-reply@factorydepo.com>';
const MAX_ATTEMPTS = 5;

/** Canonical template names (kebab-case). */
type CanonicalTemplate =
  | 'verify-email'
  | 'password-reset'
  | 'rfq-received'
  | 'rfq-quoted'
  | 'offer-received'
  | 'offer-countered'
  | 'offer-accepted'
  | 'offer-rejected'
  | 'order-placed'
  | 'order-status'
  | 'order-delivered'
  | 'shipment-milestone'
  | 'shipment-advanced'
  | 'payment-recorded'
  | 'payment-confirmed'
  | 'thread-created'
  | 'message-received'
  | 'supplier-approved'
  | 'supplier-rejected';

/** `'offer-countered'` -> `'offer_countered'`, recursively, for any name. */
type SnakeCase<T extends string> = T extends `${infer Head}-${infer Rest}`
  ? `${Head}_${SnakeCase<Rest>}`
  : T;

/**
 * Callers routinely use the database's snake_case convention
 * (`offer_countered`). Both spellings are accepted and normalised to
 * kebab-case before lookup, so nobody has to remember which one this file
 * happens to prefer.
 */
export type EmailTemplate = CanonicalTemplate | SnakeCase<CanonicalTemplate>;

export type EmailTemplateInput = EmailTemplate | (string & {});

function canonical(template: string): CanonicalTemplate {
  return template.replace(/_/g, '-') as CanonicalTemplate;
}

interface Rendered {
  subject: string;
  html: string;
}

/** Shared shell. Inline styles only — most mail clients strip <style>. */
function shell(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f7f8fa">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#1a2432">
    <div style="background:#132238;border-radius:8px 8px 0 0;padding:14px 18px;color:#fff;font-weight:700;font-size:16px;letter-spacing:-.3px">
      factory<span style="color:#f5a623">depo</span>
    </div>
    <div style="background:#fff;border:1px solid #e6e9ee;border-top:none;border-radius:0 0 8px 8px;padding:20px 18px">
      <h1 style="margin:0 0 12px;font-size:17px;font-weight:600;letter-spacing:-.2px">${title}</h1>
      ${bodyHtml}
      <p style="margin:18px 0 0;padding-top:14px;border-top:1px solid #f1f3f6;color:#7b8794;font-size:12px">
        FactoryDepo — global industrial marketplace. You receive this because you have an account.
      </p>
    </div>
  </div></body></html>`;
}

function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function p(text: string): string {
  return `<p style="margin:0 0 10px">${text}</p>`;
}

function row(label: string, value: unknown): string {
  return `<tr><td style="padding:5px 0;color:#7b8794;font-size:12.5px">${esc(label)}</td><td style="padding:5px 0;text-align:right;font-weight:600">${esc(value)}</td></tr>`;
}

function table(rows: string): string {
  return `<table style="width:100%;border-collapse:collapse;margin:10px 0;border-top:1px solid #f1f3f6">${rows}</table>`;
}

function cta(href: string, label: string): string {
  return `<p style="margin:16px 0 0"><a href="${esc(href)}" style="display:inline-block;background:#f5a623;color:#3d2a00;font-weight:600;text-decoration:none;padding:10px 16px;border-radius:5px">${esc(label)}</a></p>`;
}

/**
 * Renders a template. Kept as a pure function of (template, payload) so it can
 * be unit-tested without a database or a provider.
 */
export function renderEmail(template: EmailTemplateInput, data: Record<string, unknown> = {}): Rendered {
  const site = process.env.SITE_URL ?? 'https://www.factorydepo.com';
  const link = (path: string) => `${site}${path}`;
  const key = canonical(template);

  switch (key) {
    case 'verify-email':
      return {
        subject: 'Confirm your FactoryDepo email',
        html: shell(
          'Confirm your email address',
          p('Please confirm this address so we can send you order and quotation updates.') +
            cta(String(data.url ?? link('/profile')), 'Confirm email address'),
        ),
      };

    case 'password-reset':
      return {
        subject: 'Reset your FactoryDepo password',
        html: shell(
          'Reset your password',
          p('Use the link below to choose a new password. It expires in one hour.') +
            p('<span style="color:#7b8794;font-size:12.5px">If you did not request this, you can ignore this message.</span>') +
            cta(String(data.url ?? link('/sign-in')), 'Choose a new password'),
        ),
      };

    case 'rfq-received':
      return {
        subject: `New request: ${String(data.title ?? 'quotation request')}`,
        html: shell(
          'A buyer posted a request you can quote',
          table(
            row('Request', data.title) +
              row('Category', data.category) +
              row('Quantity', `${data.quantity ?? ''} ${data.unit ?? ''}`.trim()) +
              row('Destination', data.targetCountry ?? 'not specified'),
          ) + cta(link(`/rfqs/${data.rfqId ?? ''}`), 'View and quote'),
        ),
      };

    case 'rfq-quoted':
      return {
        subject: `New quotation on: ${String(data.title ?? 'your request')}`,
        html: shell(
          'You received a quotation',
          table(
            row('Request', data.title) +
              row('Supplier', data.supplierName) +
              row('Price', `${data.currency ?? 'USD'} ${data.price ?? ''}`) +
              row('Lead time', `${data.leadTimeDays ?? ''} days`),
          ) + cta(link(`/rfqs/${data.rfqId ?? ''}`), 'Compare quotations'),
        ),
      };

    case 'offer-received':
      return {
        subject: `New offer on ${String(data.productName ?? 'your listing')}`,
        html: shell(
          'You received an offer',
          table(
            row('Listing', data.productName) +
              row('Quantity', data.quantity) +
              row('Unit price', `${data.currency ?? 'USD'} ${data.unitPrice ?? ''}`),
          ) + cta(link('/supplier/offers'), 'Review the offer'),
        ),
      };

    case 'offer-countered':
      return {
        subject: `Counter-offer on ${String(data.productName ?? 'your offer')}`,
        html: shell(
          'You received a counter-offer',
          table(row('Listing', data.productName) + row('Unit price', `${data.currency ?? 'USD'} ${data.unitPrice ?? ''}`)) +
            cta(link('/offers'), 'Respond'),
        ),
      };

    case 'offer-accepted':
      return {
        subject: `Offer accepted: ${String(data.productName ?? '')}`,
        html: shell(
          'Your offer was accepted',
          p('The next step is an order. Payment is by bank transfer against a proforma invoice.') +
            table(row('Listing', data.productName) + row('Quantity', data.quantity)) +
            cta(link('/orders'), 'Go to orders'),
        ),
      };

    case 'order-placed':
      return {
        subject: `Order #${String(data.orderId ?? '')} received`,
        html: shell(
          'We received your order',
          table(
            row('Order', `#${data.orderId ?? ''}`) +
              row('Listing', data.productName) +
              row('Quantity', data.quantity) +
              row('Total', `${data.currency ?? 'USD'} ${data.total ?? ''}`),
          ) +
            p('Payment is by bank transfer. A proforma invoice is available from your order page.') +
            cta(link('/orders'), 'View order'),
        ),
      };

    case 'order-status':
      return {
        subject: `Order #${String(data.orderId ?? '')} is now ${String(data.status ?? '')}`,
        html: shell('Your order status changed', table(row('Order', `#${data.orderId ?? ''}`) + row('Status', data.status)) + cta(link('/orders'), 'View order')),
      };

    case 'shipment-milestone':
      return {
        subject: `Shipment update for order #${String(data.orderId ?? '')}`,
        html: shell('Shipment update', table(row('Order', `#${data.orderId ?? ''}`) + row('Milestone', data.milestone)) + cta(link('/shipments'), 'Track shipment')),
      };

    case 'payment-recorded':
      return {
        subject: `Payment recorded for order #${String(data.orderId ?? '')}`,
        html: shell(
          'Bank transfer recorded',
          p('We logged your transfer and will confirm it once the funds clear.') +
            table(row('Order', `#${data.orderId ?? ''}`) + row('Reference', data.reference) + row('Amount', `${data.currency ?? 'USD'} ${data.amount ?? ''}`)),
        ),
      };

    case 'payment-confirmed':
      return {
        subject: `Payment confirmed for order #${String(data.orderId ?? '')}`,
        html: shell('Payment confirmed', table(row('Order', `#${data.orderId ?? ''}`) + row('Amount', `${data.currency ?? 'USD'} ${data.amount ?? ''}`)) + cta(link('/orders'), 'View order')),
      };

    case 'supplier-approved':
      return {
        subject: 'Your supplier account is verified',
        html: shell('Verification approved', p('Your documents were approved and your verification badge is now visible to buyers.') + cta(link('/supplier/verification'), 'View verification')),
      };

    case 'supplier-rejected':
      return {
        subject: 'Action needed on your verification',
        html: shell(
          'Verification not approved',
          p('We could not approve your submitted documents.') +
            (data.note ? table(row('Reviewer note', data.note)) : '') +
            cta(link('/supplier/verification'), 'Review and resubmit'),
        ),
      };

    case 'offer-rejected':
      return {
        subject: `Offer declined: ${String(data.productName ?? '')}`,
        html: shell(
          'Your offer was declined',
          table(row('Listing', data.productName) + row('Unit price', `${data.currency ?? 'USD'} ${data.unitPrice ?? ''}`)) +
            p('You can send a revised offer from the listing at any time.'),
        ),
      };

    case 'order-delivered':
      return {
        subject: `Order #${String(data.orderId ?? '')} delivered`,
        html: shell(
          'Your order was delivered',
          table(row('Order', `#${data.orderId ?? ''}`) + row('Listing', data.productName)) +
            cta(link('/orders'), 'View order'),
        ),
      };

    case 'shipment-advanced':
      return {
        subject: `Shipment update for order #${String(data.orderId ?? '')}`,
        html: shell(
          'Shipment moved to the next milestone',
          table(row('Order', `#${data.orderId ?? ''}`) + row('Milestone', data.milestone)) +
            cta(link('/shipments'), 'Track shipment'),
        ),
      };

    case 'thread-created':
      return {
        subject: `New conversation on ${String(data.productName ?? 'FactoryDepo')}`,
        html: shell(
          'Someone wants to talk about your listing',
          table(row('Listing', data.productName) + row('From', data.fromName)) +
            cta(link('/messages'), 'Open messages'),
        ),
      };

    case 'message-received':
      return {
        subject: `New message from ${String(data.fromName ?? 'a counterparty')}`,
        html: shell(
          'You have a new message',
          p(esc(data.preview ?? 'Open FactoryDepo to read it.')) + cta(link('/messages'), 'Read and reply'),
        ),
      };

    default:
      // Unknown template — never throw, just send something truthful.
      return { subject: 'FactoryDepo notification', html: shell('Notification', p('You have a new update on FactoryDepo.')) };
  }
}

/** Queue a transactional email. Never throws — a mail failure must not fail a request. */
export async function queueEmail(
  to: string,
  template: EmailTemplateInput,
  data: Record<string, unknown> = {},
  subjectOverride?: string,
): Promise<void> {
  try {
    const key = canonical(template);
    const { subject } = renderEmail(key, data);
    await db.insert(emailOutbox).values({
      toEmail: to,
      subject: subjectOverride ?? subject,
      template: key,
      payload: data as Record<string, unknown>,
    });
  } catch (err) {
    console.warn('[email] failed to queue', template, err instanceof Error ? err.message : String(err));
  }
}

interface OutboxRow {
  id: number;
  toEmail: string;
  subject: string;
  template: string;
  payload: unknown;
  attempts: number;
}

/** Send one queued row through Resend. Returns true when it went out. */
async function sendOne(row: OutboxRow, apiKey: string): Promise<boolean> {
  const { html } = renderEmail(row.template as EmailTemplate, (row.payload ?? {}) as Record<string, unknown>);
  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [row.toEmail], subject: row.subject, html }),
  });

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 400);
    await db
      .update(emailOutbox)
      .set({ status: 'failed', attempts: row.attempts + 1, lastError: `${res.status} ${detail}` })
      .where(eq(emailOutbox.id, row.id));
    console.warn(`[email] send failed (${res.status}) for outbox #${row.id}`);
    return false;
  }

  await db
    .update(emailOutbox)
    .set({ status: 'sent', attempts: row.attempts + 1, sentAt: new Date(), lastError: null })
    .where(eq(emailOutbox.id, row.id));
  return true;
}

/**
 * Drain queued mail. Rows that already failed MAX_ATTEMPTS times are skipped so
 * a permanently bad address cannot block the queue forever.
 */
export async function drainOutbox(limit = 20): Promise<number> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return 0;

  const rows = (await db
    .select({
      id: emailOutbox.id,
      toEmail: emailOutbox.toEmail,
      subject: emailOutbox.subject,
      template: emailOutbox.template,
      payload: emailOutbox.payload,
      attempts: emailOutbox.attempts,
    })
    .from(emailOutbox)
    .where(and(eq(emailOutbox.status, 'queued'), sql`${emailOutbox.attempts} < ${MAX_ATTEMPTS}`))
    .orderBy(asc(emailOutbox.id))
    .limit(limit)) as OutboxRow[];

  let sent = 0;
  for (const row of rows) {
    try {
      if (await sendOne(row, apiKey)) sent += 1;
    } catch (err) {
      await db
        .update(emailOutbox)
        .set({ status: 'failed', attempts: row.attempts + 1, lastError: err instanceof Error ? err.message : String(err) })
        .where(eq(emailOutbox.id, row.id));
    }
  }
  return sent;
}

let worker: NodeJS.Timeout | null = null;

/** Start the outbox worker. No-op without RESEND_API_KEY. Safe to call once at boot. */
export function startOutboxWorker(intervalMs = 60_000): void {
  if (!process.env.RESEND_API_KEY) {
    console.log('[email] RESEND_API_KEY not set — outbox worker idle, mail will queue but not send.');
    return;
  }
  if (worker) return;
  worker = setInterval(() => {
    void drainOutbox().catch((err) => console.warn('[email] drain failed:', err instanceof Error ? err.message : String(err)));
  }, intervalMs);
  worker.unref();
  console.log('[email] outbox worker started.');
}
