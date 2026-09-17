import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { getToken, useMe, useAdminRfqs } from '@workspace/api-client-react';
import { View, Empty, StatusChip, Spinner } from '../components';
import { useI18n } from '../i18n';

/**
 * AdminRfqs — every request for quotation on the platform, in one dense table.
 *
 * The buyer is shown as the id the API returns (`zRfq` carries `buyerId`, not a
 * name), and a missing deadline is an em dash rather than a guess.
 */

type Filter = 'all' | 'open' | 'quoted' | 'closed';

function day(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(locale);
}

function AdminOnly({ signedIn, role }: { signedIn: boolean; role?: string }) {
  const { t } = useI18n();
  return (
    <View title={t('admin.common.adminsOnly')} sub={t('admin.rfqs.adminOnlySub')}>
      <Empty title={signedIn ? t('admin.common.notAdmin') : t('admin.common.notSignedIn')}>
        {signedIn
          ? t('admin.rfqs.signedInBody', { role: role ?? t('admin.common.nonAdminRole') })
          : t('admin.rfqs.signedOutBody')}
        <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
          {signedIn ? (
            <Link href="/explore" className="btn btn-sm btn-grey">{t('admin.common.backToMarketplace')}</Link>
          ) : (
            <Link href="/sign-in?next=%2Fadmin%2Frfqs" className="btn btn-sm btn-primary">{t('action.signIn')}</Link>
          )}
        </div>
      </Empty>
    </View>
  );
}

export default function AdminRfqs() {
  const { t, locale } = useI18n();
  const me = useMe();
  const signedIn = !!getToken();
  const isAdmin = me.data?.role === 'admin';

  const res = useAdminRfqs({ enabled: isAdmin });
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');

  const items = useMemo(() => res.data?.items ?? [], [res.data]);

  const counts = useMemo(() => {
    const c = { open: 0, quoted: 0, closed: 0 };
    for (const r of items) {
      if (r.status === 'open') c.open += 1;
      else if (r.status === 'quoted') c.quoted += 1;
      else c.closed += 1;
    }
    return c;
  }, [items]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((r) => {
      if (filter !== 'all' && r.status !== filter) return false;
      if (!needle) return true;
      return (
        r.title.toLowerCase().includes(needle) ||
        r.category.toLowerCase().includes(needle) ||
        (r.targetCountry ?? '').toLowerCase().includes(needle)
      );
    });
  }, [items, filter, q]);

  if (!signedIn) return <AdminOnly signedIn={false} />;
  if (me.isLoading) {
    return (
      <View title={t('admin.rfqs.title')}>
        <Spinner />
      </View>
    );
  }
  if (!isAdmin) return <AdminOnly signedIn role={me.data?.role} />;

  const quotes = items.reduce((sum, r) => sum + r.quoteCount, 0);

  return (
    <View
      title={t('admin.rfqs.title')}
      sub={t('admin.rfqs.sub')}
    >
      {res.isLoading ? (
        <Spinner />
      ) : res.isError || !res.data ? (
        <Empty title={t('admin.rfqs.loadErrorTitle')}>
          {t('admin.rfqs.loadErrorBody')}
          <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
            <button className="btn btn-sm btn-primary" onClick={() => void res.refetch()}>{t('action.tryAgain')}</button>
          </div>
        </Empty>
      ) : items.length === 0 ? (
        <Empty title={t('admin.rfqs.emptyTitle')}>
          {t('admin.rfqs.emptyBody')}
        </Empty>
      ) : (
        <>
          <div className="grid stats">
            <div className="card stat">
              <span className="ic" aria-hidden="true">📄</span>
              <div>
                <div className="v">{res.data.total.toLocaleString(locale)}</div>
                <div className="l">{t('admin.rfqs.statTotal')}</div>
              </div>
            </div>
            <div className="card stat">
              <span className="ic" aria-hidden="true">🟢</span>
              <div>
                <div className="v">{counts.open.toLocaleString(locale)}</div>
                <div className="l">{t('admin.rfqs.statOpen')}</div>
              </div>
            </div>
            <div className="card stat">
              <span className="ic" aria-hidden="true">💬</span>
              <div>
                <div className="v">{counts.quoted.toLocaleString(locale)}</div>
                <div className="l">{t('admin.rfqs.statQuoted')}</div>
              </div>
            </div>
            <div className="card stat">
              <span className="ic" aria-hidden="true">📁</span>
              <div>
                <div className="v">{counts.closed.toLocaleString(locale)}</div>
                <div className="l">{t('admin.rfqs.statClosed')}</div>
              </div>
            </div>
            <div className="card stat" title={t('admin.rfqs.statQuotesTitle')}>
              <span className="ic" aria-hidden="true">🏷️</span>
              <div>
                <div className="v">{quotes.toLocaleString(locale)}</div>
                <div className="l">{t('admin.rfqs.statQuotes')}</div>
              </div>
            </div>
          </div>

          <div className="filters">
            <input
              className="in"
              style={{ width: 240 }}
              placeholder={t('admin.rfqs.searchPlaceholder')}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label={t('admin.rfqs.searchAria')}
            />
            {([
              ['all', t('admin.rfqs.filterAll', { n: items.length.toLocaleString(locale) })],
              ['open', t('admin.rfqs.filterOpen', { n: counts.open.toLocaleString(locale) })],
              ['quoted', t('admin.rfqs.filterQuoted', { n: counts.quoted.toLocaleString(locale) })],
              ['closed', t('admin.rfqs.filterClosed', { n: counts.closed.toLocaleString(locale) })],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                className={`chip ${filter === key ? 'on' : ''}`}
                onClick={() => setFilter(key)}
                aria-pressed={filter === key}
              >
                {label}
              </button>
            ))}
            <span className="muted" style={{ marginLeft: 'auto' }}>
              {t('admin.common.showingOf', {
                shown: filtered.length.toLocaleString(locale),
                total: items.length.toLocaleString(locale),
              })}
            </span>
          </div>

          {filtered.length === 0 ? (
            <Empty title={t('admin.rfqs.noMatchTitle')}>
              {t('admin.rfqs.noMatchBody')}
            </Empty>
          ) : (
            <div className="card">
              <div className="hd">
                <b>
                  {filtered.length === 1
                    ? t('admin.rfqs.requestCountOne', { n: filtered.length.toLocaleString(locale) })
                    : t('admin.rfqs.requestCount', { n: filtered.length.toLocaleString(locale) })}
                </b>
                <span className="muted" style={{ marginLeft: 'auto' }}>{t('admin.common.inApiOrder')}</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>{t('admin.rfqs.colRequest')}</th>
                      <th className="hidem">{t('admin.rfqs.colBuyer')}</th>
                      <th className="hidem">{t('admin.rfqs.colCategory')}</th>
                      <th style={{ textAlign: 'right' }}>{t('admin.rfqs.colQuantity')}</th>
                      <th className="hidem">{t('admin.rfqs.colDeliverTo')}</th>
                      <th style={{ textAlign: 'right' }}>{t('admin.rfqs.colQuotes')}</th>
                      <th>{t('admin.rfqs.colStatus')}</th>
                      <th className="hidem">{t('admin.rfqs.colPosted')}</th>
                      <th className="hidem">{t('admin.rfqs.colDeadline')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <Link href={`/rfqs/${r.id}`} className="strong">{r.title}</Link>
                          <div className="muted">#{r.id}{r.description ? ` · ${t('admin.rfqs.hasSpec')}` : ''}</div>
                        </td>
                        <td className="hidem">
                          <span className="muted">{t('admin.rfqs.buyerRef', { id: r.buyerId })}</span>
                          <div className="muted">{t('admin.rfqs.buyerIdOnly')}</div>
                        </td>
                        <td className="hidem muted">{r.category}</td>
                        <td style={{ textAlign: 'right' }}>
                          {r.quantity.toLocaleString(locale)} {r.unit}
                        </td>
                        <td className="hidem muted" title={r.targetCountry ?? t('admin.rfqs.noTargetCountry')}>
                          {r.targetCountry ?? '—'}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {r.quoteCount > 0 ? (
                            <span className="pill p-blue">{r.quoteCount.toLocaleString(locale)}</span>
                          ) : (
                            <span className="muted" title={t('admin.rfqs.noQuotesTitle')}>0</span>
                          )}
                        </td>
                        <td><StatusChip status={r.status} /></td>
                        <td className="hidem muted" title={new Date(r.createdAt).toLocaleString(locale)}>
                          {day(r.createdAt, locale)}
                        </td>
                        <td className="hidem muted" title={r.deadline ? new Date(r.deadline).toLocaleString(locale) : t('admin.rfqs.noDeadlineTitle')}>
                          {day(r.deadline, locale)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="stripe" style={{ marginTop: 12 }}>
            <span>
              {t('admin.rfqs.stripe')}
            </span>
          </div>
        </>
      )}
    </View>
  );
}
