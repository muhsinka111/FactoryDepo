import { useProduct, useSupplier } from '@workspace/api-client-react';
import { Page, Spinner, ProductArt, productKind, Verified, TrustRing, Stars } from '../components';
import { Link } from 'wouter';

export default function ProductDetail({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const { data: p, isLoading, error } = useProduct(Number.isFinite(id) ? id : undefined);
  const supplier = useSupplier(p?.supplierId);

  if (isLoading) return <Page><Spinner /></Page>;
  if (error || !p) return <Page><div className="empty"><h3>Product not found</h3><Link href="/products" className="btn btn-outline" style={{ marginTop: 12 }}>Back to Marketplace</Link></div></Page>;

  return (
    <Page wide>
      <Link href="/products" className="mono" style={{ fontSize: 12.5, color: 'var(--faint)' }}>← Back to Marketplace</Link>
      <div className="detail-grid" style={{ marginTop: 16 }}>
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ height: 300, display: 'grid', placeItems: 'center', background: 'linear-gradient(150deg,var(--surface-2),var(--bg))' }}>
            <div style={{ transform: 'scale(1.6)' }}><ProductArt kind={productKind(p.name)} /></div>
          </div>
          <div style={{ padding: 28 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="chip chip-blue">{p.category}</span>
              {p.verified && <Verified />}
              {p.purityGrade && <span className="tag">{p.purityGrade}</span>}
            </div>
            <h1 style={{ fontSize: 28, margin: '14px 0 8px' }}>{p.name}</h1>
            <p className="muted" style={{ maxWidth: 560 }}>{p.description ?? 'Factory-direct industrial product. Request a quotation to get the latest pricing, lead time and delivery terms.'}</p>
            <div className="spec-list">
              {p.spec.map((s) => <span key={s} className="tag" style={{ fontSize: 12, padding: '5px 11px' }}>{s}</span>)}
            </div>
            <div className="stat-row" style={{ maxWidth: 560, marginTop: 20 }}>
              <div className="cell"><b>{p.currency === 'USD' ? '$' : p.currency} {p.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}</b><span>PRICE / {p.unit}</span></div>
              <div className="cell"><b>{p.moq.toLocaleString()} {p.unit}</b><span>MIN. ORDER</span></div>
              <div className="cell"><b>{p.originCountry}</b><span>ORIGIN</span></div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {supplier.data && (
            <Link href={`/suppliers/${supplier.data.id}`} className="card" style={{ padding: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
                <span className="avatar" style={{ width: 46, height: 46 }}>{supplier.data.companyName.split(' ').map((w) => w[0]).join('').slice(0, 2)}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15.5 }}>{supplier.data.companyName}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--faint)' }}>{supplier.data.country} · <Stars rating={supplier.data.rating} /></div>
                </div>
                <TrustRing score={supplier.data.trustScore} size={48} />
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {supplier.data.tags.slice(0, 3).map((t) => <span key={t} className="tag">{t}</span>)}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 12 }}>
                {supplier.data.inspectionsCount} inspections · %{supplier.data.fulfillmentRate.toFixed(1)} on-time fulfillment
              </div>
            </Link>
          )}
          <div className="card" style={{ padding: 24, borderColor: 'rgba(46,124,246,.4)' }}>
            <h3 style={{ fontSize: 17, marginBottom: 6 }}>Request a Quotation</h3>
            <p className="muted" style={{ fontSize: 13.5, marginBottom: 16 }}>Verified factories respond within hours with price, lead time and MOQ.</p>
            <Link href={`/sign-up?next=/products/${p.id}`} className="btn btn-primary btn-lg" style={{ width: '100%' }}>Request RFQ</Link>
            <p className="mono" style={{ fontSize: 11.5, color: 'var(--faint)', textAlign: 'center', marginTop: 12 }}>
              Free to join · No listing fees
            </p>
          </div>
          <div className="card" style={{ padding: 20 }}>
            <h4 style={{ fontSize: 13, fontFamily: 'var(--font-mono)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--faint)', marginBottom: 10 }}>Trade Services</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {['Factory inspection before payment', 'Laboratory testing & material analysis', 'Container loading supervision', 'International shipping & customs'].map((s) => (
                <div key={s} style={{ display: 'flex', gap: 9, fontSize: 13.5, color: 'var(--ink-2)' }}>
                  <span style={{ color: 'var(--green)' }}>✓</span>{s}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Page>
  );
}
