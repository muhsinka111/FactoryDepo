import { useMemo, useState } from 'react';
import { useSuppliers } from '@workspace/api-client-react';
import type { Supplier } from '@workspace/api-zod';
import { View, SupplierCard, Empty, DemoTag } from '../components';
import { Pager, Toolbar } from '../dash';
import { useI18n } from '../i18n';

/**
 * Page size for the directory.
 *
 * GET /api/suppliers answers with the whole set plus a `total` — it has no
 * `limit`/`offset` (artifacts/api-server/src/routes/suppliers.ts), so there is no
 * server-side page to ask for and this screen pages over the rows it already
 * holds. Fetching 1.6k rows is cheap; what was unusable was RENDERING them: one
 * document per visit at ~25k DOM nodes and 72,000 px tall. If the endpoint ever
 * grows real pagination, this slice is the only thing that changes.
 */
const PAGE_SIZE = 24;

/** A figure we may only show when the API actually supplies it. */
function metric(value: number | null | undefined): string {
  return value === null || value === undefined || value <= 0 ? '—' : String(value);
}

function rate(value: number | null | undefined): string {
  return value === null || value === undefined || value <= 0 ? '—' : `${value.toFixed(1)}%`;
}

/**
 * Directory-wide totals, computed from the rows we actually received — and only
 * from rows the platform can stand behind.
 *
 * A seeded `demo` row carries a seeded rating, inspection count and fulfilment
 * rate that no workflow produced (no inspection was done, no delivery was
 * measured). Averaging those in printed 4.8 stars and “97.1% on-time” as if they
 * were platform performance, so both averages and the verified count are taken
 * over non-demo rows only. With nothing measured the tile shows an em dash — never
 * a zero dressed up as a score.
 */
function Totals({ items }: { items: Supplier[] }) {
  const { t, locale } = useI18n();
  const real = items.filter((s) => s.dataSource !== 'demo');
  const verified = real.filter((s) => s.verifiedLevel >= 2).length;
  const rated = real.filter((s) => s.rating > 0);
  const measured = real.filter((s) => s.fulfillmentRate > 0);
  const avgRating = rated.length
    ? (rated.reduce((sum, s) => sum + s.rating, 0) / rated.length).toFixed(1)
    : '—';
  const avgFulfilment = measured.length
    ? `${(measured.reduce((sum, s) => sum + s.fulfillmentRate, 0) / measured.length).toFixed(1)}%`
    : '—';

  return (
    <div className="stats grid">
      <div className="card stat">
        <div>
          <div className="v">{items.length.toLocaleString(locale)}</div>
          <div className="l">{t('suppliers.totalListed')}</div>
        </div>
      </div>
      <div className="card stat">
        <div>
          <div className="v">{verified.toLocaleString(locale)}</div>
          <div className="l">{t('suppliers.totalVerified')}</div>
        </div>
      </div>
      <div className="card stat">
        <div>
          <div className="v">{avgRating}</div>
          <div className="l">
            {rated.length < real.length
              ? t('suppliers.avgRatingRated', { n: rated.length.toLocaleString(locale) })
              : t('suppliers.avgRating')}
          </div>
        </div>
      </div>
      <div className="card stat">
        <div>
          <div className="v">{avgFulfilment}</div>
          <div className="l">
            {measured.length < real.length
              ? t('suppliers.avgFulfilmentMeasured', { n: measured.length.toLocaleString(locale) })
              : t('suppliers.avgFulfilment')}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Supplier directory — the factories on the platform, with the totals that can
 * honestly be computed from the response. Nothing here is embellished: a row
 * that carries seed data is tagged and shows no numeric trust claim, and a
 * supplier with no rating or inspection on record shows an em dash, not a zero.
 */
export default function Suppliers() {
  const { t, locale } = useI18n();
  const res = useSuppliers();
  const [q, setQ] = useState('');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [page, setPage] = useState(1);

  const items = useMemo(() => res.data?.items ?? [], [res.data]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((s) => {
      if (verifiedOnly && s.verifiedLevel < 2) return false;
      if (!needle) return true;
      return (
        s.companyName.toLowerCase().includes(needle) ||
        s.country.toLowerCase().includes(needle) ||
        (s.city ?? '').toLowerCase().includes(needle) ||
        s.tags.some((t) => t.toLowerCase().includes(needle))
      );
    });
  }, [items, q, verifiedOnly]);

  // Paging is client-side over the filtered rows; a filter change always returns
  // to the first page so the reader never lands on an empty page.
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const shown = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <View
      title={t('suppliers.title')}
      sub={t('suppliers.sub')}
      actions={
        items.some((s) => s.dataSource === 'demo')
          ? <span className="row" style={{ gap: 6 }}><DemoTag /><span className="muted">{t('suppliers.demoNote')}</span></span>
          : undefined
      }
    >
      {res.isLoading ? (
        <View title={t('common.loading')} sub={t('suppliers.loadingSub')}>
          <div className="card">
            <div className="empty">{t('suppliers.loadingBody')}</div>
          </div>
        </View>
      ) : res.error ? (
        <Empty title={t('suppliers.loadErrorTitle')}>
          {t('suppliers.loadErrorBody')}
        </Empty>
      ) : items.length === 0 ? (
        <Empty title={t('suppliers.emptyTitle')}>
          {t('suppliers.emptyBody')}
        </Empty>
      ) : (
        <>
          <Totals items={items} />

          <Toolbar>
            <input
              type="search"
              className="grow"
              placeholder={t('suppliers.searchPlaceholder')}
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
              aria-label={t('suppliers.searchAria')}
            />
            <button
              className={`chip ${verifiedOnly ? 'on' : ''}`}
              onClick={() => { setVerifiedOnly((v) => !v); setPage(1); }}
              aria-pressed={verifiedOnly}
            >
              {t('suppliers.verifiedOnly')}
            </button>
            {(q || verifiedOnly) && (
              <button
                className="btn btn-sm btn-grey"
                onClick={() => { setQ(''); setVerifiedOnly(false); setPage(1); }}
              >
                {t('action.clear')}
              </button>
            )}
          </Toolbar>

          {filtered.length === 0 ? (
            <Empty title={t('suppliers.noMatchTitle')}>
              {t('suppliers.noMatchBody')}
            </Empty>
          ) : (
            <>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))' }}>
                {shown.map((s) => (
                  <div key={s.id}>
                    <SupplierCard s={s} />
                    {/* Trust figures render only for rows the platform measured.
                        A demo row is tagged on the card instead of carrying
                        seeded numbers; a real row with nothing on record shows
                        em dashes. */}
                    {s.dataSource !== 'demo' && (
                      <div className="row" style={{ gap: 10, padding: '5px 12px 0', flexWrap: 'wrap' }}>
                        <span className="muted">{t('suppliers.rating')} {s.rating > 0 ? s.rating.toFixed(1) : '—'}</span>
                        <span className="muted">{t('suppliers.inspections')} {metric(s.inspectionsCount)}</span>
                        <span className="muted">{t('suppliers.fulfilment')} {rate(s.fulfillmentRate)}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="card" style={{ marginTop: 8 }}>
                <Pager
                  page={safePage}
                  pageSize={PAGE_SIZE}
                  total={filtered.length}
                  onPage={setPage}
                  left={
                    filtered.length < items.length
                      ? <span className="tnum">{t('suppliers.showing', {
                        shown: filtered.length.toLocaleString(locale),
                        total: items.length.toLocaleString(locale),
                      })}</span>
                      : undefined
                  }
                />
              </div>
            </>
          )}
        </>
      )}
    </View>
  );
}
