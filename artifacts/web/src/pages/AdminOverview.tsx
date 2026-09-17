import { Link } from 'wouter';
import type { ReactNode } from 'react';
import { getToken, useMe, useAdminOverview, useTickets } from '@workspace/api-client-react';
import { View, Empty, StatusChip, Spinner, DemoTag } from '../components';
import { useI18n } from '../i18n';

/**
 * AdminOverview — the marketplace at a glance, for administrators only.
 *
 * Every figure on this screen is a COUNT or SUM the API computed; nothing is
 * estimated, trended or period-labelled. A field the API does not return at all
 * renders '—' rather than a zero, and there is no "vs last week" anywhere
 * because the API does not compute one.
 *
 * The provenance split (platform vs demo listings) is shown as its own table so
 * a real listing can never be confused with bootstrap seed data.
 */

interface Cell {
  icon: string;
  value: string;
  label: string;
  title?: string;
  /** Optional marker rendered beside the label — used to put <DemoTag /> on seed figures. */
  tag?: ReactNode;
}

/** A figure we may only show when the API actually supplied it. */
function num(n: number | null | undefined, locale: string): string {
  return typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString(locale) : '—';
}

/** Money-shaped totals: same honesty rule, two decimals. */
function amount(n: number | null | undefined, locale: string): string {
  return typeof n === 'number' && Number.isFinite(n)
    ? n.toLocaleString(locale, { maximumFractionDigits: 2 })
    : '—';
}

function day(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(locale);
}

function priorityPill(priority: string): string {
  const p = priority.toLowerCase();
  if (p === 'urgent' || p === 'high') return 'p-red';
  if (p === 'low') return 'p-grey';
  return 'p-blue';
}

/**
 * Admin-only notice. The server is the authority — every /admin endpoint
 * returns 401/403 for a non-admin — so this is the on-screen explanation for
 * the refusal, never a replacement for it.
 */
function AdminOnly({ signedIn, role, next }: { signedIn: boolean; role?: string; next: string }) {
  const { t } = useI18n();
  return (
    <View title={t('admin.common.adminsOnly')} sub={t('admin.overview.adminOnlySub')}>
      <Empty title={signedIn ? t('admin.common.notAdmin') : t('admin.common.notSignedIn')}>
        {signedIn
          ? t('admin.overview.signedInBody', { role: role ?? t('admin.common.nonAdminRole') })
          : t('admin.overview.signedOutBody')}
        <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
          {signedIn ? (
            <Link href="/explore" className="btn btn-sm btn-grey">{t('admin.common.backToMarketplace')}</Link>
          ) : (
            <Link href={`/sign-in?next=${encodeURIComponent(next)}`} className="btn btn-sm btn-primary">{t('action.signIn')}</Link>
          )}
        </div>
      </Empty>
    </View>
  );
}

export default function AdminOverview() {
  const { t, locale } = useI18n();
  const me = useMe();
  const signedIn = !!getToken();
  const isAdmin = me.data?.role === 'admin';

  const overview = useAdminOverview({ enabled: isAdmin });
  const tickets = useTickets({ enabled: isAdmin });
  const ov = overview.data;

  /** Ticket priority is an API value; an unknown one is shown exactly as the API returned it. */
  const priorityText = (priority: string): string => {
    const p = priority.toLowerCase();
    if (p === 'urgent') return t('admin.priority.urgent');
    if (p === 'high') return t('admin.priority.high');
    if (p === 'normal') return t('admin.priority.normal');
    if (p === 'low') return t('admin.priority.low');
    return priority;
  };

  if (!signedIn) return <AdminOnly signedIn={false} next="/admin" />;
  if (me.isLoading) {
    return (
      <View title={t('admin.overview.title')}>
        <Spinner />
      </View>
    );
  }
  if (!isAdmin) return <AdminOnly signedIn role={me.data?.role} next="/admin" />;

  if (overview.isLoading) {
    return (
      <View title={t('admin.overview.title')} sub={t('admin.overview.subLoading')}>
        <Spinner />
      </View>
    );
  }

  if (overview.isError || !ov) {
    return (
      <View title={t('admin.overview.title')} sub={t('admin.overview.subLoading')}>
        <Empty title={t('admin.overview.loadErrorTitle')}>
          {t('admin.overview.loadErrorBody')}
          <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
            <button className="btn btn-sm btn-primary" onClick={() => void overview.refetch()}>{t('action.tryAgain')}</button>
          </div>
        </Empty>
      </View>
    );
  }

  const marketplace: Cell[] = [
    { icon: '👥', value: num(ov.users, locale), label: t('admin.overview.users') },
    { icon: '🛒', value: num(ov.buyers, locale), label: t('admin.overview.buyers') },
    { icon: '🚚', value: num(ov.suppliers, locale), label: t('admin.overview.suppliers') },
    { icon: '📦', value: num(ov.products, locale), label: t('admin.overview.products') },
    {
      icon: '✅',
      value: num(ov.platformProducts, locale),
      label: t('admin.overview.platformProducts'),
      title: t('admin.overview.platformProductsTitle'),
    },
    {
      icon: '🧪',
      value: num(ov.demoProducts, locale),
      label: t('admin.overview.demoProducts'),
      title: t('admin.overview.demoProductsTitle'),
      tag: <DemoTag />,
    },
  ];

  const trading: Cell[] = [
    { icon: '📄', value: num(ov.rfqs, locale), label: t('admin.overview.rfqs') },
    { icon: '🏷️', value: num(ov.quotes, locale), label: t('admin.overview.quotes') },
    { icon: '🤝', value: num(ov.offers, locale), label: t('admin.overview.offers') },
    { icon: '🔔', value: num(ov.openOffers, locale), label: t('admin.overview.openOffers') },
    { icon: '🧾', value: num(ov.orders, locale), label: t('admin.overview.orders') },
    { icon: '🚢', value: num(ov.shipments, locale), label: t('admin.overview.shipments') },
  ];

  const operations: Cell[] = [
    {
      icon: '⏳',
      value: num(ov.paymentsAwaiting, locale),
      label: t('admin.overview.paymentsAwaiting'),
      title: t('admin.overview.paymentsAwaitingTitle'),
    },
    {
      icon: '💰',
      value: amount(ov.paymentsConfirmedTotal, locale),
      label: t('admin.overview.paymentsConfirmedTotal'),
      title: t('admin.overview.paymentsConfirmedTotalTitle'),
    },
    { icon: '🛡️', value: num(ov.docsAwaitingReview, locale), label: t('admin.overview.docsAwaitingReview') },
    { icon: '❓', value: num(ov.supportTicketsOpen, locale), label: t('admin.overview.supportTicketsOpen') },
    { icon: '✉️', value: num(ov.emailsQueued, locale), label: t('admin.overview.emailsQueued') },
    {
      icon: '👁️',
      value: num(ov.productViews, locale),
      label: t('admin.overview.productViews'),
      title: t('admin.overview.productViewsTitle'),
    },
    { icon: '💬', value: num(ov.messages, locale), label: t('admin.overview.messages') },
    { icon: '🧵', value: num(ov.threads, locale), label: t('admin.overview.threads') },
  ];

  const ticketItems = tickets.data?.items ?? [];
  const newestTickets = ticketItems.slice(0, 8);

  return (
    <View
      title={t('admin.overview.title')}
      sub={t('admin.overview.sub')}
      actions={
        <div className="row" style={{ gap: 6 }}>
          <button
            className="btn btn-sm btn-grey"
            onClick={() => { void overview.refetch(); void tickets.refetch(); }}
            disabled={overview.isFetching}
          >
            {overview.isFetching ? t('action.refreshing') : t('action.refresh')}
          </button>
          <Link href="/admin/verification" className="btn btn-sm btn-ghost">{t('nav.adminVerify')}</Link>
        </div>
      }
    >
      <h2 style={{ margin: '0 0 8px' }}>{t('admin.overview.sectionMarketplace')}</h2>
      <div className="grid stats">
        {marketplace.map((c) => (
          <div key={c.label} className="card stat" title={c.title}>
            <span className="ic" aria-hidden="true">{c.icon}</span>
            <div>
              <div className="v">{c.value}</div>
              <div className="l">{c.label}{c.tag ? <> {c.tag}</> : null}</div>
            </div>
          </div>
        ))}
      </div>

      <h2 style={{ margin: '0 0 8px' }}>{t('admin.overview.sectionTrading')}</h2>
      <div className="grid stats">
        {trading.map((c) => (
          <div key={c.label} className="card stat" title={c.title}>
            <span className="ic" aria-hidden="true">{c.icon}</span>
            <div>
              <div className="v">{c.value}</div>
              <div className="l">{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      <h2 style={{ margin: '0 0 8px' }}>{t('admin.overview.sectionOperations')}</h2>
      <div className="grid stats">
        {operations.map((c) => (
          <div key={c.label} className="card stat" title={c.title}>
            <span className="ic" aria-hidden="true">{c.icon}</span>
            <div>
              <div className="v">{c.value}</div>
              <div className="l">{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="cols">
        <div className="card">
          <div className="hd">
            <h2>{t('admin.overview.provenance.title')}</h2>
            <Link href="/admin/listings" className="link">{t('admin.overview.provenance.inspect')}</Link>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>{t('admin.overview.provenance.colSource')}</th>
                  <th style={{ textAlign: 'right' }}>{t('admin.overview.provenance.colListings')}</th>
                  <th>{t('admin.overview.provenance.colMeaning')}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><span className="pill p-green" title={t('admin.overview.provenance.realTitle')}>{t('admin.overview.provenance.real')}</span></td>
                  <td style={{ textAlign: 'right' }} className="strong">{num(ov.platformProducts, locale)}</td>
                  <td className="muted">{t('admin.overview.provenance.realMeaning')}</td>
                </tr>
                <tr>
                  <td><DemoTag /></td>
                  <td style={{ textAlign: 'right' }} className="strong">{num(ov.demoProducts, locale)}</td>
                  <td className="muted">{t('admin.overview.provenance.seedMeaning')}</td>
                </tr>
                <tr>
                  <td className="strong">{t('admin.overview.provenance.all')}</td>
                  <td style={{ textAlign: 'right' }} className="strong">{num(ov.products, locale)}</td>
                  <td className="muted">{t('admin.overview.provenance.allMeaning')}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="hd">
            <h2>{t('admin.overview.funnel.title')}</h2>
            <Link href="/admin/rfqs" className="link">{t('admin.overview.funnel.allRfqs')}</Link>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>{t('admin.overview.funnel.colStage')}</th>
                  <th style={{ textAlign: 'right' }}>{t('admin.overview.funnel.colCount')}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{t('admin.overview.rfqs')}</td>
                  <td style={{ textAlign: 'right' }} className="strong">{num(ov.rfqs, locale)}</td>
                </tr>
                <tr>
                  <td>{t('admin.overview.quotes')}</td>
                  <td style={{ textAlign: 'right' }} className="strong">{num(ov.quotes, locale)}</td>
                </tr>
                <tr>
                  <td>{t('admin.overview.offers')}</td>
                  <td style={{ textAlign: 'right' }} className="strong">{num(ov.offers, locale)}</td>
                </tr>
                <tr>
                  <td>{t('admin.overview.openOffers')}</td>
                  <td style={{ textAlign: 'right' }} className="strong">{num(ov.openOffers, locale)}</td>
                </tr>
                <tr>
                  <td>{t('admin.overview.orders')}</td>
                  <td style={{ textAlign: 'right' }} className="strong">{num(ov.orders, locale)}</td>
                </tr>
                <tr>
                  <td>{t('admin.overview.shipments')}</td>
                  <td style={{ textAlign: 'right' }} className="strong">{num(ov.shipments, locale)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="hd">
          <h2>{t('admin.overview.tickets.title')}</h2>
          <span className="muted" style={{ marginLeft: 'auto' }}>
            {tickets.data
              ? t('admin.overview.tickets.openTotal', {
                open: num(ov.supportTicketsOpen, locale),
                total: tickets.data.total.toLocaleString(locale),
              })
              : t('admin.overview.tickets.openOnly', { open: num(ov.supportTicketsOpen, locale) })}
          </span>
        </div>

        {tickets.isLoading ? (
          <div className="empty">{t('admin.overview.tickets.loading')}</div>
        ) : tickets.isError ? (
          <div className="empty">
            <b>{t('admin.overview.tickets.loadErrorTitle')}</b>
            {t('admin.overview.tickets.loadErrorBody')}
            <div className="row" style={{ justifyContent: 'center', marginTop: 10 }}>
              <button className="btn btn-sm btn-primary" onClick={() => void tickets.refetch()}>{t('action.tryAgain')}</button>
            </div>
          </div>
        ) : ticketItems.length === 0 ? (
          <div className="empty">
            <b>{t('admin.overview.tickets.emptyTitle')}</b>
            {t('admin.overview.tickets.emptyBody')}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>{t('admin.overview.tickets.colTicket')}</th>
                  <th className="hidem">{t('admin.overview.tickets.colPriority')}</th>
                  <th>{t('admin.overview.tickets.colStatus')}</th>
                  <th className="hidem">{t('admin.overview.tickets.colFiled')}</th>
                </tr>
              </thead>
              <tbody>
                {newestTickets.map((tk) => (
                  <tr key={tk.id}>
                    <td>
                      <span className="strong">{tk.subject}</span>
                      <div className="muted">
                        #{tk.id} · {tk.userId === null ? t('admin.overview.tickets.filedSignedOut') : t('admin.overview.tickets.filedByUser', { id: tk.userId })}
                      </div>
                    </td>
                    <td className="hidem">
                      <span className={`pill ${priorityPill(tk.priority)}`}>{priorityText(tk.priority)}</span>
                    </td>
                    <td><StatusChip status={tk.status} /></td>
                    <td className="muted hidem" title={new Date(tk.createdAt).toLocaleString(locale)}>{day(tk.createdAt, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {ticketItems.length > newestTickets.length && (
          <div className="bd muted" style={{ borderTop: '1px solid var(--line-2)' }}>
            {t('admin.overview.tickets.showingRows', {
              shown: newestTickets.length.toLocaleString(locale),
              total: ticketItems.length.toLocaleString(locale),
            })}
          </div>
        )}
      </div>
    </View>
  );
}
