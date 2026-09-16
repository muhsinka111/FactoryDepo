import { useMemo, useState } from 'react';
import { useRoute, Link } from 'wouter';
import {
  useProduct, useSupplier, useMe, useCreateOrder, useCreateRfq,
} from '@workspace/api-client-react';
import type { ApiError } from '@workspace/api-client-react';
import { View, Empty, StatusChip, DemoTag, Verified, Stars, requireAuthGate } from '../components';

/** Price with its currency symbol, keeping the raw currency for anything non-USD. */
function money(amount: number, currency: string): string {
  const prefix = currency === 'USD' ? '$' : `${currency} `;
  return `${prefix}${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

/** A metric we can only show when the API actually supplies it. */
function metric(value: number | null | undefined): string {
  return value === null || value === undefined || value <= 0 ? '—' : String(value);
}

/**
 * Honest loading state. `<Spinner />` is still used by the shared chrome, but it
 * carries no styling in the current sheet, so these pages say what they wait for.
 */
function Loading({ what }: { what: string }) {
  return (
    <View title="Loading…" sub={`Fetching ${what}`}>
      <div className="card">
        <div className="empty">Fetching {what}…</div>
      </div>
    </View>
  );
}

type ProductData = NonNullable<ReturnType<typeof useProduct>['data']>;

/**
 * Buy-now checkout. The quantity is clamped to the stock the API reports, so a
 * buyer can never order more than `quantityAvailable`.
 */
function CheckoutModal({ product, onClose }: { product: ProductData; onClose: () => void }) {
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
      setErr((e as ApiError).message || 'The order could not be placed.');
    }
  };

  const canSubmit =
    !createOrder.isPending &&
    !!form.shippingName && !!form.shippingAddress && !!form.shippingCity && !!form.shippingCountry;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <h2>{done != null ? 'Order placed' : 'Buy now — checkout'}</h2>
          <button className="x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="mb">
          {done != null ? (
            <>
              <p className="strong" style={{ marginTop: 0 }}>Order #{done} confirmed</p>
              <p className="muted" style={{ marginTop: 6 }}>
                The supplier has been notified. Track the order from your orders page.
              </p>
              <div className="row" style={{ gap: 8, marginTop: 14 }}>
                <Link href="/orders" className="btn btn-primary">View orders</Link>
                <button className="btn btn-grey" onClick={onClose}>Keep browsing</button>
              </div>
            </>
          ) : (
            <>
              <p className="muted" style={{ margin: '0 0 12px' }}>{product.name}</p>

              <div className="stats grid" style={{ marginBottom: 12 }}>
                <div className="card stat">
                  <div>
                    <div className="v">{money(product.price, product.currency)}</div>
                    <div className="l">Price / {product.unit}</div>
                  </div>
                </div>
                <div className="card stat">
                  <div>
                    <div className="v">{product.moq.toLocaleString()} {product.unit}</div>
                    <div className="l">Minimum order</div>
                  </div>
                </div>
                <div className="card stat">
                  <div>
                    <div className="v">{stock.toLocaleString()} {product.unit}</div>
                    <div className="l">Available now</div>
                  </div>
                </div>
              </div>

              <div className="field">
                <label htmlFor="qty">Quantity ({product.unit})</label>
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
                <div className="hint">Between {product.moq.toLocaleString()} and {stock.toLocaleString()} {product.unit} in stock.</div>
                <div className="row" style={{ gap: 6, marginTop: 7 }}>
                  {[product.moq, product.moq * 5, product.moq * 10]
                    .filter((q, i, a) => a.indexOf(q) === i)
                    .map((q) => (
                      <button key={q} className="btn btn-sm btn-grey" onClick={() => setQty(clamp(q))}>
                        {q.toLocaleString()} {product.unit}
                      </button>
                    ))}
                </div>
              </div>

              <div className="f2">
                <div className="field">
                  <label htmlFor="ship-name">Full name <i>*</i></label>
                  <input id="ship-name" className="in" value={form.shippingName} onChange={set('shippingName')} />
                </div>
                <div className="field">
                  <label htmlFor="ship-country">Country <i>*</i></label>
                  <input id="ship-country" className="in" value={form.shippingCountry} onChange={set('shippingCountry')} />
                </div>
                <div className="field">
                  <label htmlFor="ship-address">Street address <i>*</i></label>
                  <input id="ship-address" className="in" value={form.shippingAddress} onChange={set('shippingAddress')} />
                </div>
                <div className="field">
                  <label htmlFor="ship-city">City <i>*</i></label>
                  <input id="ship-city" className="in" value={form.shippingCity} onChange={set('shippingCity')} />
                </div>
                <div className="field">
                  <label htmlFor="ship-phone">Phone</label>
                  <input id="ship-phone" className="in" type="tel" value={form.shippingPhone} onChange={set('shippingPhone')} />
                </div>
              </div>

              <div className="field">
                <label htmlFor="ship-notes">Notes for the supplier</label>
                <textarea id="ship-notes" className="in" rows={2} value={form.notes} onChange={set('notes')} />
              </div>

              {err && <p className="errtext">{err}</p>}
            </>
          )}
        </div>
        {done == null && (
          <div className="mf">
            <span className="muted" style={{ marginRight: 'auto', alignSelf: 'center' }}>
              Total {money(total, product.currency)}
            </span>
            <button className="btn btn-grey" onClick={onClose}>Cancel</button>
            <button className="btn btn-gold" disabled={!canSubmit} onClick={submit}>
              {createOrder.isPending ? 'Placing order…' : `Place order · ${money(total, product.currency)}`}
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
        title: `${product.name} — quotation request`,
        category: product.category,
        description: notes || undefined,
        quantity: Number(quantity),
        unit,
        targetCountry: undefined,
      });
      setDone(true);
    } catch (e) {
      setErr((e as ApiError).message || 'The request could not be posted.');
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <h2>{done ? 'Request posted' : 'Request a quotation'}</h2>
          <button className="x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="mb">
          {done ? (
            <>
              <p className="strong" style={{ marginTop: 0 }}>Your requirement is live in the RFQ exchange</p>
              <p className="muted" style={{ marginTop: 6 }}>Verified suppliers can now quote price and lead time.</p>
              <div className="row" style={{ gap: 8, marginTop: 14 }}>
                <Link href="/rfqs" className="btn btn-primary">View my RFQs</Link>
                <button className="btn btn-grey" onClick={onClose}>Close</button>
              </div>
            </>
          ) : (
            <>
              <p className="muted" style={{ margin: '0 0 12px' }}>{product.name} · listed by {product.supplierName}</p>
              <div className="f2">
                <div className="field">
                  <label htmlFor="rfq-qty">Quantity <i>*</i></label>
                  <input
                    id="rfq-qty" className="in" inputMode="numeric"
                    value={quantity} onChange={(e) => setQuantity(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="rfq-unit">Unit <i>*</i></label>
                  <input
                    id="rfq-unit" className="in"
                    value={unit} onChange={(e) => setUnit(e.target.value)}
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="rfq-notes">Specs, certifications, delivery terms</label>
                <textarea
                  id="rfq-notes" className="in" rows={3}
                  value={notes} onChange={(e) => setNotes(e.target.value)}
                />
                <div className="hint">The listing MOQ is {product.moq.toLocaleString()} {product.unit}.</div>
              </div>
              {err && <p className="errtext">{err}</p>}
            </>
          )}
        </div>
        {!done && (
          <div className="mf">
            <button className="btn btn-grey" onClick={onClose}>Cancel</button>
            <button
              className="btn btn-primary"
              disabled={createRfq.isPending || !quantity || Number(quantity) <= 0 || !unit.trim()}
              onClick={submit}
            >
              {createRfq.isPending ? 'Posting…' : 'Post request'}
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
  // wouter also passes `params` as a prop, but reading the route here keeps the
  // page working when it is mounted directly (tests, storybook, deep links).
  const [matched, routeParams] = useRoute<{ id: string }>('/products/:id');
  const id = Number(params?.id ?? (matched ? routeParams.id : NaN));
  const { data: p, isLoading, error } = useProduct(Number.isFinite(id) ? id : undefined);
  const supplier = useSupplier(p?.supplierId);
  const { data: me } = useMe();
  const [checkout, setCheckout] = useState(false);
  const [rfq, setRfq] = useState(false);

  if (isLoading) return <Loading what="this listing" />;
  if (error || !p) {
    return (
      <Empty title="Product not found">
        <Link href="/explore" className="btn btn-sm btn-grey" style={{ marginTop: 10 }}>Back to explore</Link>
      </Empty>
    );
  }

  const outOfStock = p.status === 'sold_out' || p.quantityAvailable <= 0;
  const s = supplier.data;

  return (
    <View
      title={p.name}
      sub={
        <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <span>{p.category}</span>
          <span>·</span>
          <span>{p.originCountry}</span>
          <Link href="/explore" style={{ fontSize: 12.5 }}>← Back to explore</Link>
        </span>
      }
      actions={
        <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {p.verified && <Verified />}
          {p.purityGrade && <span className="pill p-blue">{p.purityGrade}</span>}
          <StatusChip status={p.status} />
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
              <div className="empty" style={{ paddingTop: 90 }}>No photo supplied for this lot</div>
            )}
          </div>
          {p.imageKey && (
            <div className="galstrip">
              <span className="galthumb on"><img src={p.imageKey} alt="" /></span>
            </div>
          )}

          <div className="stats grid" style={{ marginTop: 12 }}>
            <div className="card stat">
              <div>
                <div className="v">{money(p.price, p.currency)}</div>
                <div className="l">Price / {p.unit}</div>
              </div>
            </div>
            <div className="card stat">
              <div>
                <div className="v">{p.moq.toLocaleString()} {p.unit}</div>
                <div className="l">Minimum order</div>
              </div>
            </div>
            <div className="card stat">
              <div>
                <div className="v">{p.quantityAvailable.toLocaleString()} {p.unit}</div>
                <div className="l">Available now</div>
              </div>
            </div>
            <div className="card stat">
              <div>
                <div className="v">{p.originCountry}</div>
                <div className="l">Country of origin</div>
              </div>
            </div>
          </div>
        </div>

        {/* ---------- buy / quote panel ---------- */}
        <div className="grid" style={{ gridTemplateColumns: '1fr' }}>
          <div className="card">
            <div className="hd">
              <h2>{outOfStock ? 'Currently unavailable' : 'Buy now — ready stock'}</h2>
            </div>
            <div className="bd">
              <p className="muted" style={{ margin: '0 0 10px' }}>
                {outOfStock
                  ? p.status === 'sold_out'
                    ? 'This lot is marked sold out. Ask the supplier for the next available batch.'
                    : 'No units are available at the moment. Ask the supplier for the next available batch.'
                  : `Purchase at the listed price of ${money(p.price, p.currency)} per ${p.unit}, minimum ${p.moq.toLocaleString()} ${p.unit}.`}
              </p>

              {!outOfStock && (
                <>
                  <div className="between" style={{ marginBottom: 10 }}>
                    <span className="muted">Stock on hand</span>
                    <span className="strong">{p.quantityAvailable.toLocaleString()} {p.unit}</span>
                  </div>
                  <button
                    className="btn btn-gold"
                    style={{ width: '100%' }}
                    onClick={() => { if (!me) requireAuthGate(); else setCheckout(true); }}
                  >
                    Buy now · {money(p.price, p.currency)}/{p.unit}
                  </button>
                </>
              )}
              {outOfStock && (
                <button className="btn btn-grey" style={{ width: '100%' }} disabled>
                  Buy now — out of stock
                </button>
              )}

              <button
                className="btn btn-ghost"
                style={{ width: '100%', marginTop: 7 }}
                onClick={() => { if (!me) requireAuthGate(); else setRfq(true); }}
              >
                Request a quotation
              </button>
              <p className="hint" style={{ textAlign: 'center' }}>
                {me ? 'Ships from ' + p.originCountry : 'Sign in to order or request a quotation.'}
              </p>
            </div>
          </div>

          {/* ---------- supplier ---------- */}
          <div className="card">
            <div className="hd">
              <h2>Supplier</h2>
              {s && <Link href={`/suppliers/${s.id}`} className="link">View profile</Link>}
            </div>
            <div className="bd">
              {supplier.isLoading ? (
                <span className="muted">Loading supplier…</span>
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
                        <td className="muted">Rating</td>
                        <td style={{ textAlign: 'right' }}>
                          {s.rating > 0 ? <><Stars rating={s.rating} /> <span className="muted">{s.rating.toFixed(1)}</span></> : '—'}
                        </td>
                      </tr>
                      <tr>
                        <td className="muted">Inspections</td>
                        <td style={{ textAlign: 'right' }}>{metric(s.inspectionsCount)}</td>
                      </tr>
                      <tr>
                        <td className="muted">On-time fulfilment</td>
                        <td style={{ textAlign: 'right' }}>
                          {s.fulfillmentRate > 0 ? `${s.fulfillmentRate.toFixed(1)}%` : '—'}
                        </td>
                      </tr>
                      <tr>
                        <td className="muted">Verified level</td>
                        <td style={{ textAlign: 'right' }}>{s.verifiedLevel > 0 ? `Level ${s.verifiedLevel}` : '—'}</td>
                      </tr>
                      <tr>
                        <td className="muted">Trading since</td>
                        <td style={{ textAlign: 'right' }}>{s.since ?? '—'}</td>
                      </tr>
                    </tbody>
                  </table>
                  <p className="hint">Figures are marketplace-wide for this supplier, not just for this lot.</p>
                </>
              ) : (
                <span className="muted">Supplier details are not available.</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ---------- description & specification ---------- */}
      <div className="cols" style={{ marginTop: 12 }}>
        <div className="card">
          <div className="hd"><h2>Description</h2></div>
          <div className="bd">
            <p style={{ margin: 0 }}>
              {p.description ?? 'The supplier has not added a description. Request a quotation for specifications, lead time and delivery terms.'}
            </p>
          </div>
        </div>

        <div className="card">
          <div className="hd"><h2>Specification</h2></div>
          {p.spec.length === 0 ? (
            <div className="empty">No specification recorded for this lot.</div>
          ) : (
            <table>
              <thead>
                <tr><th>Attribute</th><th>Value</th></tr>
              </thead>
              <tbody>
                {p.spec.map((line) => {
                  const at = line.indexOf(':');
                  const label = at > 0 ? line.slice(0, at).trim() : line;
                  const value = at > 0 ? line.slice(at + 1).trim() : '—';
                  return (
                    <tr key={line}>
                      <td>{label}</td>
                      <td className="strong">{value}</td>
                    </tr>
                  );
                })}
                <tr><td>Category</td><td className="strong">{p.category}</td></tr>
                <tr><td>Unit</td><td className="strong">{p.unit}</td></tr>
                <tr><td>Purity / grade</td><td className="strong">{p.purityGrade ?? '—'}</td></tr>
              </tbody>
            </table>
          )}
        </div>
      </div>
    </View>
  );
}
