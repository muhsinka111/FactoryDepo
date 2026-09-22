import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { useThreads, useThread, useSendMessage, useMe, getToken } from '@workspace/api-client-react';
import type { Thread } from '@workspace/api-zod';
import { Empty, Spinner, DemoTag, requireAuthGate, dashboardRole } from '../components';
import {
  EmptyState,
  Kpi,
  KpiRow,
  PageHeader,
  Toolbar,
  metric,
} from '../dash';
import { useI18n } from '../i18n';

/**
 * Messages — buyer ↔ supplier conversations in a two-pane inbox.
 *
 * GET /api/threads returns only the threads the caller is a party to (as the
 * buyer, or as the owning supplier profile); GET /api/threads/:id returns the
 * thread plus its messages and marks the other party's messages read. Opening a
 * thread is therefore what clears its unread badge.
 *
 * Layout: PageHeader → KPI strip (conversations / unread / messages /
 * counterparties, all counted from the returned threads) → toolbar (search) →
 * two panes: the thread list with paging on the left, the conversation and its
 * composer on the right.
 *
 * Honesty rules applied here
 *  • The API returns no message preview on the thread list, and reading a thread
 *    to fetch its last message would clear its unread state — so a row shows what
 *    the list genuinely carries: the counterparty, the lot/subject it is about,
 *    the real message count and the relative time of the last message.
 *  • 'Unread' counts conversations whose `unreadCount` is above zero; it is never
 *    inferred from anything else. A thread with no lot and no subject reads '—'.
 *  • An unparseable timestamp renders '—' rather than a plausible date.
 */

const PAGE_SIZE = 20;

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
      {/* Sticky so the counterparty, the lot it is about and its link stay in
          view while the message list scrolls. */}
      <div className="hd" style={{ position: 'sticky', top: 0, zIndex: 3, background: '#fff' }}>
        <span className="av">{initials(other)}</span>
        <div style={{ minWidth: 0 }}>
          <b>{other}</b>
          <div className="muted" title={thread.subject ?? undefined}>
            {thread.productName?.trim() || thread.subject?.trim() || t('msg.noLot')}
          </div>
        </div>
        <span className="row" style={{ gap: 6, marginLeft: 'auto', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
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
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  /**
   * The inbox shell is viewport-sized (styles.css `.chatwrap`). The dashboard
   * chrome above it — header, KPI strip, toolbar — adds about 130px, so on a wide
   * screen the pane height is trimmed to keep the composer in view. The stacked
   * mobile layout has its own `height: auto`, which must win, hence the guard.
   */
  const [wide, setWide] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 901px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 901px)');
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const list = useMemo(() => threads.data?.items ?? [], [threads.data]);

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

  const meId = user?.id ?? -1;

  /** Counters over the threads the API returned — nothing inferred. */
  const unreadThreads = useMemo(() => list.filter((x) => x.unreadCount > 0).length, [list]);
  const messageTotal = useMemo(() => list.reduce((n, x) => n + x.messageCount, 0), [list]);
  const counterparties = useMemo(
    () => new Set(list.map((x) => counterparty(x, meId))).size,
    [list, meId],
  );

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((x) =>
      counterparty(x, meId).toLowerCase().includes(needle) ||
      aboutLine(x).toLowerCase().includes(needle) ||
      `#${x.id}`.includes(needle),
    );
  }, [list, q, meId]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const pageRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const title = t('msg.title');
  const sub = isSupplier ? t('msg.subSupplier') : t('msg.subBuyer');

  if (me.isLoading) {
    return (
      <>
        <PageHeader title={title} />
        <Spinner />
      </>
    );
  }

  if (!user) {
    return (
      <>
        <PageHeader title={title} sub={t('msg.signInSub')} />
        <Empty title={t('msg.notSignedIn')}>
          {t('msg.notSignedInBody')}
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Link href="/sign-in?next=%2Fmessages" className="btn btn-sm btn-primary">{t('action.signIn')}</Link>
            <Link href="/sign-up?next=%2Fmessages" className="btn btn-sm btn-ghost">{t('action.createAccount')}</Link>
          </div>
        </Empty>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={title}
        sub={sub}
        actions={
          <div className="row" style={{ gap: 6 }}>
            <button
              className="btn btn-sm btn-grey"
              onClick={() => void threads.refetch()}
              disabled={threads.isFetching}
            >
              {threads.isFetching ? t('action.refreshing') : t('action.refresh')}
            </button>
            <Link href="/explore" className="btn btn-sm btn-gold">{t('msg.browse')}</Link>
          </div>
        }
      />

      <KpiRow>
        {/* `admin.overview.threads` is the only existing key whose copy is the
            bare noun "Conversations" — a buyer-page tile reusing an admin key's
            wording beats inventing a new key. `notes.unreadLabel` is the only
            standalone "Unread", and both counts come from the returned threads. */}
        <Kpi ic="💬" label={t('admin.overview.threads')} value={metric(list.length)} />
        <Kpi ic="🔔" label={t('notes.unreadLabel')} value={metric(unreadThreads)} />
        <Kpi ic="✉️" label={t('msg.title')} value={metric(messageTotal)} />
        <Kpi ic="🤝" label={t('myoffers.col.counterparty')} value={metric(counterparties)} />
      </KpiRow>

      <Toolbar>
        <input
          type="search"
          className="grow"
          placeholder={t('dash.searchPlaceholder')}
          aria-label={t('dash.searchPlaceholder')}
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
        />
        <span className="sep" />
        <span className="tl tnum">{t('dash.rowsTotal', { n: rows.length.toLocaleString(locale) })}</span>
        {q.trim() !== '' && (
          <button className="btn btn-sm btn-ghost" onClick={() => { setQ(''); setPage(1); }}>
            {t('dash.clearFilters')}
          </button>
        )}
        <span className="grow" />
        {threads.dataUpdatedAt > 0 && (
          <span className="tl tnum">
            {t('dash.lastUpdated')} {new Date(threads.dataUpdatedAt).toLocaleTimeString(locale)}
          </span>
        )}
      </Toolbar>

      {threads.isLoading ? (
        <Spinner />
      ) : threads.isError ? (
        <EmptyState
          icon="⚠️"
          title={t('msg.loadErrorTitle')}
          body={t('msg.loadErrorBody')}
          action={
            <button className="btn btn-sm btn-grey" onClick={() => void threads.refetch()}>
              {threads.isFetching ? t('msg.trying') : t('action.tryAgain')}
            </button>
          }
        />
      ) : list.length === 0 ? (
        <EmptyState
          icon="💬"
          title={t('msg.emptyTitle')}
          body={isSupplier ? t('msg.emptySupplier') : t('msg.emptyBuyer')}
          action={
            <div className="row" style={{ justifyContent: 'center', gap: 8 }}>
              <Link href="/explore" className="btn btn-sm btn-gold">{t('msg.browse')}</Link>
              {isSupplier && <Link href="/supplier/listings" className="btn btn-sm btn-ghost">{t('msg.myListings')}</Link>}
            </div>
          }
        />
      ) : (
        <div className="card">
          <div
            className="chatwrap"
            style={wide ? { height: 'calc(100vh - 330px)', minHeight: 420 } : undefined}
          >
            <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, borderRight: '1px solid var(--line)' }}>
              <div className="threads" style={{ flex: 1, minHeight: 0, borderRight: 'none' }}>
                {pageRows.length === 0 ? (
                  <div className="empty" style={{ margin: '20px 10px', fontSize: 12.5 }}>
                    <b>{t('dash.noResults')}</b>
                    {t('dash.noResultsBody')}
                  </div>
                ) : (
                  pageRows.map((thread) => {
                    const last = thread.lastMessageAt;
                    const other = counterparty(thread, meId);
                    return (
                      <button
                        key={thread.id}
                        className={`thread ${selectedId === thread.id ? 'on' : ''}`}
                        onClick={() => setSelectedId(thread.id)}
                        aria-current={selectedId === thread.id}
                      >
                        <span className="av">{initials(other)}</span>
                        <span className="t">
                          <b>{other}</b>
                          <span title={aboutLine(thread)}>{aboutLine(thread)}</span>
                          <span>
                            {thread.messageCount === 0
                              ? t('msg.noMessagesYet')
                              : `${t('msg.count', { n: thread.messageCount.toLocaleString(locale) })} · ${last ? timeAgo(last) : '—'}`}
                          </span>
                        </span>
                        {thread.unreadCount > 0 && (
                          <span className="row" style={{ gap: 4, flex: 'none' }}>
                            <span
                              style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--red)' }}
                              aria-hidden="true"
                            />
                            <span className="pill p-red">{thread.unreadCount}</span>
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
              {pages > 1 && (
                <div className="pager" style={{ padding: '6px 8px', fontSize: 11.5 }}>
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    aria-label={t('dash.prev')}
                    onClick={() => setPage(safePage - 1)}
                  >
                    ‹
                  </button>
                  <span className="tnum" style={{ margin: '0 auto' }}>
                    {safePage} / {pages}
                  </span>
                  <button
                    type="button"
                    disabled={safePage >= pages}
                    aria-label={t('dash.next')}
                    onClick={() => setPage(safePage + 1)}
                  >
                    ›
                  </button>
                </div>
              )}
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
      )}
    </>
  );
}
