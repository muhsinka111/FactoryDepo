import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { useProducts } from '@workspace/api-client-react';
import { Page, SectionHead, ProductCard, Spinner } from '../components';
import { CATEGORIES, COUNTRIES } from '@workspace/api-spec';

function useQueryParam(key: string): string {
  const params = new URLSearchParams(window.location.search);
  return params.get(key) ?? '';
}

export default function Products() {
  const initialCategory = useQueryParam('category');
  const [q, setQ] = useState('');
  const [appliedQ, setAppliedQ] = useState('');
  const [category, setCategory] = useState(initialCategory);
  const [country, setCountry] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [page, setPage] = useState(1);

  const res = useProducts({
    q: appliedQ || undefined,
    category: category || undefined,
    country: country || undefined,
    minPrice: minPrice ? Number(minPrice) : undefined,
    maxPrice: maxPrice ? Number(maxPrice) : undefined,
    page,
    limit: 12,
  });

  const apply = (p = 1) => { setAppliedQ(q); setPage(p); };

  const pages = res.data?.pages ?? 1;

  return (
    <Page wide>
      <SectionHead
        eyebrow="Marketplace"
        title={<>Search <span style={{ color: 'var(--accent-ink)' }}>500,000+</span> industrial products.</>}
        sub="Filter by category, origin country and price. Every listing is factory-direct and verified."
      />

      <div className="p-layout">
        {/* filters */}
        <aside className="filter-panel">
          <h4>Search</h4>
          <div className="lbl-row">
            <input
              placeholder="Copper cathode, pumps…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && apply()}
            />
          </div>
          <button className="btn btn-primary" style={{ width: '100%', marginTop: 10 }} onClick={() => apply()}>Search</button>

          <h4>Category</h4>
          <select value={category} onChange={(e) => { setCategory(e.target.value); apply(1); }}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>

          <h4>Origin Country</h4>
          <select value={country} onChange={(e) => { setCountry(e.target.value); apply(1); }}>
            <option value="">All countries</option>
            {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>

          <h4>Price Range (USD)</h4>
          <div className="lbl-row">
            <input placeholder="Min" inputMode="numeric" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} />
            <input placeholder="Max" inputMode="numeric" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} />
          </div>
          <button className="btn btn-outline btn-sm" style={{ width: '100%', marginTop: 10 }} onClick={() => apply(1)}>Apply Price</button>

          <h4>Quick Filters</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {CATEGORIES.slice(0, 5).map((c) => (
              <button key={c} className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start', color: category === c ? 'var(--accent-ink)' : 'var(--muted)' }} onClick={() => { setCategory(c); apply(1); }}>{c}</button>
            ))}
          </div>
        </aside>

        {/* results */}
        <div>
          {res.isLoading ? <Spinner /> : res.data?.items.length ? (
            <>
              <p className="muted mono" style={{ fontSize: 12.5, marginBottom: 16 }}>
                {res.data.total.toLocaleString()} results · page {res.data.page} / {res.data.pages}
              </p>
              <div className="grid-products">
                {res.data.items.map((p) => <ProductCard key={p.id} p={p} />)}
              </div>
              {pages > 1 && (
                <div className="pager">
                  <button disabled={page <= 1} onClick={() => setPage(page - 1)}>←</button>
                  {Array.from({ length: Math.min(pages, 7) }, (_, i) => i + 1).map((n) => (
                    <button key={n} className={n === page ? 'on' : ''} onClick={() => setPage(n)}>{n}</button>
                  ))}
                  <button disabled={page >= pages} onClick={() => setPage(page + 1)}>→</button>
                </div>
              )}
            </>
          ) : (
            <div className="empty">
              <h3>No products found</h3>
              <p>Try a different search or clear some filters.</p>
              <Link href="/products" className="btn btn-outline" style={{ marginTop: 14 }}>Clear Filters</Link>
            </div>
          )}
        </div>
      </div>
    </Page>
  );
}
