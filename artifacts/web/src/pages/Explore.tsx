import { useEffect, useState } from 'react';
import { useProducts } from '@workspace/api-client-react';
import { View, ProductCard, Spinner, Empty } from '../components';
import { CATEGORIES, COUNTRIES } from '@workspace/api-spec';

function readParam(key: string): string {
  return new URLSearchParams(window.location.search).get(key) ?? '';
}

/**
 * Explore — the public marketplace browse view (buyer home when logged out).
 * Every number shown here comes from the API; nothing is embellished.
 */
export default function Explore() {
  const [q, setQ] = useState(() => readParam('q'));
  const [appliedQ, setAppliedQ] = useState(() => readParam('q'));
  const [category, setCategory] = useState(() => readParam('category'));
  const [country, setCountry] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [page, setPage] = useState(1);

  // Keep in step with the topbar search and the category rail, which navigate
  // to /explore?q=… and /explore?category=… .
  useEffect(() => {
    const onPop = () => {
      setQ(readParam('q'));
      setAppliedQ(readParam('q'));
      setCategory(readParam('category'));
      setPage(1);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const res = useProducts({
    q: appliedQ || undefined,
    category: category || undefined,
    country: country || undefined,
    minPrice: minPrice ? Number(minPrice) : undefined,
    maxPrice: maxPrice ? Number(maxPrice) : undefined,
    page,
    limit: 24,
  });

  const apply = (p = 1) => { setAppliedQ(q); setPage(p); };
  const clear = () => {
    setQ(''); setAppliedQ(''); setCategory(''); setCountry('');
    setMinPrice(''); setMaxPrice(''); setPage(1);
  };

  const total = res.data?.total ?? 0;
  const pages = res.data?.pages ?? 1;
  const items = res.data?.items ?? [];

  return (
    <View
      title="Explore stock"
      sub={
        res.isLoading
          ? 'Loading live lots…'
          : `${total.toLocaleString()} listing${total === 1 ? '' : 's'} matching your filters`
      }
      actions={
        <button className="btn btn-sm btn-grey" onClick={clear}>Clear filters</button>
      }
    >
      <div className="filters">
        <input
          className="in"
          style={{ width: 220 }}
          placeholder="Copper cathode, pumps…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && apply()}
          aria-label="Search listings"
        />
        <select value={category} onChange={(e) => { setCategory(e.target.value); apply(1); }} aria-label="Category">
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={country} onChange={(e) => { setCountry(e.target.value); apply(1); }} aria-label="Origin country">
          <option value="">All countries</option>
          {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input
          className="in" style={{ width: 84 }} placeholder="Min $" inputMode="numeric"
          value={minPrice} onChange={(e) => setMinPrice(e.target.value)}
        />
        <input
          className="in" style={{ width: 84 }} placeholder="Max $" inputMode="numeric"
          value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)}
        />
        <button className="btn btn-sm btn-primary" onClick={() => apply(1)}>Search</button>
      </div>

      {res.isLoading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <Empty title="No listings match those filters">
          Try a broader category, a different origin country, or clear the filters.
        </Empty>
      ) : (
        <>
          <div className="feedgrid">
            {items.map((p) => <ProductCard key={p.id} p={p} />)}
          </div>

          {pages > 1 && (
            <div className="row" style={{ justifyContent: 'center', marginTop: 14, gap: 6 }}>
              <button className="btn btn-sm btn-grey" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
              <span className="muted" style={{ fontSize: 12, alignSelf: 'center' }}>
                Page {res.data?.page ?? page} of {pages}
              </span>
              <button className="btn btn-sm btn-grey" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next →</button>
            </div>
          )}
        </>
      )}
    </View>
  );
}
