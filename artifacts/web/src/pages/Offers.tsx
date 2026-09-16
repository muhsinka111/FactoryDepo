import { useState } from 'react';
import { Link } from 'wouter';
import {
  useMyOffers, useCounterOffer, useAcceptOffer, useRejectOffer, useMe, getToken,
} from '@workspace/api-client-react';
import type { Offer } from '@workspace/api-zod';
import { View, Empty, StatusChip, Spinner, DemoTag, requireAuthGate, dashboardRole } from '../components';
import { useI18n } from '../i18n';

/**
 * My offers — the lot-by-lot price negotiations the signed-in user is party to.
 *
 * GET /api/offers is role-aware: a buyer sees the offers they opened, a supplier
 * the offers against their own stock, an admin everything. Either party may
 * counter, accept or reject while the offer is still open.
 *
 * Every figure on this page is returned by the API. `zOffer` carries no `unit`
 * for the lot, so the quantity is shown as a bare number rather than inventing
 * one; a missing counterparty name or an unparseable date renders '—'.
 */

/** A party can still answer a pending or countered offer; the rest are decided. */
function isOpen(status: Offer['status']): boolean {
  return status === 'pending' || status === 'countered';
}

/** Currency + thousands formatting. Values come straight from the API. */
function money(currency: string, amount: number): string {
  return `${currency === 'USD' ? '$' : `${currency} `}${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function errMessage(e: unknown, fallback: string): string {
  const m = e instanceof Error ? e.message : '';
  return m && !/^Request failed \(\d+\)$/.test(m) ? m : fallback;
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
  const { t, locale } = useI18n();
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

  if (me.isLoading) {
    return (
      <View title={title}>
        <Spinner />
      </View>
    );
  }

  if (!user) {
    return (
      <View title={t('myoffers.titleBuyer')} sub={t('myoffers.signInSub')}>
        <Empty title={t('myoffers.notSignedIn')}>
          {t('myoffers.notSignedInBody')}
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Link href="/sign-in?next=%2Foffers" className="btn btn-sm btn-primary">{t('action.signIn')}</Link>
            <Link href="/sign-up?next=%2Foffers" className="btn btn-sm btn-ghost">{t('action.createAccount')}</Link>
          </div>
        </Empty>
      </View>
    );
  }

  const items = offers.data?.items ?? [];
  const count = offers.data?.total ?? items.length;
  const openCount = items.filter((o) => isOpen(o.status)).length;

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
    <View
      title={title}
      sub={sub}
      actions={
        <button className="btn btn-sm btn-grey" onClick={() => void offers.refetch()} disabled={offers.isFetching}>
          {offers.isFetching ? t('action.refreshing') : t('action.refresh')}
        </button>
      }
    >
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

      {notice && (
        <div className="stripe">
          <span>{notice}</span>
          <Link href="/orders" className="btn btn-sm btn-grey" style={{ marginLeft: 'auto' }}>{t('myoffers.viewOrders')}</Link>
          <button className="x" onClick={() => setNotice('')} aria-label={t('action.dismiss')}>✕</button>
        </div>
      )}

      {actionErr && <p className="errtext" style={{ marginTop: -4, marginBottom: 10 }}>{actionErr}</p>}

      {offers.isLoading ? (
        <Spinner />
      ) : offers.isError ? (
        <Empty title={t('myoffers.loadErrorTitle')}>
          {t('myoffers.loadErrorBody')}
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <button className="btn btn-sm btn-primary" onClick={() => void offers.refetch()} disabled={offers.isFetching}>
              {offers.isFetching ? t('myoffers.trying') : t('action.tryAgain')}
            </button>
          </div>
        </Empty>
      ) : items.length === 0 ? (
        <Empty title={t('myoffers.emptyTitle')}>
          {isSupplier ? t('myoffers.emptySupplier') : dashAdmin ? t('myoffers.emptyAdmin') : t('myoffers.emptyBuyer')}
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Link href="/explore" className="btn btn-sm btn-primary">{t('myoffers.browseStock')}</Link>
            {isSupplier && <Link href="/supplier/listings" className="btn btn-sm btn-ghost">{t('post.myListings')}</Link>}
          </div>
        </Empty>
      ) : (
        <div className="card">
          <div className="hd">
            <b>{t('myoffers.count', { n: count.toLocaleString(locale) })}</b>
            <span className="muted">{t('myoffers.stillOpen', { n: openCount.toLocaleString(locale) })}</span>
            <span className="muted" style={{ marginLeft: 'auto' }}>{t('common.newestFirst')}</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>{t('myoffers.col.offer')}</th>
                  <th>{t('myoffers.col.counterparty')}</th>
                  <th style={{ textAlign: 'right' }}>{t('myoffers.col.quantity')}</th>
                  <th style={{ textAlign: 'right' }}>{t('myoffers.col.unitPrice')}</th>
                  <th>{t('myoffers.col.status')}</th>
                  <th className="hidem">{t('myoffers.col.date')}</th>
                  <th>{t('myoffers.col.action')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((o) => {
                  const iAmBuyer = o.buyerId === user.id;
                  const otherName = iAmBuyer ? o.supplierName : o.buyerName;
                  return (
                    <tr key={o.id}>
                      <td>
                        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                          <Link href={`/products/${o.productId}`} className="strong">{o.productName}</Link>
                          {o.dataSource === 'demo' && <DemoTag />}
                        </div>
                        <div className="muted">
                          #{o.id}
                          {o.parentOfferId != null
                            ? ` · ${t('myoffers.counterTo', { id: o.parentOfferId })}`
                            : ''}
                        </div>
                        {o.notes && <div className="muted" style={{ maxWidth: 320 }}>“{o.notes}”</div>}
                      </td>
                      <td>
                        {otherName.trim() || '—'}
                        <div className="muted">
                          {iAmBuyer ? t('myoffers.seatSupplier') : t('myoffers.seatBuyer')}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>{o.quantity.toLocaleString(locale)}</td>
                      <td style={{ textAlign: 'right' }} className="strong">{money(o.currency, o.unitPrice)}</td>
                      <td><StatusChip status={o.status} /></td>
                      <td className="muted hidem" title={new Date(o.createdAt).toLocaleString(locale)}>
                        {new Date(o.createdAt).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td>
                        {!isOpen(o.status) ? (
                          <span className="muted">{t('myoffers.noAction')}</span>
                        ) : rejectingId === o.id ? (
                          <div className="row" style={{ gap: 5, flexWrap: 'wrap' }}>
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
                          <div className="row" style={{ gap: 5, flexWrap: 'wrap' }}>
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
          </div>
        </div>
      )}
    </View>
  );
}
