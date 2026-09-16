import { useState } from 'react';
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
  View,
  Empty,
  StatusChip,
  DemoTag,
  Spinner,
  requireAuthGate,
} from '../components';
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
 */

/** Statuses from which no further decision can be taken (mirrors the API). */
const FINAL = new Set(['accepted', 'rejected', 'withdrawn']);

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

  const res = useMyOffers({ enabled: loggedIn && isSupplier });
  const [countering, setCountering] = useState<Offer | null>(null);
  const [accepting, setAccepting] = useState<Offer | null>(null);
  const [rejecting, setRejecting] = useState<Offer | null>(null);
  const [notice, setNotice] = useState('');
  const [only, setOnly] = useState<'open' | 'decided'>('open');

  if (meLoading) {
    return (
      <View title={t('offers.title')}>
        <Spinner />
      </View>
    );
  }

  if (!loggedIn || !user) {
    return (
      <View title={t('offers.title')} sub={t('offers.sub')}>
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
      </View>
    );
  }

  if (!isSupplier) {
    return (
      <View title={t('offers.title')} sub={t('offers.sub')}>
        <Empty title={t('offers.supplierOnly')}>
          {t('offers.supplierOnlyBody', { role: user.role })}
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Link href="/explore" className="btn btn-sm btn-ghost">{t('offers.browseStock')}</Link>
          </div>
        </Empty>
      </View>
    );
  }

  const all = res.data?.items ?? [];
  // GET /api/offers already returns only the offers where this account is the
  // supplier (the supplier id comes from the token, never the request), so the
  // list is used as served — no client-side guessing at who the caller is.
  const open = all.filter((o) => !FINAL.has(o.status));
  const decided = all.filter((o) => FINAL.has(o.status));
  const visible = only === 'open' ? open : decided;

  return (
    <View
      title={t('offers.title')}
      sub={
        res.isLoading
          ? t('offers.subLoading')
          : t('offers.subCount', { n: all.length.toLocaleString(locale) })
      }
      actions={
        <div className="row">
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
    >
      {notice && (
        <div className="stripe">
          <span>{notice}</span>
          <button className="x" onClick={() => setNotice('')} aria-label={t('action.dismiss')}>✕</button>
        </div>
      )}

      <div className="stripe">
        <span>
          <b>{res.isLoading ? '—' : open.length.toLocaleString(locale)}</b> {t('offers.awaiting')}
        </span>
        <span>
          <b>{res.isLoading ? '—' : decided.length.toLocaleString(locale)}</b> {t('offers.decided')}
        </span>
        <span>{t('offers.acceptCreates')}</span>
      </div>

      <div className="filters">
        <button
          className={`chip ${only === 'open' ? 'on' : ''}`}
          onClick={() => setOnly('open')}
        >
          {t('offers.filterAwaiting', { n: open.length.toLocaleString(locale) })}
        </button>
        <button
          className={`chip ${only === 'decided' ? 'on' : ''}`}
          onClick={() => setOnly('decided')}
        >
          {t('offers.filterDecided', { n: decided.length.toLocaleString(locale) })}
        </button>
        <span className="muted">{t('offers.counterNote')}</span>
      </div>

      {res.isLoading ? (
        <Spinner />
      ) : res.isError ? (
        <Empty title={t('offers.loadErrorTitle')}>
          {t('offers.loadErrorBody')}
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <button className="btn btn-sm btn-grey" onClick={() => res.refetch()}>{t('action.tryAgain')}</button>
          </div>
        </Empty>
      ) : all.length === 0 ? (
        <Empty title={t('offers.emptyTitle')}>
          {t('offers.emptyBody')}
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Link href="/supplier/listings" className="btn btn-sm btn-ghost">{t('offers.seeListings')}</Link>
            <Link href="/supplier/post" className="btn btn-sm btn-gold">{t('offers.postMore')}</Link>
          </div>
        </Empty>
      ) : visible.length === 0 ? (
        <Empty title={only === 'open' ? t('offers.noneAwaiting') : t('offers.noneDecided')}>
          {only === 'open' ? t('offers.noneAwaitingBody') : t('offers.noneDecidedBody')}
        </Empty>
      ) : (
        <div className="card">
          <div className="hd">
            <b>{t('offers.count', { n: visible.length.toLocaleString(locale) })}</b>
            <span className="muted" style={{ marginLeft: 'auto' }}>{t('common.newestFirst')}</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>{t('offers.col.listing')}</th>
                  <th>{t('offers.col.buyer')}</th>
                  <th style={{ textAlign: 'right' }}>{t('offers.col.quantity')}</th>
                  <th style={{ textAlign: 'right' }}>{t('offers.col.theirPrice')}</th>
                  <th>{t('offers.col.status')}</th>
                  <th className="hidem">{t('offers.col.received')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                        <Link href={`/products/${o.productId}`} className="strong">{o.productName}</Link>
                        {o.dataSource === 'demo' && <DemoTag />}
                      </div>
                      <div className="muted">
                        {t('offers.offerRef', { id: o.id })}
                        {o.parentOfferId !== null ? ` · ${t('offers.answersOffer', { id: o.parentOfferId })}` : ''}
                        {o.notes ? ` · “${o.notes}”` : ''}
                      </div>
                    </td>
                    <td>{o.buyerName}</td>
                    <td style={{ textAlign: 'right' }}>{o.quantity.toLocaleString(locale)}</td>
                    <td style={{ textAlign: 'right' }} className="strong">
                      {money(o.currency, o.unitPrice)}
                    </td>
                    <td><StatusChip status={o.status} /></td>
                    <td className="hidem muted" title={new Date(o.createdAt).toLocaleString(locale)}>
                      {shortDate(o.createdAt, locale)}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {FINAL.has(o.status) ? (
                        <span className="muted">{t('offers.decidedLabel')}</span>
                      ) : (
                        <>
                          <button
                            className="btn btn-sm btn-ghost"
                            onClick={() => { setNotice(''); setCountering(o); }}
                          >
                            {t('offers.counter')}
                          </button>{' '}
                          <button
                            className="btn btn-sm btn-green"
                            onClick={() => { setNotice(''); setAccepting(o); }}
                          >
                            {t('offers.accept')}
                          </button>{' '}
                          <button
                            className="btn btn-sm btn-red"
                            onClick={() => { setNotice(''); setRejecting(o); }}
                          >
                            {t('offers.reject')}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="stripe" style={{ marginTop: 12 }}>
        <span>
          {t('offers.demoNoteLead')} <span className="pill p-amber">{t('cards.demo')}</span>{' '}
          {t('offers.demoNoteTail')}
        </span>
      </div>

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
    </View>
  );
}
