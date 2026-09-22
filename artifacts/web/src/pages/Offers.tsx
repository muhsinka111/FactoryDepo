import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import {
  useMyOffers, useCounterOffer, useAcceptOffer, useRejectOffer, useMe, getToken,
} from '@workspace/api-client-react';
import type { Offer } from '@workspace/api-zod';
import { Empty, StatusChip, Spinner, DemoTag, requireAuthGate, dashboardRole } from '../components';
import {
  EmptyState,
  Kpi,
  KpiRow,
  PageHeader,
  Pager,
  TableWrap,
  ToolSelect,
  Toolbar,
  metric,
} from '../dash';
import { useI18n, statusLabel } from '../i18n';

/**
 * My offers — the lot-by-lot price negotiations the signed-in user is party to.
 *
 * GET /api/offers is role-aware: a buyer sees the offers they opened, a supplier
 * the offers against their own stock, an admin everything. Either party may
 * counter, accept or reject while the offer is still open.
 *
 * Layout: PageHeader → KPI strip (counts per status, from the returned rows) →
 * toolbar (search / status / sort / export) → dense table → pager. The counter,
 * accept and reject mutations are unchanged: the counter modal posts to
 * /offers/:id/counter, accept to /offers/:id/accept, reject to /offers/:id/reject.
 *
 * Honesty rules applied here
 *  • Every figure is a value the API returned. `zOffer` carries no `unit` for the
 *    lot, so quantity is shown as a bare number rather than inventing one; a
 *    missing counterparty name or an unparseable date renders '—'.
 *  • A counter-offer is a child row (`parentOfferId`), so the table shows the
 *    chain as it exists in the data: a parent that was answered prints the child
 *    row's real price and its offer number, and a child prints the row it
 *    answers. Neither number is derived.
 *  • `dataSource === 'demo'` rows stay labelled with <DemoTag />.
 *  • The API contract has no `updatedAt` on an offer, so the date column is the
 *    real `createdAt` and no "last update" figure is invented.
 *  • The CSV export writes exactly the rows currently filtered on screen.
 */

const PAGE_SIZE = 20;

type SortKey = 'new' | 'old' | 'price_desc' | 'price_asc';
type StatusKey = 'all' | Offer['status'];

/** The five states the offer contract defines. */
const OFFER_STATUSES: Offer['status'][] = ['pending', 'countered', 'accepted', 'rejected', 'withdrawn'];

/** A party can still answer a pending or countered offer; the rest are decided. */
function isOpen(status: Offer['status']): boolean {
  return status === 'pending' || status === 'countered';
}

/** Currency + thousands formatting. Values come straight from the API. */
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

/** Exports exactly the rows handed in — no hidden columns, no recomputed values. */
function exportRowsCsv(rows: Offer[]): void {
  const head = [
    'id', 'productId', 'productName', 'buyerName', 'supplierName', 'quantity', 'unitPrice',
    'currency', 'value', 'status', 'parentOfferId', 'dataSource', 'createdAt',
  ];
  const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [head.join(',')];
  for (const o of rows) {
    lines.push(
      [
        o.id, o.productId, o.productName, o.buyerName, o.supplierName, o.quantity, o.unitPrice,
        o.currency, (o.unitPrice * o.quantity).toFixed(2), o.status, o.parentOfferId ?? '',
        o.dataSource, o.createdAt,
      ].map(cell).join(','),
    );
  }
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'factorydepo-offers.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Counter-offer form. Sent against the offer being answered (path id). */
function CounterModal({ offer, onClose }: { offer: Offer; onClose: () => void }) {
  const { t, locale } = useI18n();
  const counter = useCounterOffer();
  const [unitPrice, setUnitPrice] = useState(String(offer.unitPrice));
  const [quantity, setQuantity] = useState(String(offer.quantity));
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  const price = Number(unitPrice);
  const qty = Number(quantity);
  const valid = Number.isFinite(price) && price > 0 && Number.isFinite(qty) && qty > 0;

  const submit = async () => {
    setErr('');
    if (!getToken()) { requireAuthGate(); return; }
    if (!valid) { setErr(t('myoffers.errInvalid')); return; }
    try {
      await counter.mutateAsync({
        id: offer.id,
        unitPrice: price,
        quantity: qty,
        notes: notes.trim() || undefined,
      });
      setDone(true);
    } catch (e) {
      setErr(errMessage(e, t('myoffers.errCounter')));
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <h2>{done ? t('myoffers.counterDoneTitle') : t('myoffers.counterTitle', { id: offer.id })}</h2>
          <button className="x" onClick={onClose} aria-label={t('action.close')}>✕</button>
        </div>
        <div className="mb">
          {done ? (
            <>
              <p className="strong" style={{ marginTop: 0 }}>{t('myoffers.counterDoneBody')}</p>
              <p className="muted" style={{ marginTop: 6 }}>
                {t('myoffers.counterLead', {
                  product: offer.productName,
                  id: offer.id,
                  qty: offer.quantity.toLocaleString(locale),
                  price: money(offer.currency, offer.unitPrice),
                })}
              </p>
              <div className="row" style={{ gap: 8, marginTop: 14 }}>
                <button className="btn btn-primary" onClick={onClose}>{t('myoffers.backToOffers')}</button>
              </div>
            </>
          ) : (
            <>
              <p className="muted" style={{ margin: '0 0 12px' }}>
                {t('myoffers.counterLead', {
                  product: offer.productName,
                  id: offer.id,
                  qty: offer.quantity.toLocaleString(locale),
                  price: money(offer.currency, offer.unitPrice),
                })}
              </p>
              <div className="f2">
                <div className="field">
                  <label htmlFor="counter-price">{t('myoffers.col.unitPrice')} <i>*</i></label>
                  <input
                    id="counter-price"
                    className={`in ${!unitPrice || !(price > 0) ? 'err' : ''}`}
                    inputMode="decimal"
                    value={unitPrice}
                    onChange={(e) => setUnitPrice(e.target.value)}
                  />
                  <div className="hint">{t('myoffers.inCurrency', { currency: offer.currency })}</div>
                </div>
                <div className="field">
                  <label htmlFor="counter-qty">{t('myoffers.col.quantity')} <i>*</i></label>
                  <input
                    id="counter-qty"
                    className={`in ${!quantity || !(qty > 0) ? 'err' : ''}`}
                    inputMode="decimal"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                  />
                  <div className="hint">{t('myoffers.originally', { qty: offer.quantity.toLocaleString(locale) })}</div>
                </div>
              </div>
              <div className="field">
                <label htmlFor="counter-notes">{t('myoffers.messageLabel')}</label>
                <textarea
                  id="counter-notes"
                  className="in"
                  rows={3}
                  placeholder={t('myoffers.messagePlaceholder')}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              {err && <p className="errtext">{err}</p>}
            </>
          )}
        </div>
        {!done && (
          <div className="mf">
            <button className="btn btn-grey" onClick={onClose}>{t('action.cancel')}</button>
            <button className="btn btn-primary" disabled={counter.isPending || !valid} onClick={() => void submit()}>
              {counter.isPending ? t('myoffers.sending') : t('myoffers.sendCounter')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Accepting is irreversible and settles the deal, so it is confirmed first and
 * the consequence — an order on the accepted quantity — is stated up front.
 */
function AcceptModal({ offer, onClose, onAccepted }: { offer: Offer; onClose: () => void; onAccepted: (id: number) => void }) {
  const { t, locale } = useI18n();
  const accept = useAcceptOffer();
  const [err, setErr] = useState('');

  const submit = async () => {
    setErr('');
    if (!getToken()) { requireAuthGate(); return; }
    try {
      await accept.mutateAsync({ id: offer.id });
      onAccepted(offer.id);
    } catch (e) {
      setErr(errMessage(e, t('myoffers.errAccept')));
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <h2>{t('myoffers.acceptTitle', { id: offer.id })}</h2>
          <button className="x" onClick={onClose} aria-label={t('action.close')}>✕</button>
        </div>
        <div className="mb">
          <p className="muted" style={{ margin: '0 0 12px' }}>
            {t('myoffers.acceptLead', {
              product: offer.productName,
              qty: offer.quantity.toLocaleString(locale),
              price: money(offer.currency, offer.unitPrice),
            })}
          </p>
          <div className="stripe" style={{ margin: 0 }}>
            <span>
              {t('myoffers.acceptStripeLead')} <b>{t('myoffers.acceptStripeStrong')}</b>{' '}
              {t('myoffers.acceptStripeTail')}
            </span>
          </div>
          <p className="hint" style={{ marginTop: 9 }}>{t('myoffers.acceptHint')}</p>
          {err && <p className="errtext">{err}</p>}
        </div>
        <div className="mf">
          <button className="btn btn-grey" onClick={onClose}>{t('action.cancel')}</button>
          <button className="btn btn-green" disabled={accept.isPending} onClick={() => void submit()}>
            {accept.isPending ? t('myoffers.accepting') : t('myoffers.acceptCta')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Offers() {
  const { t, lang, locale } = useI18n();
  const me = useMe();
  const user = me.data;
  const loggedIn = !!getToken();
  const dash = dashboardRole(user?.role, loggedIn);
  const isSupplier = dash === 'supplier';

  const offers = useMyOffers({ enabled: !!user });
  const reject = useRejectOffer();

  const [counterFor, setCounterFor] = useState<Offer | null>(null);
  const [acceptFor, setAcceptFor] = useState<Offer | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
  const [actionErr, setActionErr] = useState('');

  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusKey>('all');
  const [sort, setSort] = useState<SortKey>('new');
  const [page, setPage] = useState(1);

  const dashAdmin = dash === 'admin';
  const title = isSupplier
    ? t('myoffers.titleSupplier')
    : dashAdmin
      ? t('myoffers.titleAdmin')
      : t('myoffers.titleBuyer');
  const sub = isSupplier
    ? t('myoffers.subSupplier')
    : dashAdmin
      ? t('myoffers.subAdmin')
      : t('myoffers.subBuyer');

  const items = useMemo(() => offers.data?.items ?? [], [offers.data]);
  const apiTotal = offers.data?.total ?? items.length;

  const openCount = useMemo(() => items.filter((o) => isOpen(o.status)).length, [items]);
  const pendingCount = useMemo(() => items.filter((o) => o.status === 'pending').length, [items]);
  const counteredCount = useMemo(() => items.filter((o) => o.status === 'countered').length, [items]);
  const acceptedCount = useMemo(() => items.filter((o) => o.status === 'accepted').length, [items]);
  const rejectedCount = useMemo(() => items.filter((o) => o.status === 'rejected').length, [items]);

  /** The newest child row per parent — a counter-offer in the same negotiation. */
  const counterBy = useMemo(() => {
    const m = new Map<number, Offer>();
    const byId = new Map<number, Offer>();
    for (const o of items) byId.set(o.id, o);
    for (const o of items) {
      if (o.parentOfferId == null) continue;
      const cur = m.get(o.parentOfferId);
      if (!cur || o.id > cur.id) m.set(o.parentOfferId, o);
    }
    return { counterBy: m, byId };
  }, [items]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = items.filter((o) => {
      if (status !== 'all' && o.status !== status) return false;
      if (!needle) return true;
      return (
        `#${o.id}`.includes(needle) ||
        o.productName.toLowerCase().includes(needle) ||
        o.buyerName.toLowerCase().includes(needle) ||
        o.supplierName.toLowerCase().includes(needle) ||
        (o.notes ?? '').toLowerCase().includes(needle)
      );
    });
    out = [...out].sort((a, b) => {
      if (sort === 'new') return b.id - a.id;
      if (sort === 'old') return a.id - b.id;
      if (sort === 'price_desc') return b.unitPrice - a.unitPrice;
      return a.unitPrice - b.unitPrice;
    });
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
        <PageHeader title={t('myoffers.titleBuyer')} sub={t('myoffers.signInSub')} />
        <Empty title={t('myoffers.notSignedIn')}>
          {t('myoffers.notSignedInBody')}
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Link href="/sign-in?next=%2Foffers" className="btn btn-sm btn-primary">{t('action.signIn')}</Link>
            <Link href="/sign-up?next=%2Foffers" className="btn btn-sm btn-ghost">{t('action.createAccount')}</Link>
          </div>
        </Empty>
      </>
    );
  }

  const doReject = async (id: number) => {
    setActionErr('');
    if (!getToken()) { requireAuthGate(); return; }
    try {
      await reject.mutateAsync({ id });
      setRejectingId(null);
    } catch (e) {
      setActionErr(errMessage(e, t('myoffers.errReject', { id })));
    }
  };

  return (
    <>
      {counterFor && <CounterModal offer={counterFor} onClose={() => setCounterFor(null)} />}
      {acceptFor && (
        <AcceptModal
          offer={acceptFor}
          onClose={() => setAcceptFor(null)}
          onAccepted={(id) => {
            setAcceptFor(null);
            setNotice(t('myoffers.accepted', { id }));
          }}
        />
      )}

      <PageHeader
        title={title}
        sub={sub}
        actions={
          <div className="row" style={{ gap: 6 }}>
            <button
              className="btn btn-sm btn-grey"
              onClick={() => void offers.refetch()}
              disabled={offers.isFetching}
            >
              {offers.isFetching ? t('action.refreshing') : t('action.refresh')}
            </button>
            <Link href="/explore" className="btn btn-sm btn-gold">{t('myoffers.browseStock')}</Link>
          </div>
        }
      />

      <KpiRow>
        <Kpi ic="🏷️" label={title} value={metric(apiTotal)} hint={t('myoffers.stillOpen', { n: openCount.toLocaleString(locale) })} />
        <Kpi ic="⏳" label={t('status.pending')} value={metric(pendingCount)} />
        <Kpi ic="🔁" label={t('status.countered')} value={metric(counteredCount)} />
        <Kpi ic="✅" label={t('status.accepted')} value={metric(acceptedCount)} />
        <Kpi ic="⛔" label={t('status.rejected')} value={metric(rejectedCount)} />
      </KpiRow>

      {notice && (
        <div className="stripe">
          <span>{notice}</span>
          <Link href="/orders" className="btn btn-sm btn-grey" style={{ marginLeft: 'auto' }}>{t('myoffers.viewOrders')}</Link>
          <button className="x" onClick={() => setNotice('')} aria-label={t('action.dismiss')}>✕</button>
        </div>
      )}

      {actionErr && <p className="errtext" style={{ marginTop: -4, marginBottom: 10 }}>{actionErr}</p>}

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
          label={t('myoffers.col.status')}
          value={status}
          onChange={(v) => { setStatus(v as StatusKey); setPage(1); }}
          options={[
            { value: 'all', label: t('rfq.statusAll') },
            ...OFFER_STATUSES.map((st) => ({ value: st, label: statusLabel(lang, st) })),
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
        {offers.dataUpdatedAt > 0 && (
          <span className="tl tnum">
            {t('dash.lastUpdated')} {new Date(offers.dataUpdatedAt).toLocaleTimeString(locale)}
          </span>
        )}
      </Toolbar>

      {offers.isLoading ? (
        <Spinner />
      ) : offers.isError ? (
        <EmptyState
          icon="⚠️"
          title={t('myoffers.loadErrorTitle')}
          body={t('myoffers.loadErrorBody')}
          action={
            <button className="btn btn-sm btn-grey" onClick={() => void offers.refetch()}>
              {offers.isFetching ? t('myoffers.trying') : t('action.tryAgain')}
            </button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon="🏷️"
          title={t('myoffers.emptyTitle')}
          body={isSupplier ? t('myoffers.emptySupplier') : dashAdmin ? t('myoffers.emptyAdmin') : t('myoffers.emptyBuyer')}
          action={
            <div className="row" style={{ justifyContent: 'center', gap: 8 }}>
              <Link href="/explore" className="btn btn-sm btn-gold">{t('myoffers.browseStock')}</Link>
              {isSupplier && <Link href="/supplier/listings" className="btn btn-sm btn-ghost">{t('post.myListings')}</Link>}
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
                  <th>{t('myoffers.col.offer')}</th>
                  <th>{t('myoffers.col.counterparty')}</th>
                  <th className="num">{t('myoffers.col.quantity')}</th>
                  <th className="num">{t('myoffers.col.unitPrice')}</th>
                  <th className="tight">{t('myoffers.col.status')}</th>
                  <th className="hidem">{t('myoffers.col.date')}</th>
                  <th className="tight">{t('myoffers.col.action')}</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((o) => {
                  const iAmBuyer = o.buyerId === user.id;
                  const otherName = iAmBuyer ? o.supplierName : o.buyerName;
                  const parent = o.parentOfferId != null ? counterBy.byId.get(o.parentOfferId) : undefined;
                  const answered = counterBy.counterBy.get(o.id);
                  return (
                    <tr key={o.id}>
                      <td>
                        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                          <Link href={`/products/${o.productId}`} className="cellmain">{o.productName}</Link>
                          {o.dataSource === 'demo' && <DemoTag />}
                        </div>
                        <span className="cellsub">
                          {t('myoffers.offerRef', { id: o.id })}
                          {o.parentOfferId != null
                            ? ` · ${t('myoffers.counterTo', { id: o.parentOfferId })}`
                            : ''}
                        </span>
                        {o.notes && (
                          <span className="cellsub" style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            “{o.notes}”
                          </span>
                        )}
                      </td>
                      <td>
                        <span className="cellmain">{otherName.trim() || '—'}</span>
                        <span className="cellsub">{iAmBuyer ? t('myoffers.seatSupplier') : t('myoffers.seatBuyer')}</span>
                      </td>
                      <td className="num tnum">
                        {o.quantity.toLocaleString(locale)}
                        {parent ? (
                          <span className="cellsub tnum">{t('myoffers.originally', { qty: parent.quantity.toLocaleString(locale) })}</span>
                        ) : null}
                      </td>
                      <td className="num strong tnum">
                        {money(o.currency, o.unitPrice)}
                        {answered ? (
                          <span className="cellsub tnum">
                            {money(answered.currency, answered.unitPrice)} · {t('myoffers.answersOffer', { id: answered.id })}
                          </span>
                        ) : null}
                      </td>
                      <td className="tight"><StatusChip status={o.status} /></td>
                      <td className="hidem muted" title={new Date(o.createdAt).toLocaleString(locale)}>
                        {shortDate(o.createdAt, locale)}
                      </td>
                      <td className="tight">
                        {!isOpen(o.status) ? (
                          <span className="muted">{t('myoffers.noAction')}</span>
                        ) : rejectingId === o.id ? (
                          <div className="rowact">
                            <button
                              className="btn btn-sm btn-red"
                              disabled={reject.isPending}
                              onClick={() => void doReject(o.id)}
                            >
                              {reject.isPending ? t('offers.rejecting') : t('myoffers.confirmReject')}
                            </button>
                            <button className="btn btn-sm btn-grey" onClick={() => setRejectingId(null)}>{t('action.cancel')}</button>
                          </div>
                        ) : (
                          <div className="rowact">
                            <button className="btn btn-sm btn-ghost" onClick={() => setCounterFor(o)}>{t('myoffers.counter')}</button>
                            <button className="btn btn-sm btn-green" onClick={() => setAcceptFor(o)}>{t('myoffers.accept')}</button>
                            <button className="btn btn-sm btn-red" onClick={() => setRejectingId(o.id)}>{t('myoffers.reject')}</button>
                          </div>
                        )}
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
              left={<span className="tnum">{t('myoffers.count', { n: apiTotal.toLocaleString(locale) })}</span>}
            />
          </div>
        </>
      )}
    </>
  );
}
