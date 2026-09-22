import { useState } from 'react';
import { Link } from 'wouter';
import { useNotifications, useMarkNotificationsRead, useMe, getToken } from '@workspace/api-client-react';
import { View, Empty, Spinner, requireAuthGate, notifTypeLabel, notifSentence } from '../components';
import { useI18n } from '../i18n';

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
 *
 * `type` and `text` are server-supplied values, not interface copy: the API
 * writes its bodies in English and stores the raw enum. Both are put through the
 * shared helpers in components.tsx — the chip becomes the localised noun for
 * that entity, and the body is re-composed in the interface language when the
 * row matches a template we know. Anything unrecognised is shown exactly as the
 * server sent it (never a raw key, never a half-translated sentence).
 */

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
  const { t, lang, locale } = useI18n();
  const me = useMe();
  const user = me.data;

  const notifs = useNotifications({ enabled: !!user });
  const markRead = useMarkNotificationsRead();
  const [actionErr, setActionErr] = useState('');

  /** Compact relative label in the interface language; exact time stays in `title`. */
  const timeAgo = (iso: string): string => {
    const ts = new Date(iso).getTime();
    if (Number.isNaN(ts)) return '—';
    const secs = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (secs < 45) return t('notes.justNow');
    const mins = Math.floor(secs / 60);
    if (mins < 60) return t('notes.minutesAgo', { n: mins });
    const hours = Math.floor(mins / 60);
    if (hours < 24) return t('notes.hoursAgo', { n: hours });
    const days = Math.floor(hours / 24);
    if (days < 7) return t('notes.daysAgo', { n: days });
    return new Date(ts).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
  };

  if (me.isLoading) {
    return (
      <View title={t('notes.title')}>
        <Spinner />
      </View>
    );
  }

  if (!user) {
    return (
      <View title={t('notes.title')} sub={t('notes.signInSub')}>
        <Empty title={t('notes.notSignedIn')}>
          {t('notes.notSignedInBody')}
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Link href="/sign-in?next=%2Fnotifications" className="btn btn-sm btn-primary">{t('action.signIn')}</Link>
            <Link href="/sign-up?next=%2Fnotifications" className="btn btn-sm btn-ghost">{t('action.createAccount')}</Link>
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
      setActionErr(errMessage(e, t('notes.errMark')));
    }
  };

  return (
    <View
      title={t('notes.title')}
      sub={t('notes.sub')}
      actions={
        <div className="row">
          <button
            className="btn btn-sm btn-grey"
            onClick={() => void notifs.refetch()}
            disabled={notifs.isFetching}
          >
            {notifs.isFetching ? t('action.refreshing') : t('action.refresh')}
          </button>
          <button
            className="btn btn-sm btn-primary"
            onClick={() => void markAll()}
            disabled={markRead.isPending || unread === 0}
            title={unread === 0 ? t('notes.nothingUnread') : t('notes.markAllTitle', { n: unread })}
          >
            {markRead.isPending ? t('notes.marking') : t('notes.markAll')}
          </button>
        </div>
      }
    >
      {actionErr && <p className="errtext" style={{ marginTop: -4, marginBottom: 10 }}>{actionErr}</p>}

      {notifs.isLoading ? (
        <Spinner />
      ) : notifs.isError ? (
        <Empty title={t('notes.loadErrorTitle')}>
          {t('notes.loadErrorBody')}
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <button className="btn btn-sm btn-primary" onClick={() => void notifs.refetch()} disabled={notifs.isFetching}>
              {notifs.isFetching ? t('notes.trying') : t('action.tryAgain')}
            </button>
          </div>
        </Empty>
      ) : items.length === 0 ? (
        <Empty title={t('notes.emptyTitle')}>
          {t('notes.emptyBody')}
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Link href="/explore" className="btn btn-sm btn-primary">{t('notes.browse')}</Link>
            <Link href="/orders" className="btn btn-sm btn-ghost">{t('notes.myOrders')}</Link>
          </div>
        </Empty>
      ) : (
        <div className="card">
          <div className="hd">
            <b>{t('notes.count', { n: total.toLocaleString(locale) })}</b>
            <span className={unread > 0 ? 'pill p-blue' : 'pill p-grey'}>
              {unread > 0 ? t('notes.unreadCount', { n: unread.toLocaleString(locale) }) : t('notes.allRead')}
            </span>
          </div>
          <div>
            {items.map((n) => {
              const href = resolveLink(n.link);
              const typeLabel = notifTypeLabel(t, lang, n.type);
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
                      {!n.read && <span className="pill p-blue">{t('notes.unreadLabel')}</span>}
                      {typeLabel && <span className="pill p-grey">{typeLabel}</span>}
                    </div>
                    <div className={n.read ? undefined : 'strong'}>{notifSentence(t, lang, n)}</div>
                    <div className="muted" title={new Date(n.createdAt).toLocaleString(locale)}>
                      {timeAgo(n.createdAt)}
                    </div>
                  </div>
                  {href && (
                    <Link href={href} className="btn btn-sm btn-grey">{t('notes.open')}</Link>
                  )}
                </div>
              );
            })}
          </div>
          <div className="bd" style={{ paddingTop: 9, paddingBottom: 9 }}>
            <span className="muted">
              {t('notes.footnote')}
            </span>
          </div>
        </div>
      )}
    </View>
  );
}
