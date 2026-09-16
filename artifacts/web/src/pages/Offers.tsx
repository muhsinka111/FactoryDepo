import { useState } from 'react';
import { Link } from 'wouter';
import {
  useMyOffers, useCounterOffer, useAcceptOffer, useRejectOffer, useMe, getToken,
} from '@workspace/api-client-react';
import type { Offer } from '@workspace/api-zod';
import { View, Empty, StatusChip, Spinner, DemoTag, requireAuthGate, dashboardRole } from '../components';

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

function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function errMessage(e: unknown, fallback: string): string {
  const m = e instanceof Error ? e.message : '';
  return m && !/^Request failed \(\d+\)$/.test(m) ? m : fallback;
}

/** Who the user is negotiating with on this row, and in which seat. */
function counterparty(o: Offer, meId: number): { name: string; seat: string } {
  const iAmBuyer = o.buyerId === meId;
  const name = iAmBuyer ? o.supplierName : o.buyerName;
  return { name: name.trim() || '—', seat: iAmBuyer ? 'supplier' : 'buyer' };
}

/** Counter-offer form. Sent against the offer being answered (path id). */
function CounterModal({ offer, onClose }: { offer: Offer; onClose: () => void }) {
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
    if (!valid) { setErr('Enter a unit price and quantity greater than zero.'); return; }
    try {
      await counter.mutateAsync({
        id: offer.id,
        unitPrice: price,
        quantity: qty,
        notes: notes.trim() || undefined,
      });
      setDone(true);
    } catch (e) {
      setErr(errMessage(e, 'The counter-offer could not be sent — try again.'));
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <h2>{done ? 'Counter-offer sent' : `Counter offer #${offer.id}`}</h2>
          <button className="x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="mb">
          {done ? (
            <>
              <p className="strong" style={{ marginTop: 0 }}>Your counter-offer is with the other party</p>
              <p className="muted" style={{ marginTop: 6 }}>
                It arrives as a new open offer on {offer.productName}; the original offer is marked countered.
              </p>
              <div className="row" style={{ gap: 8, marginTop: 14 }}>
                <button className="btn btn-primary" onClick={onClose}>Back to my offers</button>
              </div>
            </>
          ) : (
            <>
              <p className="muted" style={{ margin: '0 0 12px' }}>
                {offer.productName} · offer #{offer.id} · {offer.quantity.toLocaleString()} offered at{' '}
                {money(offer.currency, offer.unitPrice)} per unit
              </p>
              <div className="f2">
                <div className="field">
                  <label htmlFor="counter-price">Unit price <i>*</i></label>
                  <input
                    id="counter-price"
                    className={`in ${!unitPrice || !(price > 0) ? 'err' : ''}`}
                    inputMode="decimal"
                    value={unitPrice}
                    onChange={(e) => setUnitPrice(e.target.value)}
                  />
                  <div className="hint">In {offer.currency}, per unit.</div>
                </div>
                <div className="field">
                  <label htmlFor="counter-qty">Quantity <i>*</i></label>
                  <input
                    id="counter-qty"
                    className={`in ${!quantity || !(qty > 0) ? 'err' : ''}`}
                    inputMode="decimal"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                  />
                  <div className="hint">Originally {offer.quantity.toLocaleString()}.</div>
                </div>
              </div>
              <div className="field">
                <label htmlFor="counter-notes">Message to the other party</label>
                <textarea
                  id="counter-notes"
                  className="in"
                  rows={3}
                  placeholder="Lead time, packing, payment terms…"
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
            <button className="btn btn-grey" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={counter.isPending || !valid} onClick={() => void submit()}>
              {counter.isPending ? 'Sending…' : 'Send counter-offer'}
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
  const accept = useAcceptOffer();
  const [err, setErr] = useState('');

  const submit = async () => {
    setErr('');
    if (!getToken()) { requireAuthGate(); return; }
    try {
      await accept.mutateAsync({ id: offer.id });
      onAccepted(offer.id);
    } catch (e) {
      setErr(errMessage(e, 'The offer could not be accepted — try again.'));
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <h2>Accept offer #{offer.id}</h2>
          <button className="x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="mb">
          <p className="muted" style={{ margin: '0 0 12px' }}>
            {offer.productName} · {offer.quantity.toLocaleString()} at {money(offer.currency, offer.unitPrice)} per unit
          </p>
          <div className="stripe" style={{ margin: 0 }}>
            <span>
              Accepting agrees to this price and quantity and <b>creates an order</b> for it. The order then
              appears under <Link href="/orders">Orders</Link>, where shipment milestones are tracked.
            </span>
          </div>
          <p className="hint" style={{ marginTop: 9 }}>This cannot be undone — the negotiation closes at the accepted terms.</p>
          {err && <p className="errtext">{err}</p>}
        </div>
        <div className="mf">
          <button className="btn btn-grey" onClick={onClose}>Cancel</button>
          <button className="btn btn-green" disabled={accept.isPending} onClick={() => void submit()}>
            {accept.isPending ? 'Accepting…' : 'Accept and create order'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Offers() {
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
  const title = isSupplier ? 'Offers on my stock' : dashAdmin ? 'All offers' : 'My offers';
  const sub = isSupplier
    ? 'Offers buyers have made on your stock. Counter, accept or reject each one.'
    : dashAdmin
      ? 'Every offer on the platform, newest first.'
      : 'Offers you have made on ready stock. Counter, accept or reject each one.';

  if (me.isLoading) {
    return (
      <View title={title}>
        <Spinner />
      </View>
    );
  }

  if (!user) {
    return (
      <View title="My offers" sub="Sign in to see the offers you are negotiating">
        <Empty title="You are not signed in">
          Offers are private to the two parties: sign in to open, counter or accept one.
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Link href="/sign-in?next=%2Foffers" className="btn btn-sm btn-primary">Sign in</Link>
            <Link href="/sign-up?next=%2Foffers" className="btn btn-sm btn-ghost">Create an account</Link>
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
      setActionErr(errMessage(e, `Offer #${id} could not be rejected — try again.`));
    }
  };

  return (
    <View
      title={title}
      sub={sub}
      actions={
        <button className="btn btn-sm btn-grey" onClick={() => void offers.refetch()} disabled={offers.isFetching}>
          {offers.isFetching ? 'Refreshing…' : 'Refresh'}
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
            setNotice(`Offer #${id} accepted. Check Orders for the resulting order.`);
          }}
        />
      )}

      {notice && (
        <div className="stripe">
          <span>{notice}</span>
          <Link href="/orders" className="btn btn-sm btn-grey" style={{ marginLeft: 'auto' }}>View orders</Link>
          <button className="x" onClick={() => setNotice('')} aria-label="Dismiss">✕</button>
        </div>
      )}

      {actionErr && <p className="errtext" style={{ marginTop: -4, marginBottom: 10 }}>{actionErr}</p>}

      {offers.isLoading ? (
        <Spinner />
      ) : offers.isError ? (
        <Empty title="Offers could not be loaded">
          The API did not return your offers — try again.
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <button className="btn btn-sm btn-primary" onClick={() => void offers.refetch()} disabled={offers.isFetching}>
              {offers.isFetching ? 'Trying…' : 'Try again'}
            </button>
          </div>
        </Empty>
      ) : items.length === 0 ? (
        <Empty title="No offers yet">
          {isSupplier
            ? 'Offers buyers make on your listings appear here, ready to counter or accept.'
            : dashAdmin
              ? 'No offer has been opened on the platform yet.'
              : 'Open a lot you want and make an offer — the supplier can counter, accept or reject it.'}
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Link href="/explore" className="btn btn-sm btn-primary">Browse ready stock</Link>
            {isSupplier && <Link href="/supplier/listings" className="btn btn-sm btn-ghost">My listings</Link>}
          </div>
        </Empty>
      ) : (
        <div className="card">
          <div className="hd">
            <b>{count.toLocaleString()} offer{count === 1 ? '' : 's'}</b>
            <span className="muted">{openCount} still open</span>
            <span className="muted" style={{ marginLeft: 'auto' }}>Newest first</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Offer</th>
                  <th>Counterparty</th>
                  <th style={{ textAlign: 'right' }}>Quantity</th>
                  <th style={{ textAlign: 'right' }}>Unit price</th>
                  <th>Status</th>
                  <th className="hidem">Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((o) => {
                  const other = counterparty(o, user.id);
                  return (
                    <tr key={o.id}>
                      <td>
                        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                          <Link href={`/products/${o.productId}`} className="strong">{o.productName}</Link>
                          {o.dataSource === 'demo' && <DemoTag />}
                        </div>
                        <div className="muted">
                          #{o.id}
                          {o.parentOfferId != null ? ` · counter to #${o.parentOfferId}` : ''}
                        </div>
                        {o.notes && <div className="muted" style={{ maxWidth: 320 }}>“{o.notes}”</div>}
                      </td>
                      <td>
                        {other.name}
                        <div className="muted">{other.seat}</div>
                      </td>
                      <td style={{ textAlign: 'right' }}>{o.quantity.toLocaleString()}</td>
                      <td style={{ textAlign: 'right' }} className="strong">{money(o.currency, o.unitPrice)}</td>
                      <td><StatusChip status={o.status} /></td>
                      <td className="muted hidem" title={new Date(o.createdAt).toLocaleString()}>
                        {shortDate(o.createdAt)}
                      </td>
                      <td>
                        {!isOpen(o.status) ? (
                          <span className="muted">No further action</span>
                        ) : rejectingId === o.id ? (
                          <div className="row" style={{ gap: 5, flexWrap: 'wrap' }}>
                            <button
                              className="btn btn-sm btn-red"
                              disabled={reject.isPending}
                              onClick={() => void doReject(o.id)}
                            >
                              {reject.isPending ? 'Rejecting…' : 'Confirm reject'}
                            </button>
                            <button className="btn btn-sm btn-grey" onClick={() => setRejectingId(null)}>Cancel</button>
                          </div>
                        ) : (
                          <div className="row" style={{ gap: 5, flexWrap: 'wrap' }}>
                            <button className="btn btn-sm btn-ghost" onClick={() => setCounterFor(o)}>Counter</button>
                            <button className="btn btn-sm btn-green" onClick={() => setAcceptFor(o)}>Accept</button>
                            <button className="btn btn-sm btn-red" onClick={() => setRejectingId(o.id)}>Reject</button>
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
