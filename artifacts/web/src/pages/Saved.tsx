import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { useSavedLots, useUnsaveLot, useMe, getToken } from '@workspace/api-client-react';
import type { SavedLot } from '@workspace/api-zod';
import { Empty, Spinner, ProductCard, requireAuthGate } from '../components';
import {
  EmptyState,
  Kpi,
  KpiRow,
  PageHeader,
  Pager,
  SectionCard,
  ToolSelect,
  Toolbar,
  metric,
} from '../dash';
import { useI18n, type DictKey } from '../i18n';

/**
 * Saved — the buyer's shortlist.
 *
 * GET /api/saved returns each saved lot as the full listing, so the same
 * ProductCard as the feed is used here and keeps its verification and demo
 * provenance tags. DELETE /api/saved/:productId removes one.
 *
 * Layout: PageHeader → KPI strip → toolbar (search / origin / stock type / sort)
 * → card grid → pager. Search, the two filters, the sort and the pager all run in
 * memory over the shortlist the page loaded.
 *
 * Honesty rules applied here
 *  • Stock value is transparent arithmetic on two returned numbers
 *    (price × quantityAvailable). It is stated in ONE currency only — the
 *    currency the lots quote; with mixed currencies the tile prints '—' and the
 *    hint names the currencies instead of inventing an FX conversion.
 *  • Origin and stock-type counts are distinct counts over the returned rows.
 *  • The list response has no note or folder, so a card shows only what the API
 *    supplies: the saved date from the row itself. An unparseable date renders '—'.
 *  • Filters offer only the countries and stock types that actually occur in the
 *    shortlist, so a filter can never select an empty result by construction.
 */

const PAGE_SIZE = 20;

type SortKey = 'new' | 'old' | 'price_desc' | 'price_asc';

function money(currency: string, amount: number): string {
  return `${currency === 'USD' ? '$' : `${currency} `}${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function shortDate(iso: string, locale: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
}

function errMessage(e: unknown, fallback: string): string {
  const m = e instanceof Error ? e.message : '';
  return m && !/^Request failed \(\d+\)$/.test(m) ? m : fallback;
}

export default function Saved() {
  const { t, locale } = useI18n();
  const me = useMe();
  const user = me.data;

  const saved = useSavedLots({ enabled: !!user });
  const unsave = useUnsaveLot();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionErr, setActionErr] = useState('');

  const [q, setQ] = useState('');
  const [country, setCountry] = useState('all');
  const [listingType, setListingType] = useState('all');
  const [sort, setSort] = useState<SortKey>('new');
  const [page, setPage] = useState(1);

  const items = useMemo(() => saved.data?.items ?? [], [saved.data]);
  const apiTotal = saved.data?.total ?? items.length;

  /** Countries and stock types that genuinely occur in this shortlist. */
  const countries = useMemo(
    () => [...new Set(items.map((l) => l.product.originCountry).filter(Boolean))].sort(),
    [items],
  );
  const types = useMemo(
    () => [...new Set(items.map((l) => l.product.listingType).filter(Boolean))].sort(),
    [items],
  );

  /**
   * Stock value, kept per currency. Only lots whose price and availability are
   * real numbers are summed, so a missing value can never be read as 0.
   */
  const byCurrency = useMemo(() => {
    const m = new Map<string, { sum: number; n: number }>();
    for (const lot of items) {
      const { price, quantityAvailable, currency } = lot.product;
      if (typeof price !== 'number' || typeof quantityAvailable !== 'number') continue;
      if (!Number.isFinite(price) || !Number.isFinite(quantityAvailable)) continue;
      const cur = m.get(currency) ?? { sum: 0, n: 0 };
      cur.sum += price * quantityAvailable;
      cur.n += 1;
      m.set(currency, cur);
    }
    return m;
  }, [items]);

  const currencies = useMemo(() => [...byCurrency.keys()], [byCurrency]);
  const single = currencies.length === 1 ? currencies[0] : null;
  const stockValue = single ? (byCurrency.get(single)?.sum ?? null) : null;
  const valuedLots = single ? (byCurrency.get(single)?.n ?? 0) : 0;

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = items.filter((lot) => {
      if (country !== 'all' && lot.product.originCountry !== country) return false;
      if (listingType !== 'all' && lot.product.listingType !== listingType) return false;
      if (!needle) return true;
      return (
        lot.product.name.toLowerCase().includes(needle) ||
        lot.product.supplierName.toLowerCase().includes(needle) ||
        lot.product.category.toLowerCase().includes(needle)
      );
    });
    out = [...out].sort((a, b) => {
      if (sort === 'new') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sort === 'old') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sort === 'price_desc') return b.product.price - a.product.price;
      return a.product.price - b.product.price;
    });
    return out;
  }, [items, q, country, listingType, sort]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const pageRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const filtersActive = q.trim() !== '' || country !== 'all' || listingType !== 'all' || sort !== 'new';
  const resetFilters = () => {
    setQ('');
    setCountry('all');
    setListingType('all');
    setSort('new');
    setPage(1);
  };

  const remove = async (productId: number) => {
    setActionErr('');
    if (!getToken()) { requireAuthGate(); return; }
    setBusyId(productId);
    try {
      await unsave.mutateAsync({ productId });
    } catch (e) {
      setActionErr(errMessage(e, t('saved.errRemove')));
    } finally {
      setBusyId(null);
    }
  };

  if (me.isLoading) {
    return (
      <>
        <PageHeader title={t('saved.title')} />
        <Spinner />
      </>
    );
  }

  if (!user) {
    return (
      <>
        <PageHeader title={t('saved.title')} sub={t('saved.signInSub')} />
        <Empty title={t('saved.notSignedIn')}>
          {t('saved.notSignedInBody')}
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Link href="/sign-in?next=%2Fsaved" className="btn btn-sm btn-primary">{t('action.signIn')}</Link>
            <Link href="/sign-up?next=%2Fsaved" className="btn btn-sm btn-ghost">{t('action.createAccount')}</Link>
          </div>
        </Empty>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t('saved.title')}
        sub={t('saved.sub')}
        actions={
          <div className="row" style={{ gap: 6 }}>
            <button
              className="btn btn-sm btn-grey"
              onClick={() => void saved.refetch()}
              disabled={saved.isFetching}
            >
              {saved.isFetching ? t('action.refreshing') : t('action.refresh')}
            </button>
            <Link href="/explore" className="btn btn-sm btn-gold">{t('saved.browse')}</Link>
          </div>
        }
      />

      <KpiRow>
        <Kpi ic="🔖" label={t('nav.savedLots')} value={metric(apiTotal)} />
        <Kpi
          ic="💰"
          label={t('dash.stockValue')}
          value={metric(stockValue, (n) => money(single ?? '', n))}
          hint={
            single
              ? `${single} · ${t('dash.rowsTotal', { n: valuedLots.toLocaleString(locale) })}`
              : currencies.length > 1
                ? currencies.join(' · ')
                : undefined
          }
        />
        <Kpi ic="🌍" label={t('product.spec.origin')} value={metric(countries.length)} />
        <Kpi ic="🏷" label={t('product.factStockType')} value={metric(types.length)} />
      </KpiRow>

      <Toolbar>
        <input
          type="search"
          className="grow"
          placeholder={t('dash.searchPlaceholder')}
          aria-label={t('dash.searchPlaceholder')}
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
        />
        <ToolSelect
          label={t('explore.originAria')}
          value={country}
          onChange={(v) => { setCountry(v); setPage(1); }}
          options={[
            { value: 'all', label: t('explore.allCountries') },
            ...countries.map((c) => ({ value: c, label: c })),
          ]}
        />
        <ToolSelect
          label={t('product.factStockType')}
          value={listingType}
          onChange={(v) => { setListingType(v); setPage(1); }}
          options={[
            { value: 'all', label: t('type.all') },
            ...types.map((ty) => ({ value: ty, label: t(`type.${ty}` as DictKey) })),
          ]}
        />
        <ToolSelect
          label={t('dash.sortBy')}
          value={sort}
          onChange={(v) => { setSort(v as SortKey); setPage(1); }}
          options={[
            { value: 'new', label: t('dash.sortNewest') },
            { value: 'old', label: t('dash.sortOldest') },
            { value: 'price_desc', label: t('dash.sortPriceHigh') },
            { value: 'price_asc', label: t('dash.sortPriceLow') },
          ]}
        />
        <span className="sep" />
        <span className="tl tnum">{t('dash.rowsTotal', { n: rows.length.toLocaleString(locale) })}</span>
        {filtersActive && (
          <button className="btn btn-sm btn-ghost" onClick={resetFilters}>{t('dash.clearFilters')}</button>
        )}
        <span className="grow" />
        {saved.dataUpdatedAt > 0 && (
          <span className="tl tnum">
            {t('dash.lastUpdated')} {new Date(saved.dataUpdatedAt).toLocaleTimeString(locale)}
          </span>
        )}
      </Toolbar>

      {actionErr && <p className="errtext" style={{ marginTop: -4, marginBottom: 10 }}>{actionErr}</p>}

      {saved.isLoading ? (
        <Spinner />
      ) : saved.isError ? (
        <EmptyState
          icon="⚠️"
          title={t('saved.loadErrorTitle')}
          body={t('saved.loadErrorBody')}
          action={
            <button className="btn btn-sm btn-grey" onClick={() => void saved.refetch()}>
              {saved.isFetching ? t('saved.trying') : t('action.tryAgain')}
            </button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon="🔖"
          title={t('saved.emptyTitle')}
          body={t('saved.emptyBody')}
          action={
            <div className="row" style={{ justifyContent: 'center', gap: 8 }}>
              <Link href="/explore" className="btn btn-sm btn-gold">{t('saved.browse')}</Link>
              <Link href="/feed" className="btn btn-sm btn-ghost">{t('saved.goToFeed')}</Link>
            </div>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="🔍"
          title={t('dash.noResults')}
          body={t('dash.noResultsBody')}
          action={<button className="btn btn-sm btn-grey" onClick={resetFilters}>{t('dash.clearFilters')}</button>}
        />
      ) : (
        <>
          <SectionCard title={t('nav.savedLots')}>
            <div className="railgrid">
              {pageRows.map((lot) => (
                <SavedCard
                  key={lot.productId}
                  lot={lot}
                  busy={busyId === lot.productId}
                  onRemove={() => void remove(lot.productId)}
                />
              ))}
            </div>
          </SectionCard>

          <div className="card" style={{ marginTop: 8 }}>
            <Pager
              page={safePage}
              pageSize={PAGE_SIZE}
              total={rows.length}
              onPage={setPage}
              left={<span className="tnum">{t('saved.count', { n: apiTotal.toLocaleString(locale) })}</span>}
            />
          </div>
        </>
      )}
    </>
  );
}

/** One shortlisted lot: the shared card plus its real saved date and actions. */
function SavedCard({ lot, busy, onRemove }: { lot: SavedLot; busy: boolean; onRemove: () => void }) {
  const { t, locale } = useI18n();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, height: '100%' }}>
      <ProductCard p={lot.product} />
      {/* Pinned to the bottom of the cell so the actions line up across cards of
          different title heights. */}
      <div style={{ marginTop: 'auto' }}>
        <div
          className="muted"
          style={{ fontSize: 11, marginBottom: 5 }}
          title={new Date(lot.createdAt).toLocaleString(locale)}
        >
          {t('saved.savedOn', { date: shortDate(lot.createdAt, locale) })}
        </div>
        <div className="row" style={{ gap: 6 }}>
          <Link href={`/products/${lot.productId}`} className="btn btn-sm btn-ghost">
            {t('dash.openDetail')}
          </Link>
          <button
            className="btn btn-sm btn-grey"
            disabled={busy}
            onClick={onRemove}
            title={t('saved.removeTitle')}
          >
            {busy ? t('saved.removing') : t('saved.remove')}
          </button>
        </div>
      </div>
    </div>
  );
}
