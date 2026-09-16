import { Link } from 'wouter';
import { useMe, useMyOrders, useDashboardStats, getToken } from '@workspace/api-client-react';
import { View, Empty, StatusChip, Spinner, dashboardRole } from '../components';
import { useI18n } from '../i18n';

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
  const { t, locale } = useI18n();
  const me = useMe();
  const user = me.data;
  const loggedIn = !!getToken();
  const dash = dashboardRole(user?.role, loggedIn);
  const isSupplier = dash === 'supplier';

  const orders = useMyOrders({ enabled: !!user });
  const stats = useDashboardStats({ enabled: !!user });
  const s = stats.data;

  /** Counts are API values; only their grouping is localised. */
  const fmt = (n: number | undefined): string => (typeof n === 'number' ? n.toLocaleString(locale) : '—');

  // Only metrics the API genuinely computes today. totalViews is hard-coded to 0
  // server-side because nothing tracks views yet, so it is shown as '—'.
  const cells: StatCell[] = [
    { icon: '📦', value: fmt(s?.totalListings), label: isSupplier ? t('orders.statListings') : t('nav.rfqs') },
    { icon: '🏷️', value: fmt(s?.activeOffers), label: isSupplier ? t('orders.statOffersReceived') : t('orders.statOffersOnRfqs') },
    { icon: '🧾', value: fmt(s?.orders), label: t('orders.statOrders') },
    ...(isSupplier
      ? [{ icon: '🚚', value: fmt(s?.soldItems), label: t('orders.statSoldItems'), title: t('orders.statSoldTitle') }]
      : []),
    { icon: '👁️', value: '—', label: t('orders.statViews'), title: t('orders.statViewsTitle') },
  ];

  if (me.isLoading) {
    return (
      <View title={t('orders.title')}>
        <Spinner />
      </View>
    );
  }

  if (!user) {
    return (
      <View title={t('orders.title')} sub={t('orders.signInSub')}>
        <Empty title={t('orders.notSignedIn')}>
          {t('orders.notSignedInBody')}
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Link href="/sign-in?next=%2Forders" className="btn btn-sm btn-primary">{t('action.signIn')}</Link>
            <Link href="/sign-up?next=%2Forders" className="btn btn-sm btn-ghost">{t('action.createAccount')}</Link>
          </div>
        </Empty>
      </View>
    );
  }

  const items = orders.data?.items ?? [];
  const count = orders.data?.total ?? items.length;

  return (
    <View
      title={t('orders.title')}
      sub={isSupplier ? t('orders.subSupplier') : t('orders.subBuyer')}
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
      {stats.isError && <p className="errtext" style={{ marginTop: -8, marginBottom: 12 }}>{t('orders.metricsError')}</p>}

      {orders.isLoading ? (
        <Spinner />
      ) : orders.isError ? (
        <Empty title={t('orders.loadErrorTitle')}>
          {t('orders.loadErrorBody')}
        </Empty>
      ) : items.length === 0 ? (
        <Empty title={t('orders.emptyTitle')}>
          {isSupplier ? t('orders.emptySupplier') : t('orders.emptyBuyer')}
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Link href="/explore" className="btn btn-sm btn-primary">{t('orders.browseStock')}</Link>
            {!isSupplier && <Link href="/rfqs" className="btn btn-sm btn-ghost">{t('orders.postRfq')}</Link>}
          </div>
        </Empty>
      ) : (
        <div className="card">
          <div className="hd">
            <b>{t('orders.count', { n: count.toLocaleString(locale) })}</b>
            <span className="muted" style={{ marginLeft: 'auto' }}>{t('common.newestFirst')}</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>{t('orders.col.order')}</th>
                  <th>{t('orders.col.product')}</th>
                  <th>{t('orders.col.counterparty')}</th>
                  <th style={{ textAlign: 'right' }}>{t('orders.col.qty')}</th>
                  <th style={{ textAlign: 'right' }}>{t('orders.col.total')}</th>
                  <th>{t('orders.col.status')}</th>
                  <th className="hidem">{t('orders.col.date')}</th>
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
                      {o.side === 'selling' ? t('orders.buyerId', { id: o.buyerId }) : o.supplierName}
                      <div className="muted">{o.side === 'selling' ? t('orders.buyerLabel') : t('orders.supplierLabel')}</div>
                    </td>
                    <td style={{ textAlign: 'right' }}>{o.quantity.toLocaleString(locale)}</td>
                    <td style={{ textAlign: 'right' }} className="strong">{money(o.currency, o.total)}</td>
                    <td><StatusChip status={o.status} /></td>
                    <td className="muted hidem" title={new Date(o.createdAt).toLocaleString(locale)}>
                      {new Date(o.createdAt).toLocaleDateString(locale)}
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
