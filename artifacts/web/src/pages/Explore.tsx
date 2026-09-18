import { useEffect, useState } from 'react';
import { Link, useSearch } from 'wouter';
import { useProducts, useCategoryCounts, useSaveLot, getToken } from '@workspace/api-client-react';
import { View, ProductCard, Spinner, Empty, DemoNotice, StockTypeFilter, requireAuthGate } from '../components';
import { COUNTRIES } from '@workspace/api-spec';
import { useI18n } from '../i18n';

function readParam(key: string): string {
  return new URLSearchParams(window.location.search).get(key) ?? '';
}

/**
 * Explore — the public marketplace browse view (buyer home when logged out).
 * Every number shown here comes from the API; nothing is embellished.
 */
export default function Explore() {
  const { t, locale } = useI18n();
  const [q, setQ] = useState(() => readParam('q'));
  const [appliedQ, setAppliedQ] = useState(() => readParam('q'));
  const [category, setCategory] = useState(() => readParam('category'));
  const [listingType, setListingType] = useState(() => readParam('listingType'));
  const [country, setCountry] = useState(() => readParam('country'));
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [page, setPage] = useState(1);
  const saveLot = useSaveLot();

  const search = useSearch();
  /**
   * Keep in step with the topbar search, the category rail and the topbar market
   * links, which navigate to /explore?q=… , ?category=… and ?country=… .
   *
   * The dependency is the QUERY STRING from wouter's `useSearch()`. Two earlier
   * attempts each looked right and failed:
   *   • listening on `popstate` — wouter navigates with pushState, which never
   *     fires popstate, so the grid kept the previous results;
   *   • depending on `useLocation()` — in wouter 3.x that hook returns the
   *     pathname only, so adding `?category=Steel` did not change it at all.
   * `useSearch()` subscribes to pushState/replaceState/popstate, which covers the
   * rail click, the topbar search, the market links and back/forward.
   */
  useEffect(() => {
    setQ(readParam('q'));
    setAppliedQ(readParam('q'));
    setCategory(readParam('category'));
    setListingType(readParam('listingType'));
    setCountry(readParam('country'));
    setPage(1);
  }, [search]);

  const res = useProducts({
    q: appliedQ || undefined,
    category: category || undefined,
    // The API validates this enum; the cast keeps the client's query type happy
    // without widening it to `string` for every caller.
    listingType: (listingType || undefined) as never,
    country: country || undefined,
    minPrice: minPrice ? Number(minPrice) : undefined,
    maxPrice: maxPrice ? Number(maxPrice) : undefined,
    page,
    limit: 24,
  });

  // Only categories that actually contain stock, so no option yields nothing.
  const { data: catData } = useCategoryCounts();
  const categoryOptions = catData?.items ?? [];

  /**
   * Reflect the current filters in the URL so a filtered view is shareable and
   * the back button works. `replaceState` rather than push, so a filter change
   * does not bury the previous page under a stack of history entries.
   */
  const syncUrl = (over: Partial<Record<'q' | 'category' | 'listingType' | 'country', string>> = {}) => {
    const v = { q: appliedQ, category, listingType, country, ...over };
    const params = new URLSearchParams();
    if (v.q) params.set('q', v.q);
    if (v.category) params.set('category', v.category);
    if (v.listingType) params.set('listingType', v.listingType);
    if (v.country) params.set('country', v.country);
    const qs = params.toString();
    window.history.replaceState(null, '', qs ? `/explore?${qs}` : '/explore');
  };

  const apply = (p = 1) => { setAppliedQ(q); setPage(p); syncUrl({ q }); };
  const clear = () => {
    setQ(''); setAppliedQ(''); setCategory(''); setListingType(''); setCountry('');
    setMinPrice(''); setMaxPrice(''); setPage(1);
    window.history.replaceState(null, '', '/explore');
  };

  const total = res.data?.total ?? 0;
  const pages = res.data?.pages ?? 1;
  const items = res.data?.items ?? [];

  return (
    <View
      title={t('explore.title')}
      sub={
        res.isLoading
          ? t('explore.subLoading')
          : t('explore.subCount', { n: total.toLocaleString(locale) })
      }
      actions={
        <button className="btn btn-sm btn-grey" onClick={clear}>{t('action.clearFilters')}</button>
      }
    >
      <DemoNotice />

      {/* Surplus-first: the stock-type facet, shared verbatim with the supplier
          and admin dashboards (components.tsx → StockTypeFilter). */}
      <StockTypeFilter
        value={listingType}
        onChange={(v) => { setListingType(v); setPage(1); syncUrl({ listingType: v }); }}
      />

      {/* Quick category strip: reachable without opening the dropdown. Hidden on
          mobile by CSS, where the category rail already covers it. */}
      <div className="catstrip">
        {categoryOptions.slice(0, 10).map((c) => (
          <Link
            key={c.category}
            href={`/explore?category=${encodeURIComponent(c.category)}`}
            className={`ct ${category === c.category ? 'on' : ''}`}
          >
            <b>{c.category}</b><span>{c.count.toLocaleString(locale)}</span>
          </Link>
        ))}
        <Link href="/categories" className="ct on">{t('categories.all')} →</Link>
      </div>

      <div className="filters">
        <input
          className="in"
          style={{ width: 220 }}
          placeholder={t('explore.searchPlaceholder')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && apply()}
          aria-label={t('explore.searchAria')}
        />
        <select
          value={category}
          onChange={(e) => { setCategory(e.target.value); setPage(1); syncUrl({ category: e.target.value }); }}
          aria-label={t('explore.categoryAria')}
        >
          <option value="">{t('explore.allCategories')}</option>
          {/* Live counts, so every option in this list returns stock. */}
          {categoryOptions.map((c) => (
            <option key={c.category} value={c.category}>
              {c.category} ({c.count.toLocaleString(locale)})
            </option>
          ))}
        </select>
        <select
          value={country}
          onChange={(e) => { setCountry(e.target.value); setPage(1); syncUrl({ country: e.target.value }); }}
          aria-label={t('explore.originAria')}
        >
          <option value="">{t('explore.allCountries')}</option>
          {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input
          className="in" style={{ width: 84 }} placeholder={t('explore.min')} inputMode="numeric"
          value={minPrice} onChange={(e) => setMinPrice(e.target.value)}
        />
        <input
          className="in" style={{ width: 84 }} placeholder={t('explore.max')} inputMode="numeric"
          value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)}
        />
        <button className="btn btn-sm btn-primary" onClick={() => apply(1)}>{t('action.search')}</button>
      </div>

      {res.isLoading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <Empty title={t('explore.emptyTitle')}>
          {t('explore.emptyBody')}
        </Empty>
      ) : (
        <>
          <div className="feedgrid">
            {items.map((p) => (
              <ProductCard
                key={p.id}
                p={p}
                onSave={(item) => {
                  // The shortlist endpoint is buyer-authenticated, so a
                  // signed-out visitor gets the auth gate, not a silent no-op.
                  if (!getToken()) { requireAuthGate(); return; }
                  saveLot.mutate({ productId: item.id } as never);
                }}
              />
            ))}
          </div>

          {pages > 1 && (
            <div className="row" style={{ justifyContent: 'center', marginTop: 14, gap: 6 }}>
              <button className="btn btn-sm btn-grey" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t('explore.prev')}</button>
              <span className="muted" style={{ fontSize: 12, alignSelf: 'center' }}>
                {t('explore.page', {
                  page: (res.data?.page ?? page).toLocaleString(locale),
                  pages: pages.toLocaleString(locale),
                })}
              </span>
              <button className="btn btn-sm btn-grey" disabled={page >= pages} onClick={() => setPage(page + 1)}>{t('explore.next')}</button>
            </div>
          )}
        </>
      )}
    </View>
  );
}
