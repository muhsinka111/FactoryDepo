import { useState } from 'react';
import { Link } from 'wouter';
import { getToken, useMe, useAdminListings } from '@workspace/api-client-react';
import { CATEGORIES, COUNTRIES } from '@workspace/api-spec';
import { View, Empty, StatusChip, Spinner, DemoTag } from '../components';
import { useI18n } from '../i18n';

/**
 * AdminListings — every listing, including seed rows.
 *
 * This screen exists to answer one question exactly: which rows are real supply
 * and which are bootstrap seed data. Provenance is never inferred here — it is
 * the `dataSource` the API returns, rendered as a Demo tag or a Real pill on
 * every single row.
 *
 * Filtering, search and paging are the API's own parameters (zProductListQuery);
 * nothing is filtered in the browser, so the counts match the server.
 */

function money(currency: string, value: number, locale: string): string {
  return `${currency === 'USD' ? '$' : `${currency} `}${value.toLocaleString(locale, { maximumFractionDigits: 2 })}`;
}

function day(iso: string, locale: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(locale);
}

function AdminOnly({ signedIn, role }: { signedIn: boolean; role?: string }) {
  const { t } = useI18n();
  return (
    <View title={t('admin.common.adminsOnly')} sub={t('admin.listings.adminOnlySub')}>
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
    </View>
  );
}

export default function AdminListings() {
  const { t, locale } = useI18n();
  const me = useMe();
  const signedIn = !!getToken();
  const isAdmin = me.data?.role === 'admin';

  const [q, setQ] = useState('');
  const [appliedQ, setAppliedQ] = useState('');
  const [category, setCategory] = useState('');
  const [country, setCountry] = useState('');
  const [hasImageOnly, setHasImageOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);

  const res = useAdminListings(
    {
      q: appliedQ || undefined,
      category: category || undefined,
      country: country || undefined,
      hasImage: hasImageOnly ? 1 : undefined,
      page,
      limit,
    },
    { enabled: isAdmin },
  );

  if (!signedIn) return <AdminOnly signedIn={false} />;
  if (me.isLoading) {
    return (
      <View title={t('nav.adminListings')}>
        <Spinner />
      </View>
    );
  }
  if (!isAdmin) return <AdminOnly signedIn role={me.data?.role} />;

  const apply = (nextPage = 1) => { setAppliedQ(q); setPage(nextPage); };
  const clear = () => {
    setQ(''); setAppliedQ(''); setCategory(''); setCountry('');
    setHasImageOnly(false); setPage(1);
  };

  const items = res.data?.items ?? [];
  const total = res.data?.total;
  const pages = res.data?.pages ?? 1;
  const hasFilters = !!(appliedQ || category || country || hasImageOnly);

  // Counted over the rows the API returned on this page — never projected onto the whole table.
  const pageDemo = items.filter((p) => p.dataSource === 'demo').length;
  const pageReal = items.length - pageDemo;

  return (
    <View
      title={t('nav.adminListings')}
      sub={t('admin.listings.sub')}
      actions={<button className="btn btn-sm btn-grey" onClick={clear}>{t('action.clearFilters')}</button>}
    >
      <div className="stripe">
        <span>
          <b>{t('admin.common.real')}</b> {t('admin.listings.stripeRealLead')} <b>dataSource: platform</b>{t('admin.listings.stripeRealTail')}
        </span>
        <span>
          <b>{t('admin.common.demo')}</b> {t('admin.listings.stripeSeedLead')} <b>dataSource: demo</b>{t('admin.listings.stripeSeedTail')}
        </span>
        <span>{t('admin.listings.stripeScraped')}</span>
      </div>

      <div className="filters">
        <input
          className="in"
          style={{ width: 220 }}
          placeholder={t('admin.listings.searchPlaceholder')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && apply(1)}
          aria-label={t('admin.listings.searchAria')}
        />
        <button className="btn btn-sm btn-primary" onClick={() => apply(1)}>{t('action.search')}</button>
        <select
          value={category}
          onChange={(e) => { setCategory(e.target.value); setPage(1); }}
          aria-label={t('admin.listings.categoryAria')}
        >
          <option value="">{t('admin.common.allCategories')}</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={country}
          onChange={(e) => { setCountry(e.target.value); setPage(1); }}
          aria-label={t('admin.listings.countryAria')}
        >
          <option value="">{t('admin.listings.allOriginCountries')}</option>
          {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button
          className={`chip ${hasImageOnly ? 'on' : ''}`}
          onClick={() => { setHasImageOnly((v) => !v); setPage(1); }}
          aria-pressed={hasImageOnly}
        >
          {t('admin.listings.withPhoto')}
        </button>
        <select
          value={String(limit)}
          onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
          aria-label={t('admin.listings.rowsPerPageAria')}
        >
          <option value="20">{t('admin.listings.perPage', { n: 20 })}</option>
          <option value="50">{t('admin.listings.perPage', { n: 50 })}</option>
          <option value="100">{t('admin.listings.perPage', { n: 100 })}</option>
        </select>
        <span className="muted" style={{ marginLeft: 'auto' }}>
          {typeof total === 'number' ? t('admin.listings.matching', { n: total.toLocaleString(locale) }) : '—'}
        </span>
      </div>

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
        <Empty title={hasFilters ? t('admin.listings.noMatchTitle') : t('admin.listings.emptyTitle')}>
          {hasFilters
            ? t('admin.listings.noMatchBody')
            : t('admin.listings.emptyBody')}
        </Empty>
      ) : (
        <>
          <div className="grid stats">
            <div className="card stat">
              <span className="ic" aria-hidden="true">📦</span>
              <div>
                <div className="v">{typeof total === 'number' ? total.toLocaleString(locale) : '—'}</div>
                <div className="l">{t('admin.listings.statMatching')}</div>
              </div>
            </div>
            <div className="card stat" title={t('admin.listings.statPageOnlyTitle')}>
              <span className="ic" aria-hidden="true">✅</span>
              <div>
                <div className="v">{pageReal.toLocaleString(locale)}</div>
                <div className="l">{t('admin.listings.statReal')}</div>
              </div>
            </div>
            <div className="card stat" title={t('admin.listings.statPageOnlyTitle')}>
              <span className="ic" aria-hidden="true">🧪</span>
              <div>
                <div className="v">{pageDemo.toLocaleString(locale)}</div>
                <div className="l">{t('admin.listings.statSeed')}</div>
              </div>
            </div>
            <div className="card stat">
              <span className="ic" aria-hidden="true">📄</span>
              <div>
                <div className="v">
                  {(res.data.page ?? page).toLocaleString(locale)} / {pages.toLocaleString(locale)}
                </div>
                <div className="l">
                  {pages === 1
                    ? t('admin.listings.pageOf', { pages: t('admin.listings.onePage') })
                    : t('admin.listings.pageOf', { pages: t('admin.listings.nPages', { n: pages.toLocaleString(locale) }) })}
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="hd">
              <b>
                {items.length === 1
                  ? t('admin.listings.rowsOnPageOne', { n: items.length.toLocaleString(locale) })
                  : t('admin.listings.rowsOnPage', { n: items.length.toLocaleString(locale) })}
              </b>
              <span className="muted" style={{ marginLeft: 'auto' }}>
                {t('admin.common.inApiOrder')}
              </span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>{t('admin.listings.colListing')}</th>
                    <th className="hidem">{t('admin.listings.colSupplier')}</th>
                    <th className="hidem">{t('admin.listings.colCategory')}</th>
                    <th style={{ textAlign: 'right' }}>{t('admin.listings.colPrice')}</th>
                    <th style={{ textAlign: 'right' }} className="hidem">{t('admin.listings.colAvailable')}</th>
                    <th>{t('admin.listings.colSource')}</th>
                    <th>{t('admin.listings.colStatus')}</th>
                    <th className="hidem">{t('admin.listings.colCreated')}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <Link href={`/products/${p.id}`} className="strong">{p.name}</Link>
                        <div className="muted">
                          {t('admin.listings.moqLine', {
                            id: p.id,
                            moq: p.moq.toLocaleString(locale),
                            unit: p.unit,
                          })}
                          {p.verified ? ` · ${t('admin.listings.verified')}` : ''}
                        </div>
                      </td>
                      <td className="hidem">
                        <Link href={`/suppliers/${p.supplierId}`}>{p.supplierName}</Link>
                        <div className="muted">{p.originCountry}</div>
                      </td>
                      <td className="hidem muted">{p.category}</td>
                      <td style={{ textAlign: 'right' }} className="strong">
                        {money(p.currency, p.price, locale)}
                        <div className="muted">/ {p.unit}</div>
                      </td>
                      <td style={{ textAlign: 'right' }} className="hidem">
                        {p.quantityAvailable.toLocaleString(locale)} {p.unit}
                      </td>
                      <td>
                        {p.dataSource === 'demo' ? (
                          <span className="row" style={{ gap: 4 }}>
                            <DemoTag />
                            <span className="muted">{t('admin.common.seed')}</span>
                          </span>
                        ) : (
                          <span className="pill p-green" title={t('admin.listings.realTitle')}>
                            {t('admin.common.real')}
                          </span>
                        )}
                      </td>
                      <td><StatusChip status={p.status} /></td>
                      <td className="hidem muted" title={new Date(p.createdAt).toLocaleString(locale)}>
                        {day(p.createdAt, locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pages > 1 && (
              <div className="row" style={{ justifyContent: 'center', gap: 6, padding: '10px 12px', borderTop: '1px solid var(--line-2)' }}>
                <button className="btn btn-sm btn-grey" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t('admin.listings.prev')}</button>
                <span className="muted" style={{ fontSize: 12, alignSelf: 'center' }}>
                  {t('admin.listings.pageOfPages', {
                    page: (res.data.page ?? page).toLocaleString(locale),
                    pages: pages.toLocaleString(locale),
                  })}
                </span>
                <button className="btn btn-sm btn-grey" disabled={page >= pages} onClick={() => setPage(page + 1)}>{t('admin.listings.next')}</button>
              </div>
            )}
          </div>

          <div className="stripe" style={{ marginTop: 12 }}>
            <span>
              {t('admin.listings.stripeProvenance')}
            </span>
          </div>
        </>
      )}
    </View>
  );
}
