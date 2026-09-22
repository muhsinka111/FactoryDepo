import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import {
  useProducts,
  useDeleteProduct,
  useMe,
  useDashboardStats,
  getToken,
} from '@workspace/api-client-react';
import type { ApiError } from '@workspace/api-client-react';
import type { Product } from '@workspace/api-zod';
import {
  Empty,
  StatusChip,
  StockTypeBadge,
  DemoTag,
  Spinner,
  requireAuthGate,
  StockTypeFilter,
} from '../components';
import {
  PageHeader,
  KpiRow,
  Kpi,
  Toolbar,
  ToolSelect,
  Pager,
  EmptyState,
  TableWrap,
  Attention,
  SectionCard,
  metric,
} from '../dash';
import { ListingForm } from './SupplierPost';
import { useI18n } from '../i18n';

/**
 * My listings — every lot that belongs to the signed-in supplier's own supplier
 * row. GET /api/products?mine=1 scopes the list server-side from the token, so
 * this page can never show another supplier's stock.
 *
 * Layout: PageHeader → KPI strip → attention/quick-action cards → quick type
 * filter → toolbar (search / status / sort / export) → dense table → pager.
 * Every filter, the sort and the pager run in memory over the caller's own
 * stock, which the page loads in one request (`limit=100`, the API's cap).
 *
 * Edit reuses the Post stock form in an inline modal: the row being edited is
 * already in memory from this very list, so there is no second fetch and no
 * route change — the form itself (SupplierPost's ListingForm) is shared.
 *
 * Honesty rules applied here
 *  • `total` is the number the API reports for the query, never the page length.
 *  • The KPI strip reads `useDashboardStats()` (GET /api/orders/stats), which is
 *    account-scoped: totalListings / totalViews / orders / soldItems. Views are a
 *    real COUNT over product_views for the caller's own listings — but the API
 *    has NO per-listing view count, so no per-row view column exists here.
 *  • Stock value is transparent arithmetic on two returned numbers
 *    (price × quantityAvailable) and is labelled `dash.stockValue`. It is only
 *    stated when the whole stock is loaded and every lot quotes one currency;
 *    a partial load or a mixed-currency account prints '—' and the KPI hint
 *    names the currencies instead of inventing a converted total.
 *  • A lot with dataSource 'demo' is labelled <DemoTag />; supplier-posted lots
 *    are 'platform' and carry no tag.
 *  • Available stock is rendered as '—' when the API omits the column, so a real
 *    0 is shown as 0 rather than hidden.
 *  • 'Low stock' is only shown for a real, positive availability at or below
 *    twice the lot's own MOQ.
 *  • The CSV export writes exactly the rows currently filtered on screen.
 */

const PAGE_SIZE = 20;
/** The API caps `limit` at 100; one request covers a seller's whole stock. */
const LOAD_LIMIT = 100;

type SortKey = 'new' | 'old' | 'price_desc' | 'price_asc' | 'stock';
type StatusKey = 'all' | 'active' | 'sold_out';

/**
 * Deep-linked status filter — `/supplier/listings?status=sold_out` is the
 * destination of the "needs attention" row, so a click lands on the filtered
 * list (and the URL stays shareable/bookmarkable).
 */
function statusFromUrl(): StatusKey {
  const raw = new URLSearchParams(window.location.search).get('status');
  return raw === 'active' || raw === 'sold_out' ? raw : 'all';
}

function money(currency: string, amount: number): string {
  return `${currency === 'USD' ? '$' : `${currency} `}${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

/**
 * Available stock is the number the API holds for the lot, so a real 0 is shown
 * as 0 rather than hidden. Only a missing column would be '—', and the contract
 * makes quantityAvailable a required number.
 */
function qty(n: number | undefined, locale: string): string {
  return typeof n === 'number' ? n.toLocaleString(locale) : '—';
}

function shortDate(iso: string, locale: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Whole days since a timestamp the API returned — '—' when it is not a date. */
function daysSince(iso: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  return days < 0 ? 0 : days;
}

function errorText(e: unknown, fallback: string): string {
  const err = e as Partial<ApiError> | undefined;
  if (err?.message) return err.message;
  return fallback;
}

/** Exports exactly the rows handed in — no hidden columns, no recomputed values. */
function exportRowsCsv(rows: Product[]): void {
  const head = [
    'id', 'name', 'category', 'listingType', 'status', 'price', 'currency', 'unit',
    'moq', 'quantityAvailable', 'stockValue', 'originCountry', 'purityGrade',
    'dataSource', 'createdAt',
  ];
  const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [head.join(',')];
  for (const p of rows) {
    lines.push(
      [
        p.id, p.name, p.category, p.listingType, p.status, p.price, p.currency, p.unit,
        p.moq, p.quantityAvailable, (p.price * p.quantityAvailable).toFixed(2),
        p.originCountry, p.purityGrade ?? '', p.dataSource, p.createdAt,
      ].map(cell).join(','),
    );
  }
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'factorydepo-my-listings.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** The confirming delete modal. The consequence is stated before it happens. */
function DeleteModal({
  product,
  onClose,
  onDeleted,
}: {
  product: Product;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { t } = useI18n();
  const del = useDeleteProduct();
  const [err, setErr] = useState('');

  const confirm = async () => {
    setErr('');
    try {
      await del.mutateAsync({ id: product.id });
      onDeleted();
    } catch (e) {
      // The API refuses with 409 listing_in_use when the lot has orders or offers.
      setErr(errorText(e, t('listings.deleteErr')));
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <h2>{t('listings.deleteTitle')}</h2>
          <button className="x" onClick={onClose} aria-label={t('action.close')}>✕</button>
        </div>
        <div className="mb">
          <p style={{ marginTop: 0, fontSize: 12.5 }}>
            <b>{t('listings.deleteLead', { name: product.name, id: product.id })}</b>
          </p>
          <p className="muted" style={{ fontSize: 12.5 }}>
            {t('listings.deleteBody')}
          </p>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>
            {t('listings.deleteKeepBody')}
          </p>
          {err && <div className="errtext" style={{ marginTop: 8 }} role="alert">{err}</div>}
        </div>
        <div className="mf">
          <button className="btn btn-grey" onClick={onClose} disabled={del.isPending}>{t('listings.keepListing')}</button>
          <button className="btn btn-red" onClick={confirm} disabled={del.isPending}>
            {del.isPending ? t('listings.deleting') : t('listings.deleteForever')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Edit modal — the shared Post stock form, prefilled with this row. */
function EditModal({
  product,
  onClose,
  onSaved,
}: {
  product: Product;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ width: 'min(720px,100%)' }} onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <h2>{t('listings.editTitle', { id: product.id })}</h2>
          <button className="x" onClick={onClose} aria-label={t('action.close')}>✕</button>
        </div>
        <div className="mb">
          <ListingForm product={product} onCancel={onClose} onSaved={onSaved} />
        </div>
      </div>
    </div>
  );
}

export default function SupplierListings() {
  const { t, locale } = useI18n();
  const { data: user, isLoading: meLoading } = useMe();
  const loggedIn = !!getToken();
  const isSupplier = user?.role === 'supplier';
  const ready = loggedIn && isSupplier;

  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusKey>(() => statusFromUrl());
  const [listingType, setListingType] = useState('');
  const [sort, setSort] = useState<SortKey>('new');
  const [editing, setEditing] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [notice, setNotice] = useState('');

  /** The seller's whole stock in one request; every control below is in-memory. */
  const res = useProducts({ mine: 1, limit: LOAD_LIMIT }, { enabled: ready });
  const stats = useDashboardStats({ enabled: ready });

  const items = useMemo(() => res.data?.items ?? [], [res.data]);
  const apiTotal = res.data?.total ?? 0;

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = items.filter((p) => {
      if (status !== 'all' && p.status !== status) return false;
      if (listingType && p.listingType !== listingType) return false;
      if (needle) {
        const hay = `${p.name} ${p.category}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      switch (sort) {
        case 'old':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'price_desc':
          return b.price - a.price;
        case 'price_asc':
          return a.price - b.price;
        case 'stock':
          return b.quantityAvailable - a.quantityAvailable;
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });
    return sorted;
  }, [items, q, status, listingType, sort]);

  // A filter change makes the old page number meaningless.
  useEffect(() => {
    setPage(1);
  }, [q, status, listingType, sort]);

  const pageRows = useMemo(
    () => rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [rows, page],
  );

  /**
   * price × quantityAvailable per currency. Only a complete load in a single
   * currency yields one figure; anything else is '—' (with the currencies named
   * in the hint), because converting or extrapolating would invent a number.
   */
  const stockValue = useMemo(() => {
    if (items.length === 0 || apiTotal > items.length) return null;
    const byCurrency = new Map<string, number>();
    for (const p of items) {
      byCurrency.set(p.currency, (byCurrency.get(p.currency) ?? 0) + p.price * p.quantityAvailable);
    }
    if (byCurrency.size !== 1) return null;
    const [currency, value] = [...byCurrency.entries()][0] as [string, number];
    return { currency, value };
  }, [items, apiTotal]);

  const currencies = useMemo(
    () => [...new Set(items.map((p) => p.currency))],
    [items],
  );

  const soldOut = useMemo(() => items.filter((p) => p.status === 'sold_out').length, [items]);
  const lowStock = useMemo(
    () => items.filter((p) => p.quantityAvailable > 0 && p.quantityAvailable <= p.moq * 2).length,
    [items],
  );

  const filtersActive = q.trim() !== '' || status !== 'all' || listingType !== '';
  const resetFilters = () => {
    setQ('');
    setStatus('all');
    setListingType('');
    setPage(1);
  };

  if (meLoading) {
    return (
      <>
        <PageHeader title={t('listings.title')} />
        <Spinner />
      </>
    );
  }

  if (!loggedIn || !user) {
    return (
      <>
        <PageHeader title={t('listings.title')} sub={t('listings.sub')} />
        <Empty title={t('listings.notSignedIn')}>
          {t('listings.notSignedInBody')}
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Link
              href="/sign-in?next=%2Fsupplier%2Flistings"
              className="btn btn-sm btn-primary"
              onClick={() => requireAuthGate()}
            >
              {t('action.signIn')}
            </Link>
            <Link href="/sign-up?next=%2Fsupplier%2Flistings" className="btn btn-sm btn-ghost">
              {t('listings.createSupplierAccount')}
            </Link>
          </div>
        </Empty>
      </>
    );
  }

  if (!isSupplier) {
    return (
      <>
        <PageHeader title={t('listings.title')} sub={t('listings.sub')} />
        <Empty title={t('listings.supplierOnly')}>
          {t('listings.supplierOnlyBody', { role: user.role })}
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Link href="/explore" className="btn btn-sm btn-ghost">{t('listings.browseStock')}</Link>
          </div>
        </Empty>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t('listings.title')}
        sub={
          res.isLoading
            ? t('listings.subLoading')
            : t('listings.subCount', { n: apiTotal.toLocaleString(locale) })
        }
        actions={
          <div className="row" style={{ gap: 6 }}>
            <button
              className="btn btn-sm btn-grey"
              onClick={() => res.refetch()}
              disabled={res.isFetching}
            >
              {res.isFetching ? t('action.refreshing') : t('action.refresh')}
            </button>
            <Link href="/supplier/post" className="btn btn-sm btn-gold">{t('listings.postStock')}</Link>
          </div>
        }
      />

      <KpiRow>
        <Kpi
          ic="📦"
          label={t('orders.statListings')}
          value={metric(stats.data?.totalListings)}
        />
        <Kpi
          ic="👁"
          label={t('orders.statViews')}
          value={metric(stats.data?.totalViews)}
          hint={t('orders.statViewsTitle')}
        />
        <Kpi
          ic="🧾"
          label={t('orders.statOrders')}
          value={metric(stats.data?.orders)}
        />
        <Kpi
          ic="✅"
          label={t('orders.statSoldItems')}
          value={metric(stats.data?.soldItems)}
        />
        <Kpi
          ic="💰"
          label={t('dash.stockValue')}
          value={metric(stockValue?.value ?? null, (n) => money(stockValue!.currency, n))}
          hint={
            stockValue
              ? t('dash.rowsTotal', { n: items.length.toLocaleString(locale) })
              : currencies.length > 0
                ? currencies.join(' · ')
                : undefined
          }
        />
      </KpiRow>

      <div className="grid2 mb10">
        <SectionCard title={t('dash.needsAttention')}>
          <Attention
            items={[
              {
                icon: '⚠️',
                label: t('status.sold_out'),
                count: soldOut,
                // A real destination rather than an in-page handler: the shared
                // kit styles `.attn a` (an anchor), and the filter is in the URL.
                href: '/supplier/listings?status=sold_out',
              },
            ]}
          />
          {lowStock > 0 && (
            <div className="chiprow mt10">
              <span className="pill p-amber">{t('pd.lowStock')}</span>
              <span className="muted" style={{ fontSize: 11.5 }}>
                {t('dash.rowsTotal', { n: lowStock.toLocaleString(locale) })}
              </span>
            </div>
          )}
        </SectionCard>

        <SectionCard title={t('dash.quickActions')}>
          <div className="grid" style={{ gap: 7 }}>
            <Link href="/supplier/post" className="btn btn-gold" style={{ justifyContent: 'flex-start' }}>
              {t('listings.postStock')}
            </Link>
            <Link href="/supplier/offers" className="btn btn-grey" style={{ justifyContent: 'flex-start' }}>
              {t('nav.offersSup')}
            </Link>
            <Link href="/supplier/verification" className="btn btn-grey" style={{ justifyContent: 'flex-start' }}>
              {t('nav.verification')}
            </Link>
            <Link href="/explore" className="btn btn-grey" style={{ justifyContent: 'flex-start' }}>
              {t('listings.browseStock')}
            </Link>
          </div>
        </SectionCard>
      </div>

      {notice && (
        <div className="stripe">
          <span>{notice}</span>
          <button className="x" onClick={() => setNotice('')} aria-label={t('action.dismiss')}>✕</button>
        </div>
      )}

      <StockTypeFilter
        value={listingType}
        onChange={(v) => {
          setListingType(v);
          setPage(1);
        }}
      />

      <Toolbar>
        <input
          type="search"
          className="grow"
          placeholder={t('dash.searchPlaceholder')}
          aria-label={t('dash.searchPlaceholder')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <ToolSelect
          label={t('listings.col.status')}
          value={status}
          onChange={(v) => setStatus(v as StatusKey)}
          options={[
            { value: 'all', label: t('rfq.statusAll') },
            { value: 'active', label: t('status.active') },
            { value: 'sold_out', label: t('status.sold_out') },
          ]}
        />
        <ToolSelect
          label={t('dash.sortBy')}
          value={sort}
          onChange={(v) => setSort(v as SortKey)}
          options={[
            { value: 'new', label: t('dash.sortNewest') },
            { value: 'old', label: t('dash.sortOldest') },
            { value: 'price_desc', label: t('dash.sortPriceHigh') },
            { value: 'price_asc', label: t('dash.sortPriceLow') },
            { value: 'stock', label: t('listings.col.available') },
          ]}
        />
        <span className="sep" />
        <span className="tl tnum">{t('dash.rowsTotal', { n: rows.length.toLocaleString(locale) })}</span>
        <button
          className="btn btn-sm btn-grey"
          onClick={() => exportRowsCsv(rows)}
          disabled={rows.length === 0}
        >
          {t('dash.exportCsv')}
        </button>
        {filtersActive && (
          <button className="btn btn-sm btn-ghost" onClick={resetFilters}>
            {t('dash.clearFilters')}
          </button>
        )}
        <span className="grow" />
        {res.dataUpdatedAt > 0 && (
          <span className="tl tnum">
            {t('dash.lastUpdated')} {new Date(res.dataUpdatedAt).toLocaleTimeString(locale)}
          </span>
        )}
      </Toolbar>

      {res.isLoading ? (
        <Spinner />
      ) : res.isError ? (
        <EmptyState
          icon="⚠️"
          title={t('listings.loadErrorTitle')}
          body={t('listings.loadErrorBody')}
          action={
            <button className="btn btn-sm btn-grey" onClick={() => res.refetch()}>{t('action.tryAgain')}</button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon="📦"
          title={t('listings.emptyTitle')}
          body={t('listings.emptyBody')}
          action={
            <div className="row" style={{ justifyContent: 'center', gap: 8 }}>
              <Link href="/supplier/post" className="btn btn-sm btn-gold">{t('listings.postFirst')}</Link>
              <Link href="/supplier/verification" className="btn btn-sm btn-ghost">{t('listings.getVerified')}</Link>
            </div>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="🔍"
          title={t('dash.noResults')}
          body={t('dash.noResultsBody')}
          action={
            <button className="btn btn-sm btn-grey" onClick={resetFilters}>{t('dash.clearFilters')}</button>
          }
        />
      ) : (
        <>
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>{t('listings.col.lot')}</th>
                  <th className="hidem">{t('listings.col.category')}</th>
                  <th className="num">{t('listings.col.unitPrice')}</th>
                  <th className="num hidem">{t('listings.col.moq')}</th>
                  <th className="num">{t('listings.col.available')}</th>
                  <th className="num">{t('dash.stockValue')}</th>
                  <th className="tight">{t('listings.col.status')}</th>
                  <th className="hidem">{t('listings.col.posted')}</th>
                  <th className="tight" />
                </tr>
              </thead>
              <tbody>
                {pageRows.map((p) => {
                  const low = p.quantityAvailable > 0 && p.quantityAvailable <= p.moq * 2;
                  const days = daysSince(p.createdAt);
                  return (
                    <tr key={p.id}>
                      <td>
                        <div className="row" style={{ alignItems: 'flex-start', gap: 9 }}>
                          <span className="thumb">
                            {p.imageKey ? <img src={p.imageKey} alt={p.name} loading="lazy" /> : null}
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                              <Link href={`/products/${p.id}`} className="cellmain">{p.name}</Link>
                              {p.dataSource === 'demo' && <DemoTag />}
                              {p.listingType !== 'stock' && <StockTypeBadge type={p.listingType} />}
                            </div>
                            <span className="cellsub">
                              {t('listings.lotRef', { id: p.id })}
                              {p.originCountry ? ` · ${p.originCountry}` : ''}
                              {p.purityGrade ? ` · ${p.purityGrade}` : ''}
                              {p.imageKey ? '' : ` · ${t('listings.noPhotoInline')}`}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="hidem muted">{p.category}</td>
                      <td className="num strong">
                        {money(p.currency, p.price)}
                        <span className="cellsub">/ {p.unit}</span>
                      </td>
                      <td className="num hidem">
                        {p.moq.toLocaleString(locale)} {p.unit}
                      </td>
                      <td className="num">
                        {qty(p.quantityAvailable, locale)}
                        <span className="cellsub">
                          {p.unit}
                          {low ? <> · <span className="pill p-amber">{t('pd.lowStock')}</span></> : null}
                        </span>
                      </td>
                      <td className="num">
                        {money(p.currency, p.price * p.quantityAvailable)}
                        <span className="cellsub tnum">
                          {qty(p.quantityAvailable, locale)} × {money(p.currency, p.price)}
                        </span>
                      </td>
                      <td className="tight"><StatusChip status={p.status} /></td>
                      <td className="hidem muted" title={new Date(p.createdAt).toLocaleString(locale)}>
                        {shortDate(p.createdAt, locale)}
                        {days !== null ? (
                          <span className="cellsub">{t('dash.daysLive', { n: days.toLocaleString(locale) })}</span>
                        ) : null}
                      </td>
                      <td className="tight">
                        <div className="rowact">
                          <button
                            className="btn btn-sm btn-ghost"
                            onClick={() => { setNotice(''); setEditing(p); }}
                          >
                            {t('action.edit')}
                          </button>
                          <button
                            className="btn btn-sm btn-red"
                            onClick={() => { setNotice(''); setDeleting(p); }}
                          >
                            {t('action.delete')}
                          </button>
                          <Link href={`/products/${p.id}`} className="btn btn-sm btn-grey">
                            {t('dash.openDetail')}
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>

          <div className="card" style={{ marginTop: 8 }}>
            <Pager
              page={page}
              pageSize={PAGE_SIZE}
              total={rows.length}
              onPage={setPage}
              left={
                <span className="tnum">
                  {t('listings.count', { n: apiTotal.toLocaleString(locale) })}
                </span>
              }
            />
          </div>

          <div className="stripe" style={{ marginTop: 12 }}>
            <span>
              {t('listings.demoNoteLead')} <span className="pill p-amber">{t('cards.demo')}</span>{' '}
              {t('listings.demoNoteTail')}
            </span>
            <span>{t('listings.bankTransferNote')}</span>
          </div>
        </>
      )}

      {editing && (
        <EditModal
          product={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); setNotice(t('listings.updated')); }}
        />
      )}

      {deleting && (
        <DeleteModal
          product={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => { setDeleting(null); setNotice(t('listings.deleted')); }}
        />
      )}
    </>
  );
}
