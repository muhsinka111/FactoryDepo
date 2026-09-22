import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import {
  useMyOffers,
  useCounterOffer,
  useAcceptOffer,
  useRejectOffer,
  useMe,
  getToken,
} from '@workspace/api-client-react';
import type { ApiError } from '@workspace/api-client-react';
import type { Offer } from '@workspace/api-zod';
import {
  Empty,
  StatusChip,
  DemoTag,
  Spinner,
  requireAuthGate,
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
  metric,
} from '../dash';
import { useI18n } from '../i18n';

/**
 * Offers on your stock — the supplier side of lot-by-lot negotiation.
 *
 * GET /api/offers is role-aware: a supplier account already receives only the
 * offers opened against its own supplier row. This page additionally drops any
 * row whose supplierId is not one of those, so an admin (who sees every offer at
 * the API) still sees a genuine "offers on your stock" screen rather than the
 * whole book.
 *
 * What the three actions do, exactly:
 *  • Counter → POST /offers/:id/counter. It does not overwrite the offer; it
 *    inserts a linked child offer and flips the original to 'countered'.
 *  • Accept  → POST /offers/:id/accept. THIS CREATES AN ORDER. The buyer then
 *    pays by bank transfer; nothing is charged through the platform.
 *  • Reject  → POST /offers/:id/reject. Final — the API refuses a second
 *    decision on an accepted/rejected offer with 409.
 *
 * A decided offer is shown with no action buttons, matching what the API accepts.
 *
 * Honesty rules applied here
 *  • Every KPI is a count of the rows the API returned, grouped by their real
 *    status — nothing is estimated.
 *  • "Their price" is the buyer's opening price of the row's negotiation chain.
 *    POST /api/offers always opens the root of a chain as a buyer action and
 *    refuses a supplier offering on its own listing, so the root row of a chain
 *    on this account's stock is provably the buyer's number; the cell names the
 *    root offer it came from. When the chain's root is not in the returned list
 *    the cell prints '—' rather than guessing.
 *  • The unit price column is the price stated on that row, whatever side of the
 *    negotiation it came from — the offer contract records no per-row author, so
 *    the table never labels a row "your counter" when the API cannot prove whose
 *    number it is. The parent link on the row says which offer it answers.
 *  • The unit of measure is not part of the offer contract, so quantity is shown
 *    without inventing one.
 *  • Rows keep <DemoTag /> when the underlying lot is demo supply.
 */

const PAGE_SIZE = 20;
const FINAL = new Set(['accepted', 'rejected', 'withdrawn']);

type StatusFilter = 'all' | 'pending' | 'countered' | 'accepted' | 'rejected';
type SortKey = 'new' | 'old' | 'price_desc' | 'price_asc';

const STATUS_VALUES: StatusFilter[] = ['all', 'pending', 'countered', 'accepted', 'rejected'];

/**
 * Deep-linked status filter — `/supplier/offers?status=pending` is where the
 * "needs attention" row sends you, so the filtered view has a real URL.
 */
function statusFromUrl(): StatusFilter {
  const raw = new URLSearchParams(window.location.search).get('status');
  return STATUS_VALUES.includes(raw as StatusFilter) ? (raw as StatusFilter) : 'all';
}

function money(currency: string, amount: number): string {
  return `${currency === 'USD' ? '$' : `${currency} `}${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function shortDate(iso: string, locale: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
}

function errorText(e: unknown, fallback: string): string {
  const err = e as Partial<ApiError> | undefined;
  if (err?.message) return err.message;
  return fallback;
}

/** Counter form — the price the supplier answers with. */
function CounterModal({
  offer,
  onClose,
  onDone,
}: {
  offer: Offer;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { t, locale } = useI18n();
  const counter = useCounterOffer();
  const [unitPrice, setUnitPrice] = useState(String(offer.unitPrice));
  const [quantity, setQuantity] = useState(String(offer.quantity));
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState('');

  const submit = async () => {
    setErr('');
    const price = Number(unitPrice);
    if (!Number.isFinite(price) || price <= 0) {
      setErr(t('offers.counterErrPrice'));
      return;
    }
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      setErr(t('offers.counterErrQty'));
      return;
    }
    try {
      await counter.mutateAsync({
        id: offer.id,
        unitPrice: price,
        // Only send a quantity when the supplier actually changed it.
        quantity: qty === offer.quantity ? undefined : qty,
        notes: notes.trim() || undefined,
      });
      onDone(t('offers.counterDone'));
    } catch (e) {
      setErr(errorText(e, t('offers.counterErr')));
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <h2>{t('offers.counterTitle', { id: offer.id })}</h2>
          <button className="x" onClick={onClose} aria-label={t('action.close')}>✕</button>
        </div>
        <div className="mb">
          <p className="muted" style={{ marginTop: 0, fontSize: 12.5 }}>
            {t('offers.counterBody', {
              buyer: offer.buyerName,
              price: money(offer.currency, offer.unitPrice),
              qty: offer.quantity.toLocaleString(locale),
              product: offer.productName,
            })}
          </p>
          {err && <div className="errtext" style={{ marginBottom: 10 }} role="alert">{err}</div>}
          <div className="f2">
            <div className="field">
              <label htmlFor="counter-price">{t('offers.counterPrice')} <i>*</i></label>
              <input
                id="counter-price"
                className="in"
                inputMode="decimal"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
              />
              <div className="hint">{t('offers.perUnit', { currency: offer.currency })}</div>
            </div>
            <div className="field">
              <label htmlFor="counter-qty">{t('offers.counterQty')}</label>
              <input
                id="counter-qty"
                className="in"
                inputMode="decimal"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
              <div className="hint">{t('offers.counterQtyHint')}</div>
            </div>
          </div>
          <div className="field">
            <label htmlFor="counter-notes">{t('offers.counterNotes')}</label>
            <textarea
              id="counter-notes"
              className="in"
              rows={3}
              placeholder={t('offers.counterNotesPlaceholder')}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <div className="mf">
          <button className="btn btn-grey" onClick={onClose} disabled={counter.isPending}>{t('action.cancel')}</button>
          <button className="btn btn-gold" onClick={submit} disabled={counter.isPending || !unitPrice}>
            {counter.isPending ? t('offers.sending') : t('offers.sendCounter')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Accept — spells out that an order is created and the buyer pays by transfer. */
function AcceptModal({
  offer,
  onClose,
  onDone,
}: {
  offer: Offer;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { t, locale } = useI18n();
  const accept = useAcceptOffer();
  const [err, setErr] = useState('');
  const total = offer.unitPrice * offer.quantity;

  const confirm = async () => {
    setErr('');
    try {
      await accept.mutateAsync({ id: offer.id });
      onDone(t('offers.acceptDone', { id: offer.id, buyer: offer.buyerName }));
    } catch (e) {
      setErr(errorText(e, t('offers.acceptErr')));
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <h2>{t('offers.acceptTitle', { id: offer.id })}</h2>
          <button className="x" onClick={onClose} aria-label={t('action.close')}>✕</button>
        </div>
        <div className="mb">
          <table>
            <tbody>
              <tr>
                <td className="muted">{t('offers.listing')}</td>
                <td style={{ textAlign: 'right' }}>{offer.productName}</td>
              </tr>
              <tr>
                <td className="muted">{t('offers.buyer')}</td>
                <td style={{ textAlign: 'right' }}>{offer.buyerName}</td>
              </tr>
              <tr>
                <td className="muted">{t('offers.quantity')}</td>
                <td style={{ textAlign: 'right' }}>{offer.quantity.toLocaleString(locale)}</td>
              </tr>
              <tr>
                <td className="muted">{t('offers.unitPrice')}</td>
                <td style={{ textAlign: 'right' }}>{money(offer.currency, offer.unitPrice)}</td>
              </tr>
              <tr>
                <td className="muted">{t('offers.offerValue')}</td>
                <td style={{ textAlign: 'right' }} className="strong">{money(offer.currency, total)}</td>
              </tr>
            </tbody>
          </table>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
            <b>{t('offers.acceptBodyLead')}</b> {t('offers.acceptBodyBank')}{' '}
            <b>{t('post.bankTransfer')}</b> {t('offers.acceptBodyTail')}
          </p>
          {err && <div className="errtext" role="alert">{err}</div>}
        </div>
        <div className="mf">
          <button className="btn btn-grey" onClick={onClose} disabled={accept.isPending}>{t('action.cancel')}</button>
          <button className="btn btn-green" onClick={confirm} disabled={accept.isPending}>
            {accept.isPending ? t('offers.accepting') : t('offers.acceptCta')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Reject — also final. */
function RejectModal({
  offer,
  onClose,
  onDone,
}: {
  offer: Offer;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { t } = useI18n();
  const reject = useRejectOffer();
  const [err, setErr] = useState('');

  const confirm = async () => {
    setErr('');
    try {
      await reject.mutateAsync({ id: offer.id });
      onDone(t('offers.rejectDone', { id: offer.id }));
    } catch (e) {
      setErr(errorText(e, t('offers.rejectErr')));
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <h2>{t('offers.rejectTitle', { id: offer.id })}</h2>
          <button className="x" onClick={onClose} aria-label={t('action.close')}>✕</button>
        </div>
        <div className="mb">
          <p className="muted" style={{ marginTop: 0, fontSize: 12.5 }}>
            {t('offers.rejectBody', {
              buyer: offer.buyerName,
              price: money(offer.currency, offer.unitPrice),
              product: offer.productName,
            })}
          </p>
          {err && <div className="errtext" role="alert">{err}</div>}
        </div>
        <div className="mf">
          <button className="btn btn-grey" onClick={onClose} disabled={reject.isPending}>{t('action.cancel')}</button>
          <button className="btn btn-red" onClick={confirm} disabled={reject.isPending}>
            {reject.isPending ? t('offers.rejecting') : t('offers.rejectCta')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SupplierOffers() {
  const { t, locale } = useI18n();
  const { data: user, isLoading: meLoading } = useMe();
  const loggedIn = !!getToken();
  const isSupplier = user?.role === 'supplier';
  const ready = loggedIn && isSupplier;

  const res = useMyOffers({ enabled: ready });
  const [countering, setCountering] = useState<Offer | null>(null);
  const [accepting, setAccepting] = useState<Offer | null>(null);
  const [rejecting, setRejecting] = useState<Offer | null>(null);
  const [notice, setNotice] = useState('');
  const [status, setStatus] = useState<StatusFilter>(() => statusFromUrl());
  const [sort, setSort] = useState<SortKey>('new');
  const [page, setPage] = useState(1);

  const all = useMemo(() => res.data?.items ?? [], [res.data]);

  const counts = useMemo(
    () => ({
      pending: all.filter((o) => o.status === 'pending').length,
      countered: all.filter((o) => o.status === 'countered').length,
      accepted: all.filter((o) => o.status === 'accepted').length,
      rejected: all.filter((o) => o.status === 'rejected').length,
    }),
    [all],
  );

  /**
   * Money at stake per status: unitPrice × quantity over the rows the API
   * returned — real arithmetic on returned numbers. It is only stated when the
   * selection quotes a single currency; an empty selection or a mixed-currency
   * selection prints '—' rather than a converted or empty total.
   */
  const valueOf = (pred: (o: Offer) => boolean): { currency: string; value: number } | null => {
    const sel = all.filter(pred);
    if (sel.length === 0) return null;
    const currencies = new Set(sel.map((o) => o.currency));
    if (currencies.size !== 1) return null;
    const [currency] = [...currencies] as [string];
    return { currency, value: sel.reduce((sum, o) => sum + o.unitPrice * o.quantity, 0) };
  };
  const pendingValue = valueOf((o) => o.status === 'pending');
  const acceptedValue = valueOf((o) => o.status === 'accepted');
  const totalValue = valueOf(() => true);
  const money3 = (v: { currency: string; value: number } | null): string =>
    metric(v?.value ?? null, (n) => money(v!.currency, n));

  const rows = useMemo(() => {
    const filtered = all.filter((o) => (status === 'all' ? true : o.status === status));
    const sorted = [...filtered];
    sorted.sort((a, b) =>
      sort === 'old'
        ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        : sort === 'price_desc'
          ? b.unitPrice - a.unitPrice
          : sort === 'price_asc'
            ? a.unitPrice - b.unitPrice
            : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return sorted;
  }, [all, status, sort]);

  const pageRows = useMemo(
    () => rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [rows, page],
  );

  /**
   * Chain roots. A root (parentOfferId === null) is provably the buyer's opening
   * offer: only a buyer action creates one, and the API refuses a supplier
   * offering on its own listing. A broken chain (parent not in the list) yields
   * null so the cell can print '—' instead of attributing a price to the buyer.
   */
  const rootOf = useMemo(() => {
    const byId = new Map(all.map((o) => [o.id, o]));
    return (offer: Offer): Offer | null => {
      let cur: Offer = offer;
      for (let guard = 0; guard < 20; guard++) {
        if (cur.parentOfferId === null) return cur;
        const parent = byId.get(cur.parentOfferId);
        if (!parent) return null;
        cur = parent;
      }
      return null;
    };
  }, [all]);

  if (meLoading) {
    return (
      <>
        <PageHeader title={t('offers.title')} />
        <Spinner />
      </>
    );
  }

  if (!loggedIn || !user) {
    return (
      <>
        <PageHeader title={t('offers.title')} sub={t('offers.sub')} />
        <Empty title={t('offers.notSignedIn')}>
          {t('offers.notSignedInBody')}
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Link
              href="/sign-in?next=%2Fsupplier%2Foffers"
              className="btn btn-sm btn-primary"
              onClick={() => requireAuthGate()}
            >
              {t('action.signIn')}
            </Link>
            <Link href="/sign-up?next=%2Fsupplier%2Foffers" className="btn btn-sm btn-ghost">
              {t('offers.createSupplierAccount')}
            </Link>
          </div>
        </Empty>
      </>
    );
  }

  if (!isSupplier) {
    return (
      <>
        <PageHeader title={t('offers.title')} sub={t('offers.sub')} />
        <Empty title={t('offers.supplierOnly')}>
          {t('offers.supplierOnlyBody', { role: user.role })}
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Link href="/explore" className="btn btn-sm btn-ghost">{t('offers.browseStock')}</Link>
          </div>
        </Empty>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t('offers.title')}
        sub={
          res.isLoading
            ? t('offers.subLoading')
            : t('offers.subCount', { n: all.length.toLocaleString(locale) })
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
            <Link href="/supplier/listings" className="btn btn-sm btn-ghost">{t('post.myListings')}</Link>
          </div>
        }
      />

      <KpiRow>
        <Kpi
          ic="⏳"
          label={t('status.pending')}
          value={metric(res.isLoading ? undefined : counts.pending)}
          hint={t('offers.awaiting')}
        />
        <Kpi
          ic="🔁"
          label={t('status.countered')}
          value={metric(res.isLoading ? undefined : counts.countered)}
        />
        <Kpi
          ic="✅"
          label={t('status.accepted')}
          value={metric(res.isLoading ? undefined : counts.accepted)}
        />
        <Kpi
          ic="⛔"
          label={t('status.rejected')}
          value={metric(res.isLoading ? undefined : counts.rejected)}
        />
        <Kpi
          ic="🏷️"
          label={t('orders.col.total')}
          value={metric(res.isLoading ? undefined : all.length)}
          hint={t('dash.rowsTotal', { n: all.length.toLocaleString(locale) })}
        />
      </KpiRow>

      <div className="grid2 mb10">
        <div className="card">
          <div className="hd"><h2>{t('dash.needsAttention')}</h2></div>
          <div className="bd">
            <Attention
              items={[
                {
                  icon: '⏳',
                  label: t('offers.awaiting'),
                  count: counts.pending,
                  // Anchors get the kit's `.attn a` row layout, and the filter
                  // lives in the URL so the landing view is shareable.
                  href: '/supplier/offers?status=pending',
                },
              ]}
            />
            <div className="mt10">
              <span className="muted" style={{ fontSize: 11.5 }}>{t('offers.acceptCreates')}</span>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="hd"><h2>{t('offers.offerValue')}</h2></div>
          <div className="bd">
            <div className="mini3">
              <div>
                <div className="v tnum">{money3(pendingValue)}</div>
                <div className="l">{t('status.pending')}</div>
              </div>
              <div>
                <div className="v tnum">{money3(acceptedValue)}</div>
                <div className="l">{t('status.accepted')}</div>
              </div>
              <div>
                <div className="v tnum">{money3(totalValue)}</div>
                <div className="l">{t('orders.col.total')}</div>
              </div>
            </div>
            <p className="muted mt10" style={{ fontSize: 11.5, marginBottom: 0 }}>
              {t('offers.counterNote')}
            </p>
          </div>
        </div>
      </div>

      {notice && (
        <div className="stripe">
          <span>{notice}</span>
          <button className="x" onClick={() => setNotice('')} aria-label={t('action.dismiss')}>✕</button>
        </div>
      )}

      <Toolbar>
        <ToolSelect
          label={t('offers.col.status')}
          value={status}
          onChange={(v) => {
            setStatus(v as StatusFilter);
            setPage(1);
          }}
          options={[
            { value: 'all', label: t('rfq.statusAll') },
            { value: 'pending', label: t('status.pending') },
            { value: 'countered', label: t('status.countered') },
            { value: 'accepted', label: t('status.accepted') },
            { value: 'rejected', label: t('status.rejected') },
          ]}
        />
        <ToolSelect
          label={t('dash.sortBy')}
          value={sort}
          onChange={(v) => {
            setSort(v as SortKey);
            setPage(1);
          }}
          options={[
            { value: 'new', label: t('dash.sortNewest') },
            { value: 'old', label: t('dash.sortOldest') },
            { value: 'price_desc', label: t('dash.sortPriceHigh') },
            { value: 'price_asc', label: t('dash.sortPriceLow') },
          ]}
        />
        <span className="sep" />
        <span className="tl tnum">{t('dash.rowsTotal', { n: rows.length.toLocaleString(locale) })}</span>
        {status !== 'all' && (
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => {
              setStatus('all');
              setPage(1);
            }}
          >
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
          title={t('offers.loadErrorTitle')}
          body={t('offers.loadErrorBody')}
          action={
            <button className="btn btn-sm btn-grey" onClick={() => res.refetch()}>{t('action.tryAgain')}</button>
          }
        />
      ) : all.length === 0 ? (
        <EmptyState
          icon="🏷️"
          title={t('offers.emptyTitle')}
          body={t('offers.emptyBody')}
          action={
            <div className="row" style={{ justifyContent: 'center', gap: 8 }}>
              <Link href="/supplier/listings" className="btn btn-sm btn-ghost">{t('offers.seeListings')}</Link>
              <Link href="/supplier/post" className="btn btn-sm btn-gold">{t('offers.postMore')}</Link>
            </div>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="🔍"
          title={status === 'pending' ? t('offers.noneAwaiting') : t('dash.noResults')}
          body={status === 'pending' ? t('offers.noneAwaitingBody') : t('dash.noResultsBody')}
          action={
            <button
              className="btn btn-sm btn-grey"
              onClick={() => {
                setStatus('all');
                setPage(1);
              }}
            >
              {t('dash.clearFilters')}
            </button>
          }
        />
      ) : (
        <>
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>{t('offers.col.listing')}</th>
                  <th>{t('offers.col.buyer')}</th>
                  <th className="num">{t('myoffers.col.quantity')}</th>
                  <th className="num">{t('offers.col.theirPrice')}</th>
                  <th className="num hidem">{t('myoffers.col.unitPrice')}</th>
                  <th className="num">{t('orders.col.total')}</th>
                  <th className="tight">{t('offers.col.status')}</th>
                  <th className="hidem">{t('offers.col.received')}</th>
                  <th className="tight">{t('myoffers.col.action')}</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((o) => {
                  const root = rootOf(o);
                  const total = o.unitPrice * o.quantity;
                  return (
                    <tr key={o.id}>
                      <td>
                        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                          <Link href={`/products/${o.productId}`} className="cellmain">{o.productName}</Link>
                          {o.dataSource === 'demo' && <DemoTag />}
                        </div>
                        <span className="cellsub">
                          {t('offers.offerRef', { id: o.id })}
                          {o.parentOfferId !== null
                            ? ` · ${t('offers.answersOffer', { id: o.parentOfferId })}`
                            : ''}
                          {o.notes ? ` · “${o.notes}”` : ''}
                        </span>
                      </td>
                      <td>{o.buyerName}</td>
                      <td className="num">{o.quantity.toLocaleString(locale)}</td>
                      <td className="num strong">
                        {root ? money(o.currency, root.unitPrice) : metric(undefined)}
                        {root ? (
                          <span className="cellsub">{t('offers.offerRef', { id: root.id })}</span>
                        ) : null}
                      </td>
                      <td className="num hidem">
                        {money(o.currency, o.unitPrice)}
                        <span className="cellsub">
                          {o.parentOfferId !== null
                            ? t('offers.answersOffer', { id: o.parentOfferId })
                            : t('offers.col.theirPrice')}
                        </span>
                      </td>
                      <td className="num">
                        {money(o.currency, total)}
                        <span className="cellsub tnum">
                          {o.quantity.toLocaleString(locale)} × {money(o.currency, o.unitPrice)}
                        </span>
                      </td>
                      <td className="tight"><StatusChip status={o.status} /></td>
                      <td className="hidem muted" title={new Date(o.createdAt).toLocaleString(locale)}>
                        {shortDate(o.createdAt, locale)}
                      </td>
                      <td className="tight">
                        {FINAL.has(o.status) ? (
                          <span className="muted">{t('offers.decidedLabel')}</span>
                        ) : (
                          <div className="rowact">
                            <button
                              className="btn btn-sm btn-ghost"
                              onClick={() => { setNotice(''); setCountering(o); }}
                            >
                              {t('offers.counter')}
                            </button>
                            <button
                              className="btn btn-sm btn-green"
                              onClick={() => { setNotice(''); setAccepting(o); }}
                            >
                              {t('offers.accept')}
                            </button>
                            <button
                              className="btn btn-sm btn-red"
                              onClick={() => { setNotice(''); setRejecting(o); }}
                            >
                              {t('offers.reject')}
                            </button>
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
              page={page}
              pageSize={PAGE_SIZE}
              total={rows.length}
              onPage={setPage}
              left={<span className="tnum">{t('offers.count', { n: rows.length.toLocaleString(locale) })}</span>}
            />
          </div>

          <div className="stripe" style={{ marginTop: 12 }}>
            <span>
              {t('offers.demoNoteLead')} <span className="pill p-amber">{t('cards.demo')}</span>{' '}
              {t('offers.demoNoteTail')}
            </span>
          </div>
        </>
      )}

      {countering && (
        <CounterModal
          offer={countering}
          onClose={() => setCountering(null)}
          onDone={(m) => { setCountering(null); setNotice(m); }}
        />
      )}
      {accepting && (
        <AcceptModal
          offer={accepting}
          onClose={() => setAccepting(null)}
          onDone={(m) => { setAccepting(null); setNotice(m); }}
        />
      )}
      {rejecting && (
        <RejectModal
          offer={rejecting}
          onClose={() => setRejecting(null)}
          onDone={(m) => { setRejecting(null); setNotice(m); }}
        />
      )}
    </>
  );
}
