import { useEffect, useMemo, useState } from 'react';
import { Link, useSearch } from 'wouter';
import { getToken, useMe } from '@workspace/api-client-react';
import { CATEGORIES, COUNTRIES } from '@workspace/api-spec';
import { Empty, StatusChip, Spinner, DemoTag, StockTypeFilter, countryCode } from '../components';
import {
  EmptyState,
  Kpi,
  KpiRow,
  PageHeader,
  Pager,
  TabStrip,
  TableWrap,
  ToolSelect,
  Toolbar,
  metric,
} from '../dash';
import { useI18n } from '../i18n';
import { Flash, PullModal, RestoreModal, useAdminListingPage, type AdminListing } from './AdminKit';

/**
 * AdminListings — every listing, including seed rows, with the moderation
 * toolbar the console needs to work the catalogue.
 *
 * Three kinds of control live on this page and they are NOT the same thing:
 *
 *  1. The API's own parameters — search text, category, origin country, the
 *     "with a photo" chip, page, page size AND the admin-only
 *     `moderation=visible|pulled` state. Those go to the server, so the row count
 *     on screen is the server's count.
 *  2. Page-scoped facets — source (platform / demo), status, stock type and the
 *     sort order. GET /api/admin/listings accepts no such parameter, so these
 *     narrow and re-order the rows of the page the server returned. They never
 *     touch the total, and the header says "showing N of M" while they are on so
 *     nobody reads a page count as a catalogue count.
 *  3. The moderation queue itself: the tab counts and the "Pulled" KPI are three
 *     more requests that carry the SAME server filters plus their own moderation
 *     value, so a tab's figure is exactly what clicking it returns.
 *
 * Provenance is never inferred here — it is the `dataSource` the API returns,
 * rendered as a Demo tag or a Real pill on every single row.
 */

type SortKey = 'newest' | 'oldest' | 'priceHigh' | 'priceLow' | 'stock';
type ModerationKey = '' | 'visible' | 'pulled';

function money(currency: string, value: number, locale: string): string {
  return `${currency === 'USD' ? '$' : `${currency} `}${value.toLocaleString(locale, { maximumFractionDigits: 2 })}`;
}

function day(iso: string, locale: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(locale);
}

function moderationFromUrl(): ModerationKey {
  const raw = new URLSearchParams(window.location.search).get('moderation');
  return raw === 'pulled' || raw === 'visible' ? raw : '';
}

function AdminOnly({ signedIn, role }: { signedIn: boolean; role?: string }) {
  const { t } = useI18n();
  return (
    <>
      <PageHeader title={t('admin.common.adminsOnly')} sub={t('admin.listings.adminOnlySub')} />
      <Empty title={signedIn ? t('admin.common.notAdmin') : t('admin.common.notSignedIn')}>
        {signedIn
          ? t('admin.listings.signedInBody', { role: role ?? t('admin.common.nonAdminRole') })
          : t('admin.listings.signedOutBody')}
        <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
          {signedIn ? (
            <Link href="/explore" className="btn btn-sm btn-grey">{t('admin.listings.browsePublic')}</Link>
          ) : (
            <Link href="/sign-in?next=%2Fadmin%2Flistings" className="btn btn-sm btn-primary">{t('action.signIn')}</Link>
          )}
        </div>
      </Empty>
    </>
  );
}

export default function AdminListings() {
  const { t, locale } = useI18n();
  const me = useMe();
  const signedIn = !!getToken();
  const isAdmin = me.data?.role === 'admin';

  // Server parameters (the API's own query contract).
  const [q, setQ] = useState('');
  const [appliedQ, setAppliedQ] = useState('');
  const [category, setCategory] = useState('');
  const [country, setCountry] = useState('');
  const [hasImageOnly, setHasImageOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  // The admin-only moderation filter, deep-linkable: ?moderation=pulled is the
  // queue a KPI tile and the sidebar link land on.
  const [moderation, setModeration] = useState<ModerationKey>(() => moderationFromUrl());

  // Page-scoped facets (see the header comment).
  const [source, setSource] = useState('');
  const [status, setStatus] = useState('');
  const [listingType, setListingType] = useState('');
  const [sort, setSort] = useState<SortKey>('newest');

  const [msg, setMsg] = useState<string | null>(null);
  const [pulling, setPulling] = useState<AdminListing | null>(null);
  const [restoring, setRestoring] = useState<AdminListing | null>(null);

  // The URL is the entry point (a link can carry the queue); a tab click also
  // writes it back, so a refresh or a bookmark keeps the view.
  const search = useSearch();
  useEffect(() => {
    const next = moderationFromUrl();
    setModeration((cur) => (cur === next ? cur : next));
  }, [search]);

  const server = useMemo(
    () => ({
      q: appliedQ || undefined,
      category: category || undefined,
      country: country || undefined,
      hasImage: hasImageOnly ? 1 : undefined,
      limit,
      page,
      moderation: moderation || undefined,
    }),
    [appliedQ, category, country, hasImageOnly, limit, page, moderation],
  );

  const res = useAdminListingPage(server, isAdmin);

  // The queue's own counts: same server filters, one moderation value each, so a
  // tab's number is the number of rows that tab will show.
  const countBase = useMemo(
    () => ({
      q: appliedQ || undefined,
      category: category || undefined,
      country: country || undefined,
      hasImage: hasImageOnly ? 1 : undefined,
      limit: 1,
      page: 1,
    }),
    [appliedQ, category, country, hasImageOnly],
  );
  const allCount = useAdminListingPage(countBase, isAdmin);
  const visibleCount = useAdminListingPage({ ...countBase, moderation: 'visible' }, isAdmin);
  const pulledCount = useAdminListingPage({ ...countBase, moderation: 'pulled' }, isAdmin);

  const items = useMemo(() => res.data?.items ?? [], [res.data]);
  const total = res.data?.total;
  const pages = res.data?.pages ?? 1;
  const shownPage = res.data?.page ?? page;

  /**
   * The page-scoped facets. Sorting is stable over the rows the server sent:
   * 'newest' keeps the API's own order (it returns the catalogue newest first)
   * rather than re-sorting rows we only hold a page of.
   */
  const visible = useMemo(() => {
    let rows = items;
    if (source) rows = rows.filter((p) => p.dataSource === source);
    if (status) rows = rows.filter((p) => p.status === status);
    if (listingType) rows = rows.filter((p) => p.listingType === listingType);
    if (sort === 'newest') return rows;
    const sorted = [...rows];
    if (sort === 'oldest') sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    if (sort === 'priceHigh') sorted.sort((a, b) => b.price - a.price);
    if (sort === 'priceLow') sorted.sort((a, b) => a.price - b.price);
    if (sort === 'stock') sorted.sort((a, b) => b.quantityAvailable - a.quantityAvailable);
    return sorted;
  }, [items, source, status, listingType, sort]);

  if (!signedIn) return <AdminOnly signedIn={false} />;
  if (me.isLoading) {
    return (
      <>
        <PageHeader title={t('nav.adminListings')} />
        <Spinner />
      </>
    );
  }
  if (!isAdmin) return <AdminOnly signedIn role={me.data?.role} />;

  const apply = (nextPage = 1) => { setAppliedQ(q); setPage(nextPage); };
  const clear = () => {
    setQ(''); setAppliedQ(''); setCategory(''); setListingType(''); setCountry('');
    setHasImageOnly(false); setPage(1);
    setSource(''); setStatus(''); setSort('newest'); setModeration('');
    window.history.replaceState(null, '', '/admin/listings');
  };
  const clearPageFilters = () => { setSource(''); setStatus(''); setListingType(''); setSort('newest'); };

  const setQueue = (next: ModerationKey) => {
    setModeration(next);
    setPage(1);
    const sp = new URLSearchParams(window.location.search);
    if (next) sp.set('moderation', next);
    else sp.delete('moderation');
    const qs = sp.toString();
    window.history.replaceState(null, '', `/admin/listings${qs ? `?${qs}` : ''}`);
  };

  const hasFilters = !!(appliedQ || category || country || hasImageOnly || moderation);
  const pageFiltersOn = !!(source || status || listingType || sort !== 'newest');

  // Counted over the rows the API returned on this page — never projected onto
  // the whole table (the endpoint publishes no provenance split).
  const pageDemo = items.filter((p) => p.dataSource === 'demo').length;
  const pageReal = items.length - pageDemo;

  const pageFilterTitle = t('admin.listings.statPageOnlyTitle');

  return (
    <>
      <PageHeader
        title={t('nav.adminListings')}
        sub={t('admin.listings.sub')}
        actions={
          <>
            <button className="btn btn-sm btn-grey" onClick={clear}>{t('action.clearFilters')}</button>
            <Link href="/admin/audit" className="btn btn-sm btn-ghost">{t('nav.adminAudit')}</Link>
            <Link href="/admin" className="btn btn-sm btn-ghost">{t('nav.overview')}</Link>
          </>
        }
      />

      {msg ? <Flash kind="ok">{msg}</Flash> : null}

      <KpiRow>
        <Kpi ic="📦" label={t('admin.listings.statMatching')} value={metric(total, (v) => v.toLocaleString(locale))} />
        <Kpi ic="✅" label={t('admin.listings.statReal')} value={pageReal.toLocaleString(locale)} />
        <Kpi
          ic="🧪"
          label={t('admin.listings.statSeed')}
          value={pageDemo.toLocaleString(locale)}
          hint={<DemoTag />}
        />
        <Kpi
          ic="🚫"
          label={t('admin.mod.viewPulled')}
          value={metric(pulledCount.data?.total, (v) => v.toLocaleString(locale))}
          hint={<span title={t('admin.mod.countTitle')}>{t('admin.mod.queue')}</span>}
          selected={moderation === 'pulled'}
          onClick={() => setQueue(moderation === 'pulled' ? '' : 'pulled')}
        />
        <Kpi
          ic="📄"
          label={t('dash.page')}
          value={`${shownPage.toLocaleString(locale)} / ${pages.toLocaleString(locale)}`}
        />
      </KpiRow>

      {/* The queue, one click each; the counts are the API's own totals for the
          same filters, so a tab's figure equals what that tab returns. */}
      <TabStrip
        tabs={[
          { key: '', label: t('admin.mod.viewAll'), count: allCount.data?.total },
          { key: 'visible', label: t('admin.mod.viewVisible'), count: visibleCount.data?.total },
          { key: 'pulled', label: t('admin.mod.viewPulled'), count: pulledCount.data?.total },
        ]}
        active={moderation}
        onChange={(k) => setQueue(k as ModerationKey)}
      />
      {moderation === 'pulled' ? <p className="muted" style={{ margin: '8px 0 0', fontSize: 12 }}>{t('admin.mod.queueSub')}</p> : null}

      <Toolbar>
        <input
          type="search"
          className="grow"
          placeholder={t('admin.listings.searchPlaceholder')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && apply(1)}
          aria-label={t('admin.listings.searchAria')}
        />
        <button className="btn btn-sm btn-primary" onClick={() => apply(1)}>{t('action.search')}</button>
        <span className="sep" />
        <ToolSelect
          label={t('admin.listings.colCategory')}
          value={category}
          onChange={(v) => { setCategory(v); setPage(1); }}
          options={[
            { value: '', label: t('admin.common.allCategories') },
            ...CATEGORIES.map((c) => ({ value: c, label: c })),
          ]}
        />
        <ToolSelect
          label={t('admin.listings.countryAria')}
          value={country}
          onChange={(v) => { setCountry(v); setPage(1); }}
          options={[
            { value: '', label: t('admin.listings.allOriginCountries') },
            /* The option VALUE is the stored ISO code: COUNTRIES holds display
               names, and offering the names would filter on a spelling the rows
               do not hold. An unmapped stored value stays selectable instead of
               the select silently falling back to "all". */
            ...COUNTRIES.map((c) => ({ value: countryCode(c as string), label: c })),
            ...(country && !COUNTRIES.some((c) => countryCode(c as string) === country)
              ? [{ value: country, label: country }]
              : []),
          ]}
        />
        <button
          className={`chip ${hasImageOnly ? 'on' : ''}`}
          onClick={() => { setHasImageOnly((v) => !v); setPage(1); }}
          aria-pressed={hasImageOnly}
        >
          {t('admin.listings.withPhoto')}
        </button>
        <span className="sep" />
        <span className="tl" title={pageFilterTitle}>{t('dash.filters')}</span>
        <ToolSelect
          label={t('admin.listings.colSource')}
          value={source}
          onChange={setSource}
          options={[
            { value: '', label: t('admin.suppliers.filterAll') },
            { value: 'platform', label: t('admin.common.real') },
            { value: 'demo', label: t('admin.common.demo') },
          ]}
        />
        <ToolSelect
          label={t('admin.listings.colStatus')}
          value={status}
          onChange={setStatus}
          options={[
            { value: '', label: t('admin.suppliers.filterAll') },
            { value: 'active', label: t('status.active') },
            { value: 'sold_out', label: t('status.sold_out') },
          ]}
        />
        <ToolSelect
          label={t('dash.sortBy')}
          value={sort}
          onChange={(v) => setSort(v as SortKey)}
          options={[
            { value: 'newest', label: t('dash.sortNewest') },
            { value: 'oldest', label: t('dash.sortOldest') },
            { value: 'priceHigh', label: t('dash.sortPriceHigh') },
            { value: 'priceLow', label: t('dash.sortPriceLow') },
            { value: 'stock', label: t('admin.listings.colAvailable') },
          ]}
        />
        <ToolSelect
          label={t('admin.listings.rowsPerPageAria')}
          value={String(limit)}
          onChange={(v) => { setLimit(Number(v)); setPage(1); }}
          options={[20, 50, 100].map((n) => ({ value: String(n), label: t('admin.listings.perPage', { n }) }))}
        />
        <span className="grow" />
        <span className="tl tnum">
          {typeof total === 'number' ? t('admin.listings.matching', { n: total.toLocaleString(locale) }) : '—'}
        </span>
      </Toolbar>

      <div className="stripe">
        <span>
          <b>{t('admin.common.real')}</b> {t('admin.listings.stripeRealLead')} <b>dataSource: platform</b>{t('admin.listings.stripeRealTail')}
        </span>
        <span>
          <b>{t('admin.common.demo')}</b> {t('admin.listings.stripeSeedLead')} <b>dataSource: demo</b>{t('admin.listings.stripeSeedTail')}
        </span>
        <span>{t('admin.mod.pullNote')}</span>
      </div>

      {/* Same control as the buyer and supplier views: one implementation for
          all three dashboards (owner constraint). It narrows this page. */}
      <StockTypeFilter value={listingType} onChange={setListingType} />

      {res.isLoading ? (
        <Spinner />
      ) : res.isError || !res.data ? (
        <Empty title={t('admin.listings.loadErrorTitle')}>
          {t('admin.listings.loadErrorBody')}
          <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
            <button className="btn btn-sm btn-primary" onClick={() => void res.refetch()}>{t('action.tryAgain')}</button>
          </div>
        </Empty>
      ) : items.length === 0 ? (
        <EmptyState
          icon={moderation === 'pulled' ? '✓' : '📦'}
          title={
            moderation === 'pulled' && !appliedQ && !category && !country
              ? t('admin.mod.emptyTitle')
              : hasFilters
                ? t('admin.listings.noMatchTitle')
                : t('admin.listings.emptyTitle')
          }
          body={
            moderation === 'pulled' && !appliedQ && !category && !country
              ? t('admin.mod.emptyBody')
              : hasFilters
                ? t('admin.listings.noMatchBody')
                : t('admin.listings.emptyBody')
          }
          action={hasFilters ? <button className="btn btn-sm btn-grey" onClick={clear}>{t('action.clearFilters')}</button> : undefined}
        />
      ) : (
        <>
          <div className="card">
            <div className="hd">
              <b>
                {items.length === 1
                  ? t('admin.listings.rowsOnPageOne', { n: items.length.toLocaleString(locale) })
                  : t('admin.listings.rowsOnPage', { n: items.length.toLocaleString(locale) })}
              </b>
              {pageFiltersOn && visible.length !== items.length ? (
                <span className="muted">{t('admin.common.showingOf', { shown: visible.length.toLocaleString(locale), total: items.length.toLocaleString(locale) })}</span>
              ) : null}
              <span className="muted" style={{ marginLeft: 'auto' }}>{t('admin.common.inApiOrder')}</span>
            </div>

            {visible.length === 0 ? (
              <EmptyState
                icon="🔎"
                title={t('dash.noResults')}
                body={t('dash.noResultsBody')}
                action={
                  <button className="btn btn-sm btn-grey" onClick={clearPageFilters}>{t('dash.resetView')}</button>
                }
              />
            ) : (
              <>
                <TableWrap>
                  <table>
                    <thead>
                      <tr>
                        <th>{t('admin.listings.colListing')}</th>
                        <th className="hidem">{t('admin.listings.colSupplier')}</th>
                        <th className="num">{t('admin.listings.colPrice')}</th>
                        <th className="num hidem">{t('admin.listings.colAvailable')}</th>
                        <th>{t('admin.mod.colModeration')}</th>
                        <th>{t('admin.listings.colStatus')}</th>
                        <th className="hidem">{t('admin.listings.colCreated')}</th>
                        <th className="tight" />
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((p) => (
                        <tr key={p.id} className={p.moderationStatus === 'pulled' ? 'pullrow' : undefined}>
                          <td>
                            <Link href={`/products/${p.id}`} className="cellmain">{p.name}</Link>
                            <span className="cellsub">
                              {t('admin.listings.moqLine', {
                                id: p.id,
                                moq: p.moq.toLocaleString(locale),
                                unit: p.unit,
                              })}
                              {p.verified ? ` · ${t('admin.listings.verified')}` : ''}
                              {' · '}{p.listingType}
                            </span>
                          </td>
                          <td className="hidem">
                            <Link href={`/suppliers/${p.supplierId}`}>{p.supplierName}</Link>
                            <span className="cellsub">{p.originCountry}</span>
                          </td>
                          <td className="num strong">
                            {money(p.currency, p.price, locale)}
                            <span className="cellsub">/ {p.unit}</span>
                          </td>
                          <td className="num hidem">
                            {p.quantityAvailable.toLocaleString(locale)} {p.unit}
                          </td>
                          <td>
                            {p.moderationStatus === 'pulled' ? (
                              <>
                                <span className="pill pullpill">{t('admin.mod.pulled')}</span>
                                {p.pulledReason ? <span className="pullreason">{p.pulledReason}</span> : null}
                              </>
                            ) : (
                              <span className="pill p-green">{t('admin.mod.live')}</span>
                            )}
                          </td>
                          <td>
                            <StatusChip status={p.status} />
                            <span className="cellsub">
                              {p.dataSource === 'demo' ? <DemoTag /> : t('admin.common.real')}
                            </span>
                          </td>
                          <td className="hidem muted" title={new Date(p.createdAt).toLocaleString(locale)}>
                            {day(p.createdAt, locale)}
                          </td>
                          <td className="tight">
                            <div className="rowact">
                              <Link href={`/admin/listings/${p.id}`} className="btn btn-sm btn-primary">
                                {t('admin.listings.manage')}
                              </Link>
                              {p.moderationStatus === 'pulled' ? (
                                <button className="btn btn-sm btn-grey" onClick={() => setRestoring(p)}>
                                  {t('admin.mod.restore')}
                                </button>
                              ) : (
                                <button className="btn btn-sm btn-red" onClick={() => setPulling(p)}>
                                  {t('admin.mod.pull')}
                                </button>
                              )}
                              <Link href={`/products/${p.id}`} className="btn btn-sm btn-grey">{t('dash.openDetail')}</Link>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>

                {typeof total === 'number' ? (
                  <Pager
                    page={shownPage}
                    pageSize={limit}
                    total={total}
                    onPage={(p) => setPage(p)}
                  />
                ) : null}
              </>
            )}
          </div>

          <div className="stripe" style={{ marginTop: 12 }}>
            <span>{t('admin.listings.stripeProvenance')}</span>
          </div>
        </>
      )}

      {pulling ? (
        <PullModal
          listing={pulling}
          onClose={() => setPulling(null)}
          onDone={(text) => { setPulling(null); setMsg(text); }}
        />
      ) : null}
      {restoring ? (
        <RestoreModal
          listing={restoring}
          onClose={() => setRestoring(null)}
          onDone={(text) => { setRestoring(null); setMsg(text); }}
        />
      ) : null}
    </>
  );
}
