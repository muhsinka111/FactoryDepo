import { Link } from 'wouter';
import type { ReactNode } from 'react';
import { getToken, useMe, useAdminOverview, useTickets } from '@workspace/api-client-react';
import { View, Empty, StatusChip, Spinner, DemoTag } from '../components';

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
function num(n: number | null | undefined): string {
  return typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('en-US') : '—';
}

/** Money-shaped totals: same honesty rule, two decimals. */
function amount(n: number | null | undefined): string {
  return typeof n === 'number' && Number.isFinite(n)
    ? n.toLocaleString('en-US', { maximumFractionDigits: 2 })
    : '—';
}

function day(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
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
  return (
    <View title="Admins only" sub="This console reads and changes marketplace-wide data">
      <Empty title={signedIn ? 'Your account is not an administrator' : 'You are not signed in'}>
        {signedIn
          ? `You are signed in as ${role ?? 'a non-admin role'}. Only administrator accounts are accepted by the admin endpoints.`
          : 'Sign in with an administrator account to open the admin console.'}
        <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
          {signedIn ? (
            <Link href="/explore" className="btn btn-sm btn-grey">Back to the marketplace</Link>
          ) : (
            <Link href={`/sign-in?next=${encodeURIComponent(next)}`} className="btn btn-sm btn-primary">Sign in</Link>
          )}
        </div>
      </Empty>
    </View>
  );
}

export default function AdminOverview() {
  const me = useMe();
  const signedIn = !!getToken();
  const isAdmin = me.data?.role === 'admin';

  const overview = useAdminOverview({ enabled: isAdmin });
  const tickets = useTickets({ enabled: isAdmin });
  const ov = overview.data;

  if (!signedIn) return <AdminOnly signedIn={false} next="/admin" />;
  if (me.isLoading) {
    return (
      <View title="Marketplace overview">
        <Spinner />
      </View>
    );
  }
  if (!isAdmin) return <AdminOnly signedIn role={me.data?.role} next="/admin" />;

  if (overview.isLoading) {
    return (
      <View title="Marketplace overview" sub="Platform counts straight from the API">
        <Spinner />
      </View>
    );
  }

  if (overview.isError || !ov) {
    return (
      <View title="Marketplace overview" sub="Platform counts straight from the API">
        <Empty title="Could not load the marketplace overview — try again">
          The admin overview endpoint did not answer. Nothing is cached or estimated here, so no
          figures are shown.
          <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
            <button className="btn btn-sm btn-primary" onClick={() => void overview.refetch()}>Try again</button>
          </div>
        </Empty>
      </View>
    );
  }

  const marketplace: Cell[] = [
    { icon: '👥', value: num(ov.users), label: 'Registered users' },
    { icon: '🛒', value: num(ov.buyers), label: 'Buyer accounts' },
    { icon: '🚚', value: num(ov.suppliers), label: 'Supplier accounts' },
    { icon: '📦', value: num(ov.products), label: 'Listings (all sources)' },
    {
      icon: '✅',
      value: num(ov.platformProducts),
      label: 'Real listings',
      title: 'Listings created by a real supplier through the app (dataSource: platform)',
    },
    {
      icon: '🧪',
      value: num(ov.demoProducts),
      label: 'Seed listings',
      title: 'Bootstrap seed data — shown with a Demo tag, never as real supply (dataSource: demo)',
      tag: <DemoTag />,
    },
  ];

  const trading: Cell[] = [
    { icon: '📄', value: num(ov.rfqs), label: 'Requests for quotation' },
    { icon: '🏷️', value: num(ov.quotes), label: 'Quotes submitted' },
    { icon: '🤝', value: num(ov.offers), label: 'Offers' },
    { icon: '🔔', value: num(ov.openOffers), label: 'Offers still open' },
    { icon: '🧾', value: num(ov.orders), label: 'Orders' },
    { icon: '🚢', value: num(ov.shipments), label: 'Shipments' },
  ];

  const operations: Cell[] = [
    {
      icon: '⏳',
      value: num(ov.paymentsAwaiting),
      label: 'Payments awaiting confirmation',
      title: 'Bank transfers recorded by buyers and not yet confirmed by an administrator',
    },
    {
      icon: '💰',
      value: amount(ov.paymentsConfirmedTotal),
      label: 'Confirmed payments · sum',
      title: 'Sum of confirmed payment amounts as returned by the API. The API does not split this by currency.',
    },
    { icon: '🛡️', value: num(ov.docsAwaitingReview), label: 'Documents awaiting review' },
    { icon: '❓', value: num(ov.supportTicketsOpen), label: 'Open support tickets' },
    { icon: '✉️', value: num(ov.emailsQueued), label: 'Emails queued' },
    {
      icon: '👁️',
      value: num(ov.productViews),
      label: 'Listing views recorded',
      title: 'Rows recorded in the view table by the API. No other view figure exists.',
    },
    { icon: '💬', value: num(ov.messages), label: 'Messages' },
    { icon: '🧵', value: num(ov.threads), label: 'Conversations' },
  ];

  const ticketItems = tickets.data?.items ?? [];
  const newestTickets = ticketItems.slice(0, 8);

  return (
    <View
      title="Marketplace overview"
      sub="Every number here is a live count or sum from the API — no estimates, no trends, no period labels"
      actions={
        <div className="row" style={{ gap: 6 }}>
          <button
            className="btn btn-sm btn-grey"
            onClick={() => { void overview.refetch(); void tickets.refetch(); }}
            disabled={overview.isFetching}
          >
            {overview.isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
          <Link href="/admin/verification" className="btn btn-sm btn-ghost">Verification desk</Link>
        </div>
      }
    >
      <h2 style={{ margin: '0 0 8px' }}>Marketplace</h2>
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

      <h2 style={{ margin: '0 0 8px' }}>Trading activity</h2>
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

      <h2 style={{ margin: '0 0 8px' }}>Operations</h2>
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
            <h2>Listing provenance</h2>
            <Link href="/admin/listings" className="link">Inspect listings</Link>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Source</th>
                  <th style={{ textAlign: 'right' }}>Listings</th>
                  <th>What it means</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><span className="pill p-green" title="Created by a real supplier inside the app">Real</span></td>
                  <td style={{ textAlign: 'right' }} className="strong">{num(ov.platformProducts)}</td>
                  <td className="muted">Posted by a real supplier through the app</td>
                </tr>
                <tr>
                  <td><DemoTag /></td>
                  <td style={{ textAlign: 'right' }} className="strong">{num(ov.demoProducts)}</td>
                  <td className="muted">Seed data that gives an empty database something to demo</td>
                </tr>
                <tr>
                  <td className="strong">All listings</td>
                  <td style={{ textAlign: 'right' }} className="strong">{num(ov.products)}</td>
                  <td className="muted">Every row the API returns, of both sources</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="hd">
            <h2>Trading funnel</h2>
            <Link href="/admin/rfqs" className="link">All RFQs</Link>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Stage</th>
                  <th style={{ textAlign: 'right' }}>Count</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Requests for quotation</td>
                  <td style={{ textAlign: 'right' }} className="strong">{num(ov.rfqs)}</td>
                </tr>
                <tr>
                  <td>Quotes submitted</td>
                  <td style={{ textAlign: 'right' }} className="strong">{num(ov.quotes)}</td>
                </tr>
                <tr>
                  <td>Offers</td>
                  <td style={{ textAlign: 'right' }} className="strong">{num(ov.offers)}</td>
                </tr>
                <tr>
                  <td>Offers still open</td>
                  <td style={{ textAlign: 'right' }} className="strong">{num(ov.openOffers)}</td>
                </tr>
                <tr>
                  <td>Orders</td>
                  <td style={{ textAlign: 'right' }} className="strong">{num(ov.orders)}</td>
                </tr>
                <tr>
                  <td>Shipments</td>
                  <td style={{ textAlign: 'right' }} className="strong">{num(ov.shipments)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="hd">
          <h2>Support tickets</h2>
          <span className="muted" style={{ marginLeft: 'auto' }}>
            {num(ov.supportTicketsOpen)} open · {tickets.data ? `${tickets.data.total.toLocaleString()} total` : '—'}
          </span>
        </div>

        {tickets.isLoading ? (
          <div className="empty">Loading support tickets…</div>
        ) : tickets.isError ? (
          <div className="empty">
            <b>Could not load support tickets — try again</b>
            The ticket queue did not answer. The count above still comes from the overview endpoint.
            <div className="row" style={{ justifyContent: 'center', marginTop: 10 }}>
              <button className="btn btn-sm btn-primary" onClick={() => void tickets.refetch()}>Try again</button>
            </div>
          </div>
        ) : ticketItems.length === 0 ? (
          <div className="empty">
            <b>No support tickets</b>
            Nothing has been filed through the help centre yet.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th className="hidem">Priority</th>
                  <th>Status</th>
                  <th className="hidem">Filed</th>
                </tr>
              </thead>
              <tbody>
                {newestTickets.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <span className="strong">{t.subject}</span>
                      <div className="muted">
                        #{t.id} · {t.userId === null ? 'filed while signed out' : `user #${t.userId}`}
                      </div>
                    </td>
                    <td className="hidem">
                      <span className={`pill ${priorityPill(t.priority)}`}>{t.priority}</span>
                    </td>
                    <td><StatusChip status={t.status} /></td>
                    <td className="muted hidem" title={new Date(t.createdAt).toLocaleString()}>{day(t.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {ticketItems.length > newestTickets.length && (
          <div className="bd muted" style={{ borderTop: '1px solid var(--line-2)' }}>
            Showing {newestTickets.length} of the {ticketItems.length.toLocaleString()} rows the API returned,
            in the order it returned them — the ticket queue has no paging parameter.
          </div>
        )}
      </div>
    </View>
  );
}
