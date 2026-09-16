import { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { useThreads, useThread, useSendMessage, useMe, getToken } from '@workspace/api-client-react';
import type { Thread } from '@workspace/api-zod';
import { View, Empty, Spinner, DemoTag, requireAuthGate, dashboardRole } from '../components';

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

/** Compact "3m ago" label. Falls back to a date, then to '—' for junk input. */
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

/** Spoken form of the other party, for the composer placeholder. */
function otherParty(t: Thread, meId: number): string {
  const name = counterparty(t, meId);
  return name === '—' ? 'the other party' : name;
}

/**
 * One conversation. Split out so `useSendMessage(threadId)` always has a real
 * thread id rather than a sentinel.
 */
function ThreadPane({ threadId, meId }: { threadId: number; meId: number }) {
  const detail = useThread(threadId);
  const send = useSendMessage(threadId);
  const [body, setBody] = useState('');
  const [err, setErr] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);

  const t = detail.data?.thread;
  const msgs = detail.data?.messages ?? [];

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
      setErr(errMessage(e, 'The message could not be sent — try again.'));
    }
  };

  if (detail.isLoading) {
    return (
      <div className="msgs">
        <Spinner />
      </div>
    );
  }

  if (detail.isError || !t) {
    return (
      <div className="msgs">
        <div className="empty">
          <b>This conversation could not be loaded</b>
          It may have been removed, or it is not open to your account — try again.
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <button className="btn btn-sm btn-primary" onClick={() => void detail.refetch()} disabled={detail.isFetching}>
              {detail.isFetching ? 'Trying…' : 'Try again'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="msgs">
      <div className="hd">
        <span className="av">{initials(counterparty(t, meId))}</span>
        <div style={{ minWidth: 0 }}>
          <b>{counterparty(t, meId)}</b>
          <div className="muted" title={t.subject ?? undefined}>
            {t.productName?.trim() || t.subject?.trim() || 'No lot attached'}
          </div>
        </div>
        <span className="row" style={{ gap: 6, marginLeft: 'auto' }}>
          {t.dataSource === 'demo' && <DemoTag />}
          {t.productId != null && (
            <Link href={`/products/${t.productId}`} className="link">View lot</Link>
          )}
        </span>
      </div>

      <div className="msglist" ref={listRef}>
        {msgs.length === 0 ? (
          <div className="empty">
            <b>No messages in this conversation yet</b>
            Write the first one below.
          </div>
        ) : (
          msgs.map((m) => (
            <div key={m.id} className={`msg ${m.senderId === meId ? 'me' : 'them'}`}>
              <div>{m.body}</div>
              <div className="tm" title={new Date(m.createdAt).toLocaleString()}>
                {m.senderId === meId ? '' : `${m.senderName} · `}
                {timeAgo(m.createdAt)}
                {m.senderId === meId && m.readAt ? ' · read' : ''}
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
            placeholder={`Message ${otherParty(t, meId)}…`}
            aria-label="Write a message"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
          />
          <button
            className="btn btn-primary"
            disabled={send.isPending || body.trim().length === 0}
            onClick={() => void submit()}
          >
            {send.isPending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Messages() {
  const me = useMe();
  const user = me.data;
  const loggedIn = !!getToken();
  const dash = dashboardRole(user?.role, loggedIn);
  const isSupplier = dash === 'supplier';

  const threads = useThreads({ enabled: !!user });
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const list = threads.data?.items ?? [];

  // Keep exactly one thread selected: the newest active one by default, and a
  // still-valid choice when the list refreshes.
  useEffect(() => {
    if (!threads.data) return;
    const rows = threads.data.items;
    if (rows.length === 0) { setSelectedId(null); return; }
    setSelectedId((cur) => (cur != null && rows.some((t) => t.id === cur) ? cur : rows[0].id));
  }, [threads.data]);

  const title = 'Messages';
  const sub = isSupplier
    ? 'Buyer enquiries on your stock. Opening a conversation marks it read.'
    : 'Your conversations with suppliers. Opening a conversation marks it read.';

  if (me.isLoading) {
    return (
      <View title={title}>
        <Spinner />
      </View>
    );
  }

  if (!user) {
    return (
      <View title="Messages" sub="Sign in to see your conversations">
        <Empty title="You are not signed in">
          Conversations are private to the two parties: sign in to read and reply.
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Link href="/sign-in?next=%2Fmessages" className="btn btn-sm btn-primary">Sign in</Link>
            <Link href="/sign-up?next=%2Fmessages" className="btn btn-sm btn-ghost">Create an account</Link>
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
        <Empty title="Conversations could not be loaded">
          The API did not return your threads — try again.
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <button className="btn btn-sm btn-primary" onClick={() => void threads.refetch()} disabled={threads.isFetching}>
              {threads.isFetching ? 'Trying…' : 'Try again'}
            </button>
          </div>
        </Empty>
      </View>
    );
  }

  if (list.length === 0) {
    return (
      <View title={title} sub={sub}>
        <Empty title="No conversations yet">
          {isSupplier
            ? 'When a buyer asks about one of your lots, the conversation appears here.'
            : 'Open a lot you are interested in and message the supplier — the conversation appears here.'}
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Link href="/explore" className="btn btn-sm btn-primary">Browse ready stock</Link>
            {isSupplier && <Link href="/supplier/listings" className="btn btn-sm btn-ghost">My listings</Link>}
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
          {threads.isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      }
    >
      <div className="card">
        <div className="chatwrap">
          <div className="threads">
            {list.map((t) => {
              const last = t.lastMessageAt;
              return (
                <button
                  key={t.id}
                  className={`thread ${selectedId === t.id ? 'on' : ''}`}
                  onClick={() => setSelectedId(t.id)}
                  aria-current={selectedId === t.id}
                >
                  <span className="av">{initials(counterparty(t, user.id))}</span>
                  <span className="t">
                    <b>{counterparty(t, user.id)}</b>
                    <span>{aboutLine(t)}</span>
                    <span>
                      {t.messageCount === 0
                        ? 'No messages yet'
                        : `${t.messageCount} message${t.messageCount === 1 ? '' : 's'} · ${last ? timeAgo(last) : '—'}`}
                    </span>
                  </span>
                  {t.unreadCount > 0 && <span className="pill p-red">{t.unreadCount}</span>}
                </button>
              );
            })}
          </div>

          {selectedId == null ? (
            <div className="msgs">
              <div className="empty" style={{ margin: 'auto' }}>
                <b>Pick a conversation</b>
                Its messages appear here.
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
