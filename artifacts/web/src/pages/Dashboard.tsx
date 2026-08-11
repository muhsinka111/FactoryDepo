import { Link } from 'wouter';
import { useMe, useRfqs, useMyOrders, useDashboardStats } from '@workspace/api-client-react';
import { Page, Spinner, StatusChip, TrustRing } from '../components';

const ROLE_TITLES: Record<string, string> = {
  buyer: 'Buyer Workspace',
  supplier: 'Supplier Workspace',
  inspector: 'Inspector Workspace',
  lab: 'Laboratory Workspace',
  logistics: 'Logistics Workspace',
  admin: 'Admin Console',
};

const ORDER_STATUS_COLOR: Record<string, string> = {
  pending: 'var(--accent)',
  paid: '#22c55e',
  shipped: '#22c55e',
  delivered: '#22c55e',
  cancelled: '#f87171',
};

function StatCard({ label, value, delta, accent }: { label: string; value: string | number; delta?: string; accent?: boolean }) {
  return (
    <div className="card" style={{ padding: 22 }}>
      <div className="eyebrow" style={{ marginBottom: 10 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <b style={{ fontSize: 30, color: accent ? 'var(--accent)' : undefined }}>{value}</b>
        {delta && <span className="mono" style={{ fontSize: 12, color: 'var(--green)' }}>{delta}</span>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data: user, isLoading } = useMe();
  const rfqs = useRfqs({ enabled: !!user });
  const orders = useMyOrders({ enabled: !!user });
  const stats = useDashboardStats({ enabled: !!user });

  if (isLoading || !user) {
    return (
      <Page>
        <Spinner />
        <div style={{ textAlign: 'center', marginTop: 10 }}>
          <Link href="/sign-in" className="btn btn-primary">Sign in to view your dashboard</Link>
        </div>
      </Page>
    );
  }

  const isSupplier = user.role === 'supplier';

  return (
    <Page wide>
      <div className="hero-band" style={{ padding: '44px 40px' }}>
        <span className="eyebrow" style={{ color: '#5CA1FF' }}>{ROLE_TITLES[user.role] ?? 'Dashboard'}</span>
        <h1 style={{ fontSize: 32, marginTop: 8 }}>Hello, {user.name.split(' ')[0]}.</h1>
        <p style={{ fontSize: 15, margin: '10px 0 0' }}>
          {user.company ? `${user.company} · ` : ''}{user.country ?? ''} · Trust Score <b style={{ color: '#fff' }}>{Math.round(user.trustScore)}</b>
        </p>
        <div style={{ display: 'flex', gap: 10, marginTop: 22, flexWrap: 'wrap' }}>
          {!isSupplier && <Link href="/rfq" className="btn btn-primary">Post an RFQ</Link>}
          <Link href="/products" className="btn btn-outline" style={{ borderColor: 'rgba(238,244,252,.3)', color: '#EEF4FC' }}>Browse Products</Link>
          {isSupplier && <Link href="/suppliers" className="btn btn-outline" style={{ borderColor: 'rgba(238,244,252,.3)', color: '#EEF4FC' }}>My Profile</Link>}
        </div>
      </div>

      {/* Tasarım 2/4: metrik kartları — gerçek DB sayıları (honest metrics kuralı) */}
      <div className="d-grid3" style={{ marginTop: 26 }}>
        <StatCard label={isSupplier ? 'Active Listings' : 'My RFQs'} value={stats.data?.totalListings ?? '—'} />
        <StatCard label="Offers" value={stats.data?.activeOffers ?? '—'} accent />
        <StatCard label="Orders" value={stats.data?.orders ?? '—'} delta={stats.data && stats.data.orders > 0 ? `${stats.data.orders} total` : undefined} />
        <StatCard label="Sold Items" value={stats.data?.soldItems ?? '—'} />
        <div className="card" style={{ padding: 22 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Trust Score</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <TrustRing score={user.trustScore} size={56} />
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              Earned through verification,<br />inspections & fulfillment.
            </div>
          </div>
        </div>
        <div className="card" style={{ padding: 22 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Quick Actions</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Link href="/rfq" className="btn btn-outline btn-sm">Open RFQ Exchange</Link>
            <Link href="/products" className="btn btn-outline btn-sm">Search Products</Link>
          </div>
        </div>
      </div>

      {/* Orders — dropshipping siparişleri */}
      <h2 style={{ fontSize: 20, margin: '38px 0 16px' }}>
        {isSupplier ? 'Incoming Orders' : 'My Orders'}
      </h2>
      {orders.isLoading ? <Spinner /> : orders.data && orders.data.items.length > 0 ? (
        <div className="table-wrap card">
          <table>
            <thead>
              <tr><th>Order</th><th>Product</th><th>Qty</th><th>Total</th><th>Status</th><th>Date</th></tr>
            </thead>
            <tbody>
              {orders.data.items.map((o) => (
                <tr key={o.id}>
                  <td className="mono" style={{ color: 'var(--faint)' }}>#{o.id}</td>
                  <td style={{ fontWeight: 600, maxWidth: 340 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.productName}</div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{o.supplierName}</div>
                  </td>
                  <td className="mono">{o.quantity.toLocaleString()}</td>
                  <td className="mono"><b>{o.currency === 'USD' ? '$' : o.currency} {o.total.toLocaleString('en-US', { maximumFractionDigits: 2 })}</b></td>
                  <td><StatusChip status={o.status} /></td>
                  <td className="mono" style={{ fontSize: 12.5, color: 'var(--faint)' }}>{new Date(o.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card" style={{ padding: 28, textAlign: 'center' }}>
          <p className="muted">No orders yet.</p>
          <Link href="/products" className="btn btn-outline" style={{ marginTop: 12 }}>Browse ready stock</Link>
        </div>
      )}

      <h2 style={{ fontSize: 20, margin: '38px 0 16px' }}>
        {isSupplier ? 'Open RFQs to quote' : 'Latest RFQs'}
      </h2>
      {rfqs.isLoading ? <Spinner /> : (
        <div className="table-wrap card">
          <table>
            <thead>
              <tr><th>RFQ</th><th>Category</th><th>Quantity</th><th>Quotes</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {rfqs.data?.items.slice(0, 8).map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.title}</td>
                  <td className="muted">{r.category}</td>
                  <td className="mono">{r.quantity.toLocaleString()} {r.unit}</td>
                  <td className="mono">{r.quoteCount}</td>
                  <td><StatusChip status={r.status} /></td>
                  <td><Link href={`/rfq/${r.id}`} className="btn btn-outline btn-sm">Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  );
}
