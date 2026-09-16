import { useMemo, useState } from 'react';
import { useSuppliers } from '@workspace/api-client-react';
import { View, SupplierCard, Empty, DemoTag } from '../components';

/** A figure we may only show when the API actually supplies it. */
function metric(value: number | null | undefined): string {
  return value === null || value === undefined || value <= 0 ? '—' : String(value);
}

function rate(value: number | null | undefined): string {
  return value === null || value === undefined || value <= 0 ? '—' : `${value.toFixed(1)}%`;
}

/** Honest loading state — the shared `<Spinner />` has no styling in the sheet. */
function Loading() {
  return (
    <View title="Loading…" sub="Fetching the supplier directory">
      <div className="card">
        <div className="empty">Fetching the supplier directory…</div>
      </div>
    </View>
  );
}

/** Directory-wide totals, computed from the rows we actually received. */
function Totals({ items }: { items: { verifiedLevel: number; rating: number; inspectionsCount: number; fulfillmentRate: number }[] }) {
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
          <div className="v">{items.length.toLocaleString()}</div>
          <div className="l">Suppliers listed</div>
        </div>
      </div>
      <div className="card stat">
        <div>
          <div className="v">{verified.toLocaleString()}</div>
          <div className="l">Verified level 2+</div>
        </div>
      </div>
      <div className="card stat">
        <div>
          <div className="v">{avgRating}</div>
          <div className="l">Average rating {rated.length < items.length ? `(${rated.length} rated)` : ''}</div>
        </div>
      </div>
      <div className="card stat">
        <div>
          <div className="v">{avgFulfilment}</div>
          <div className="l">On-time fulfilment {measured.length < items.length ? `(${measured.length} measured)` : ''}</div>
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
      title="Supplier directory"
      sub="Factories and trading houses on FactoryDepo. Verification tiers come from on-site audits and document checks."
      actions={
        items.some((s) => s.dataSource === 'demo')
          ? <span className="row" style={{ gap: 6 }}><DemoTag /><span className="muted">rows marked demo are seed data</span></span>
          : undefined
      }
    >
      {res.isLoading ? (
        <Loading />
      ) : res.error ? (
        <Empty title="The directory could not be loaded">
          The supplier service did not respond. Try again in a moment.
        </Empty>
      ) : items.length === 0 ? (
        <Empty title="No suppliers listed yet">
          Supplier profiles appear here once they are onboarded and verified.
        </Empty>
      ) : (
        <>
          <Totals items={items} />

          <div className="filters">
            <input
              className="in"
              style={{ width: 240 }}
              placeholder="Company, country, city, capability…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search suppliers"
            />
            <button
              className={`chip ${verifiedOnly ? 'on' : ''}`}
              onClick={() => setVerifiedOnly((v) => !v)}
              aria-pressed={verifiedOnly}
            >
              Verified only
            </button>
            {(q || verifiedOnly) && (
              <button className="btn btn-sm btn-grey" onClick={() => { setQ(''); setVerifiedOnly(false); }}>
                Clear
              </button>
            )}
            <span className="muted" style={{ marginLeft: 'auto' }}>
              Showing {filtered.length.toLocaleString()} of {items.length.toLocaleString()}
            </span>
          </div>

          {filtered.length === 0 ? (
            <Empty title="No suppliers match that search">
              Try a shorter company name or clear the verified filter.
            </Empty>
          ) : (
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))' }}>
              {filtered.map((s) => (
                <div key={s.id}>
                  <SupplierCard s={s} />
                  <div className="row" style={{ gap: 10, padding: '5px 12px 0', flexWrap: 'wrap' }}>
                    <span className="muted">Rating {s.rating > 0 ? s.rating.toFixed(1) : '—'}</span>
                    <span className="muted">Inspections {metric(s.inspectionsCount)}</span>
                    <span className="muted">Fulfilment {rate(s.fulfillmentRate)}</span>
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
