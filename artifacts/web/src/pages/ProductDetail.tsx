import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useRoute, Link } from 'wouter';
import {
  useProduct, useSupplier, useMe, useCreateOrder, useCreateRfq, useProducts, useCreateThread,
  useCreateOffer, apiFetch,
} from '@workspace/api-client-react';
import type { ApiError } from '@workspace/api-client-react';
import {
  View, Empty, StatusChip, DemoTag, Verified, Stars, requireAuthGate,
  ProductCard, StockTypeBadge,
} from '../components';
import { TabStrip } from '../dash';
import { useI18n, type DictKey } from '../i18n';
import ProductQa from './ProductQa';

/** Price with its currency symbol, keeping the raw currency for anything non-USD. */
function money(amount: number, currency: string): string {
  const prefix = currency === 'USD' ? '$' : `${currency} `;
  return `${prefix}${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

/** A metric we can only show when the API actually supplies it. */
function metric(value: number | null | undefined): string {
  return value === null || value === undefined || value <= 0 ? '—' : String(value);
}

/** Whole days since an ISO timestamp; `null` when the timestamp is unusable. */
function daysSince(iso: string): number | null {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
}

type ProductData = NonNullable<ReturnType<typeof useProduct>['data']>;
type SupplierData = NonNullable<ReturnType<typeof useSupplier>['data']>;

/**
 * Buy-now checkout. The quantity is clamped to the stock the API reports, so a
 * buyer can never order more than `quantityAvailable`.
 */
function CheckoutModal({
  product, qty: initialQty, onClose,
}: { product: ProductData; qty: number; onClose: () => void }) {
  const { t, locale } = useI18n();
  const { data: user } = useMe();
  const createOrder = useCreateOrder();
  const stock = product.quantityAvailable;
  const [qty, setQty] = useState<number>(initialQty);
  const [form, setForm] = useState({
    shippingName: user?.name ?? '',
    shippingAddress: '',
    shippingCity: '',
    shippingCountry: user?.country ?? '',
    shippingPhone: '',
    notes: '',
  });
  const [done, setDone] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const clamp = (n: number) => Math.min(Math.max(n, product.moq), Math.max(stock, product.moq));
  const total = useMemo(() => product.price * qty, [product.price, qty]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    setErr(null);
    try {
      const order = await createOrder.mutateAsync({ productId: product.id, quantity: qty, ...form });
      setDone(order.id);
    } catch (e) {
      setErr((e as ApiError).message || t('checkout.errPlace'));
    }
  };

  const canSubmit =
    !createOrder.isPending &&
    !!form.shippingName && !!form.shippingAddress && !!form.shippingCity && !!form.shippingCountry;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <h2>{done != null ? t('checkout.placedTitle') : t('checkout.title')}</h2>
          <button className="x" onClick={onClose} aria-label={t('action.close')}>✕</button>
        </div>
        <div className="mb">
          {done != null ? (
            <>
              <p className="strong" style={{ marginTop: 0 }}>{t('checkout.confirmed', { id: done })}</p>
              <p className="muted" style={{ marginTop: 6 }}>
                {t('checkout.notified')}
              </p>
              <div className="row" style={{ gap: 8, marginTop: 14 }}>
                <Link href="/orders" className="btn btn-primary">{t('checkout.viewOrders')}</Link>
                <button className="btn btn-grey" onClick={onClose}>{t('checkout.keepBrowsing')}</button>
              </div>
            </>
          ) : (
            <>
              <p className="muted" style={{ margin: '0 0 12px' }}>{product.name}</p>

              <div className="stats grid" style={{ marginBottom: 12 }}>
                <div className="card stat">
                  <div>
                    <div className="v">{money(product.price, product.currency)}</div>
                    <div className="l">{t('checkout.pricePer', { unit: product.unit })}</div>
                  </div>
                </div>
                <div className="card stat">
                  <div>
                    <div className="v">{product.moq.toLocaleString(locale)} {product.unit}</div>
                    <div className="l">{t('checkout.minimumOrder')}</div>
                  </div>
                </div>
                <div className="card stat">
                  <div>
                    <div className="v">{stock.toLocaleString(locale)} {product.unit}</div>
                    <div className="l">{t('checkout.availableNow')}</div>
                  </div>
                </div>
              </div>

              <div className="field">
                <label htmlFor="qty">{t('checkout.quantity', { unit: product.unit })}</label>
                <input
                  id="qty"
                  className="in"
                  type="number"
                  min={product.moq}
                  max={stock}
                  step={1}
                  value={qty}
                  onChange={(e) => setQty(clamp(Number(e.target.value) || product.moq))}
                />
                <div className="hint">
                  {t('checkout.qtyHint', {
                    moq: product.moq.toLocaleString(locale),
                    stock: stock.toLocaleString(locale),
                    unit: product.unit,
                  })}
                </div>
                <div className="row" style={{ gap: 6, marginTop: 7 }}>
                  {[product.moq, product.moq * 5, product.moq * 10]
                    .filter((q, i, a) => a.indexOf(q) === i)
                    .map((q) => (
                      <button key={q} className="btn btn-sm btn-grey" onClick={() => setQty(clamp(q))}>
                        {q.toLocaleString(locale)} {product.unit}
                      </button>
                    ))}
                </div>
              </div>

              <div className="f2">
                <div className="field">
                  <label htmlFor="ship-name">{t('checkout.fullName')} <i>*</i></label>
                  <input id="ship-name" className="in" value={form.shippingName} onChange={set('shippingName')} />
                </div>
                <div className="field">
                  <label htmlFor="ship-country">{t('checkout.country')} <i>*</i></label>
                  <input id="ship-country" className="in" value={form.shippingCountry} onChange={set('shippingCountry')} />
                </div>
                <div className="field">
                  <label htmlFor="ship-address">{t('checkout.address')} <i>*</i></label>
                  <input id="ship-address" className="in" value={form.shippingAddress} onChange={set('shippingAddress')} />
                </div>
                <div className="field">
                  <label htmlFor="ship-city">{t('checkout.city')} <i>*</i></label>
                  <input id="ship-city" className="in" value={form.shippingCity} onChange={set('shippingCity')} />
                </div>
                <div className="field">
                  <label htmlFor="ship-phone">{t('checkout.phone')}</label>
                  <input id="ship-phone" className="in" type="tel" value={form.shippingPhone} onChange={set('shippingPhone')} />
                </div>
              </div>

              <div className="field">
                <label htmlFor="ship-notes">{t('checkout.notes')}</label>
                <textarea id="ship-notes" className="in" rows={2} value={form.notes} onChange={set('notes')} />
              </div>

              {err && <p className="errtext">{err}</p>}
            </>
          )}
        </div>
        {done == null && (
          <div className="mf">
            <span className="muted" style={{ marginRight: 'auto', alignSelf: 'center' }}>
              {t('checkout.total', { total: money(total, product.currency) })}
            </span>
            <button className="btn btn-grey" onClick={onClose}>{t('action.cancel')}</button>
            <button className="btn btn-gold" disabled={!canSubmit} onClick={submit}>
              {createOrder.isPending ? t('checkout.placing') : t('checkout.placeOrder', { total: money(total, product.currency) })}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * RFQ instead of an instant purchase. A request needs a title, quantity and
 * unit, so the buyer states them here rather than us guessing on their behalf.
 */
function RfqModal({
  product, qty: initialQty, onClose,
}: { product: ProductData; qty: number; onClose: () => void }) {
  const { t, locale } = useI18n();
  const createRfq = useCreateRfq();
  const [quantity, setQuantity] = useState(String(initialQty));
  const [unit, setUnit] = useState(product.unit);
  const [notes, setNotes] = useState('');
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    try {
      await createRfq.mutateAsync({
        // The requirement title is user data derived from the listing name; the
        // trailing phrase is interface text and is translated.
        title: `${product.name} — ${t('rfqModal.titleSuffix')}`,
        category: product.category,
        description: notes || undefined,
        quantity: Number(quantity),
        unit,
        targetCountry: undefined,
      });
      setDone(true);
    } catch (e) {
      setErr((e as ApiError).message || t('rfqModal.errPost'));
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <h2>{done ? t('rfqModal.postedTitle') : t('rfqModal.title')}</h2>
          <button className="x" onClick={onClose} aria-label={t('action.close')}>✕</button>
        </div>
        <div className="mb">
          {done ? (
            <>
              <p className="strong" style={{ marginTop: 0 }}>{t('rfqModal.live')}</p>
              <p className="muted" style={{ marginTop: 6 }}>{t('rfqModal.canQuote')}</p>
              <div className="row" style={{ gap: 8, marginTop: 14 }}>
                <Link href="/rfqs" className="btn btn-primary">{t('rfqModal.viewMine')}</Link>
                <button className="btn btn-grey" onClick={onClose}>{t('action.close')}</button>
              </div>
            </>
          ) : (
            <>
              <p className="muted" style={{ margin: '0 0 12px' }}>
                {t('rfqModal.listedBy', { product: product.name, supplier: product.supplierName })}
              </p>
              <div className="f2">
                <div className="field">
                  <label htmlFor="rfq-qty">{t('rfqModal.quantity')} <i>*</i></label>
                  <input
                    id="rfq-qty" className="in" inputMode="numeric"
                    value={quantity} onChange={(e) => setQuantity(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="rfq-unit">{t('rfqModal.unit')} <i>*</i></label>
                  <input
                    id="rfq-unit" className="in"
                    value={unit} onChange={(e) => setUnit(e.target.value)}
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="rfq-notes">{t('rfqModal.specs')}</label>
                <textarea
                  id="rfq-notes" className="in" rows={3}
                  value={notes} onChange={(e) => setNotes(e.target.value)}
                />
                <div className="hint">
                  {t('rfqModal.moqHint', { moq: product.moq.toLocaleString(locale), unit: product.unit })}
                </div>
              </div>
              {err && <p className="errtext">{err}</p>}
            </>
          )}
        </div>
        {!done && (
          <div className="mf">
            <button className="btn btn-grey" onClick={onClose}>{t('action.cancel')}</button>
            <button
              className="btn btn-primary"
              disabled={createRfq.isPending || !quantity || Number(quantity) <= 0 || !unit.trim()}
              onClick={submit}
            >
              {createRfq.isPending ? t('rfqModal.posting') : t('rfqModal.post')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Contact the seller: opens (or reuses) a message thread with this listing as its
 * subject and posts the buyer's first message. The thread de-duplicates on the
 * server, so reaching out twice continues the same conversation — it then shows
 * up in the seller's own `/supplier/messages` inbox.
 */
function ContactModal({
  product, qty: initialQty, onClose,
}: { product: ProductData; qty: number; onClose: () => void }) {
  const { t, locale } = useI18n();
  const createThread = useCreateThread();
  const [qty, setQty] = useState('');
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { setQty(initialQty > 0 ? String(initialQty) : ''); }, [initialQty]);

  const send = async () => {
    setErr(null);
    try {
      const thread = await createThread.mutateAsync({
        supplierId: product.supplierId,
        productId: product.id,
        subject: product.name.slice(0, 200),
      });
      // The quantity is the buyer's own input, so it travels as the first line
      // of their message instead of as a field the API does not have.
      const body = qty.trim() ? `${qty.trim()} ${product.unit}\n${message.trim()}` : message.trim();
      await apiFetch(`/threads/${thread.id}/messages`, { method: 'POST', body: { body } });
      setDone(true);
    } catch (e) {
      // The API's own message — e.g. `own_supplier` when a supplier tries to
      // message their own profile. Nothing is invented to soften it.
      setErr((e as ApiError).message || '—');
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <h2>{t('pd.contactTitle')}</h2>
          <button className="x" onClick={onClose} aria-label={t('pd.close')}>✕</button>
        </div>
        <div className="mb">
          {done ? (
            <>
              <p className="strong" style={{ marginTop: 0 }}>{t('pd.contactSent')}</p>
              <p className="muted" style={{ marginTop: 6 }}>{t('pd.contactSentBody')}</p>
              <div className="row" style={{ gap: 8, marginTop: 14 }}>
                <Link href="/messages" className="btn btn-primary">{t('nav.messages')}</Link>
                <button className="btn btn-grey" onClick={onClose}>{t('pd.close')}</button>
              </div>
            </>
          ) : (
            <>
              <p className="muted" style={{ margin: '0 0 12px' }}>{t('pd.contactIntro')}</p>
              <div className="field">
                <label htmlFor="ct-seller">{t('pd.contactTarget')}</label>
                <input
                  id="ct-seller" className="in" readOnly
                  value={`${product.supplierName} · ${product.name}`}
                />
              </div>
              <div className="field">
                <label htmlFor="ct-qty">{t('pd.contactQty')} ({product.unit})</label>
                <input
                  id="ct-qty" className="in" inputMode="numeric" placeholder={String(product.moq)}
                  value={qty} onChange={(e) => setQty(e.target.value)}
                />
                <div className="hint">
                  {t('rfqModal.moqHint', { moq: product.moq.toLocaleString(locale), unit: product.unit })}
                </div>
              </div>
              <div className="field">
                <label htmlFor="ct-msg">{t('pd.contactMessage')} <i>*</i></label>
                <textarea
                  id="ct-msg" className="in" rows={4}
                  placeholder={t('pd.questionPlaceholder')}
                  value={message} onChange={(e) => setMessage(e.target.value)}
                />
              </div>
              {err ? <p className="errtext">{err}</p> : null}
            </>
          )}
        </div>
        {!done && (
          <div className="mf">
            <button className="btn btn-grey" onClick={onClose}>{t('pd.cancel')}</button>
            <button
              className="btn btn-primary"
              disabled={createThread.isPending || message.trim().length === 0}
              onClick={send}
            >
              {t('pd.contactSend')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Strings this page needs that the dictionary does not carry yet.
 *
 * `i18n.tsx` is a single-writer file, so these render as honest English text
 * rather than as a raw key (a missing key would print `pd.makeOffer` to the
 * buyer). The key each one wants is noted here for the dictionary's owner:
 *
 *   pd.makeOffer     'Make an offer'                        / 'Teklif ver'
 *   pd.offerIntro    'Name the unit price and the quantity you want. The seller
 *                    is notified and can accept, reject or answer with their
 *                    own price.'                            / 'İstediğiniz birim fiyatı ve miktarı belirtin. Satıcı bilgilendirilir; kabul edebilir, reddedebilir veya kendi fiyatıyla yanıtlayabilir.'
 *   pd.offerSubmit   'Send offer'                           / 'Teklifi gönder'
 *   pd.offerSent     'Offer sent'                           / 'Teklif gönderildi'
 *   pd.offerSentBody 'The seller sees it with the price and quantity you named,
 *                    and can accept, reject or answer it.' / 'Satıcı teklifinizi belirttiğiniz fiyat ve miktarla görür; kabul edebilir, reddedebilir veya yanıtlayabilir.'
 *   pd.offerErr      'Could not send your offer.'           / 'Teklifiniz gönderilemedi.'
 *   pd.offerErrPrice 'Your offer price must be a number greater than zero.' / 'Teklif fiyatınız sıfırdan büyük bir sayı olmalı.'
 *   pd.mobileOffer   'Offer'                                / 'Teklif'
 */
const L = {
  makeOffer: 'Make an offer',
  offerIntro:
    'Name the unit price and the quantity you want. The seller is notified and can accept, reject or answer with their own price.',
  offerSubmit: 'Send offer',
  offerSent: 'Offer sent',
  offerSentBody:
    'The seller sees it with the price and quantity you named, and can accept, reject or answer it.',
  offerErr: 'Could not send your offer.',
  offerErrPrice: 'Your offer price must be a number greater than zero.',
  mobileOffer: 'Offer',
};

/**
 * The buyer's offer — the owner's one-tap negotiation, and the only way an
 * offer enters the platform from a listing. `POST /api/offers` records the price
 * and quantity against this lot and returns the row it wrote, so the panel
 * reports that row's id; a failure shows the API's own message verbatim
 * (`own_listing`, a validation message, …). Nothing here fakes a success.
 *
 * The quantity rides the buy box's own clamp, so an offer can name neither less
 * than the listing's MOQ nor more than the stock the API reports.
 */
function OfferModal({
  product, qty: initialQty, onClose,
}: { product: ProductData; qty: number; onClose: () => void }) {
  const { t, locale } = useI18n();
  const createOffer = useCreateOffer();
  const stock = product.quantityAvailable;
  const noStock = stock <= 0;
  /** The buy box's hard ceiling — real stock, never below the listing's MOQ. */
  const ceiling = Math.max(stock, product.moq);
  const [price, setPrice] = useState(String(product.price));
  const [quantity, setQuantity] = useState(String(initialQty));
  const [notes, setNotes] = useState('');
  /** The id the API returned — the only thing that proves the offer landed. */
  const [done, setDone] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const clamp = (n: number) => Math.min(Math.max(n, product.moq), ceiling);
  const priceNum = Number(price);
  const priceOk = Number.isFinite(priceNum) && priceNum > 0;
  const qty = clamp(Number(quantity) || product.moq);

  const submit = async () => {
    setErr(null);
    if (!priceOk) {
      setErr(L.offerErrPrice);
      return;
    }
    try {
      const row = await createOffer.mutateAsync({
        productId: product.id,
        quantity: qty,
        unitPrice: priceNum,
        currency: product.currency,
        notes: notes.trim() || undefined,
      });
      setDone(row.id);
    } catch (e) {
      // The API's own words — never a softened or invented message.
      setErr((e as ApiError).message || L.offerErr);
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <h2>{done != null ? L.offerSent : L.makeOffer}</h2>
          <button className="x" onClick={onClose} aria-label={t('action.close')}>✕</button>
        </div>
        <div className="mb">
          {done != null ? (
            <>
              <p className="strong" style={{ marginTop: 0 }}>
                {t('offers.offerRef', { id: done })}
              </p>
              <p className="muted" style={{ marginTop: 6 }}>{L.offerSentBody}</p>
              <div className="row" style={{ gap: 8, marginTop: 14 }}>
                <Link href="/offers" className="btn btn-primary">{t('myoffers.titleBuyer')}</Link>
                <button className="btn btn-grey" onClick={onClose}>{t('pd.close')}</button>
              </div>
            </>
          ) : (
            <>
              <p className="muted" style={{ margin: '0 0 12px' }}>
                {t('pd.contactTarget')}: {product.supplierName}
              </p>
              <p className="muted" style={{ marginTop: 0 }}>{L.offerIntro}</p>

              <div className="f2">
                <div className="field">
                  <label htmlFor="of-price">{t('offers.counterPrice')} <i>*</i></label>
                  <input
                    id="of-price" className="in" inputMode="decimal"
                    value={price} onChange={(e) => setPrice(e.target.value)}
                  />
                  <div className="hint">
                    {t('offers.perUnit', { currency: product.currency })} {'·'}{' '}
                    {t('pd.unitPrice')}: {money(product.price, product.currency)} / {product.unit}
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="of-qty">{t('offers.quantity')} ({product.unit}) <i>*</i></label>
                  <input
                    id="of-qty" className="in" inputMode="numeric"
                    value={quantity}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      setQuantity(String(Number.isFinite(n) && n > 0 ? clamp(n) : product.moq));
                    }}
                  />
                  <div className="hint">
                    {noStock
                      ? t('product.soldOutBody')
                      : t('checkout.qtyHint', {
                          moq: product.moq.toLocaleString(locale),
                          stock: stock.toLocaleString(locale),
                          unit: product.unit,
                        })}
                  </div>
                </div>
              </div>

              <div className="field">
                <label htmlFor="of-note">{t('pd.contactMessage')}</label>
                <textarea
                  id="of-note" className="in" rows={3}
                  placeholder={t('offers.counterNotesPlaceholder')}
                  value={notes} onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              <div className="linetotal">
                <span>
                  {t('offers.offerValue')} {'·'} {qty.toLocaleString(locale)} {product.unit}
                </span>
                <b className="tnum">{priceOk ? money(priceNum * qty, product.currency) : '—'}</b>
              </div>

              {err ? <p className="errtext">{err}</p> : null}
            </>
          )}
        </div>
        {done == null && (
          <div className="mf">
            <button className="btn btn-grey" onClick={onClose}>{t('action.cancel')}</button>
            <button
              className="btn btn-gold"
              disabled={createOffer.isPending || !priceOk}
              onClick={submit}
            >
              {createOffer.isPending ? t('offers.sending') : L.offerSubmit}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Supplier tab — the company profile. Only what the API returns is presented as
 * fact: a row it cannot fill reads `pd.notProvided`, and a supplier who has
 * published no performance figures gets one honest sentence rather than a wall
 * of dashes. Employees, factory area and certificates are NOT in the API
 * contract, so they are not shown at all.
 */
function SupplierPanel({
  supplier, loading, product,
}: { supplier: SupplierData | undefined; loading: boolean; product: ProductData }) {
  const { t, locale } = useI18n();

  if (loading) {
    return (
      <div className="card"><div className="bd"><span className="muted">{t('product.loadingSupplier')}</span></div></div>
    );
  }
  if (!supplier) {
    return (
      <div className="card"><div className="bd"><span className="muted">{t('product.supplierUnavailable')}</span></div></div>
    );
  }

  const s = supplier;
  const na = <span className="na">{t('pd.notProvided')}</span>;
  const hasPerformance =
    s.rating > 0 || s.inspectionsCount > 0 || s.fulfillmentRate > 0 || s.trustScore > 0;

  const rows: [string, ReactNode][] = [
    [t('checkout.country'), s.country || na],
    [t('checkout.city'), s.city ? s.city : na],
    [t('product.verifiedLevel'), s.verifiedLevel > 0 ? t('product.levelN', { n: s.verifiedLevel }) : na],
    [t('admin.suppliers.colListings'), s.productCount > 0 ? s.productCount.toLocaleString(locale) : na],
    [t('product.tradingSince'), s.since ? s.since : na],
  ];

  return (
    <div className="card">
      <div className="hd">
        <h2>{t('pd.companyProfile')}</h2>
        <Link href={`/suppliers/${s.id}`} className="link">{t('pd.viewStore')}</Link>
      </div>
      <div className="bd">
        <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
          <span className="av" style={{ width: 34, height: 34, fontSize: 13 }}>
            {s.companyName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              <b style={{ fontSize: 13 }}>{s.companyName}</b>
              {s.verifiedLevel >= 2 && <Verified />}
              {s.dataSource === 'demo' && <DemoTag />}
            </div>
            <div className="muted">
              {s.country}
              {s.city ? ` · ${s.city}` : ''}
            </div>
          </div>
        </div>

        <div className="cap mt14">
          {rows.map(([k, v]) => (
            <Fragment key={k}>
              <span className="k">{k}</span>
              <span className="v">{v}</span>
            </Fragment>
          ))}
        </div>

        {s.tags.length > 0 && (
          <>
            <div className="muted mt10">{t('supplierDetail.capabilities')}</div>
            <div className="row" style={{ gap: 5, flexWrap: 'wrap', marginTop: 5 }}>
              {s.tags.map((tag) => <span key={tag} className="pill p-grey">{tag}</span>)}
            </div>
          </>
        )}

        {s.description ? (
          <div className="descblock mt14">
            <p className="raw" style={{ margin: 0 }}>{s.description}</p>
          </div>
        ) : null}

        <div className="sechead mt14"><h2>{t('pd.statsTitle')}</h2></div>
        {hasPerformance ? (
          <div className="cap">
            <span className="k">{t('product.rating')}</span>
            <span className="v">
              {s.rating > 0 ? <><Stars rating={s.rating} /> <span className="muted tnum">{s.rating.toFixed(1)}</span></> : na}
            </span>
            <span className="k">{t('product.inspections')}</span>
            <span className="v tnum">{metric(s.inspectionsCount)}</span>
            <span className="k">{t('product.fulfilment')}</span>
            <span className="v tnum">{s.fulfillmentRate > 0 ? `${s.fulfillmentRate.toFixed(1)}%` : na}</span>
            <span className="k">{t('supplierDetail.trustScore')}</span>
            <span className="v tnum">{metric(s.trustScore)}</span>
          </div>
        ) : (
          <p className="muted" style={{ margin: 0 }}>{t('pd.supplierNoStats')}</p>
        )}
        <p className="hint">{t('product.supplierFiguresHint')}</p>
        <div className="row" style={{ gap: 7, marginTop: 10, flexWrap: 'wrap' }}>
          <Link href={`/suppliers/${s.id}`} className="btn btn-sm btn-grey">{t('pd.viewStore')}</Link>
          <Link href={`/explore?category=${encodeURIComponent(product.category)}`} className="btn btn-sm btn-grey">
            {t('pd.similarProducts')}
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * Mobile action bar geometry, measured from the live DOM rather than assumed.
 *
 * Below 820px the app shell already owns the bottom edge with its own
 * `.bottomnav` (styles.css: `position:fixed;bottom:0;z-index:70`). The product
 * bar is fixed to that same edge, so it is lifted by the nav's real height and
 * the page reserves exactly the height the bar occupies — otherwise the two
 * bars would stack on top of each other and the last rail would end up behind
 * them. Nothing here is a magic number: both values come from `getComputedStyle`
 * / `offsetHeight` at runtime and are re-measured on resize.
 */
function useMobileBar() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ lift: 0, h: 0 });
  useEffect(() => {
    let raf = 0;
    const measure = () => {
      raf = 0;
      const bar = ref.current;
      const nav = document.querySelector<HTMLElement>('.bottomnav');
      const navShown = !!nav && getComputedStyle(nav).display !== 'none';
      const barShown = !!bar && getComputedStyle(bar).display !== 'none';
      const lift = navShown && nav ? nav.offsetHeight : 0;
      const h = barShown && bar ? bar.offsetHeight : 0;
      // Only a genuine change re-renders, so the observer can never loop.
      setBox((prev) => (prev.lift === lift && prev.h === h ? prev : { lift, h }));
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(measure); };
    schedule();
    window.addEventListener('resize', schedule);
    // The shell mounts its own bottom nav (and swaps it per role) *after* this
    // page's first paint, so watch the DOM rather than assuming it is there yet.
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.removeEventListener('resize', schedule);
      mo.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return { ...box, ref };
}

/**
 * Product detail — an Alibaba-style B2B listing page: breadcrumb, gallery and key
 * facts on the left, a sticky buy box with the seller on the right, then the
 * tabbed detail (overview / specifications / questions & answers / supplier),
 * the catalogue rails and a mobile action bar.
 *
 * Every figure on this page comes from the API. A value it does not supply reads
 * an em dash or `pd.notProvided`; nothing here invents a number, a certification,
 * a lead time or a trade term.
 */
export default function ProductDetail({ params }: { params?: { id?: string } }) {
  const { t, locale } = useI18n();
  // wouter also passes `params` as a prop, but reading the route here keeps the
  // page working when it is mounted directly (tests, storybook, deep links).
  const [matched, routeParams] = useRoute<{ id: string }>('/products/:id');
  const id = Number(params?.id ?? (matched ? routeParams.id : NaN));
  const { data: p, isLoading, error } = useProduct(Number.isFinite(id) ? id : undefined);
  const supplier = useSupplier(p?.supplierId);
  const { data: me } = useMe();
  const [checkout, setCheckout] = useState(false);
  const [rfq, setRfq] = useState(false);
  const [contact, setContact] = useState(false);
  const [offer, setOffer] = useState(false);
  const [tab, setTab] = useState('overview');
  /** Bumped by the "Ask a question" CTA so the Q&A composer takes focus. */
  const [qaFocus, setQaFocus] = useState(0);
  const [qty, setQty] = useState(1);
  const bar = useMobileBar();

  /** Same-category stock for the rail at the foot of the page (public, real). */
  const same = useProducts({ category: p?.category, hasImage: 1, limit: 9 }, { enabled: !!p?.category });
  /** Other lots from this supplier — the new public `supplierId` catalogue filter. */
  const more = useProducts(
    { supplierId: p?.supplierId, hasImage: 1, limit: 8 },
    { enabled: !!p?.supplierId },
  );
  /**
   * Ownership is the server's answer, never our inference: `mine=1` returns the
   * caller's own listings and an empty list for an account without a supplier
   * profile, so a listing whose supplierId appears there belongs to this viewer.
   */
  const mine = useProducts(
    { mine: 1, limit: 1 },
    { enabled: !!me && (me.role === 'supplier' || me.role === 'admin') },
  );

  // A new listing starts its stepper at that listing's own MOQ.
  const pid = p?.id;
  const moq = p?.moq ?? 1;
  useEffect(() => { setQty(moq); }, [pid, moq]);

  if (isLoading) {
    const what = t('product.loadingThis');
    return (
      <View title={t('product.loadingTitle')} sub={t('product.fetching', { what })}>
        <div className="card">
          <div className="empty">{t('product.fetching', { what })}</div>
        </div>
      </View>
    );
  }
  if (error || !p) {
    return (
      <Empty title={t('product.notFound')}>
        <Link href="/explore" className="btn btn-sm btn-grey" style={{ marginTop: 10 }}>{t('product.backToExplore')}</Link>
      </Empty>
    );
  }

  const s = supplier.data;
  /**
   * Verification this page can stand behind. `products.verified` is true on rows
   * whose supplier sits below the platform's own level-2 bar (the bar this file
   * enforces in SupplierPanel), so it is not evidence of anything on its own —
   * the product badge therefore rides the supplier's recorded level, the same
   * value the supplier block shows. The inspection row below follows the same
   * rule: it claims inspection only when the API reports a count above zero.
   * A demo tag is never hidden either way, so provenance stays visible.
   */
  const supplierVerified = (s?.verifiedLevel ?? 0) >= 2;
  const inspectionsCount = s?.inspectionsCount ?? 0;
  const outOfStock = p.status === 'sold_out' || p.quantityAvailable <= 0;
  /** The stepper's hard ceiling: real stock, never below the listing's MOQ. */
  const maxQty = Math.max(p.quantityAvailable, p.moq);
  const q = Math.min(Math.max(qty, p.moq), maxQty);
  const lineTotal = p.price * q;
  const lowStock = !outOfStock && p.quantityAvailable <= p.moq * 2;
  const days = daysSince(p.createdAt);
  const listedOn = new Date(p.createdAt);
  const listedOnText = Number.isNaN(listedOn.getTime()) ? '—' : listedOn.toLocaleDateString(locale);

  const canAnswer = me?.role === 'admin' || !!mine.data?.items.some((x) => x.supplierId === p.supplierId);

  const others = (same.data?.items ?? []).filter((x) => x.id !== p.id).slice(0, 8);
  const moreItems = (more.data?.items ?? []).filter((x) => x.id !== p.id).slice(0, 8);
  const moreIds = new Set(moreItems.map((x) => x.id));
  /** Same category, minus whatever the supplier rail already shows above it. */
  const similar = others.filter((x) => !moreIds.has(x.id));

  const step = (d: number) => setQty((v) => Math.min(Math.max(v + d, p.moq), maxQty));

  const askQuestion = () => {
    setTab('faq');
    setQaFocus((n) => n + 1);
  };

  /** Every write action on this page needs an account; the gate owns that flow. */
  const gated = (open: () => void) => () => {
    if (!me) requireAuthGate();
    else open();
  };

  /** Supplier-authored spec lines: only the structural labels are translated. */
  const specLines = p.spec
    .map((line) => {
      const at = line.indexOf(':');
      return at > 0
        ? { k: line.slice(0, at).trim(), v: line.slice(at + 1).trim() || '—' }
        : { k: t('product.col.attribute'), v: line };
    })
    .filter((row, i, all) => all.findIndex((x) => x.k === row.k && x.v === row.v) === i);

  const keySpecs: [string, ReactNode][] = [
    [t('product.spec.category'), <Link key="c" href={`/explore?category=${encodeURIComponent(p.category)}`}>{p.category}</Link>],
    [t('product.spec.unit'), p.unit],
    [t('product.minOrder'), `${p.moq.toLocaleString(locale)} ${p.unit}`],
    [t('product.availableNow'), `${p.quantityAvailable.toLocaleString(locale)} ${p.unit}`],
    [t('product.origin'), p.originCountry],
    [t('pd.listedOn'), listedOnText],
  ];

  return (
    <>
      <nav className="crumb" aria-label="Breadcrumb">
        <Link href="/explore">{t('pd.home')}</Link>
        <span className="sep">›</span>
        <Link href={`/explore?category=${encodeURIComponent(p.category)}`}>{p.category}</Link>
        <span className="sep">›</span>
        <span className="now" title={p.name}>{p.name}</span>
      </nav>

      <View
        title={p.name}
        sub={
          <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <Link href={`/explore?category=${encodeURIComponent(p.category)}`}>{p.category}</Link>
            <span>·</span>
            <Link href={`/explore?country=${encodeURIComponent(p.originCountry)}`}>{p.originCountry}</Link>
            <span>·</span>
            <Link href={`/suppliers/${p.supplierId}`}>{p.supplierName}</Link>
          </span>
        }
        actions={
          <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {supplierVerified && (
              <span title={t('product.levelN', { n: s?.verifiedLevel ?? 0 })}><Verified /></span>
            )}
            {p.purityGrade && <span className="pill p-blue">{p.purityGrade}</span>}
            <StatusChip status={p.status} />
            {p.listingType && p.listingType !== 'stock' && <StockTypeBadge type={p.listingType} />}
            {p.dataSource === 'demo' && <DemoTag />}
          </span>
        }
      >
        {checkout && <CheckoutModal product={p} qty={q} onClose={() => setCheckout(false)} />}
        {rfq && <RfqModal product={p} qty={q} onClose={() => setRfq(false)} />}
        {contact && <ContactModal product={p} qty={q} onClose={() => setContact(false)} />}
        {offer && <OfferModal product={p} qty={q} onClose={() => setOffer(false)} />}

        <div className="pdgrid">
          {/* ---------------- left: gallery + key facts ---------------- */}
          <div className="pdleft">
            <div className={`pdimg${p.imageKey ? ' zoom' : ''}`}>
              {p.imageKey ? (
                <>
                  <img src={p.imageKey} alt={p.name} />
                  {(supplierVerified || (p.listingType && p.listingType !== 'stock')) && (
                    <span className="tag">
                      {supplierVerified && <Verified />}
                      {p.listingType && p.listingType !== 'stock' && <StockTypeBadge type={p.listingType} />}
                    </span>
                  )}
                  <span className="hintz">{t('pd.zoomHint')}</span>
                </>
              ) : (
                // No image key on the listing: say so instead of showing a photo
                // of some other lot. The API supplies one image or none.
                <div className="ph-empty">
                  <span className="ph-glyph">📦</span>
                  <span className="ph-cat">{p.category}</span>
                  <span className="ph-note">{t('pd.noPhotoYet')}</span>
                </div>
              )}
            </div>
            {p.imageKey ? (
              <p className="pdmeta">{t('pd.gallery')} · {t('pd.photoCount', { n: 1 })}</p>
            ) : null}

            <div className="sechead mt14"><h2>{t('pd.keyFacts')}</h2></div>
            <div className="factstrip" style={{ marginTop: 0 }}>
              <div className="fact">
                <div className="k">{t('pd.unitPrice')}</div>
                <div className="v tnum">{money(p.price, p.currency)}</div>
              </div>
              <div className="fact">
                <div className="k">{t('product.spec.unit')}</div>
                <div className="v">{p.unit}</div>
              </div>
              <div className="fact">
                <div className="k">{t('product.minOrder')}</div>
                <div className="v tnum">{p.moq.toLocaleString(locale)} {p.unit}</div>
              </div>
              <div className="fact">
                <div className="k">{t('product.availableNow')}</div>
                <div className="v tnum">{p.quantityAvailable.toLocaleString(locale)} {p.unit}</div>
              </div>
              <div className="fact">
                <div className="k">{t('product.factStockType')}</div>
                <div className="v">
                  {p.listingType
                    ? t(`type.${p.listingType}` as DictKey)
                    : <span className="na">{t('pd.notProvided')}</span>}
                </div>
              </div>
              <div className="fact">
                <div className="k">{t('product.origin')}</div>
                <div className="v">{p.originCountry}</div>
              </div>
              <div className="fact">
                <div className="k">{t('product.spec.category')}</div>
                <div className="v">
                  <Link href={`/explore?category=${encodeURIComponent(p.category)}`}>{p.category}</Link>
                </div>
              </div>
              <div className="fact">
                <div className="k">{t('pd.listedOn')}</div>
                <div className="v">{listedOnText}</div>
                {days !== null ? <div className="hint">{t('pd.daysOnSite', { n: days })}</div> : null}
              </div>
              <div className="fact">
                <div className="k">{t('product.spec.purity')}</div>
                <div className="v">
                  {p.purityGrade ?? <span className="na">{t('pd.notProvided')}</span>}
                </div>
              </div>
            </div>
          </div>

          {/* ---------------- right: sticky buy box ---------------- */}
          <div className="pdside">
            <div className="card">
              <div className="hd">
                <h2>{outOfStock ? t('product.unavailable') : t('pd.buyBox')}</h2>
              </div>
              <div className="pbox">
                <div className="muted" style={{ fontSize: 11.5 }}>{t('pd.unitPrice')}</div>
                <div className="row" style={{ gap: 6, alignItems: 'baseline' }}>
                  <span className="price">{money(p.price, p.currency)}</span>
                  <span className="per">/ {p.unit}</span>
                </div>

                <div className="stockline">
                  <span className={outOfStock ? 'muted' : 'strong'}>
                    {outOfStock ? t('pd.outOfStockNow') : lowStock ? t('pd.lowStock') : t('pd.inStock')}
                  </span>
                  <span className="strong tnum">
                    {p.quantityAvailable.toLocaleString(locale)} {p.unit}
                  </span>
                </div>

                {!outOfStock ? (
                  <>
                    <div className="row between" style={{ marginTop: 10 }}>
                      <span className="muted" style={{ fontSize: 12 }}>{t('pd.qty')}</span>
                      <span className="muted" style={{ fontSize: 11.5 }}>
                        {t('product.minOrder')} {p.moq.toLocaleString(locale)} {p.unit}
                      </span>
                    </div>
                    <div className="qtyrow">
                      <button type="button" aria-label="−" disabled={q <= p.moq} onClick={() => step(-1)}>−</button>
                      <input
                        type="number" inputMode="numeric" min={p.moq} max={maxQty} step={1}
                        value={q} aria-label={t('pd.qty')}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          setQty(Number.isFinite(n) ? Math.min(Math.max(n, p.moq), maxQty) : p.moq);
                        }}
                      />
                      <button type="button" aria-label="+" disabled={q >= maxQty} onClick={() => step(1)}>+</button>
                    </div>
                    <div className="linetotal">
                      <span>
                        {t('pd.lineTotal')} · {q.toLocaleString(locale)} {p.unit}
                      </span>
                      <b className="tnum">{money(lineTotal, p.currency)}</b>
                    </div>
                  </>
                ) : (
                  <p className="muted mt10" style={{ marginBottom: 0 }}>
                    {p.status === 'sold_out' ? t('product.soldOutBody') : t('product.noUnitsBody')}
                  </p>
                )}

                <div className="ctastack mt14">
                  <button
                    className="btn btn-gold btn-lg"
                    disabled={outOfStock}
                    onClick={gated(() => setCheckout(true))}
                  >
                    {outOfStock
                      ? t('product.outOfStock')
                      : t('product.buyNowPrice', { price: money(p.price, p.currency), unit: p.unit })}
                  </button>
                  <button className="btn btn-primary" onClick={gated(() => setOffer(true))}>
                    {L.makeOffer}
                  </button>
                  <button className="btn btn-ghost" onClick={gated(() => setRfq(true))}>
                    {t('pd.requestQuotation')}
                  </button>
                  <button className="btn btn-ghost" onClick={gated(() => setContact(true))}>
                    {t('pd.contactSeller')}
                  </button>
                  <button className="btn btn-grey" onClick={askQuestion}>
                    {t('pd.askQuestion')}
                  </button>
                </div>
                <p className="hint" style={{ textAlign: 'center' }}>{t('pd.shipsFromNote')}</p>
              </div>

              {/* ---------------- seller strip + trust rows ---------------- */}
              <div className="bd" style={{ paddingTop: 0 }}>
                <div className="sellerline">
                  <span className="av">
                    {p.supplierName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                      <Link href={`/suppliers/${p.supplierId}`} className="nm">{p.supplierName}</Link>
                      {supplierVerified && (
                        <span title={t('product.levelN', { n: s?.verifiedLevel ?? 0 })}><Verified /></span>
                      )}
                      {s?.dataSource === 'demo' && <DemoTag />}
                    </div>
                    <div className="mt">
                      {s ? (
                        <>
                          {s.country}
                          {s.city ? ` · ${s.city}` : ''}
                          {s.verifiedLevel > 0 ? ` · ${t('product.levelN', { n: s.verifiedLevel })}` : ''}
                        </>
                      ) : p.originCountry}
                    </div>
                  </div>
                </div>

                {/* Trust rows: only what this platform actually does. There is no
                    escrow — the payment row says so in plain terms (funds settle
                    between the two parties; the order only records the outcome)
                    and `pd.trustEscrow` is deliberately never rendered. The
                    inspection row carries that rule too: it is rendered only when
                    the API reports a recorded inspection count above zero, and it
                    shows the count that backs it. */}
                {supplierVerified ? (
                  <div className="trustrow">
                    <span className="ic">✓</span>
                    <div>
                      <b>{t('pd.trustVerified')}</b>
                      {t('suppliers.sub')}
                    </div>
                  </div>
                ) : null}
                {inspectionsCount > 0 ? (
                  <div className="trustrow">
                    <span className="ic">🔍</span>
                    <div>
                      <b>{t('pd.trustInspected')}</b>
                      {t('supplierDetail.service1')} {'·'} {inspectionsCount.toLocaleString(locale)}{' '}
                      {t('product.inspections')}
                    </div>
                  </div>
                ) : null}
                <div className="trustrow">
                  <span className="ic">💳</span>
                  <div>
                    <b>{t('pd.paymentTerms')}</b>
                    {t('help.buying4')}
                  </div>
                </div>
                <div className="trustrow">
                  <span className="ic">🚢</span>
                  <div>
                    <b>{t('pd.trustLogistics')}</b>
                    {t('ship.advanceRecorded')}
                  </div>
                </div>

                <div className="row" style={{ gap: 7, marginTop: 10, flexWrap: 'wrap' }}>
                  <Link href={`/suppliers/${p.supplierId}`} className="btn btn-sm btn-grey">{t('pd.viewStore')}</Link>
                  <Link href={`/suppliers/${p.supplierId}`} className="btn btn-sm btn-grey">{t('pd.allFromSupplier')}</Link>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ---------------- tabs ---------------- */}
        <div className="mt14">
          <TabStrip
            tabs={[
              { key: 'overview', label: t('pd.tabsOverview') },
              { key: 'specs', label: t('pd.tabsSpecs') },
              { key: 'faq', label: t('pd.tabsFaq') },
              { key: 'supplier', label: t('pd.tabsSupplier') },
            ]}
            active={tab}
            onChange={setTab}
          />

          {tab === 'overview' && (
            <div className="grid2">
              <div className="card">
                <div className="hd"><h2>{t('pd.descriptionH')}</h2></div>
                <div className="bd">
                  <div className="descblock">
                    {p.description ? (
                      // Supplier-authored copy, kept verbatim — never translated.
                      <p className="raw" style={{ margin: 0 }}>{p.description}</p>
                    ) : (
                      <span className="na">{t('product.noDescription')}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="hd"><h2>{t('pd.specsH')}</h2></div>
                <div className="bd" style={{ paddingBottom: 0 }}>
                  {specLines.length === 0 ? (
                    <p className="na" style={{ marginTop: 0 }}>{t('pd.specEmpty')}</p>
                  ) : (
                    <table className="spectbl">
                      <tbody>
                        {specLines.map((r) => (
                          <tr key={`${r.k}-${r.v}`}>
                            <td className="k">{r.k}</td>
                            <td className="v">{r.v}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
                <table className="spectbl">
                  <tbody>
                    {keySpecs.map(([k, v]) => (
                      <tr key={k}>
                        <td className="k">{k}</td>
                        <td className="v">{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'specs' && (
            <div className="card">
              <div className="hd">
                <h2>{t('pd.specsH')}</h2>
                {p.spec.length === 0 ? (
                  <span className="muted" style={{ fontSize: 11.5 }}>{t('pd.specEmpty')}</span>
                ) : null}
              </div>
              <div className="bd" style={{ paddingBottom: 0 }}>
                <table className="spectbl">
                  <tbody>
                    <tr>
                      <td className="k">{t('orders.col.product')}</td>
                      <td className="v">{p.name}</td>
                    </tr>
                    <tr>
                      <td className="k">{t('product.supplier')}</td>
                      <td className="v"><Link href={`/suppliers/${p.supplierId}`}>{p.supplierName}</Link></td>
                    </tr>
                    <tr>
                      <td className="k">{t('product.spec.category')}</td>
                      <td className="v"><Link href={`/explore?category=${encodeURIComponent(p.category)}`}>{p.category}</Link></td>
                    </tr>
                    <tr>
                      <td className="k">{t('pd.unitPrice')}</td>
                      <td className="v tnum">{money(p.price, p.currency)}</td>
                    </tr>
                    <tr>
                      <td className="k">{t('product.spec.unit')}</td>
                      <td className="v">{p.unit}</td>
                    </tr>
                    <tr>
                      <td className="k">{t('product.minOrder')}</td>
                      <td className="v tnum">{p.moq.toLocaleString(locale)} {p.unit}</td>
                    </tr>
                    <tr>
                      <td className="k">{t('product.availableNow')}</td>
                      <td className="v tnum">{p.quantityAvailable.toLocaleString(locale)} {p.unit}</td>
                    </tr>
                    <tr>
                      <td className="k">{t('product.factStockType')}</td>
                      <td className="v">
                        {p.listingType
                          ? t(`type.${p.listingType}` as DictKey)
                          : <span className="na">{t('pd.notProvided')}</span>}
                      </td>
                    </tr>
                    <tr>
                      <td className="k">{t('product.origin')}</td>
                      <td className="v">{p.originCountry}</td>
                    </tr>
                    <tr>
                      <td className="k">{t('product.spec.purity')}</td>
                      <td className="v">{p.purityGrade ?? <span className="na">{t('pd.notProvided')}</span>}</td>
                    </tr>
                    <tr>
                      <td className="k">{t('pd.trustVerified')}</td>
                      <td className="v">
                        {s && s.verifiedLevel > 0
                          ? t('product.levelN', { n: s.verifiedLevel })
                          : <span className="na">{t('pd.notProvided')}</span>}
                      </td>
                    </tr>
                    <tr>
                      <td className="k">{t('supplierDetail.trustScore')}</td>
                      <td className="v tnum">{metric(p.trustScore)}</td>
                    </tr>
                    <tr>
                      <td className="k">{t('admin.listings.colListing')}</td>
                      <td className="v tnum">{p.id}</td>
                    </tr>
                    <tr>
                      <td className="k">{t('pd.listedOn')}</td>
                      <td className="v">
                        {listedOnText}
                        {days !== null ? ` · ${t('pd.daysOnSite', { n: days })}` : ''}
                      </td>
                    </tr>
                    {specLines.map((r) => (
                      <tr key={`spec-${r.k}-${r.v}`}>
                        <td className="k">{r.k}</td>
                        <td className="v">{r.v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'faq' && <ProductQa productId={p.id} canAnswer={canAnswer} focusKey={qaFocus} />}

          {tab === 'supplier' && (
            <SupplierPanel supplier={s} loading={supplier.isLoading} product={p} />
          )}
        </div>

        {/* ---------------- rails ---------------- */}
        {moreItems.length > 0 && (
          <div className="card mt14">
            <div className="hd">
              <h2>{t('pd.moreFromSupplier')}</h2>
              <Link href={`/suppliers/${p.supplierId}`} className="link">{t('pd.allFromSupplier')}</Link>
            </div>
            <div className="bd">
              <div className="railgrid">
                {moreItems.map((x) => <ProductCard key={x.id} p={x} />)}
              </div>
            </div>
          </div>
        )}

        <div className="card mt14">
          <div className="hd">
            <h2>{t('pd.similarProducts')}</h2>
            <Link href={`/explore?category=${encodeURIComponent(p.category)}`} className="link">
              {t('categories.all')}
            </Link>
          </div>
          <div className="bd">
            {similar.length === 0 ? (
              <span className="muted">{t('product.noneElse')}</span>
            ) : (
              <div className="railgrid">
                {similar.map((x) => <ProductCard key={x.id} p={x} />)}
              </div>
            )}
          </div>
        </div>
      </View>

      {/* Reserve the height the fixed action bar occupies so the last rail is
          never hidden behind it (0 on desktop, where the bar is display:none). */}
      {bar.h > 0 ? <div aria-hidden="true" style={{ height: bar.h }} /> : null}

      {/* ---------------- mobile action bar (shown ≤900px by enterprise.css) ---------------- */}
      <div className="mobar" ref={bar.ref} style={{ bottom: bar.lift }}>
        <div style={{ minWidth: 0 }}>
          <span className="p">{money(p.price, p.currency)}</span>
          <span className="u">/ {p.unit}</span>
        </div>
        <button className="btn btn-gold" disabled={outOfStock} onClick={gated(() => setCheckout(true))}>
          {t('pd.mobileBuy')}
        </button>
        <button className="btn btn-primary" onClick={gated(() => setOffer(true))}>
          {L.mobileOffer}
        </button>
        <button className="btn btn-ghost" onClick={gated(() => setRfq(true))}>
          {t('pd.mobileQuote')}
        </button>
      </div>
    </>
  );
}
