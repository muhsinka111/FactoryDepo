import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { useProducts, useRfqs, useSuppliers, useMe } from '@workspace/api-client-react';
import { View, ProductCard, Spinner, Empty, RAIL_CATEGORIES } from '../components';
import { COUNTRIES } from '@workspace/api-spec';

/**
 * Buyer feed — the landing view after sign-in.
 *
 * A dense marketplace front page: an honest counters stripe, a filter bar, and
 * the listing grid. Every figure is read straight off the API responses
 * (`total` from /api/products, real rows from /api/suppliers and /api/rfqs);
 * nothing is estimated, and unavailable fields render "—".
 */

function readParam(key: string): string {
  return new URLSearchParams(window.location.search).get(key) ?? '';
}

export default function Feed() {
  const { data: user } = useMe();

  const [q, setQ] = useState(() => readParam('q'));
  const [appliedQ, setAppliedQ] = useState(() => readParam('q'));
  const [category, setCategory] = useState(() => readParam('category'));
  const [country, setCountry] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [page, setPage] = useState(1);

  // Keep in step with the topbar search and the category rail, which both
  // navigate to /feed?q=… and /feed?category=… .
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

  const products = useProducts({
    q: appliedQ || undefined,
    category: category || undefined,
    country: country || undefined,
    minPrice: minPrice ? Number(minPrice) : undefined,
    maxPrice: maxPrice ? Number(maxPrice) : undefined,
    page,
    limit: 24,
  });
  const suppliers = useSuppliers();
  const rfqs = useRfqs();

  const items = products.data?.items ?? [];
  const total = products.data?.total ?? 0;
  const pages = products.data?.pages ?? 1;
  const verifiedSuppliers = (suppliers.data?.items ?? []).filter((s) => s.verifiedLevel >= 2).length;
  const openRequests = (rfqs.data?.items ?? []).filter((r) => r.status === 'open').length;

  const hasFilters = !!(appliedQ || category || country || minPrice || maxPrice);
  const apply = (p = 1) => { setAppliedQ(q); setPage(p); };
  const clear = () => {
    setQ(''); setAppliedQ(''); setCategory(''); setCountry('');
    setMinPrice(''); setMaxPrice(''); setPage(1);
  };
  const pickCategory = (c: string) => {
    setCategory(c === 'All industries' ? '' : c);
    setPage(1);
  };

  const first = total === 0 ? 0 : (page - 1) * 24 + 1;
  const last = Math.min(page * 24, total);

  return (
    <View
      title={user ? `Welcome back, ${user.name.split(' ')[0]}` : 'Marketplace feed'}
      sub="Ready stock, surplus and overstock lots from verified factories — newest first."
      actions={
        <div className="row">
          <Link href="/supplier/post" className="btn btn-sm btn-grey">Sell stock</Link>
          <Link href="/rfqs" className="btn btn-gold">Post a request</Link>
        </div>
      }
    >
      <div className="stripe">
        <span>
          <b>{products.isLoading ? '—' : total.toLocaleString()}</b> lots match your filters
        </span>
        <span>
          <b>{suppliers.isLoading ? '—' : verifiedSuppliers}</b> verified suppliers
        </span>
        <span>
          <b>{rfqs.isLoading ? '—' : openRequests}</b> open requests
        </span>
      </div>

      {/* category filter — same vocabulary as the category rail */}
      <div className="card" style={{ marginBottom: 11 }}>
        <div className="bd">
          <div className="filters" style={{ marginBottom: 8 }}>
            <button
              className={`chip ${category === '' ? 'on' : ''}`}
              onClick={() => pickCategory('All industries')}
            >
              All industries
            </button>
            {RAIL_CATEGORIES.map((c) => (
              <button
                key={c}
                className={`chip ${category === c ? 'on' : ''}`}
                onClick={() => pickCategory(c)}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="filters" style={{ marginBottom: 0 }}>
            <input
              className="in"
              style={{ width: 210 }}
              placeholder="Copper cathode, pumps…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && apply()}
              aria-label="Search lots"
            />
            <select
              value={country}
              onChange={(e) => { setCountry(e.target.value); setPage(1); }}
              aria-label="Origin country"
            >
              <option value="">All origins</option>
              {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input
              className="in"
              style={{ width: 88 }}
              placeholder="Min $"
              inputMode="numeric"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
              aria-label="Minimum price"
            />
            <input
              className="in"
              style={{ width: 88 }}
              placeholder="Max $"
              inputMode="numeric"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              aria-label="Maximum price"
            />
            <button className="btn btn-sm btn-primary" onClick={() => apply(1)}>Search</button>
            {hasFilters && (
              <button className="btn btn-sm btn-grey" onClick={clear}>Clear filters</button>
            )}
            <span className="muted" style={{ marginLeft: 'auto' }}>
              {products.isLoading ? '—' : `${total.toLocaleString()} lot${total === 1 ? '' : 's'}`}
            </span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="hd">
          <h2>{category || 'All industries'}</h2>
          <span className="muted" style={{ marginLeft: 'auto' }}>
            {products.isLoading
              ? '—'
              : total === 0
                ? 'No lots'
                : `${first.toLocaleString()}–${last.toLocaleString()} of ${total.toLocaleString()}`}
          </span>
        </div>

        {products.isLoading ? (
          <Spinner />
        ) : items.length === 0 ? (
          <Empty title="No lots match those filters">
            Try a different industry, another origin country, or clear the filters.
          </Empty>
        ) : (
          <div className="bd">
            <div className="feedgrid">
              {items.map((p) => <ProductCard key={p.id} p={p} />)}
            </div>
          </div>
        )}
      </div>

      {pages > 1 && (
        <div className="row" style={{ justifyContent: 'center', marginTop: 12, gap: 6 }}>
          <button
            className="btn btn-sm btn-grey"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            ← Prev
          </button>
          <span className="muted">
            Page {(products.data?.page ?? page).toLocaleString()} of {pages.toLocaleString()}
          </span>
          <button
            className="btn btn-sm btn-grey"
            disabled={page >= pages}
            onClick={() => setPage(page + 1)}
          >
            Next →
          </button>
        </div>
      )}

      <div className="stripe" style={{ marginTop: 12 }}>
        <span>
          Looking for something specific?{' '}
          <Link href="/rfqs">Post a request</Link> and let verified factories quote you.
        </span>
        <span>
          Selling instead? <Link href="/supplier/post">List your stock</Link> —{' '}
          {user ? `signed in as ${user.role}` : <Link href="/sign-up">create a free account</Link>}.
        </span>
      </div>
    </View>
  );
}
