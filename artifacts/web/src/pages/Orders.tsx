import { Link } from 'wouter';
import { useMe, useMyOrders, useDashboardStats, getToken } from '@workspace/api-client-react';
import { View, Empty, StatusChip, Spinner, dashboardRole } from '../components';

/**
 * Orders — every order the signed-in user is party to (buy-now / dropshipping).
 * GET /orders labels each row side: 'buying' | 'selling', so the counterparty is
 * the supplier on a purchase and the buyer on a sale.
 * Every number on this page is either returned by the API or rendered '—'.
 */

/** Currency + thousands formatting. Values come straight from the API. */
function money(currency: string, amount: number): string {
  return `${currency === 'USD' ? '$' : `${currency} `}${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

interface StatCell {
  icon: string;
  value: string;
  label: string;
  title?: string;
}

export default function Orders() {
  const me = useMe();
  const user = me.data;
  const loggedIn = !!getToken();
  const dash = dashboardRole(user?.role, loggedIn);
  const isSupplier = dash === 'supplier';

  const orders = useMyOrders({ enabled: !!user });
  const stats = useDashboardStats({ enabled: !!user });
  const s = stats.data;

  const fmt = (n: number | undefined): string => (typeof n === 'number' ? n.toLocaleString() : '—');

  // Only metrics the API genuinely computes today. totalViews is hard-coded to 0
  // server-side because nothing tracks views yet, so it is shown as '—'.
  const cells: StatCell[] = [
    { icon: '📦', value: fmt(s?.totalListings), label: isSupplier ? 'My listings' : 'My RFQs' },
    { icon: '🏷️', value: fmt(s?.activeOffers), label: isSupplier ? 'Offers received' : 'Offers on my RFQs' },
    { icon: '🧾', value: fmt(s?.orders), label: 'Orders' },
    ...(isSupplier
      ? [{ icon: '🚚', value: fmt(s?.soldItems), label: 'Sold items', title: 'Shipped or delivered orders' }]
      : []),
    { icon: '👁️', value: '—', label: 'Views · not tracked yet', title: 'View tracking is not implemented yet' },
  ];

  if (me.isLoading) {
    return (
      <View title="Orders">
        <Spinner />
      </View>
    );
  }

  if (!user) {
    return (
      <View title="Orders" sub="Sign in to see the orders you are party to">
        <Empty title="You are not signed in">
          Orders are private: sign in to see what you have committed to buy or sell.
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Link href="/sign-in?next=%2Forders" className="btn btn-sm btn-primary">Sign in</Link>
            <Link href="/sign-up?next=%2Forders" className="btn btn-sm btn-ghost">Create an account</Link>
          </div>
        </Empty>
      </View>
    );
  }

  const items = orders.data?.items ?? [];
  const count = orders.data?.total ?? items.length;

  return (
    <View
      title="Orders"
      sub={isSupplier ? 'Orders buyers placed on your stock' : 'Everything you have committed to buy'}
    >
      <div className="grid stats">
        {cells.map((c) => (
          <div key={c.label} className="card stat" title={c.title}>
            <span className="ic" aria-hidden="true">{c.icon}</span>
            <div>
              <div className="v">{c.value}</div>
              <div className="l">{c.label}</div>
            </div>
          </div>
        ))}
      </div>
      {stats.isError && <p className="errtext" style={{ marginTop: -8, marginBottom: 12 }}>Metrics could not be loaded right now.</p>}

      {orders.isLoading ? (
        <Spinner />
      ) : orders.isError ? (
        <Empty title="Orders could not be loaded">
          The API did not return your orders. Refresh the page or sign in again.
        </Empty>
      ) : items.length === 0 ? (
        <Empty title="No orders yet">
          {isSupplier
            ? 'When a buyer orders from your stock it appears here.'
            : 'Buy-now orders you place on ready stock appear here.'}
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Link href="/explore" className="btn btn-sm btn-primary">Browse ready stock</Link>
            {!isSupplier && <Link href="/rfqs" className="btn btn-sm btn-ghost">Post an RFQ</Link>}
          </div>
        </Empty>
      ) : (
        <div className="card">
          <div className="hd">
            <b>{count.toLocaleString()} order{count === 1 ? '' : 's'}</b>
            <span className="muted" style={{ marginLeft: 'auto' }}>Newest first</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Product</th>
                  <th>Counterparty</th>
                  <th style={{ textAlign: 'right' }}>Qty</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th>Status</th>
                  <th className="hidem">Date</th>
                </tr>
              </thead>
              <tbody>
                {items.map((o) => (
                  <tr key={o.id}>
                    <td className="muted">#{o.id}</td>
                    <td>
                      <Link href={`/products/${o.productId}`} className="strong">{o.productName}</Link>
                    </td>
                    <td>
                      {o.side === 'selling' ? `Buyer #${o.buyerId}` : o.supplierName}
                      <div className="muted">{o.side === 'selling' ? 'buyer' : 'supplier'}</div>
                    </td>
                    <td style={{ textAlign: 'right' }}>{o.quantity.toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }} className="strong">{money(o.currency, o.total)}</td>
                    <td><StatusChip status={o.status} /></td>
                    <td className="muted hidem" title={new Date(o.createdAt).toLocaleString()}>
                      {new Date(o.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </View>
  );
}
