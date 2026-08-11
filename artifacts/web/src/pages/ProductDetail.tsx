import { useMemo, useState } from 'react';
import { useProduct, useSupplier, useMe, useCreateOrder } from '@workspace/api-client-react';
import { Page, Spinner, ProductArt, productKind, Verified, TrustRing, Stars, requireAuthGate } from '../components';
import { Link } from 'wouter';

const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  paid: 'Paid',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

/** Buy-now / dropshipping checkout modal (Tasarım 2: Make an Offer + Buy Now). */
function CheckoutModal({ product, onClose }: { product: NonNullable<ReturnType<typeof useProduct>['data']>; onClose: () => void }) {
  const { data: user } = useMe();
  const createOrder = useCreateOrder();
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

  const total = useMemo(() => product.price * qty, [product.price, qty]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    setErr(null);
    try {
      const order = await createOrder.mutateAsync({
        productId: product.id,
        quantity: qty,
        ...form,
      });
      setDone(order.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Order failed');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
          <h3>{done != null ? 'Order Placed ✓' : 'Buy Now — Checkout'}</h3>
          <p>{product.name}</p>
        </div>
        <div className="modal-body">
          {done != null ? (
            <div style={{ textAlign: 'center', padding: '18px 0 8px' }}>
              <div style={{ fontSize: 44 }}>🎉</div>
              <h3 style={{ margin: '12px 0 6px' }}>Order #{done} confirmed</h3>
              <p className="muted">The supplier has been notified and will confirm shipping within 24 hours. Track it from your dashboard.</p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 18 }}>
                <Link href="/dashboard" className="btn btn-primary">View Dashboard</Link>
                <button className="btn btn-outline" onClick={onClose}>Keep Browsing</button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
                <div className="cell" style={{ flex: 1 }}><b>{product.currency === 'USD' ? '$' : product.currency} {product.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}</b><span>UNIT PRICE</span></div>
                <div className="cell" style={{ flex: 1 }}><b>{product.moq.toLocaleString()} {product.unit}</b><span>MIN. ORDER</span></div>
              </div>
              <label className="mono" style={{ fontSize: 11.5, color: 'var(--faint)', letterSpacing: '.08em', textTransform: 'uppercase' }}>Quantity ({product.unit})</label>
              <input
                type="number"
                min={product.moq}
                step={1}
                value={qty}
                onChange={(e) => setQty(Math.max(Number(e.target.value) || 0, 0))}
                style={{ margin: '6px 0 14px' }}
              />
              <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
                {[product.moq, product.moq * 5, product.moq * 10].filter((q, i, a) => a.indexOf(q) === i).map((q) => (
                  <button key={q} className="btn btn-outline btn-sm" onClick={() => setQty(q)}>{q.toLocaleString()} {product.unit}</button>
                ))}
              </div>
              {[
                { k: 'shippingName' as const, ph: 'Full name *', type: 'text' },
                { k: 'shippingAddress' as const, ph: 'Street address *', type: 'text' },
                { k: 'shippingCity' as const, ph: 'City *', type: 'text' },
                { k: 'shippingCountry' as const, ph: 'Country *', type: 'text' },
                { k: 'shippingPhone' as const, ph: 'Phone (optional)', type: 'tel' },
              ].map((f) => (
                <input key={f.k} type={f.type} placeholder={f.ph} value={form[f.k]} onChange={set(f.k)} style={{ marginBottom: 10 }} />
              ))}
              <textarea placeholder="Notes for the supplier (optional)" value={form.notes} onChange={set('notes')} rows={2} style={{ marginBottom: 14 }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 16 }}>
                <span className="muted">Total ({product.currency})</span>
                <b>${total.toLocaleString('en-US', { maximumFractionDigits: 2 })}</b>
              </div>
              {err && <p style={{ color: '#f87171', fontSize: 13.5, marginBottom: 12 }}>{err}</p>}
              <button className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={createOrder.isPending || !form.shippingName || !form.shippingAddress || !form.shippingCity || !form.shippingCountry} onClick={submit}>
                {createOrder.isPending ? 'Placing order…' : `Place Order — $${total.toLocaleString('en-US', { maximumFractionDigits: 2 })}`}
              </button>
              <p className="mono" style={{ fontSize: 11, color: 'var(--faint)', textAlign: 'center', marginTop: 12 }}>
                Factory-direct · Inspected listings · Secure payment
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProductDetail({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const { data: p, isLoading, error } = useProduct(Number.isFinite(id) ? id : undefined);
  const supplier = useSupplier(p?.supplierId);
  const { data: me } = useMe();
  const [checkout, setCheckout] = useState(false);

  if (isLoading) return <Page><Spinner /></Page>;
  if (error || !p) return <Page><div className="empty"><h3>Product not found</h3><Link href="/products" className="btn btn-outline" style={{ marginTop: 12 }}>Back to Marketplace</Link></div></Page>;

  return (
    <Page wide>
      {checkout && <CheckoutModal product={p} onClose={() => setCheckout(false)} />}
      <Link href="/products" className="mono" style={{ fontSize: 12.5, color: 'var(--faint)' }}>← Back to Marketplace</Link>
      <div className="detail-grid" style={{ marginTop: 16 }}>
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ height: 320, display: 'grid', placeItems: 'center', background: 'linear-gradient(150deg,var(--surface-2),var(--bg))', position: 'relative', overflow: 'hidden' }}>
            {p.imageKey ? (
              <img src={p.imageKey} alt={p.name} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ transform: 'scale(1.6)' }}><ProductArt kind={productKind(p.name)} /></div>
            )}
          </div>
          <div style={{ padding: 28 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="chip chip-blue">{p.category}</span>
              {p.verified && <Verified />}
              {p.purityGrade && <span className="tag">{p.purityGrade}</span>}
            </div>
            <h1 style={{ fontSize: 28, margin: '14px 0 8px' }}>{p.name}</h1>
            <p className="muted" style={{ maxWidth: 560 }}>{p.description ?? 'Factory-direct industrial product. Request a quotation to get the latest pricing, lead time and delivery terms.'}</p>
            <div className="spec-list">
              {p.spec.map((s) => <span key={s} className="tag" style={{ fontSize: 12, padding: '5px 11px' }}>{s}</span>)}
            </div>
            <div className="stat-row" style={{ maxWidth: 560, marginTop: 20 }}>
              <div className="cell"><b>{p.currency === 'USD' ? '$' : p.currency} {p.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}</b><span>PRICE / {p.unit}</span></div>
              <div className="cell"><b>{p.moq.toLocaleString()} {p.unit}</b><span>MIN. ORDER</span></div>
              <div className="cell"><b>{p.originCountry}</b><span>ORIGIN</span></div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {supplier.data && (
            <Link href={`/suppliers/${supplier.data.id}`} className="card" style={{ padding: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
                <span className="avatar" style={{ width: 46, height: 46 }}>{supplier.data.companyName.split(' ').map((w) => w[0]).join('').slice(0, 2)}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15.5 }}>{supplier.data.companyName}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--faint)' }}>{supplier.data.country} · <Stars rating={supplier.data.rating} /></div>
                </div>
                <TrustRing score={supplier.data.trustScore} size={48} />
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {supplier.data.tags.slice(0, 3).map((t) => <span key={t} className="tag">{t}</span>)}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 12 }}>
                {supplier.data.inspectionsCount} inspections · %{supplier.data.fulfillmentRate.toFixed(1)} on-time fulfillment
              </div>
            </Link>
          )}
          <div className="card" style={{ padding: 24, borderColor: 'rgba(46,124,246,.4)' }}>
            <h3 style={{ fontSize: 17, marginBottom: 6 }}>Buy Now — Ready Stock</h3>
            <p className="muted" style={{ fontSize: 13.5, marginBottom: 16 }}>Instant purchase at listed price. No negotiation, no waiting for quotes.</p>
            <button className="btn btn-primary btn-lg" style={{ width: '100%' }} onClick={() => { if (!me) requireAuthGate(); else setCheckout(true); }}>
              Buy Now · ${p.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}/{p.unit}
            </button>
            <p className="mono" style={{ fontSize: 11.5, color: 'var(--faint)', textAlign: 'center', marginTop: 12 }}>
              Ships from {p.originCountry} · MOQ {p.moq.toLocaleString()} {p.unit}
            </p>
          </div>
          <div className="card" style={{ padding: 24 }}>
            <h3 style={{ fontSize: 17, marginBottom: 6 }}>Request a Quotation</h3>
            <p className="muted" style={{ fontSize: 13.5, marginBottom: 16 }}>Prefer to negotiate? Get a custom quote with lead time and volume pricing.</p>
            <button className="btn btn-outline btn-lg" style={{ width: '100%' }} onClick={() => requireAuthGate()}>Make an Offer</button>
          </div>
          <div className="card" style={{ padding: 20 }}>
            <h4 style={{ fontSize: 13, fontFamily: 'var(--font-mono)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--faint)', marginBottom: 10 }}>Trade Services</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {['Factory inspection before payment', 'Laboratory testing & material analysis', 'Container loading supervision', 'International shipping & customs'].map((s) => (
                <div key={s} style={{ display: 'flex', gap: 9, fontSize: 13.5, color: 'var(--ink-2)' }}>
                  <span style={{ color: 'var(--green)' }}>✓</span>{s}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Page>
  );
}
