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

function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
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
  const counter = useCounterOffer();
  const [unitPrice, setUnitPrice] = useState(String(offer.unitPrice));
  const [quantity, setQuantity] = useState(String(offer.quantity));
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState('');

  const submit = async () => {
    setErr('');
    const price = Number(unitPrice);
    if (!Number.isFinite(price) || price <= 0) {
      setErr('Your counter price must be a number greater than zero.');
      return;
    }
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      setErr('Quantity must be a number greater than zero.');
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
      onDone('Counter sent. The original offer is marked countered and the buyer is notified.');
    } catch (e) {
      setErr(errorText(e, 'Could not send this counter-offer.'));
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <h2>Counter offer #{offer.id}</h2>
          <button className="x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="mb">
          <p className="muted" style={{ marginTop: 0, fontSize: 12.5 }}>
            {offer.buyerName} offered <b>{money(offer.currency, offer.unitPrice)}</b> / {offer.quantity.toLocaleString()}{' '}
            on <b>{offer.productName}</b>. Your answer becomes a new linked offer; the buyer&apos;s terms
            stay on the record.
          </p>
          {err && <div className="errtext" style={{ marginBottom: 10 }} role="alert">{err}</div>}
          <div className="f2">
            <div className="field">
              <label htmlFor="counter-price">Your unit price <i>*</i></label>
              <input
                id="counter-price"
                className="in"
                inputMode="decimal"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
              />
              <div className="hint">{offer.currency} per unit</div>
            </div>
            <div className="field">
              <label htmlFor="counter-qty">Quantity</label>
              <input
                id="counter-qty"
                className="in"
                inputMode="decimal"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
              <div className="hint">Leave as-is to keep the buyer&apos;s quantity.</div>
            </div>
          </div>
          <div className="field">
            <label htmlFor="counter-notes">Note to the buyer</label>
            <textarea
              id="counter-notes"
              className="in"
              rows={3}
              placeholder="Lead time, packing, Incoterms, validity of this price…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <div className="mf">
          <button className="btn btn-grey" onClick={onClose} disabled={counter.isPending}>Cancel</button>
          <button className="btn btn-gold" onClick={submit} disabled={counter.isPending || !unitPrice}>
            {counter.isPending ? 'Sending…' : 'Send counter'}
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
  const accept = useAcceptOffer();
  const [err, setErr] = useState('');
  const total = offer.unitPrice * offer.quantity;

  const confirm = async () => {
    setErr('');
    try {
      await accept.mutateAsync({ id: offer.id });
      onDone(`Offer #${offer.id} accepted. An order was created for ${offer.buyerName}.`);
    } catch (e) {
      setErr(errorText(e, 'Could not accept this offer.'));
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <h2>Accept offer #{offer.id}?</h2>
          <button className="x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="mb">
          <table>
            <tbody>
              <tr>
                <td className="muted">Listing</td>
                <td style={{ textAlign: 'right' }}>{offer.productName}</td>
              </tr>
              <tr>
                <td className="muted">Buyer</td>
                <td style={{ textAlign: 'right' }}>{offer.buyerName}</td>
              </tr>
              <tr>
                <td className="muted">Quantity</td>
                <td style={{ textAlign: 'right' }}>{offer.quantity.toLocaleString()}</td>
              </tr>
              <tr>
                <td className="muted">Unit price</td>
                <td style={{ textAlign: 'right' }}>{money(offer.currency, offer.unitPrice)}</td>
              </tr>
              <tr>
                <td className="muted">Offer value</td>
                <td style={{ textAlign: 'right' }} className="strong">{money(offer.currency, total)}</td>
              </tr>
            </tbody>
          </table>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
            <b>Accepting creates an order.</b> The buyer is committed to it and pays by{' '}
            <b>bank transfer</b> — the platform does not take a card payment. You issue the proforma
            and confirm the transfer when it lands; the order then moves to shipment.
            This decision is final: an accepted offer cannot be re-decided.
          </p>
          {err && <div className="errtext" role="alert">{err}</div>}
        </div>
        <div className="mf">
          <button className="btn btn-grey" onClick={onClose} disabled={accept.isPending}>Cancel</button>
          <button className="btn btn-green" onClick={confirm} disabled={accept.isPending}>
            {accept.isPending ? 'Accepting…' : 'Accept and create order'}
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
  const reject = useRejectOffer();
  const [err, setErr] = useState('');

  const confirm = async () => {
    setErr('');
    try {
      await reject.mutateAsync({ id: offer.id });
      onDone(`Offer #${offer.id} rejected.`);
    } catch (e) {
      setErr(errorText(e, 'Could not reject this offer.'));
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <h2>Reject offer #{offer.id}?</h2>
          <button className="x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="mb">
          <p className="muted" style={{ marginTop: 0, fontSize: 12.5 }}>
            {offer.buyerName}&apos;s offer of {money(offer.currency, offer.unitPrice)} on{' '}
            <b>{offer.productName}</b> is closed. Rejecting is final — the buyer cannot revive this
            offer, though they may open a new one.
          </p>
          {err && <div className="errtext" role="alert">{err}</div>}
        </div>
        <div className="mf">
          <button className="btn btn-grey" onClick={onClose} disabled={reject.isPending}>Cancel</button>
          <button className="btn btn-red" onClick={confirm} disabled={reject.isPending}>
            {reject.isPending ? 'Rejecting…' : 'Reject offer'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SupplierOffers() {
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
      <View title="Offers on your stock">
        <Spinner />
      </View>
    );
  }

  if (!loggedIn || !user) {
    return (
      <View title="Offers on your stock" sub="Buyers negotiating on your lots">
        <Empty title="You are not signed in">
          Offers are private to the buyer and the supplier on them. Sign in to answer them.
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Link
              href="/sign-in?next=%2Fsupplier%2Foffers"
              className="btn btn-sm btn-primary"
              onClick={() => requireAuthGate()}
            >
              Sign in
            </Link>
            <Link href="/sign-up?next=%2Fsupplier%2Foffers" className="btn btn-sm btn-ghost">
              Create a supplier account
            </Link>
          </div>
        </Empty>
      </View>
    );
  }

  if (!isSupplier) {
    return (
      <View title="Offers on your stock" sub="Buyers negotiating on your lots">
        <Empty title="Supplier accounts only">
          Your account is a {user.role} account, so no stock is listed under it and no offers can
          arrive. Offers you have made as a buyer live on the buyer side of the marketplace.
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Link href="/explore" className="btn btn-sm btn-ghost">Browse ready stock</Link>
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
      title="Offers on your stock"
      sub={
        res.isLoading
          ? 'Loading offers…'
          : `${all.length.toLocaleString()} offer${all.length === 1 ? '' : 's'} on your listings`
      }
      actions={
        <div className="row">
          <button
            className="btn btn-sm btn-grey"
            onClick={() => res.refetch()}
            disabled={res.isFetching}
          >
            {res.isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
          <Link href="/supplier/listings" className="btn btn-sm btn-ghost">My listings</Link>
        </div>
      }
    >
      {notice && (
        <div className="stripe">
          <span>{notice}</span>
          <button className="x" onClick={() => setNotice('')} aria-label="Dismiss">✕</button>
        </div>
      )}

      <div className="stripe">
        <span>
          <b>{res.isLoading ? '—' : open.length}</b> awaiting your answer
        </span>
        <span>
          <b>{res.isLoading ? '—' : decided.length}</b> decided
        </span>
        <span>
          Accepting an offer <b>creates an order</b>; the buyer pays by <b>bank transfer</b>.
        </span>
      </div>

      <div className="filters">
        <button
          className={`chip ${only === 'open' ? 'on' : ''}`}
          onClick={() => setOnly('open')}
        >
          Awaiting answer ({open.length})
        </button>
        <button
          className={`chip ${only === 'decided' ? 'on' : ''}`}
          onClick={() => setOnly('decided')}
        >
          Decided ({decided.length})
        </button>
        <span className="muted">Counters open a new linked offer; your original terms stay on record.</span>
      </div>

      {res.isLoading ? (
        <Spinner />
      ) : res.isError ? (
        <Empty title="Offers could not be loaded">
          Could not load the offers on your stock — try again.
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <button className="btn btn-sm btn-grey" onClick={() => res.refetch()}>Try again</button>
          </div>
        </Empty>
      ) : all.length === 0 ? (
        <Empty title="No offers yet">
          When a buyer negotiates on one of your lots it appears here, with the price they proposed
          and the quantity they want. You can accept it, reject it, or answer with your own price.
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Link href="/supplier/listings" className="btn btn-sm btn-ghost">See my listings</Link>
            <Link href="/supplier/post" className="btn btn-sm btn-gold">+ Post more stock</Link>
          </div>
        </Empty>
      ) : visible.length === 0 ? (
        <Empty title={only === 'open' ? 'Nothing awaiting your answer' : 'No decided offers yet'}>
          {only === 'open'
            ? 'Every offer on your stock has been answered. Switch to Decided to review them.'
            : 'Offers you accept or reject are kept here as a record.'}
        </Empty>
      ) : (
        <div className="card">
          <div className="hd">
            <b>{visible.length.toLocaleString()} offer{visible.length === 1 ? '' : 's'}</b>
            <span className="muted" style={{ marginLeft: 'auto' }}>Newest first</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Listing</th>
                  <th>Buyer</th>
                  <th style={{ textAlign: 'right' }}>Quantity</th>
                  <th style={{ textAlign: 'right' }}>Their price</th>
                  <th>Status</th>
                  <th className="hidem">Received</th>
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
                        offer #{o.id}
                        {o.parentOfferId !== null ? ` · answers offer #${o.parentOfferId}` : ''}
                        {o.notes ? ` · “${o.notes}”` : ''}
                      </div>
                    </td>
                    <td>{o.buyerName}</td>
                    <td style={{ textAlign: 'right' }}>{o.quantity.toLocaleString('en-US')}</td>
                    <td style={{ textAlign: 'right' }} className="strong">
                      {money(o.currency, o.unitPrice)}
                    </td>
                    <td><StatusChip status={o.status} /></td>
                    <td className="hidem muted" title={new Date(o.createdAt).toLocaleString()}>
                      {shortDate(o.createdAt)}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {FINAL.has(o.status) ? (
                        <span className="muted">Decided</span>
                      ) : (
                        <>
                          <button
                            className="btn btn-sm btn-ghost"
                            onClick={() => { setNotice(''); setCountering(o); }}
                          >
                            Counter
                          </button>{' '}
                          <button
                            className="btn btn-sm btn-green"
                            onClick={() => { setNotice(''); setAccepting(o); }}
                          >
                            Accept
                          </button>{' '}
                          <button
                            className="btn btn-sm btn-red"
                            onClick={() => { setNotice(''); setRejecting(o); }}
                          >
                            Reject
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
          A row tagged <span className="pill p-amber">Demo</span> sits on a seeded lot, not stock you
          posted. Accepting it still creates a real order — check the lot before you commit.
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
