import { Link } from 'wouter';
import { useProducts, useSuppliers, useRfqs } from '@workspace/api-client-react';
import { Page, SectionHead, ProductCard, SupplierCard, RfqCard, Spinner } from '../components';
import { CATEGORIES, COUNTRIES } from '@workspace/api-spec';

const CAT_ICONS: Record<string, string> = {
  'Metals & Minerals': 'M',
  Steel: 'S',
  Chemicals: 'C',
  Machinery: 'Ma',
  'Industrial Equipment': 'IE',
  Electronics: 'E',
  Automotive: 'A',
  'Construction Materials': 'CM',
  'Renewable Energy': 'RE',
  Packaging: 'P',
  'Plastic & Rubber': 'PR',
  Textiles: 'T',
};

export default function Home() {
  const featured = useProducts({ limit: 4 });
  const suppliers = useSuppliers();
  const rfqs = useRfqs();

  return (
    <Page wide>
      {/* hero — light */}
      <section className="hero-light" style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1.15fr .85fr', gap: 44, alignItems: 'center' }}>
        <div>
          <span className="eyebrow">The Operating System for Global Industrial Trade</span>
          <h1 style={{ marginTop: 16 }}>Source the world's <span className="mark">industrial supply</span> — verified.</h1>
          <p>Connect with verified manufacturers, mines and industrial suppliers worldwide. Inspections, testing, logistics and business services — all in one trusted platform.</p>
          <div className="actions">
            <Link href="/products" className="btn btn-primary btn-lg">Find Suppliers →</Link>
            <Link href="/sign-up" className="btn btn-outline btn-lg" style={{ borderColor: 'var(--border-strong)', color: 'var(--ink-2)' }}>Become a Supplier</Link>
            <Link href="/rfq" className="btn btn-ghost btn-lg">▶ Post an RFQ</Link>
          </div>
        </div>
        <div className="hero-feed">
          <div className="hero-feed-head"><span className="dot"></span>Live Trade Activity</div>
          <div className="feed-item">
            <span className="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg></span>
            <span><b>New RFQ: 100 Tons Copper Cathode</b><span>FOB Türkiye · 2m ago · 3 quotes</span></span>
          </div>
          <div className="feed-item">
            <span className="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35M8 11h6M11 8v6" /></svg></span>
            <span><b>Inspection Completed: Foshan Steel Co</b><span>Guangdong, China · 5m ago · Score 91</span></span>
          </div>
          <div className="feed-item">
            <span className="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></svg></span>
            <span><b>New Supplier Joined: Shandong Mining Group</b><span>Shandong, China · 8m ago · Trust 91</span></span>
          </div>
          <div style={{ padding: '13px 18px', textAlign: 'center', borderTop: '1px solid var(--border)' }}>
            <Link href="/rfq" className="mono" style={{ fontSize: 11.5, color: 'var(--accent-ink)', fontWeight: 600 }}>View live RFQ market →</Link>
          </div>
        </div>
      </section>

      {/* stats */}
      <section className="h-stats" style={{ display: 'grid', gap: 14, marginTop: 26 }}>
        {[
          ['500,000+', 'Industrial Products'],
          ['150,000+', 'Verified Suppliers'],
          ['80+', 'Countries'],
          ['2M+', 'RFQs Completed'],
          ['95%', 'On-time Delivery'],
        ].map(([n, l]) => (
          <div key={l} className="card" style={{ padding: '20px 12px', textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, color: 'var(--accent-ink)' }}>{n}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{l}</div>
          </div>
        ))}
      </section>

      {/* categories */}
      <section style={{ marginTop: 64 }}>
        <SectionHead eyebrow="Industries" title={<>Industrial only. <span style={{ color: 'var(--accent-ink)' }}>Deep, not wide.</span></>} sub="Ten core sectors, each with its own supply chain intelligence." />
        <div className="h-cats" style={{ display: 'grid', gap: 12 }}>
          {CATEGORIES.map((c) => (
            <Link key={c} href={`/products?category=${encodeURIComponent(c)}`} className="card" style={{ padding: '16px 12px', textAlign: 'center', transition: 'all .15s ease' }}>
              <div style={{
                width: 36, height: 36, margin: '0 auto 10px', borderRadius: 9, display: 'grid', placeItems: 'center',
                background: 'rgba(46,124,246,.1)', color: 'var(--accent-ink)', fontWeight: 800, fontFamily: 'var(--font-display)', fontSize: 13,
              }}>{CAT_ICONS[c] ?? '·'}</div>
              <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.3 }}>{c}</div>
            </Link>
          ))}
        </div>
      </section>

      {/* featured products */}
      <section style={{ marginTop: 64 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 22 }}>
          <SectionHead eyebrow="Marketplace" title={<>Featured <span style={{ color: 'var(--accent-ink)' }}>products.</span></>} sub="Factory-direct pricing, real MOQs, verified origins." />
          <Link href="/products" className="btn btn-outline">View All →</Link>
        </div>
        {featured.isLoading ? <Spinner /> : (
          <div className="grid-products">
            {featured.data?.items.map((p) => <ProductCard key={p.id} p={p} />)}
          </div>
        )}
      </section>

      {/* suppliers */}
      <section style={{ marginTop: 64 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 22 }}>
          <SectionHead eyebrow="Verified Directory" title={<>Top verified <span style={{ color: 'var(--accent-ink)' }}>suppliers.</span></>} sub="Every profile carries an on-site verified Trust Score." />
          <Link href="/suppliers" className="btn btn-outline">All Suppliers →</Link>
        </div>
        {suppliers.isLoading ? <Spinner /> : (
          <div className="grid-suppliers">
            {suppliers.data?.items.slice(0, 3).map((s) => <SupplierCard key={s.id} s={s} />)}
          </div>
        )}
      </section>

      {/* RFQ + countries */}
      <section className="h-rfqrow" style={{ marginTop: 64, display: 'grid', gap: 24 }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 22 }}>
            <SectionHead eyebrow="Live RFQ Market" title={<>Requests from <span style={{ color: 'var(--accent-ink)' }}>real buyers.</span></>} />
            <Link href="/rfq" className="btn btn-primary">Post Your RFQ →</Link>
          </div>
          {rfqs.isLoading ? <Spinner /> : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 14 }}>
              {rfqs.data?.items.slice(0, 4).map((r) => <RfqCard key={r.id} r={r} />)}
            </div>
          )}
        </div>
        <div className="card" style={{ padding: 26, background: 'linear-gradient(160deg,#0B1830,#07101F 75%)', color: '#E6EFFA', border: 'none', display: 'flex', flexDirection: 'column' }}>
          <span className="eyebrow" style={{ color: '#5CA1FF' }}>Global Network</span>
          <h2 style={{ fontSize: 22, margin: '12px 0 8px' }}>On-the-ground in every sourcing corridor.</h2>
          <p style={{ color: 'rgba(143,163,191,.9)', fontSize: 13.5, flex: 1 }}>In-country inspectors, partner laboratories and warehouses where your supply chains actually run.</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 22 }}>
            {[['80+', 'Countries Covered'], ['200+', 'Inspection Partners'], ['50+', 'Accredited Laboratories'], ['100+', 'Warehouses']].map(([n, l]) => (
              <div key={l} style={{ background: 'rgba(148,173,209,.08)', border: '1px solid rgba(148,173,209,.16)', borderRadius: 12, padding: 14 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, color: '#fff' }}>{n}</div>
                <div style={{ fontSize: 11.5, color: 'rgba(143,163,191,.9)' }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* sourcing corridors */}
      <section style={{ marginTop: 64, textAlign: 'center' }}>
        <SectionHead eyebrow="Sourcing Corridors" title={<>Türkiye ↔ China ↔ <span style={{ color: 'var(--accent-ink)' }}>the world.</span></>} sub="Primary sourcing corridors, live on the platform today." />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          {COUNTRIES.map((c) => (
            <Link key={c} href={`/suppliers`} className="chip chip-gray" style={{ fontSize: 13, padding: '7px 16px' }}>{c}</Link>
          ))}
        </div>
      </section>
    </Page>
  );
}
