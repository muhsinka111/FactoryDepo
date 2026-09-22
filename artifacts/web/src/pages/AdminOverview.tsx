import { Link } from 'wouter';
import type { ReactNode } from 'react';
import {
  getToken,
  useAdminDocs,
  useAdminListings,
  useAdminOverview,
  useAdminQuestions,
  useAdminRfqs,
  useCategoryCounts,
  useMe,
  usePayments,
  useTickets,
} from '@workspace/api-client-react';
import { DemoTag, Empty, Spinner, StatusChip } from '../components';
import {
  Attention,
  BarChart,
  EmptyState,
  Kpi,
  KpiRow,
  PageHeader,
  SectionCard,
  TableWrap,
  Timeline,
  metric,
} from '../dash';
import type { AttnItem, BarItem, TlItem } from '../dash';
import { useI18n } from '../i18n';

/**
 * AdminOverview — the marketplace at a glance, for administrators only.
 *
 * Every figure on this screen is a COUNT or SUM the API computed; nothing is
 * estimated, trended or period-labelled. A field the API does not return at all
 * renders '—' rather than a zero, and there is no "vs last week" anywhere
 * because the API does not compute one.
 *
 * Four things make the console navigable and operable instead of a wall of
 * numbers:
 *   · every KPI tile links to the page that owns the underlying rows where such
 *     a page exists (nothing links to a screen that is not built);
 *   · a "needs attention" strip carries the four queues that do have an
 *     endpoint, each row a real count, and collapses to one honest line when all
 *     four are zero;
 *   · a recent-activity feed assembled from real rows (newest listings, newest
 *     RFQs, newest listing questions) — each item a record with its own date;
 *   · two dependency-free bar charts over real distributions (listing
 *     provenance, listings per category).
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
  /** Admin page that owns these rows. Absent when no such page exists. */
  href?: string;
}

/** Day and timestamp renderers: an unparseable date prints '—', never "Invalid Date". */
function day(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(locale);
}

function stamp(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(locale);
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
    <>
      <PageHeader title={t('admin.common.adminsOnly')} sub={t('admin.overview.adminOnlySub')} />
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
    </>
  );
}

/** One KPI group: an .sechead heading over a row of tiles. */
function Group({ head, cells }: { head: string; cells: Cell[] }) {
  return (
    <>
      <div className="sechead">
        <h2>{head}</h2>
      </div>
      <KpiRow>
        {cells.map((c) => (
          <Kpi
            key={c.label}
            ic={c.icon}
            value={c.value}
            label={c.title ? <span title={c.title}>{c.label}</span> : c.label}
            hint={c.tag}
            href={c.href}
          />
        ))}
      </KpiRow>
    </>
  );
}

export default function AdminOverview() {
  const { t, locale } = useI18n();
  const me = useMe();
  const signedIn = !!getToken();
  const isAdmin = me.data?.role === 'admin';
  const on = { enabled: isAdmin };

  const overview = useAdminOverview(on);
  const tickets = useTickets(on);
  const payments = usePayments(on);
  const docs = useAdminDocs(on);
  const questions = useAdminQuestions(on);
  const rfqs = useAdminRfqs(on);
  const allCategories = useCategoryCounts(on);
  /** Newest listings — the same endpoint and order the listings page uses. */
  const listings = useAdminListings({ page: 1, limit: 20 }, on);
  const ov = overview.data;

  const money = (n: number | null | undefined): string =>
    metric(n, (v) => v.toLocaleString(locale, { maximumFractionDigits: 2 }));
  const nf = (n: number | null | undefined): string => metric(n, (v) => v.toLocaleString(locale));

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
      <>
        <PageHeader title={t('admin.overview.title')} />
        <Spinner />
      </>
    );
  }
  if (!isAdmin) return <AdminOnly signedIn role={me.data?.role} next="/admin" />;

  if (overview.isLoading) {
    return (
      <>
        <PageHeader title={t('admin.overview.title')} sub={t('admin.overview.subLoading')} />
        <Spinner />
      </>
    );
  }

  if (overview.isError || !ov) {
    return (
      <>
        <PageHeader title={t('admin.overview.title')} sub={t('admin.overview.subLoading')} />
        <Empty title={t('admin.overview.loadErrorTitle')}>
          {t('admin.overview.loadErrorBody')}
          <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
            <button className="btn btn-sm btn-primary" onClick={() => void overview.refetch()}>{t('action.tryAgain')}</button>
          </div>
        </Empty>
      </>
    );
  }

  const marketplace: Cell[] = [
    { icon: '👥', value: nf(ov.users), label: t('admin.overview.users') },
    { icon: '🛒', value: nf(ov.buyers), label: t('admin.overview.buyers') },
    { icon: '🚚', value: nf(ov.suppliers), label: t('admin.overview.suppliers'), href: '/admin/suppliers' },
    { icon: '📦', value: nf(ov.products), label: t('admin.overview.products'), href: '/admin/listings' },
    {
      icon: '✅',
      value: nf(ov.platformProducts),
      label: t('admin.overview.platformProducts'),
      title: t('admin.overview.platformProductsTitle'),
      href: '/admin/listings',
    },
    {
      icon: '🧪',
      value: nf(ov.demoProducts),
      label: t('admin.overview.demoProducts'),
      title: t('admin.overview.demoProductsTitle'),
      tag: <DemoTag />,
      href: '/admin/listings',
    },
  ];

  const trading: Cell[] = [
    { icon: '📄', value: nf(ov.rfqs), label: t('admin.overview.rfqs'), href: '/admin/rfqs' },
    { icon: '🏷️', value: nf(ov.quotes), label: t('admin.overview.quotes'), href: '/admin/rfqs' },
    { icon: '🤝', value: nf(ov.offers), label: t('admin.overview.offers') },
    { icon: '🔔', value: nf(ov.openOffers), label: t('admin.overview.openOffers') },
    { icon: '🧾', value: nf(ov.orders), label: t('admin.overview.orders') },
    { icon: '🚢', value: nf(ov.shipments), label: t('admin.overview.shipments'), href: '/shipments' },
  ];

  const operations: Cell[] = [
    {
      icon: '⏳',
      value: nf(ov.paymentsAwaiting),
      label: t('admin.overview.paymentsAwaiting'),
      title: t('admin.overview.paymentsAwaitingTitle'),
      href: '/admin/payments',
    },
    {
      icon: '💰',
      value: money(ov.paymentsConfirmedTotal),
      label: t('admin.overview.paymentsConfirmedTotal'),
      title: t('admin.overview.paymentsConfirmedTotalTitle'),
      href: '/admin/payments',
    },
    {
      icon: '🛡️',
      value: nf(ov.docsAwaitingReview),
      label: t('admin.overview.docsAwaitingReview'),
      href: '/admin/verification',
    },
    {
      icon: '❓',
      value: nf(ov.supportTicketsOpen),
      label: t('admin.overview.supportTicketsOpen'),
      href: '#admin-tickets',
    },
    { icon: '✉️', value: nf(ov.emailsQueued), label: t('admin.overview.emailsQueued') },
    {
      icon: '👁️',
      value: nf(ov.productViews),
      label: t('admin.overview.productViews'),
      title: t('admin.overview.productViewsTitle'),
    },
    { icon: '💬', value: nf(ov.messages), label: t('admin.overview.messages') },
    { icon: '🧵', value: nf(ov.threads), label: t('admin.overview.threads') },
  ];

  /* ---------------------------- needs attention ---------------------------- */

  const paymentsPending = payments.data ? payments.data.items.filter((p) => p.status === 'awaiting').length : undefined;
  const docsPending = docs.data ? docs.data.items.filter((d) => d.status === 'submitted').length : undefined;
  const ticketsOpen = tickets.data ? tickets.data.items.filter((tk) => tk.status === 'open').length : undefined;
  const questionsPending = questions.data
    ? questions.data.items.filter((q) => q.status === 'pending').length
    : undefined;

  // "Nothing needs attention" may only be claimed once all four queues answered.
  const attentionReady =
    paymentsPending !== undefined &&
    docsPending !== undefined &&
    ticketsOpen !== undefined &&
    questionsPending !== undefined;

  const attention: AttnItem[] = [
    { icon: '⏳', label: t('admin.overview.paymentsAwaiting'), count: paymentsPending ?? 0, href: '/admin/payments' },
    { icon: '🛡️', label: t('admin.overview.docsAwaitingReview'), count: docsPending ?? 0, href: '/admin/verification' },
    { icon: '❓', label: t('admin.overview.supportTicketsOpen'), count: ticketsOpen ?? 0, href: '#admin-tickets' },
    {
      icon: '💬',
      label: `${t('dash.pending')} · ${t('pd.faqH')}`,
      count: questionsPending ?? 0,
      href: '#admin-questions',
    },
  ];

  /* ---------------------------- recent activity --------------------------- */

  const activity: { at: string; tone: 'blue' | 'gold' | 'green' | 'red'; node: TlItem }[] = [];
  /** The feed's meta line sits under the title: `.tl .mt` is an inline span in the
   *  shared kit, so the page gives its content its own line. */
  const metaLine = (children: ReactNode) => <span style={{ display: 'block' }}>{children}</span>;
  for (const p of listings.data?.items ?? []) {
    activity.push({
      at: p.createdAt,
      tone: 'gold',
      node: {
        text: <Link href={`/products/${p.id}`}>{p.name}</Link>,
        meta: metaLine(
          <>
            {t('admin.listings.colListing')} #{p.id} · {p.supplierName} · {stamp(p.createdAt, locale)}
            {p.dataSource === 'demo' ? <> <DemoTag /></> : null}
          </>,
        ),
      },
    });
  }
  for (const r of rfqs.data?.items ?? []) {
    activity.push({
      at: r.createdAt,
      tone: 'blue',
      node: {
        text: <Link href="/admin/rfqs">{r.title}</Link>,
        meta: metaLine(
          <>
            {t('admin.overview.rfqs')} #{r.id} · {stamp(r.createdAt, locale)}
            {r.dataSource === 'demo' ? <> <DemoTag /></> : null}
          </>,
        ),
      },
    });
  }
  for (const q of questions.data?.items ?? []) {
    activity.push({
      at: q.askedAt,
      tone: 'green',
      node: {
        text: <Link href={`/products/${q.productId}`}>{q.productName}</Link>,
        meta: metaLine(
          <>
            {t('pd.faqH')} · {q.askerName} · {stamp(q.askedAt, locale)}
            {q.dataSource === 'demo' ? <> <DemoTag /></> : null}
          </>,
        ),
      },
    });
  }
  const recentActivity: TlItem[] = activity
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 8)
    .map((x) => x.node);
  const activityLoading = listings.isLoading || rfqs.isLoading || questions.isLoading;

  /* ------------------------------ distributions --------------------------- */

  const provenanceBars: BarItem[] = [
    { label: t('admin.common.real'), value: ov.platformProducts, tone: 'navy' },
    { label: t('admin.common.demo'), value: ov.demoProducts, tone: 'gold' },
  ];

  // Counts straight from the catalogue endpoint, biggest first, ten shown.
  const categoryBars: BarItem[] = [...(allCategories.data?.items ?? [])]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map((c) => ({ label: c.category, value: c.count }));

  /* --------------------------------- tables -------------------------------- */

  const ticketItems = tickets.data?.items ?? [];
  const newestTickets = ticketItems.slice(0, 8);
  const pendingQuestions = (questions.data?.items ?? []).filter((q) => q.status === 'pending').slice(0, 8);

  return (
    <>
      <PageHeader
        title={t('admin.overview.title')}
        sub={t('admin.overview.sub')}
        actions={
          <>
            <button
              className="btn btn-sm btn-grey"
              onClick={() => {
                void overview.refetch();
                void tickets.refetch();
                void payments.refetch();
                void docs.refetch();
                void questions.refetch();
                void rfqs.refetch();
                void listings.refetch();
                void allCategories.refetch();
              }}
              disabled={overview.isFetching}
            >
              {overview.isFetching ? t('action.refreshing') : t('action.refresh')}
            </button>
            <Link href="/admin/verification" className="btn btn-sm btn-ghost">{t('nav.adminVerify')}</Link>
          </>
        }
      />

      <Group head={t('admin.overview.sectionMarketplace')} cells={marketplace} />
      <Group head={t('admin.overview.sectionTrading')} cells={trading} />
      <Group head={t('admin.overview.sectionOperations')} cells={operations} />

      <div className="grid2">
        <SectionCard title={t('dash.needsAttention')}>
          {attentionReady ? (
            <Attention items={attention} />
          ) : (
            <div className="empty">{t('common.loading')}</div>
          )}
        </SectionCard>

        <SectionCard
          title={t('dash.recentActivity')}
          action={<Link href="/admin/listings">{t('dash.viewAll')}</Link>}
        >
          {activityLoading ? (
            <div className="empty">{t('common.loading')}</div>
          ) : (
            <Timeline
              items={recentActivity}
              empty={<EmptyState icon="🕓" title={t('dash.noActivity')} />}
            />
          )}
        </SectionCard>
      </div>

      <div className="grid2" style={{ marginTop: 12 }}>
        <SectionCard
          title={t('admin.overview.provenance.title')}
          action={<Link href="/admin/listings">{t('admin.overview.provenance.inspect')}</Link>}
          padded={false}
        >
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>{t('admin.overview.provenance.colSource')}</th>
                  <th className="num">{t('admin.overview.provenance.colListings')}</th>
                  <th>{t('admin.overview.provenance.colMeaning')}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><span className="pill p-green" title={t('admin.overview.provenance.realTitle')}>{t('admin.overview.provenance.real')}</span></td>
                  <td className="num strong">{nf(ov.platformProducts)}</td>
                  <td className="muted">{t('admin.overview.provenance.realMeaning')}</td>
                </tr>
                <tr>
                  <td><DemoTag /></td>
                  <td className="num strong">{nf(ov.demoProducts)}</td>
                  <td className="muted">{t('admin.overview.provenance.seedMeaning')}</td>
                </tr>
                <tr>
                  <td className="strong">{t('admin.overview.provenance.all')}</td>
                  <td className="num strong">{nf(ov.products)}</td>
                  <td className="muted">{t('admin.overview.provenance.allMeaning')}</td>
                </tr>
              </tbody>
            </table>
          </TableWrap>
          <div className="bd">
            <div className="legend" style={{ marginBottom: 7 }}>
              <span><i style={{ background: 'var(--navy)' }} />{t('admin.common.real')}</span>
              <span><i style={{ background: 'var(--gold)' }} />{t('admin.common.demo')}</span>
            </div>
            <BarChart items={provenanceBars} />
          </div>
        </SectionCard>

        <SectionCard
          title={t('admin.overview.funnel.title')}
          action={<Link href="/admin/rfqs">{t('admin.overview.funnel.allRfqs')}</Link>}
          padded={false}
        >
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>{t('admin.overview.funnel.colStage')}</th>
                  <th className="num">{t('admin.overview.funnel.colCount')}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{t('admin.overview.rfqs')}</td>
                  <td className="num strong">{nf(ov.rfqs)}</td>
                </tr>
                <tr>
                  <td>{t('admin.overview.quotes')}</td>
                  <td className="num strong">{nf(ov.quotes)}</td>
                </tr>
                <tr>
                  <td>{t('admin.overview.offers')}</td>
                  <td className="num strong">{nf(ov.offers)}</td>
                </tr>
                <tr>
                  <td>{t('admin.overview.openOffers')}</td>
                  <td className="num strong">{nf(ov.openOffers)}</td>
                </tr>
                <tr>
                  <td>{t('admin.overview.orders')}</td>
                  <td className="num strong">{nf(ov.orders)}</td>
                </tr>
                <tr>
                  <td>{t('admin.overview.shipments')}</td>
                  <td className="num strong">{nf(ov.shipments)}</td>
                </tr>
              </tbody>
            </table>
          </TableWrap>
        </SectionCard>
      </div>

      <div className="mt14">
        <SectionCard
          title={t('nav.categories')}
          action={
            allCategories.data
              ? <span className="muted">{t('dash.rowsTotal', { n: allCategories.data.total.toLocaleString(locale) })}</span>
              : null
          }
        >
          {allCategories.isLoading ? (
            <div className="empty">{t('common.loading')}</div>
          ) : categoryBars.length === 0 ? (
            <div className="muted">—</div>
          ) : (
            <BarChart items={categoryBars} />
          )}
        </SectionCard>
      </div>

      <div className="card mt14" id="admin-tickets">
        <div className="hd">
          <h2>{t('admin.overview.tickets.title')}</h2>
          <span className="muted" style={{ marginLeft: 'auto' }}>
            {tickets.data
              ? t('admin.overview.tickets.openTotal', {
                open: nf(ov.supportTicketsOpen),
                total: tickets.data.total.toLocaleString(locale),
              })
              : t('admin.overview.tickets.openOnly', { open: nf(ov.supportTicketsOpen) })}
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
          <>
            <TableWrap>
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
                        <span className="cellmain">{tk.subject}</span>
                        <span className="cellsub">
                          #{tk.id} · {tk.userId === null ? t('admin.overview.tickets.filedSignedOut') : t('admin.overview.tickets.filedByUser', { id: tk.userId })}
                        </span>
                      </td>
                      <td className="hidem">
                        <span className={`pill ${priorityPill(tk.priority)}`}>{priorityText(tk.priority)}</span>
                      </td>
                      <td><StatusChip status={tk.status} /></td>
                      <td className="muted hidem" title={stamp(tk.createdAt, locale)}>{day(tk.createdAt, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
            {ticketItems.length > newestTickets.length && (
              <div className="bd muted" style={{ borderTop: '1px solid var(--line-2)' }}>
                {t('admin.overview.tickets.showingRows', {
                  shown: newestTickets.length.toLocaleString(locale),
                  total: ticketItems.length.toLocaleString(locale),
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* The Q&A moderation queue. GET/PATCH /api/admin/questions has no page of
          its own, so the console surfaces the pending rows here and each one
          links to the listing it is about. */}
      <div className="card mt14" id="admin-questions">
        <div className="hd">
          <h2>{t('pd.faqH')}</h2>
          <span className="muted" style={{ marginLeft: 'auto' }}>
            {questions.data ? (
              <>
                {t('dash.pending')} {nf(questionsPending ?? 0)} · {t('dash.rowsTotal', { n: questions.data.total.toLocaleString(locale) })}
              </>
            ) : t('common.loading')}
          </span>
        </div>

        {questions.isLoading ? (
          <div className="empty">{t('common.loading')}</div>
        ) : questions.isError ? (
          <div className="empty">
            <b>{t('admin.overview.loadErrorTitle')}</b>
            <div className="row" style={{ justifyContent: 'center', marginTop: 10 }}>
              <button className="btn btn-sm btn-primary" onClick={() => void questions.refetch()}>{t('action.tryAgain')}</button>
            </div>
          </div>
        ) : pendingQuestions.length === 0 ? (
          <EmptyState icon="✅" title={t('dash.allClear')} />
        ) : (
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>{t('admin.growth.colQuestion')}</th>
                  <th className="hidem">{t('admin.listings.colListing')}</th>
                  <th className="hidem">{t('admin.overview.tickets.colFiled')}</th>
                  <th className="tight" />
                </tr>
              </thead>
              <tbody>
                {pendingQuestions.map((q) => (
                  <tr key={q.id}>
                    <td>
                      <span className="cellmain">{q.question}</span>
                      <span className="cellsub">
                        {q.askerName} · {t('dash.pending')}
                        {q.dataSource === 'demo' ? <> · <DemoTag /></> : null}
                      </span>
                    </td>
                    <td className="hidem">
                      <Link href={`/products/${q.productId}`}>{q.productName}</Link>
                      <span className="cellsub">#{q.productId}</span>
                    </td>
                    <td className="muted hidem" title={stamp(q.askedAt, locale)}>{day(q.askedAt, locale)}</td>
                    <td className="tight">
                      <div className="rowact">
                        <Link href={`/products/${q.productId}`} className="btn btn-sm btn-grey">{t('dash.openDetail')}</Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </div>
    </>
  );
}
