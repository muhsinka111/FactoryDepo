import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { useProducts, useRfqs, useSuppliers, useMe } from '@workspace/api-client-react';
import { View, ProductCard, Spinner, Empty, RAIL_CATEGORIES } from '../components';
import { COUNTRIES } from '@workspace/api-spec';
import { useI18n } from '../i18n';

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
  const { t, locale } = useI18n();
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
  // The empty string is the "no category" sentinel the API understands; only the
  // visible label is translated, so the request never depends on the language.
  const pickCategory = (c: string) => {
    setCategory(c === 'All industries' ? '' : c);
    setPage(1);
  };

  const first = total === 0 ? 0 : (page - 1) * 24 + 1;
  const last = Math.min(page * 24, total);

  return (
    <View
      title={user ? t('feed.welcomeBack', { name: user.name.split(' ')[0] ?? user.name }) : t('feed.title')}
      sub={t('feed.sub')}
      actions={
        <div className="row">
          <Link href="/supplier/post" className="btn btn-sm btn-grey">{t('feed.sellStock')}</Link>
          <Link href="/rfqs" className="btn btn-gold">{t('feed.postRequest')}</Link>
        </div>
      }
    >
      <div className="stripe">
        <span>
          <b>{products.isLoading ? '—' : total.toLocaleString(locale)}</b> {t('feed.lotsMatch')}
        </span>
        <span>
          <b>{suppliers.isLoading ? '—' : verifiedSuppliers.toLocaleString(locale)}</b> {t('feed.verifiedSuppliers')}
        </span>
        <span>
          <b>{rfqs.isLoading ? '—' : openRequests.toLocaleString(locale)}</b> {t('feed.openRequests')}
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
              {t('feed.allIndustries')}
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
              placeholder={t('explore.searchPlaceholder')}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && apply()}
              aria-label={t('feed.searchAria')}
            />
            <select
              value={country}
              onChange={(e) => { setCountry(e.target.value); setPage(1); }}
              aria-label={t('explore.originAria')}
            >
              <option value="">{t('feed.allOrigins')}</option>
              {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input
              className="in"
              style={{ width: 88 }}
              placeholder={t('explore.min')}
              inputMode="numeric"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
              aria-label={t('feed.minAria')}
            />
            <input
              className="in"
              style={{ width: 88 }}
              placeholder={t('explore.max')}
              inputMode="numeric"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              aria-label={t('feed.maxAria')}
            />
            <button className="btn btn-sm btn-primary" onClick={() => apply(1)}>{t('action.search')}</button>
            {hasFilters && (
              <button className="btn btn-sm btn-grey" onClick={clear}>{t('action.clearFilters')}</button>
            )}
            <span className="muted" style={{ marginLeft: 'auto' }}>
              {products.isLoading ? '—' : t('feed.lotsCount', { n: total.toLocaleString(locale) })}
            </span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="hd">
          <h2>{category || t('feed.allIndustries')}</h2>
          <span className="muted" style={{ marginLeft: 'auto' }}>
            {products.isLoading
              ? '—'
              : total === 0
                ? t('feed.noLots')
                : t('feed.shownRange', {
                    first: first.toLocaleString(locale),
                    last: last.toLocaleString(locale),
                    total: total.toLocaleString(locale),
                  })}
          </span>
        </div>

        {products.isLoading ? (
          <Spinner />
        ) : items.length === 0 ? (
          <Empty title={t('feed.emptyTitle')}>
            {t('feed.emptyBody')}
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
            {t('explore.prev')}
          </button>
          <span className="muted">
            {t('explore.page', {
              page: (products.data?.page ?? page).toLocaleString(locale),
              pages: pages.toLocaleString(locale),
            })}
          </span>
          <button
            className="btn btn-sm btn-grey"
            disabled={page >= pages}
            onClick={() => setPage(page + 1)}
          >
            {t('explore.next')}
          </button>
        </div>
      )}

      <div className="stripe" style={{ marginTop: 12 }}>
        <span>
          {t('feed.lookingFor')}{' '}
          <Link href="/rfqs">{t('feed.postRequestLink')}</Link> {t('feed.lookingForTail')}
        </span>
        <span>
          {t('feed.sellingInstead')} <Link href="/supplier/post">{t('feed.listYourStock')}</Link> —{' '}
          {user ? t('feed.signedInAs', { role: user.role }) : <Link href="/sign-up">{t('feed.createFree')}</Link>}.
        </span>
      </div>
    </View>
  );
}
