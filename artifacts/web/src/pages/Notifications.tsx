import { useState } from 'react';
import { Link } from 'wouter';
import { useNotifications, useMarkNotificationsRead, useMe, getToken } from '@workspace/api-client-react';
import { View, Empty, Spinner, requireAuthGate } from '../components';

/**
 * Notifications — the caller's own feed, newest first.
 *
 * GET /api/notifications is strictly self-scoped and returns a real `unread`
 * COUNT, so the unread figure and the badge come from the API rather than being
 * estimated from the page. POST /api/notifications/read marks everything read.
 *
 * `createdAt` is the only time the API supplies, and it is rendered as a
 * relative label; the exact timestamp stays in the title attribute. A row with
 * no timestamp renders '—'.
 */

/** Compact "5m ago" label. Falls back to a date, then to '—' for junk input. */
function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const secs = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (secs < 45) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function errMessage(e: unknown, fallback: string): string {
  const m = e instanceof Error ? e.message : '';
  return m && !/^Request failed \(\d+\)$/.test(m) ? m : fallback;
}

/** Routes this shell mounts exactly, plus the ones that take a path parameter. */
const EXACT = [
  '/feed', '/explore', '/offers', '/rfqs', '/orders', '/shipments', '/messages',
  '/saved', '/notifications', '/help', '/profile', '/products', '/suppliers',
  '/supplier/listings', '/supplier/post', '/supplier/offers',
  '/supplier/rfq-opportunities', '/supplier/verification', '/admin',
];
const DETAIL = ['/products/', '/suppliers/', '/rfqs/'];
const LIST_BASE = ['/orders', '/offers', '/shipments', '/saved', '/notifications', '/profile', '/messages', '/feed', '/explore'];

/**
 * A notification's `link` is a server-side path and a few of them point at
 * routes this shell does not mount (e.g. '/threads/12', '/buyer/offers'). The
 * known ones are normalised onto the mounted route; a deeper path under a list
 * view ('/orders/12') goes to the list itself rather than the catch-all; and
 * anything unrecognised is shown as text with no link.
 */
function resolveLink(link: string | null): string | null {
  if (!link) return null;
  const p = link.trim();
  if (!p.startsWith('/')) return null;
  if (p.startsWith('/threads/')) return '/messages';
  if (p === '/buyer/offers' || p === '/supplier/offers') return '/offers';
  if (p === '/buyer/orders' || p === '/supplier/orders') return '/orders';
  if (p === '/buyer/messages' || p === '/supplier/messages') return '/messages';
  if (EXACT.includes(p)) return p;
  if (DETAIL.some((d) => p.startsWith(d))) return p;
  return LIST_BASE.find((b) => p === b || p.startsWith(b + '/')) ?? null;
}

export default function Notifications() {
  const me = useMe();
  const user = me.data;

  const notifs = useNotifications({ enabled: !!user });
  const markRead = useMarkNotificationsRead();
  const [actionErr, setActionErr] = useState('');

  if (me.isLoading) {
    return (
      <View title="Notifications">
        <Spinner />
      </View>
    );
  }

  if (!user) {
    return (
      <View title="Notifications" sub="Sign in to see your account activity">
        <Empty title="You are not signed in">
          Notifications are private to your account: sign in to read them.
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Link href="/sign-in?next=%2Fnotifications" className="btn btn-sm btn-primary">Sign in</Link>
            <Link href="/sign-up?next=%2Fnotifications" className="btn btn-sm btn-ghost">Create an account</Link>
          </div>
        </Empty>
      </View>
    );
  }

  const items = notifs.data?.items ?? [];
  const total = notifs.data?.total ?? items.length;
  const unread = notifs.data?.unread ?? 0;

  const markAll = async () => {
    setActionErr('');
    if (!getToken()) { requireAuthGate(); return; }
    try {
      await markRead.mutateAsync();
    } catch (e) {
      setActionErr(errMessage(e, 'Notifications could not be marked read — try again.'));
    }
  };

  return (
    <View
      title="Notifications"
      sub="Offers, messages and shipment updates on your account, newest first."
      actions={
        <div className="row">
          <button
            className="btn btn-sm btn-grey"
            onClick={() => void notifs.refetch()}
            disabled={notifs.isFetching}
          >
            {notifs.isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
          <button
            className="btn btn-sm btn-primary"
            onClick={() => void markAll()}
            disabled={markRead.isPending || unread === 0}
            title={unread === 0 ? 'Nothing is unread' : `Mark ${unread} unread notification${unread === 1 ? '' : 's'} read`}
          >
            {markRead.isPending ? 'Marking…' : 'Mark all read'}
          </button>
        </div>
      }
    >
      {actionErr && <p className="errtext" style={{ marginTop: -4, marginBottom: 10 }}>{actionErr}</p>}

      {notifs.isLoading ? (
        <Spinner />
      ) : notifs.isError ? (
        <Empty title="Notifications could not be loaded">
          The API did not return your notifications — try again.
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <button className="btn btn-sm btn-primary" onClick={() => void notifs.refetch()} disabled={notifs.isFetching}>
              {notifs.isFetching ? 'Trying…' : 'Try again'}
            </button>
          </div>
        </Empty>
      ) : items.length === 0 ? (
        <Empty title="No notifications yet">
          When an offer is countered, a message arrives or a shipment moves, it is recorded here.
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Link href="/explore" className="btn btn-sm btn-primary">Browse ready stock</Link>
            <Link href="/orders" className="btn btn-sm btn-ghost">My orders</Link>
          </div>
        </Empty>
      ) : (
        <div className="card">
          <div className="hd">
            <b>
              {total.toLocaleString()} notification{total === 1 ? '' : 's'}
            </b>
            <span className={unread > 0 ? 'pill p-blue' : 'pill p-grey'}>
              {unread > 0 ? `${unread} unread` : 'All read'}
            </span>
          </div>
          <div>
            {items.map((n) => {
              const href = resolveLink(n.link);
              return (
                <div
                  key={n.id}
                  className="between"
                  style={{
                    alignItems: 'flex-start',
                    gap: 10,
                    padding: '9px 12px',
                    borderBottom: '1px solid var(--line-2)',
                    background: n.read ? undefined : 'var(--blue-l)',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 2 }}>
                      {!n.read && <span className="pill p-blue">Unread</span>}
                      {n.type && <span className="pill p-grey">{n.type.replace(/_/g, ' ')}</span>}
                    </div>
                    <div className={n.read ? undefined : 'strong'}>{n.text}</div>
                    <div className="muted" title={new Date(n.createdAt).toLocaleString()}>
                      {timeAgo(n.createdAt)}
                    </div>
                  </div>
                  {href && (
                    <Link href={href} className="btn btn-sm btn-grey">Open</Link>
                  )}
                </div>
              );
            })}
          </div>
          <div className="bd" style={{ paddingTop: 9, paddingBottom: 9 }}>
            <span className="muted">
              Unread counts come straight from the API. Opening a conversation or an offer from here does not
              clear a notification on its own — use “Mark all read”.
            </span>
          </div>
        </div>
      )}
    </View>
  );
}
