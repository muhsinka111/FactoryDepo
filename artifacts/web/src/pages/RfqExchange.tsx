import { useState } from 'react';
import { useRfqs, useCreateRfq, useMe } from '@workspace/api-client-react';
import { Page, SectionHead, RfqCard, Spinner, StatusChip } from '../components';
import { Link } from 'wouter';
import { CATEGORIES, COUNTRIES } from '@workspace/api-spec';
import type { ApiError } from '@workspace/api-client-react';

export default function RfqExchange() {
  const res = useRfqs();
  const { data: user } = useMe();
  const create = useCreateRfq();
  const [showForm, setShowForm] = useState(false);
  const [err, setErr] = useState('');
  const [form, setForm] = useState<{ title: string; category: string; description: string; quantity: string; unit: string; targetCountry: string }>({ title: '', category: CATEGORIES[0], description: '', quantity: '', unit: 'MT', targetCountry: '' });

  const isBuyer = user?.role === 'buyer';

  const submit = async () => {
    setErr('');
    try {
      await create.mutateAsync({
        title: form.title,
        category: form.category,
        description: form.description || undefined,
        quantity: Number(form.quantity),
        unit: form.unit,
        targetCountry: form.targetCountry || undefined,
      });
      setShowForm(false);
      setForm({ title: '', category: CATEGORIES[0], description: '', quantity: '', unit: 'MT', targetCountry: '' });
    } catch (e) {
      setErr((e as ApiError).message ?? 'Could not post RFQ');
    }
  };

  return (
    <Page wide>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <SectionHead
          eyebrow="Live RFQ Exchange"
          title={<>Post a requirement. <span style={{ color: 'var(--accent-ink)' }}>Get verified quotes.</span></>}
          sub="Buyers post requirements, verified factories respond within hours. Compare price, lead time, quality and Trust Score — not just the lowest price."
        />
        {isBuyer && (
          <button className="btn btn-primary btn-lg" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : '+ Post Your RFQ'}
          </button>
        )}
      </div>

      {showForm && (
        <div className="card" style={{ padding: 26, marginBottom: 26, borderColor: 'rgba(46,124,246,.45)' }}>
          <h3 style={{ fontSize: 18, marginBottom: 16 }}>New Request for Quotation</h3>
          {err && <div className="form-error">{err}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>What do you need? *</label>
              <input placeholder="e.g. 100 Tons Copper Cathode" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="field">
              <label>Category</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Quantity & Unit *</label>
              <div className="lbl-row">
                <input placeholder="100" inputMode="numeric" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
                <input placeholder="MT" style={{ maxWidth: 90 }} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label>Target Country (delivery)</label>
              <select value={form.targetCountry} onChange={(e) => setForm({ ...form, targetCountry: e.target.value })}>
                <option value="">Any country</option>
                {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Details (specs, certifications, delivery terms)</label>
              <input placeholder="Optional — purity, grade, Incoterms…" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
          <button className="btn btn-primary" style={{ marginTop: 6 }} disabled={!form.title.trim() || !form.quantity || create.isPending} onClick={submit}>
            {create.isPending ? 'Posting…' : 'Post RFQ'}
          </button>
        </div>
      )}

      {!isBuyer && !user && (
        <p className="chip chip-blue" style={{ marginBottom: 22, fontSize: 13, padding: '9px 16px' }}>
          <Link href="/sign-up" style={{ fontWeight: 700 }}>Create a free buyer account</Link> to post RFQs — or browse and quote as a supplier.
        </p>
      )}

      {res.isLoading ? <Spinner /> : res.data?.items.length ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
          {res.data.items.map((r) => <RfqCard key={r.id} r={r} />)}
        </div>
      ) : (
        <div className="empty"><h3>No RFQs yet</h3><p>Be the first to post a requirement.</p></div>
      )}
    </Page>
  );
}

export function RfqCardInline({ r }: { r: NonNullable<ReturnType<typeof useRfqs>['data']>['items'][number] }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span className="eyebrow">{r.category}</span>
        <StatusChip status={r.status} />
      </div>
      <div style={{ fontWeight: 600, fontSize: 14.5 }}>{r.title}</div>
      <div className="mono" style={{ fontSize: 11.5, color: 'var(--faint)', marginTop: 4 }}>
        {r.quantity.toLocaleString()} {r.unit} · {r.quoteCount} quotes
      </div>
    </div>
  );
}
