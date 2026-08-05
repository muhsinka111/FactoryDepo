import { useSupplier, useProducts } from '@workspace/api-client-react';
import { Page, Spinner, TrustRing, Stars, Verified, ProductCard } from '../components';
import { Link } from 'wouter';

export default function SupplierDetail({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const { data: s, isLoading, error } = useSupplier(Number.isFinite(id) ? id : undefined);
  const products = useProducts({ limit: 50 }, { enabled: !!s });

  if (isLoading) return <Page><Spinner /></Page>;
  if (error || !s) return <Page><div className="empty"><h3>Supplier not found</h3><Link href="/suppliers" className="btn btn-outline" style={{ marginTop: 12 }}>Back to Directory</Link></div></Page>;

  const mine = products.data?.items.filter((p) => p.supplierId === s.id) ?? [];

  return (
    <Page wide>
      <Link href="/suppliers" className="mono" style={{ fontSize: 12.5, color: 'var(--faint)' }}>← Back to Directory</Link>

      <div className="card" style={{ padding: 30, marginTop: 16 }}>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="avatar" style={{ width: 68, height: 68, fontSize: 23 }}>{s.companyName.split(' ').map((w) => w[0]).join('').slice(0, 2)}</span>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: 26 }}>{s.companyName}</h1>
              {s.verifiedLevel >= 2 && <Verified />}
              {s.verifiedLevel === 3 && <span className="chip chip-blue">Level 3 · Track Record</span>}
            </div>
            <div style={{ fontSize: 13.5, color: 'var(--faint)', marginTop: 4 }}>
              {s.country}{s.city ? ` · ${s.city}` : ''} · Since {s.since ?? '—'} · <Stars rating={s.rating} />
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <TrustRing score={s.trustScore} size={72} />
            <div className="mono" style={{ fontSize: 9.5, color: 'var(--faint)', marginTop: 6 }}>TRUST SCORE</div>
          </div>
        </div>

        {s.description && <p className="muted" style={{ marginTop: 18, maxWidth: 700 }}>{s.description}</p>}

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 16 }}>
          {s.tags.map((t) => <span key={t} className="tag" style={{ fontSize: 12, padding: '5px 11px' }}>{t}</span>)}
        </div>

        <div className="stat-row" style={{ marginTop: 22, maxWidth: 620 }}>
          <div className="cell"><b>{s.rating.toFixed(1)}</b><span>RATING</span></div>
          <div className="cell"><b>{s.inspectionsCount}</b><span>INSPECTIONS</span></div>
          <div className="cell"><b>%{s.fulfillmentRate.toFixed(1)}</b><span>FULFILLMENT</span></div>
          <div className="cell"><b>{s.productCount}</b><span>PRODUCTS</span></div>
        </div>
      </div>

      <div style={{ marginTop: 40 }}>
        <h2 style={{ fontSize: 22, marginBottom: 18 }}>Products from {s.companyName}</h2>
        {mine.length ? (
          <div className="grid-products">{mine.map((p) => <ProductCard key={p.id} p={p} />)}</div>
        ) : (
          <div className="empty"><h3>No active listings yet</h3><p>Request a quotation directly for this supplier's catalog.</p></div>
        )}
      </div>
    </Page>
  );
}
