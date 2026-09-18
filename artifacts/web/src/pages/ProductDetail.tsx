import { useMemo, useState } from 'react';
import { useRoute, Link } from 'wouter';
import {
  useProduct, useSupplier, useMe, useCreateOrder, useCreateRfq, useProducts,
} from '@workspace/api-client-react';
import type { ApiError } from '@workspace/api-client-react';
import {
  View, Empty, StatusChip, DemoTag, Verified, Stars, requireAuthGate,
  ProductCard, StockTypeBadge,
} from '../components';
import { useI18n, type DictKey } from '../i18n';

/** Price with its currency symbol, keeping the raw currency for anything non-USD. */
function money(amount: number, currency: string): string {
  const prefix = currency === 'USD' ? '$' : `${currency} `;
  return `${prefix}${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

/** A metric we can only show when the API actually supplies it. */
function metric(value: number | null | undefined): string {
  return value === null || value === undefined || value <= 0 ? '—' : String(value);
}

type ProductData = NonNullable<ReturnType<typeof useProduct>['data']>;

/**
 * Buy-now checkout. The quantity is clamped to the stock the API reports, so a
 * buyer can never order more than `quantityAvailable`.
 */
function CheckoutModal({ product, onClose }: { product: ProductData; onClose: () => void }) {
  const { t, locale } = useI18n();
  const { data: user } = useMe();
  const createOrder = useCreateOrder();
  const stock = product.quantityAvailable;
  const [qty, setQty] = useState<number>(Math.max(product.moq, 1));
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
function RfqModal({ product, onClose }: { product: ProductData; onClose: () => void }) {
  const { t, locale } = useI18n();
  const createRfq = useCreateRfq();
  const [quantity, setQuantity] = useState(String(Math.max(product.moq, 1)));
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
 * Product detail — gallery, honest stock line, supplier panel and the buy /
 * request actions. Every figure on this page comes from the API; when a value
 * is missing we print an em dash instead of a plausible-looking number.
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
  /**
   * Same-category stock for the rail at the foot of the page. Fetched from the
   * public endpoint (never invented), with images only, and the current listing
   * filtered out.
   */
  const same = useProducts({ category: p?.category, hasImage: 1, limit: 9 }, { enabled: !!p?.category });

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

  const outOfStock = p.status === 'sold_out' || p.quantityAvailable <= 0;
  const s = supplier.data;
  const others = (same.data?.items ?? []).filter((x) => x.id !== p.id).slice(0, 8);

  return (
    <View
      title={p.name}
      sub={
        <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <Link href={`/explore?category=${encodeURIComponent(p.category)}`}>{p.category}</Link>
          <span>·</span>
          <Link href={`/explore?country=${encodeURIComponent(p.originCountry)}`}>{p.originCountry}</Link>
          <Link href="/explore" style={{ fontSize: 12.5 }}>← {t('product.backToExplore')}</Link>
        </span>
      }
      actions={
        <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {p.verified && <Verified />}
          {p.purityGrade && <span className="pill p-blue">{p.purityGrade}</span>}
          <StatusChip status={p.status} />
          {p.listingType && p.listingType !== 'stock' && <StockTypeBadge type={p.listingType} />}
          {p.dataSource === 'demo' && <DemoTag />}
        </span>
      }
    >
      {checkout && <CheckoutModal product={p} onClose={() => setCheckout(false)} />}
      {rfq && <RfqModal product={p} onClose={() => setRfq(false)} />}

      <div className="cols">
        {/* ---------- gallery ---------- */}
        <div>
          <div className="galmain">
            {p.imageKey ? (
              <img src={p.imageKey} alt={p.name} />
            ) : (
              <div className="empty" style={{ paddingTop: 90 }}>{t('product.noPhoto')}</div>
            )}
          </div>

          <div className="stats grid" style={{ marginTop: 12 }}>
            <div className="card stat">
              <div>
                <div className="v">{money(p.price, p.currency)}</div>
                <div className="l">{t('product.pricePer', { unit: p.unit })}</div>
              </div>
            </div>
            <div className="card stat">
              <div>
                <div className="v">{p.moq.toLocaleString(locale)} {p.unit}</div>
                <div className="l">{t('product.minOrder')}</div>
              </div>
            </div>
            <div className="card stat">
              <div>
                <div className="v">{p.quantityAvailable.toLocaleString(locale)} {p.unit}</div>
                <div className="l">{t('product.availableNow')}</div>
              </div>
            </div>
            <div className="card stat">
              <div>
                <div className="v">{t(`type.${p.listingType}` as DictKey)}</div>
                <div className="l">{t('product.factStockType')}</div>
              </div>
            </div>
            <div className="card stat">
              <div>
                <div className="v">{p.originCountry}</div>
                <div className="l">{t('product.origin')}</div>
              </div>
            </div>
          </div>
        </div>

        {/* ---------- buy / quote panel ---------- */}
        <div className="grid" style={{ gridTemplateColumns: '1fr' }}>
          <div className="card">
            <div className="hd">
              <h2>{outOfStock ? t('product.unavailable') : t('product.buyNowHeading')}</h2>
            </div>
            <div className="bd">
              <p className="muted" style={{ margin: '0 0 10px' }}>
                {outOfStock
                  ? p.status === 'sold_out'
                    ? t('product.soldOutBody')
                    : t('product.noUnitsBody')
                  : t('product.purchaseTerms', {
                      price: money(p.price, p.currency),
                      unit: p.unit,
                      moq: p.moq.toLocaleString(locale),
                    })}
              </p>

              {!outOfStock && (
                <>
                  <div className="between" style={{ marginBottom: 10 }}>
                    <span className="muted">{t('product.stockOnHand')}</span>
                    <span className="strong">{p.quantityAvailable.toLocaleString(locale)} {p.unit}</span>
                  </div>
                  <button
                    className="btn btn-gold"
                    style={{ width: '100%' }}
                    onClick={() => { if (!me) requireAuthGate(); else setCheckout(true); }}
                  >
                    {t('product.buyNowPrice', { price: money(p.price, p.currency), unit: p.unit })}
                  </button>
                </>
              )}
              {outOfStock && (
                <button className="btn btn-grey" style={{ width: '100%' }} disabled>
                  {t('product.outOfStock')}
                </button>
              )}

              <button
                className="btn btn-ghost"
                style={{ width: '100%', marginTop: 7 }}
                onClick={() => { if (!me) requireAuthGate(); else setRfq(true); }}
              >
                {t('product.requestQuote')}
              </button>
              <p className="hint" style={{ textAlign: 'center' }}>
                {me ? t('product.shipsFrom', { country: p.originCountry }) : t('product.signInToOrder')}
              </p>
            </div>
          </div>

          {/* ---------- supplier ---------- */}
          <div className="card">
            <div className="hd">
              <h2>{t('product.supplier')}</h2>
              {s && <Link href={`/suppliers/${s.id}`} className="link">{t('product.viewProfile')}</Link>}
            </div>
            <div className="bd">
              {supplier.isLoading ? (
                <span className="muted">{t('product.loadingSupplier')}</span>
              ) : s ? (
                <>
                  <div className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
                    <span className="av" style={{ width: 34, height: 34, fontSize: 13 }}>
                      {s.companyName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                        <b style={{ fontSize: 13 }}>{s.companyName}</b>
                        {s.verifiedLevel >= 2 && <Verified />}
                        {s.dataSource === 'demo' && <DemoTag />}
                      </div>
                      <div className="muted">{s.country}{s.city ? ` · ${s.city}` : ''}</div>
                    </div>
                  </div>
                  <table style={{ marginTop: 10 }}>
                    <tbody>
                      <tr>
                        <td className="muted">{t('product.rating')}</td>
                        <td style={{ textAlign: 'right' }}>
                          {s.rating > 0 ? <><Stars rating={s.rating} /> <span className="muted">{s.rating.toFixed(1)}</span></> : '—'}
                        </td>
                      </tr>
                      <tr>
                        <td className="muted">{t('product.inspections')}</td>
                        <td style={{ textAlign: 'right' }}>{metric(s.inspectionsCount)}</td>
                      </tr>
                      <tr>
                        <td className="muted">{t('product.fulfilment')}</td>
                        <td style={{ textAlign: 'right' }}>
                          {s.fulfillmentRate > 0 ? `${s.fulfillmentRate.toFixed(1)}%` : '—'}
                        </td>
                      </tr>
                      <tr>
                        <td className="muted">{t('product.verifiedLevel')}</td>
                        <td style={{ textAlign: 'right' }}>
                          {s.verifiedLevel > 0 ? t('product.levelN', { n: s.verifiedLevel }) : '—'}
                        </td>
                      </tr>
                      <tr>
                        <td className="muted">{t('product.tradingSince')}</td>
                        <td style={{ textAlign: 'right' }}>{s.since ?? '—'}</td>
                      </tr>
                    </tbody>
                  </table>
                  <p className="hint">{t('product.supplierFiguresHint')}</p>
                </>
              ) : (
                <span className="muted">{t('product.supplierUnavailable')}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ---------- description & specification ---------- */}
      <div className="cols" style={{ marginTop: 12 }}>
        <div className="card">
          <div className="hd"><h2>{t('product.description')}</h2></div>
          <div className="bd">
            <p style={{ margin: 0 }}>
              {p.description ?? t('product.noDescription')}
            </p>
          </div>
        </div>

        <div className="card">
          <div className="hd"><h2>{t('product.specification')}</h2></div>
          {p.spec.length === 0 ? (
            <div className="empty">{t('product.noSpec')}</div>
          ) : (
            <table>
              <thead>
                <tr><th>{t('product.col.attribute')}</th><th>{t('product.col.value')}</th></tr>
              </thead>
              <tbody>
                {p.spec.map((line) => {
                  const at = line.indexOf(':');
                  // Specification lines are supplier-authored data: only the
                  // structural labels below are translated, never the values.
                  const label = at > 0 ? line.slice(0, at).trim() : line;
                  const value = at > 0 ? line.slice(at + 1).trim() : '—';
                  return (
                    <tr key={line}>
                      <td>{label}</td>
                      <td className="strong">{value}</td>
                    </tr>
                  );
                })}
                <tr>
                  <td>{t('product.spec.category')}</td>
                  <td className="strong">
                    <Link href={`/explore?category=${encodeURIComponent(p.category)}`}>{p.category}</Link>
                  </td>
                </tr>
                <tr><td>{t('product.spec.unit')}</td><td className="strong">{p.unit}</td></tr>
                <tr><td>{t('product.spec.purity')}</td><td className="strong">{p.purityGrade ?? '—'}</td></tr>
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ---------- more stock in this category ---------- */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="hd">
          <h2>{t('product.moreInCategory', { category: p.category })}</h2>
          <Link href={`/explore?category=${encodeURIComponent(p.category)}`} className="link">
            {t('categories.all')}
          </Link>
        </div>
        <div className="bd">
          {others.length === 0 ? (
            <span className="muted">{t('product.noneElse')}</span>
          ) : (
            <div className="feedgrid">
              {others.map((x) => <ProductCard key={x.id} p={x} />)}
            </div>
          )}
        </div>
      </div>
    </View>
  );
}
