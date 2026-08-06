import { useState } from 'react';
import { useRfqDetail, useCreateQuote, useMe } from '@workspace/api-client-react';
import { Page, Spinner, StatusChip, TrustRing, Stars, requireAuthGate } from '../components';
import { Link } from 'wouter';
import type { ApiError } from '@workspace/api-client-react';

export default function RfqDetail({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const { data, isLoading, error } = useRfqDetail(Number.isFinite(id) ? id : undefined);
  const { data: user } = useMe();
  const submitQuote = useCreateQuote(id);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({ price: '', leadTimeDays: '', notes: '' });

  const isSupplier = user?.role === 'supplier';

  if (isLoading) return <Page><Spinner /></Page>;
  if (error || !data) return <Page><div className="empty"><h3>RFQ not found</h3><Link href="/rfq" className="btn btn-outline" style={{ marginTop: 12 }}>Back to Exchange</Link></div></Page>;

  const rfq = data.rfq;
  const canQuote = isSupplier && rfq.status !== 'closed';

  const submit = async () => {
    setErr('');
    try {
      await submitQuote.mutateAsync({
        price: Number(form.price),
        currency: 'USD',
        leadTimeDays: Number(form.leadTimeDays),
        notes: form.notes || undefined,
      });
      setForm({ price: '', leadTimeDays: '', notes: '' });
    } catch (e) {
      setErr((e as ApiError).message ?? 'Could not submit quote');
    }
  };

  return (
    <Page wide>
      <Link href="/rfq" className="mono" style={{ fontSize: 12.5, color: 'var(--faint)' }}>← Back to RFQ Exchange</Link>

      <div className="card" style={{ padding: 28, marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
              <span className="chip chip-blue">{rfq.category}</span>
              <StatusChip status={rfq.status} />
              <span className="mono" style={{ fontSize: 12, color: 'var(--faint)' }}>Posted {new Date(rfq.createdAt).toLocaleDateString()}</span>
            </div>
            <h1 style={{ fontSize: 26 }}>{rfq.title}</h1>
            {rfq.description && <p className="muted" style={{ marginTop: 10, maxWidth: 640 }}>{rfq.description}</p>}
            <div className="stat-row" style={{ maxWidth: 560, marginTop: 18 }}>
              <div className="cell"><b>{rfq.quantity.toLocaleString()} {rfq.unit}</b><span>QUANTITY</span></div>
              <div className="cell"><b>{rfq.targetCountry ?? 'Any'}</b><span>TARGET COUNTRY</span></div>
              <div className="cell"><b>{rfq.quoteCount}</b><span>QUOTES</span></div>
            </div>
          </div>
        </div>
      </div>

      <div className="rfq-detail-grid" style={{ marginTop: 24 }}>
        <div>
          <h2 style={{ fontSize: 19, marginBottom: 14 }}>Quotations ({data.quotes.length})</h2>
          {data.quotes.length === 0 && (
            <div className="empty" style={{ padding: 40 }}>
              <h3>No quotations yet</h3>
              <p>Verified suppliers are reviewing this requirement.</p>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {data.quotes.map((q) => (
              <div key={q.id} className="card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  <span className="avatar" style={{ width: 42, height: 42, fontSize: 14 }}>{q.supplierName.split(' ').map((w) => w[0]).join('').slice(0, 2)}</span>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{q.supplierName}</div>
                    <div style={{ fontSize: 12, color: 'var(--faint)' }}>Trust Score {Math.round(q.trustScore)} · <Stars rating={Math.min(5, Math.max(3, q.trustScore / 20))} /></div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 19, color: 'var(--accent-ink)' }}>
                      {q.currency === 'USD' ? '$' : q.currency} {q.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                    </div>
                    <div className="mono" style={{ fontSize: 11, color: 'var(--faint)' }}>Lead time {q.leadTimeDays} days</div>
                  </div>
                  <StatusChip status={q.status} />
                </div>
                {q.notes && <p className="muted" style={{ fontSize: 13.5, marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>{q.notes}</p>}
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ fontSize: 17, marginBottom: 6 }}>Submit a Quotation</h3>
          <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
            {canQuote ? 'Suppliers: respond with your best price and lead time.' : 'Sign in as a supplier to quote this RFQ.'}
          </p>
          {err && <div className="form-error">{err}</div>}
          {canQuote ? (
            <>
              <div className="field">
                <label>Price (USD) *</label>
                <input inputMode="numeric" placeholder="e.g. 8400" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
              </div>
              <div className="field">
                <label>Lead Time (days) *</label>
                <input inputMode="numeric" placeholder="e.g. 30" value={form.leadTimeDays} onChange={(e) => setForm({ ...form, leadTimeDays: e.target.value })} />
              </div>
              <div className="field">
                <label>Notes (specs, incoterms, validity)</label>
                <textarea placeholder="FOB / CIF terms, grade, sample policy…" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <button className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={!form.price || !form.leadTimeDays || submitQuote.isPending} onClick={submit}>
                {submitQuote.isPending ? 'Submitting…' : 'Submit Quote'}
              </button>
            </>
          ) : (
            <button className="btn btn-primary btn-lg" style={{ width: '100%' }} onClick={() => requireAuthGate()}>
              Join as a Supplier to Quote
            </button>
          )}
        </div>
      </div>
    </Page>
  );
}
