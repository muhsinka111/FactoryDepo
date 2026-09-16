import { useState } from 'react';
import { Link, useParams } from 'wouter';
import { useRfqDetail, useCreateQuote, useMe } from '@workspace/api-client-react';
import { View, Spinner, StatusChip, Verified, requireAuthGate } from '../components';
import type { ApiError } from '@workspace/api-client-react';
import type { Quote } from '@workspace/api-zod';

/**
 * RFQ detail + its quotations.
 *
 * Route: /rfqs/:id. The id is read from the route (wouter passes no props into
 * the page component). Buyers read the quotations that arrived; suppliers with
 * a member account can submit one.
 */

function readId(): number {
  // Fallback for environments where the page is mounted outside a wouter route.
  const fromPath = window.location.pathname.split('/').filter(Boolean).pop();
  const n = Number(fromPath);
  return Number.isFinite(n) && n > 0 ? n : NaN;
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function money(price: number, currency: string): string {
  const amount = price.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return currency === 'USD' ? `$${amount}` : `${currency} ${amount}`;
}

function QuoteRow({ q }: { q: Quote }) {
  return (
    <tr>
      <td>
        <div className="row" style={{ gap: 7 }}>
          <span className="av">
            {q.supplierName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
          </span>
          <div style={{ minWidth: 0 }}>
            <b>{q.supplierName}</b>
            <div className="muted">Trust score {Math.round(q.trustScore)}</div>
          </div>
        </div>
      </td>
      <td className="strong" style={{ whiteSpace: 'nowrap' }}>{money(q.price, q.currency)}</td>
      <td style={{ whiteSpace: 'nowrap' }}>{q.leadTimeDays} days</td>
      <td className="hidem">
        {q.notes ? <span className="muted">{q.notes}</span> : '—'}
      </td>
      <td className="hidem" style={{ whiteSpace: 'nowrap' }}>{shortDate(q.createdAt)}</td>
      <td><StatusChip status={q.status} /></td>
    </tr>
  );
}

export default function RfqDetail() {
  const params = useParams();
  const id = Number(params.id ?? readId());
  const { data, isLoading, error } = useRfqDetail(Number.isFinite(id) ? id : undefined);
  const { data: user } = useMe();
  const submitQuote = useCreateQuote(Number.isFinite(id) ? id : 0);

  const [err, setErr] = useState('');
  const [form, setForm] = useState({ price: '', leadTimeDays: '', notes: '' });

  const rfq = data?.rfq;
  const quotes = data?.quotes ?? [];
  const isSupplier = user?.role === 'supplier';
  const canQuote = isSupplier && rfq?.status !== 'closed';

  const submit = async () => {
    setErr('');
    const price = Number(form.price);
    const leadTimeDays = Number(form.leadTimeDays);
    if (!Number.isFinite(price) || price <= 0) {
      setErr('Enter a unit price greater than zero.');
      return;
    }
    if (!Number.isInteger(leadTimeDays) || leadTimeDays <= 0 || leadTimeDays > 365) {
      setErr('Lead time must be a whole number of days between 1 and 365.');
      return;
    }
    try {
      await submitQuote.mutateAsync({
        price,
        currency: 'USD',
        leadTimeDays,
        notes: form.notes.trim() || undefined,
      });
      setForm({ price: '', leadTimeDays: '', notes: '' });
    } catch (e) {
      setErr((e as ApiError).message ?? 'Could not submit this quotation.');
    }
  };

  if (isLoading) {
    return (
      <View title="Request" sub="Loading…">
        <div className="card"><Spinner /></div>
      </View>
    );
  }

  if (error || !rfq) {
    return (
      <View title="Request">
        <div className="card">
          <div className="empty">
            <b>Request not found</b>
            This requirement may have been withdrawn, or the link is wrong.
            <div style={{ marginTop: 12 }}>
              <Link href="/rfqs" className="btn btn-sm btn-grey">← Back to requests</Link>
            </div>
          </div>
        </div>
      </View>
    );
  }

  return (
    <View
      title={rfq.title}
      sub={
        <>
          <Link href="/rfqs">← All requests</Link> · posted {shortDate(rfq.createdAt)}
        </>
      }
      actions={<StatusChip status={rfq.status} />}
    >
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="hd">
          <span className="pill p-grey">{rfq.category}</span>
          <span className="muted">Request #{rfq.id}</span>
          <span className="muted" style={{ marginLeft: 'auto' }}>
            {rfq.status === 'open' ? 'Accepting quotations' : 'Not accepting new quotations'}
          </span>
        </div>
        <div className="bd">
          {rfq.description
            ? <p style={{ margin: '0 0 12px', maxWidth: '80ch' }}>{rfq.description}</p>
            : <p className="muted" style={{ margin: '0 0 12px' }}>No further specification supplied.</p>}

          <div className="f3">
            <div className="card">
              <div className="bd">
                <div className="muted">Quantity</div>
                <div className="strong" style={{ fontSize: 16 }}>
                  {rfq.quantity.toLocaleString()} {rfq.unit}
                </div>
              </div>
            </div>
            <div className="card">
              <div className="bd">
                <div className="muted">Deliver to</div>
                <div className="strong" style={{ fontSize: 16 }}>{rfq.targetCountry ?? '—'}</div>
              </div>
            </div>
            <div className="card">
              <div className="bd">
                <div className="muted">Quotations</div>
                <div className="strong" style={{ fontSize: 16 }}>{quotes.length}</div>
              </div>
            </div>
          </div>

          <div className="stripe" style={{ margin: '12px 0 0' }}>
            <span>Deadline <b>{rfq.deadline ? shortDate(rfq.deadline) : '—'}</b></span>
            <span>Requested by <b>—</b></span>
          </div>
        </div>
      </div>

      <div className="cols">
        <div className="card">
          <div className="hd">
            <h2>Quotations</h2>
            <span className="muted" style={{ marginLeft: 'auto' }}>
              {quotes.length} received
            </span>
          </div>
          {quotes.length === 0 ? (
            <div className="empty">
              <b>No quotations yet</b>
              Verified suppliers are reviewing this requirement.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th>Price</th>
                  <th>Lead time</th>
                  <th className="hidem">Notes</th>
                  <th className="hidem">Sent</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => <QuoteRow key={q.id} q={q} />)}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <div className="hd">
            <h2>Submit a quotation</h2>
            {isSupplier && <span style={{ marginLeft: 'auto' }}><Verified label="Supplier account" /></span>}
          </div>
          <div className="bd">
            {!isSupplier ? (
              <>
                <p className="muted" style={{ marginTop: 0 }}>
                  {user
                    ? 'Quotations come from supplier accounts. Switch to your supplier account to respond to this request.'
                    : 'Only signed-in supplier accounts can quote a request. Browsing stays open to everyone.'}
                </p>
                <button
                  className="btn btn-grey"
                  style={{ width: '100%' }}
                  disabled={!!user}
                  onClick={() => requireAuthGate()}
                >
                  {user ? 'Supplier accounts only' : 'Sign in as a supplier'}
                </button>
              </>
            ) : !canQuote ? (
              <>
                <p className="muted" style={{ marginTop: 0 }}>
                  This request is <b>{rfq.status}</b> and is no longer accepting quotations.
                </p>
                <Link href="/supplier/rfq-opportunities" className="btn btn-grey" style={{ width: '100%' }}>
                  See open requests
                </Link>
              </>
            ) : (
              <>
                <p className="muted" style={{ marginTop: 0 }}>
                  Respond with your unit price and lead time. Your verified profile travels with the quotation.
                </p>
                {err && <div className="errtext" style={{ marginBottom: 10 }}>{err}</div>}
                <div className="field">
                  <label htmlFor="q-price">Unit price (USD) <i>*</i></label>
                  <input
                    id="q-price"
                    className="in"
                    inputMode="decimal"
                    placeholder="e.g. 8400"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="q-lead">Lead time (days) <i>*</i></label>
                  <input
                    id="q-lead"
                    className="in"
                    inputMode="numeric"
                    placeholder="e.g. 30"
                    value={form.leadTimeDays}
                    onChange={(e) => setForm({ ...form, leadTimeDays: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="q-notes">Terms and notes</label>
                  <textarea
                    id="q-notes"
                    className="in"
                    rows={3}
                    placeholder="Incoterms, grade, packing, sample policy, validity…"
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                  <div className="hint">
                    Buyers compare price, lead time and verification side by side.
                  </div>
                </div>
                <button
                  className="btn btn-gold"
                  style={{ width: '100%' }}
                  disabled={!form.price || !form.leadTimeDays || submitQuote.isPending}
                  onClick={submit}
                >
                  {submitQuote.isPending ? 'Submitting…' : 'Submit quotation'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </View>
  );
}
