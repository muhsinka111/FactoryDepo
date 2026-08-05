import { Link } from 'wouter';
import { useMe, useRfqs } from '@workspace/api-client-react';
import { Page, Spinner, StatusChip, TrustRing } from '../components';

const ROLE_TITLES: Record<string, string> = {
  buyer: 'Buyer Workspace',
  supplier: 'Supplier Workspace',
  inspector: 'Inspector Workspace',
  lab: 'Laboratory Workspace',
  logistics: 'Logistics Workspace',
  admin: 'Admin Console',
};

export default function Dashboard() {
  const { data: user, isLoading } = useMe();
  const rfqs = useRfqs({ enabled: !!user });

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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginTop: 26 }}>
        <div className="card" style={{ padding: 22 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Your Role</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="chip chip-blue" style={{ fontSize: 13, padding: '6px 14px' }}>{user.role}</span>
            <span className="mono" style={{ fontSize: 12, color: 'var(--faint)' }}>{user.email}</span>
          </div>
        </div>
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
