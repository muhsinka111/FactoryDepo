import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { useMe, useMyOrders, useDashboardStats, getToken } from '@workspace/api-client-react';
import type { Order } from '@workspace/api-zod';
import { Empty, StatusChip, Spinner, dashboardRole } from '../components';
import {
  EmptyState,
  Kpi,
  KpiRow,
  PageHeader,
  Pager,
  SectionCard,
  TableWrap,
  ToolSelect,
  Toolbar,
  metric,
} from '../dash';
import { useI18n, statusLabel } from '../i18n';

/**
 * Orders — every order the signed-in user is party to (buy-now / dropshipping).
 * GET /orders labels each row side: 'buying' | 'selling', so the counterparty is
 * the supplier on a purchase and the buyer on a sale.
 *
 * Layout: PageHeader → KPI strip → account-level key figures → toolbar
 * (search / status / sort / export) → dense table → pager. Every filter, the
 * sort and the pager run in memory over the caller's own orders, which the API
 * returns in one list, newest first.
 *
 * Honesty rules applied here
 *  • Every KPI is computed from the orders this API response actually contains:
 *    counts per status and a value sum. The sum is stated for ONE currency only —
 *    the currency the rows quote. When rows quote several currencies the tile
 *    prints '—' and names the currencies instead of inventing an FX conversion.
 *  • `dash.avgOrderValue` is transparent arithmetic (sum ÷ count) over the same
 *    single-currency rows, and the hint says which currency and how many orders
 *    it covers.
 *  • The API's order row carries no `unit` and no `dataSource`, so neither is
 *    invented here: quantity is a bare number, and no Demo tag is rendered.
 *  • The account-level card reads GET /orders/stats, which the server scopes to
 *    the caller (a buyer's "listings" figure is their RFQ count, their views are
 *    the views on the lots they saved). The tile titles say so, and the card is
 *    never presented as per-row data.
 *  • The CSV export writes exactly the rows currently filtered on screen.
 */

const PAGE_SIZE = 20;

type SortKey = 'new' | 'old' | 'total_desc' | 'total_asc';
type StatusKey = 'all' | Order['status'];

/** The five states the order contract defines, in fulfilment order. */
const ORDER_STATUSES: Order['status'][] = ['pending', 'paid', 'shipped', 'delivered', 'cancelled'];
/** Statuses that are neither delivered nor cancelled. */
const OPEN_STATUSES: Order['status'][] = ['pending', 'paid', 'shipped'];

function money(currency: string, amount: number): string {
  return `${currency === 'USD' ? '$' : `${currency} `}${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function shortDate(iso: string, locale: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Exports exactly the rows handed in — no hidden columns, no recomputed values. */
function exportRowsCsv(rows: Order[]): void {
  const head = [
    'id', 'productId', 'productName', 'supplierId', 'supplierName', 'buyerId', 'side',
    'quantity', 'unitPrice', 'currency', 'total', 'status', 'createdAt',
  ];
  const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [head.join(',')];
  for (const o of rows) {
    lines.push(
      [
        o.id, o.productId, o.productName, o.supplierId, o.supplierName, o.buyerId, o.side,
        o.quantity, o.unitPrice, o.currency, o.total, o.status, o.createdAt,
      ].map(cell).join(','),
    );
  }
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'factorydepo-orders.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function Orders() {
  const { t, lang, locale } = useI18n();
  const me = useMe();
  const user = me.data;
  const loggedIn = !!getToken();
  const dash = dashboardRole(user?.role, loggedIn);
  const isSupplier = dash === 'supplier';

  const orders = useMyOrders({ enabled: !!user });
  const stats = useDashboardStats({ enabled: !!user });
  const s = stats.data;

  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusKey>('all');
  const [sort, setSort] = useState<SortKey>('new');
  const [page, setPage] = useState(1);

  const items = useMemo(() => orders.data?.items ?? [], [orders.data]);
  const apiTotal = orders.data?.total ?? items.length;

  /** Status counts — API values, grouped locally. */
  const openCount = useMemo(() => items.filter((o) => OPEN_STATUSES.includes(o.status)).length, [items]);
  const deliveredCount = useMemo(() => items.filter((o) => o.status === 'delivered').length, [items]);
  const cancelledCount = useMemo(() => items.filter((o) => o.status === 'cancelled').length, [items]);

  /**
   * Value sums, kept per currency. Only rows whose `total` is a real number are
   * summed, so a missing value can never be read as 0.
   */
  const byCurrency = useMemo(() => {
    const m = new Map<string, { sum: number; n: number }>();
    for (const o of items) {
      if (typeof o.total !== 'number' || !Number.isFinite(o.total)) continue;
      const cur = m.get(o.currency) ?? { sum: 0, n: 0 };
      cur.sum += o.total;
      cur.n += 1;
      m.set(o.currency, cur);
    }
    return m;
  }, [items]);

  const currencies = useMemo(() => [...byCurrency.keys()], [byCurrency]);
  const single = currencies.length === 1 ? currencies[0] : null;
  const valueSum = single ? (byCurrency.get(single)?.sum ?? null) : null;
  const valueCount = single ? (byCurrency.get(single)?.n ?? 0) : 0;
  const avgValue = single && valueCount > 0 && valueSum !== null ? valueSum / valueCount : null;

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = items.filter((o) => {
      if (status !== 'all' && o.status !== status) return false;
      if (!needle) return true;
      return (
        `#${o.id}`.includes(needle) ||
        o.productName.toLowerCase().includes(needle) ||
        o.supplierName.toLowerCase().includes(needle) ||
        `${o.shippingCity} ${o.shippingCountry}`.toLowerCase().includes(needle)
      );
    });
    out = [...out].sort((a, b) => {
      const ta = new Date(a.createdAt).getTime();
      const tb = new Date(b.createdAt).getTime();
      if (sort === 'new') return tb - ta;
      if (sort === 'old') return ta - tb;
      if (sort === 'total_desc') return b.total - a.total;
      return a.total - b.total;
    });
    // The API orders newest-first and the id is monotonic, so the sort is stable
    // for equal keys without a second comparator.
    return out;
  }, [items, q, status, sort]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const pageRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const filtersActive = q.trim() !== '' || status !== 'all' || sort !== 'new';
  const resetFilters = () => {
    setQ('');
    setStatus('all');
    setSort('new');
    setPage(1);
  };

  const title = t('orders.title');
  const sub = isSupplier ? t('orders.subSupplier') : t('orders.subBuyer');

  if (me.isLoading) {
    return (
      <>
        <PageHeader title={title} />
        <Spinner />
      </>
    );
  }

  if (!user) {
    return (
      <>
        <PageHeader title={title} sub={t('orders.signInSub')} />
        <Empty title={t('orders.notSignedIn')}>
          {t('orders.notSignedInBody')}
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Link href="/sign-in?next=%2Forders" className="btn btn-sm btn-primary">{t('action.signIn')}</Link>
            <Link href="/sign-up?next=%2Forders" className="btn btn-sm btn-ghost">{t('orders.createAccount')}</Link>
          </div>
        </Empty>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={title}
        sub={sub}
        actions={
          <div className="row" style={{ gap: 6 }}>
            <button
              className="btn btn-sm btn-grey"
              onClick={() => void orders.refetch()}
              disabled={orders.isFetching}
            >
              {orders.isFetching ? t('action.refreshing') : t('action.refresh')}
            </button>
            <Link href="/explore" className="btn btn-sm btn-gold">{t('orders.browseStock')}</Link>
          </div>
        }
      />

      <KpiRow>
        <Kpi ic="🧾" label={t('orders.statOrders')} value={metric(apiTotal)} />
        <Kpi ic="⏳" label={t('status.open')} value={metric(openCount)} />
        <Kpi ic="✅" label={t('status.delivered')} value={metric(deliveredCount)} />
        <Kpi ic="⛔" label={t('status.cancelled')} value={metric(cancelledCount)} />
        <Kpi
          ic="💰"
          label={t('orders.col.total')}
          value={metric(valueSum, (n) => money(single ?? '', n))}
          hint={
            single
              ? `${single} · ${t('orders.count', { n: valueCount.toLocaleString(locale) })}`
              : currencies.length > 1
                ? currencies.join(' · ')
                : undefined
          }
        />
        <Kpi
          ic="📊"
          label={t('dash.avgOrderValue')}
          value={metric(avgValue, (n) => money(single ?? '', n))}
          hint={single ? `${single} · ${t('dash.rowsTotal', { n: valueCount.toLocaleString(locale) })}` : undefined}
        />
      </KpiRow>

      {/* Account-level figures on the left (the tile titles carry the API's own
          scope wording), the buyer's own next steps on the right — the same
          two-card shape the supplier dashboard uses. */}
      <div className="grid2 mb10">
        <SectionCard title={t('dash.kpis')}>
          <div className="cap">
            <span className="k">{isSupplier ? t('orders.statListings') : t('nav.rfqs')}</span>
            <span className="v">{metric(s?.totalListings)}</span>
            <span className="k">{isSupplier ? t('orders.statOffersReceived') : t('orders.statOffersOnRfqs')}</span>
            <span className="v">{metric(s?.activeOffers)}</span>
            {isSupplier && (
              <>
                <span className="k">{t('orders.statSoldItems')}</span>
                <span className="v" title={t('orders.statSoldTitle')}>{metric(s?.soldItems)}</span>
              </>
            )}
            <span className="k" title={t('orders.statViewsTitle')}>{t('orders.statViews')}</span>
            <span className="v" title={t('orders.statViewsTitle')}>{metric(s?.totalViews)}</span>
          </div>
          {stats.isError && <p className="errtext mt10">{t('orders.metricsError')}</p>}
        </SectionCard>

        <SectionCard title={t('dash.quickActions')}>
          <div className="grid" style={{ gap: 7 }}>
            <Link href="/explore" className="btn btn-gold" style={{ justifyContent: 'flex-start' }}>
              {t('orders.browseStock')}
            </Link>
            <Link href="/offers" className="btn btn-grey" style={{ justifyContent: 'flex-start' }}>
              {isSupplier ? t('nav.offersSup') : t('nav.offersBuyer')}
            </Link>
            <Link href="/messages" className="btn btn-grey" style={{ justifyContent: 'flex-start' }}>
              {t('nav.messages')}
            </Link>
            <Link href="/saved" className="btn btn-grey" style={{ justifyContent: 'flex-start' }}>
              {t('nav.saved')}
            </Link>
          </div>
        </SectionCard>
      </div>

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
          label={t('orders.col.status')}
          value={status}
          onChange={(v) => { setStatus(v as StatusKey); setPage(1); }}
          options={[
            { value: 'all', label: t('rfq.statusAll') },
            ...ORDER_STATUSES.map((st) => ({ value: st, label: statusLabel(lang, st) })),
          ]}
        />
        <ToolSelect
          label={t('dash.sortBy')}
          value={sort}
          onChange={(v) => { setSort(v as SortKey); setPage(1); }}
          options={[
            { value: 'new', label: t('dash.sortNewest') },
            { value: 'old', label: t('dash.sortOldest') },
            { value: 'total_desc', label: `${t('orders.col.total')} ↓` },
            { value: 'total_asc', label: `${t('orders.col.total')} ↑` },
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
          <button className="btn btn-sm btn-ghost" onClick={resetFilters}>{t('dash.clearFilters')}</button>
        )}
        <span className="grow" />
        {orders.dataUpdatedAt > 0 && (
          <span className="tl tnum">
            {t('dash.lastUpdated')} {new Date(orders.dataUpdatedAt).toLocaleTimeString(locale)}
          </span>
        )}
      </Toolbar>

      {orders.isLoading ? (
        <Spinner />
      ) : orders.isError ? (
        <EmptyState
          icon="⚠️"
          title={t('orders.loadErrorTitle')}
          body={t('orders.loadErrorBody')}
          action={
            <button className="btn btn-sm btn-grey" onClick={() => void orders.refetch()}>{t('action.tryAgain')}</button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon="🧾"
          title={t('orders.emptyTitle')}
          body={isSupplier ? t('orders.emptySupplier') : t('orders.emptyBuyer')}
          action={
            <div className="row" style={{ justifyContent: 'center', gap: 8 }}>
              <Link href="/explore" className="btn btn-sm btn-gold">{t('orders.browseStock')}</Link>
              {!isSupplier && <Link href="/rfqs" className="btn btn-sm btn-ghost">{t('orders.postRfq')}</Link>}
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
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th className="tight">{t('orders.col.order')}</th>
                  <th>{t('orders.col.product')}</th>
                  <th className="num">{t('orders.col.qty')}</th>
                  <th className="num hidem">{t('myoffers.col.unitPrice')}</th>
                  <th className="num">{t('orders.col.total')}</th>
                  <th className="tight">{t('orders.col.status')}</th>
                  <th className="hidem">{t('orders.col.date')}</th>
                  <th className="tight" />
                </tr>
              </thead>
              <tbody>
                {pageRows.map((o) => {
                  const buying = o.side === 'buying';
                  return (
                    <tr key={o.id}>
                      <td className="tight muted tnum">#{o.id}</td>
                      <td>
                        <Link href={`/products/${o.productId}`} className="cellmain">{o.productName}</Link>
                        <span className="cellsub">
                          {buying ? (
                            <Link href={`/suppliers/${o.supplierId}`}>{o.supplierName}</Link>
                          ) : (
                            t('orders.buyerId', { id: o.buyerId })
                          )}
                          {' · '}
                          {buying ? t('orders.supplierLabel') : t('orders.buyerLabel')}
                        </span>
                      </td>
                      <td className="num tnum">{o.quantity.toLocaleString(locale)}</td>
                      <td className="num hidem tnum">{money(o.currency, o.unitPrice)}</td>
                      <td className="num strong tnum">{money(o.currency, o.total)}</td>
                      <td className="tight"><StatusChip status={o.status} /></td>
                      <td className="hidem muted" title={new Date(o.createdAt).toLocaleString(locale)}>
                        {shortDate(o.createdAt, locale)}
                      </td>
                      <td className="tight">
                        <div className="rowact">
                          <Link href={`/products/${o.productId}`} className="btn btn-sm btn-ghost">
                            {t('msg.viewLot')}
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
              page={safePage}
              pageSize={PAGE_SIZE}
              total={rows.length}
              onPage={setPage}
              left={<span className="tnum">{t('orders.count', { n: apiTotal.toLocaleString(locale) })}</span>}
            />
          </div>
        </>
      )}
    </>
  );
}
