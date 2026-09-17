import { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { useThreads, useThread, useSendMessage, useMe, getToken } from '@workspace/api-client-react';
import type { Thread } from '@workspace/api-zod';
import { View, Empty, Spinner, DemoTag, requireAuthGate, dashboardRole } from '../components';
import { useI18n } from '../i18n';

/**
 * Messages — buyer ↔ supplier conversations in a two-pane chat.
 *
 * GET /api/threads returns only the threads the caller is a party to (as the
 * buyer, or as the owning supplier profile); GET /api/threads/:id returns the
 * thread plus its messages and marks the other party's messages read. Opening a
 * thread is therefore what clears its unread badge.
 *
 * The API returns no message preview text on the list, so a row shows the lot it
 * is about and its real message count instead of a fabricated snippet; a thread
 * with no lot and no subject renders '—'.
 */

function errMessage(e: unknown, fallback: string): string {
  const m = e instanceof Error ? e.message : '';
  return m && !/^Request failed \(\d+\)$/.test(m) ? m : fallback;
}

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '—';
}

/** Who the user is talking to, from their seat in the thread. */
function counterparty(t: Thread, meId: number): string {
  const name = meId === t.buyerId ? t.supplierName : t.buyerName;
  return name.trim() || '—';
}

/** The lot (or subject) a thread is about; '—' when it is about neither. */
function aboutLine(t: Thread): string {
  return t.productName?.trim() || t.subject?.trim() || '—';
}

/**
 * One conversation. Split out so `useSendMessage(threadId)` always has a real
 * thread id rather than a sentinel.
 */
function ThreadPane({ threadId, meId }: { threadId: number; meId: number }) {
  const { t, locale } = useI18n();
  const detail = useThread(threadId);
  const send = useSendMessage(threadId);
  const [body, setBody] = useState('');
  const [err, setErr] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);

  const thread = detail.data?.thread;
  const msgs = detail.data?.messages ?? [];

  /** Compact "5m ago" label, in the interface language. */
  const timeAgo = (iso: string): string => {
    const ts = new Date(iso).getTime();
    if (Number.isNaN(ts)) return '—';
    const secs = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (secs < 45) return t('msg.justNow');
    const mins = Math.floor(secs / 60);
    if (mins < 60) return t('msg.minutesAgo', { n: mins });
    const hours = Math.floor(mins / 60);
    if (hours < 24) return t('msg.hoursAgo', { n: hours });
    const days = Math.floor(hours / 24);
    if (days < 7) return t('msg.daysAgo', { n: days });
    return new Date(ts).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
  };

  // Opening a thread reads it: jump to the newest message once it arrives.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [detail.data]);

  const submit = async () => {
    const text = body.trim();
    if (!text || send.isPending) return;
    setErr('');
    if (!getToken()) { requireAuthGate(); return; }
    try {
      await send.mutateAsync({ body: text });
      setBody('');
    } catch (e) {
      setErr(errMessage(e, t('msg.errSend')));
    }
  };

  if (detail.isLoading) {
    return (
      <div className="msgs">
        <Spinner />
      </div>
    );
  }

  if (detail.isError || !thread) {
    return (
      <div className="msgs">
        <div className="empty">
          <b>{t('msg.threadLoadError')}</b>
          {t('msg.threadLoadErrorBody')}
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <button className="btn btn-sm btn-primary" onClick={() => void detail.refetch()} disabled={detail.isFetching}>
              {detail.isFetching ? t('msg.trying') : t('action.tryAgain')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const other = counterparty(thread, meId);
  const otherSpoken = other === '—' ? t('msg.otherParty') : other;

  return (
    <div className="msgs">
      <div className="hd">
        <span className="av">{initials(other)}</span>
        <div style={{ minWidth: 0 }}>
          <b>{other}</b>
          <div className="muted" title={thread.subject ?? undefined}>
            {thread.productName?.trim() || thread.subject?.trim() || t('msg.noLot')}
          </div>
        </div>
        <span className="row" style={{ gap: 6, marginLeft: 'auto' }}>
          {thread.dataSource === 'demo' && <DemoTag />}
          {thread.productId != null && (
            <Link href={`/products/${thread.productId}`} className="link">{t('msg.viewLot')}</Link>
          )}
        </span>
      </div>

      <div className="msglist" ref={listRef}>
        {msgs.length === 0 ? (
          <div className="empty">
            <b>{t('msg.emptyThreadTitle')}</b>
            {t('msg.emptyThreadBody')}
          </div>
        ) : (
          msgs.map((m) => (
            <div key={m.id} className={`msg ${m.senderId === meId ? 'me' : 'them'}`}>
              <div>{m.body}</div>
              <div className="tm" title={new Date(m.createdAt).toLocaleString(locale)}>
                {m.senderId === meId ? '' : `${m.senderName} · `}
                {timeAgo(m.createdAt)}
                {m.senderId === meId && m.readAt ? ` · ${t('msg.read')}` : ''}
              </div>
            </div>
          ))
        )}
      </div>

      <div>
        {err && <p className="errtext" style={{ margin: '0 9px 6px' }}>{err}</p>}
        <div className="composer">
          <input
            className="in"
            placeholder={t('msg.messagePlaceholder', { name: otherSpoken })}
            aria-label={t('msg.messageAria')}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
          />
          <button
            className="btn btn-primary"
            disabled={send.isPending || body.trim().length === 0}
            onClick={() => void submit()}
          >
            {send.isPending ? t('msg.sending') : t('msg.send')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Messages() {
  const { t, locale } = useI18n();
  const me = useMe();
  const user = me.data;
  const loggedIn = !!getToken();
  const dash = dashboardRole(user?.role, loggedIn);
  const isSupplier = dash === 'supplier';

  const threads = useThreads({ enabled: !!user });
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const list = threads.data?.items ?? [];

  /** Compact "3m ago" label, in the interface language. */
  const timeAgo = (iso: string): string => {
    const ts = new Date(iso).getTime();
    if (Number.isNaN(ts)) return '—';
    const secs = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (secs < 45) return t('msg.justNow');
    const mins = Math.floor(secs / 60);
    if (mins < 60) return t('msg.minutesAgo', { n: mins });
    const hours = Math.floor(mins / 60);
    if (hours < 24) return t('msg.hoursAgo', { n: hours });
    const days = Math.floor(hours / 24);
    if (days < 7) return t('msg.daysAgo', { n: days });
    return new Date(ts).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
  };

  // Keep exactly one thread selected: the newest active one by default, and a
  // still-valid choice when the list refreshes.
  useEffect(() => {
    if (!threads.data) return;
    const rows = threads.data.items;
    if (rows.length === 0) { setSelectedId(null); return; }
    setSelectedId((cur) => (cur != null && rows.some((x) => x.id === cur) ? cur : rows[0].id));
  }, [threads.data]);

  const title = t('msg.title');
  const sub = isSupplier ? t('msg.subSupplier') : t('msg.subBuyer');

  if (me.isLoading) {
    return (
      <View title={title}>
        <Spinner />
      </View>
    );
  }

  if (!user) {
    return (
      <View title={title} sub={t('msg.signInSub')}>
        <Empty title={t('msg.notSignedIn')}>
          {t('msg.notSignedInBody')}
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Link href="/sign-in?next=%2Fmessages" className="btn btn-sm btn-primary">{t('action.signIn')}</Link>
            <Link href="/sign-up?next=%2Fmessages" className="btn btn-sm btn-ghost">{t('action.createAccount')}</Link>
          </div>
        </Empty>
      </View>
    );
  }

  if (threads.isLoading) {
    return (
      <View title={title} sub={sub}>
        <Spinner />
      </View>
    );
  }

  if (threads.isError) {
    return (
      <View title={title} sub={sub}>
        <Empty title={t('msg.loadErrorTitle')}>
          {t('msg.loadErrorBody')}
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <button className="btn btn-sm btn-primary" onClick={() => void threads.refetch()} disabled={threads.isFetching}>
              {threads.isFetching ? t('msg.trying') : t('action.tryAgain')}
            </button>
          </div>
        </Empty>
      </View>
    );
  }

  if (list.length === 0) {
    return (
      <View title={title} sub={sub}>
        <Empty title={t('msg.emptyTitle')}>
          {isSupplier ? t('msg.emptySupplier') : t('msg.emptyBuyer')}
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Link href="/explore" className="btn btn-sm btn-primary">{t('msg.browse')}</Link>
            {isSupplier && <Link href="/supplier/listings" className="btn btn-sm btn-ghost">{t('msg.myListings')}</Link>}
          </div>
        </Empty>
      </View>
    );
  }

  return (
    <View
      title={title}
      sub={sub}
      actions={
        <button className="btn btn-sm btn-grey" onClick={() => void threads.refetch()} disabled={threads.isFetching}>
          {threads.isFetching ? t('action.refreshing') : t('action.refresh')}
        </button>
      }
    >
      <div className="card">
        <div className="chatwrap">
          <div className="threads">
            {list.map((thread) => {
              const last = thread.lastMessageAt;
              return (
                <button
                  key={thread.id}
                  className={`thread ${selectedId === thread.id ? 'on' : ''}`}
                  onClick={() => setSelectedId(thread.id)}
                  aria-current={selectedId === thread.id}
                >
                  <span className="av">{initials(counterparty(thread, user.id))}</span>
                  <span className="t">
                    <b>{counterparty(thread, user.id)}</b>
                    <span>{aboutLine(thread)}</span>
                    <span>
                      {thread.messageCount === 0
                        ? t('msg.noMessagesYet')
                        : `${t('msg.count', { n: thread.messageCount.toLocaleString(locale) })} · ${last ? timeAgo(last) : '—'}`}
                    </span>
                  </span>
                  {thread.unreadCount > 0 && <span className="pill p-red">{thread.unreadCount}</span>}
                </button>
              );
            })}
          </div>

          {selectedId == null ? (
            <div className="msgs">
              <div className="empty" style={{ margin: 'auto' }}>
                <b>{t('msg.pickTitle')}</b>
                {t('msg.pickBody')}
              </div>
            </div>
          ) : (
            <ThreadPane key={selectedId} threadId={selectedId} meId={user.id} />
          )}
        </div>
      </div>
    </View>
  );
}
