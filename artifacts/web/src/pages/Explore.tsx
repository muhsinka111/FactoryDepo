import { useEffect, useState } from 'react';
import { useProducts } from '@workspace/api-client-react';
import { View, ProductCard, Spinner, Empty } from '../components';
import { CATEGORIES, COUNTRIES } from '@workspace/api-spec';
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
        <select value={category} onChange={(e) => { setCategory(e.target.value); apply(1); }} aria-label={t('explore.categoryAria')}>
          <option value="">{t('explore.allCategories')}</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={country} onChange={(e) => { setCountry(e.target.value); apply(1); }} aria-label={t('explore.originAria')}>
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
            {items.map((p) => <ProductCard key={p.id} p={p} />)}
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
