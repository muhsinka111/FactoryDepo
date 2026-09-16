import { useMemo, useState } from 'react';
import { useSuppliers } from '@workspace/api-client-react';
import { View, SupplierCard, Empty, DemoTag } from '../components';
import { useI18n } from '../i18n';

/** A figure we may only show when the API actually supplies it. */
function metric(value: number | null | undefined): string {
  return value === null || value === undefined || value <= 0 ? '—' : String(value);
}

function rate(value: number | null | undefined): string {
  return value === null || value === undefined || value <= 0 ? '—' : `${value.toFixed(1)}%`;
}

/** Directory-wide totals, computed from the rows we actually received. */
function Totals({ items }: { items: { verifiedLevel: number; rating: number; inspectionsCount: number; fulfillmentRate: number }[] }) {
  const { t, locale } = useI18n();
  const verified = items.filter((s) => s.verifiedLevel >= 2).length;
  const rated = items.filter((s) => s.rating > 0);
  const measured = items.filter((s) => s.fulfillmentRate > 0);
  const avgRating = rated.length
    ? (rated.reduce((sum, s) => sum + s.rating, 0) / rated.length).toFixed(1)
    : '—';
  const avgFulfilment = (() => {
    return measured.length
      ? `${(measured.reduce((sum, s) => sum + s.fulfillmentRate, 0) / measured.length).toFixed(1)}%`
      : '—';
  })();

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
            {rated.length < items.length
              ? t('suppliers.avgRatingRated', { n: rated.length.toLocaleString(locale) })
              : t('suppliers.avgRating')}
          </div>
        </div>
      </div>
      <div className="card stat">
        <div>
          <div className="v">{avgFulfilment}</div>
          <div className="l">
            {measured.length < items.length
              ? t('suppliers.avgFulfilmentMeasured', { n: measured.length.toLocaleString(locale) })
              : t('suppliers.avgFulfilment')}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Supplier directory — a dense list of the factories on the platform with the
 * honest totals we can compute from the response. Nothing here is embellished:
 * a supplier with no inspections yet shows an em dash, not a zero.
 */
export default function Suppliers() {
  const { t, locale } = useI18n();
  const res = useSuppliers();
  const [q, setQ] = useState('');
  const [verifiedOnly, setVerifiedOnly] = useState(false);

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

          <div className="filters">
            <input
              className="in"
              style={{ width: 240 }}
              placeholder={t('suppliers.searchPlaceholder')}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label={t('suppliers.searchAria')}
            />
            <button
              className={`chip ${verifiedOnly ? 'on' : ''}`}
              onClick={() => setVerifiedOnly((v) => !v)}
              aria-pressed={verifiedOnly}
            >
              {t('suppliers.verifiedOnly')}
            </button>
            {(q || verifiedOnly) && (
              <button className="btn btn-sm btn-grey" onClick={() => { setQ(''); setVerifiedOnly(false); }}>
                {t('action.clear')}
              </button>
            )}
            <span className="muted" style={{ marginLeft: 'auto' }}>
              {t('suppliers.showing', {
                shown: filtered.length.toLocaleString(locale),
                total: items.length.toLocaleString(locale),
              })}
            </span>
          </div>

          {filtered.length === 0 ? (
            <Empty title={t('suppliers.noMatchTitle')}>
              {t('suppliers.noMatchBody')}
            </Empty>
          ) : (
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))' }}>
              {filtered.map((s) => (
                <div key={s.id}>
                  <SupplierCard s={s} />
                  <div className="row" style={{ gap: 10, padding: '5px 12px 0', flexWrap: 'wrap' }}>
                    <span className="muted">{t('suppliers.rating')} {s.rating > 0 ? s.rating.toFixed(1) : '—'}</span>
                    <span className="muted">{t('suppliers.inspections')} {metric(s.inspectionsCount)}</span>
                    <span className="muted">{t('suppliers.fulfilment')} {rate(s.fulfillmentRate)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </View>
  );
}
