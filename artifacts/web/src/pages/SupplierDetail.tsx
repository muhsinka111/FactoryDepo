import { useRoute, useLocation, Link } from 'wouter';
import { useSupplier, useProducts, useMe } from '@workspace/api-client-react';
import { View, Empty, ProductCard, Verified, DemoTag, Stars, requireAuthGate } from '../components';

/** Metrics we can only show when the API actually computes them. */
function metric(value: number | null | undefined): string {
  return value === null || value === undefined || value <= 0 ? '—' : String(value);
}

function rate(value: number | null | undefined): string {
  return value === null || value === undefined || value <= 0 ? '—' : `${value.toFixed(1)}%`;
}

/** Honest loading state — the shared `<Spinner />` has no styling in the sheet. */
function Loading({ what }: { what: string }) {
  return (
    <View title="Loading…" sub={`Fetching ${what}`}>
      <div className="card">
        <div className="empty">Fetching {what}…</div>
      </div>
    </View>
  );
}

/**
 * Supplier profile — verification tier, the honest trading record, the
 * capability tags the supplier declared, and their live lots. A figure the
 * platform does not compute yet prints as an em dash rather than a 0.0 that
 * would read as a real score.
 */
export default function SupplierDetail({ params }: { params?: { id?: string } }) {
  const [matched, routeParams] = useRoute<{ id: string }>('/suppliers/:id');
  const id = Number(params?.id ?? (matched ? routeParams.id : NaN));
  const { data: s, isLoading, error } = useSupplier(Number.isFinite(id) ? id : undefined);
  const products = useProducts({ limit: 100 }, { enabled: !!s });
  const { data: me } = useMe();
  const [, navigate] = useLocation();

  if (isLoading) return <Loading what="this supplier profile" />;
  if (error || !s) {
    return (
      <Empty title="Supplier not found">
        <Link href="/suppliers" className="btn btn-sm btn-grey" style={{ marginTop: 10 }}>Back to directory</Link>
      </Empty>
    );
  }

  const mine = products.data?.items.filter((p) => p.supplierId === s.id) ?? [];

  return (
    <View
      title={s.companyName}
      sub={
        <span>
          {s.country}{s.city ? ` · ${s.city}` : ''} · Trading since {s.since ?? '—'} ·{' '}
          <Link href="/suppliers" style={{ fontSize: 12.5 }}>← Back to directory</Link>
        </span>
      }
      actions={
        <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {s.verifiedLevel >= 2 && <Verified label={s.verifiedLevel >= 3 ? 'Verified · level 3' : 'Verified'} />}
          {s.verifiedLevel === 1 && <span className="pill p-grey">Registered</span>}
          {s.dataSource === 'demo' && <DemoTag />}
        </span>
      }
    >
      <div className="stats grid">
        <div className="card stat">
          <div>
            <div className="v">{s.rating > 0 ? <Stars rating={s.rating} /> : '—'}</div>
            <div className="l">Buyer rating{s.rating > 0 ? ` ${s.rating.toFixed(1)} / 5` : ' — not rated yet'}</div>
          </div>
        </div>
        <div className="card stat">
          <div>
            <div className="v">{metric(s.inspectionsCount)}</div>
            <div className="l">On-site inspections</div>
          </div>
        </div>
        <div className="card stat">
          <div>
            <div className="v">{rate(s.fulfillmentRate)}</div>
            <div className="l">On-time fulfilment</div>
          </div>
        </div>
        <div className="card stat">
          <div>
            <div className="v">{s.productCount.toLocaleString()}</div>
            <div className="l">Active listings</div>
          </div>
        </div>
        <div className="card stat">
          <div>
            <div className="v">{s.verifiedLevel > 0 ? `Level ${s.verifiedLevel}` : '—'}</div>
            <div className="l">Verification tier</div>
          </div>
        </div>
        <div className="card stat">
          <div>
            <div className="v">{s.trustScore > 0 ? Math.round(s.trustScore) : '—'}</div>
            <div className="l">Trust score (0–100)</div>
          </div>
        </div>
      </div>

      <div className="cols3">
        <div className="card">
          <div className="hd"><h2>About {s.companyName}</h2></div>
          <div className="bd">
            <p style={{ margin: 0 }}>
              {s.description ?? 'This supplier has not published a company description yet.'}
            </p>
            {s.tags.length > 0 && (
              <>
                <div className="muted" style={{ margin: '12px 0 5px' }}>Declared capabilities</div>
                <div className="row" style={{ gap: 5, flexWrap: 'wrap' }}>
                  {s.tags.map((t) => <span key={t} className="pill p-grey">{t}</span>)}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="card">
          <div className="hd"><h2>Verification &amp; record</h2></div>
          <table>
            <tbody>
              <tr>
                <td className="muted">Verification tier</td>
                <td style={{ textAlign: 'right' }}>{s.verifiedLevel > 0 ? `Level ${s.verifiedLevel}` : '—'}</td>
              </tr>
              <tr>
                <td className="muted">Buyer rating</td>
                <td style={{ textAlign: 'right' }}>{s.rating > 0 ? `${s.rating.toFixed(1)} / 5` : '—'}</td>
              </tr>
              <tr>
                <td className="muted">Inspections completed</td>
                <td style={{ textAlign: 'right' }}>{metric(s.inspectionsCount)}</td>
              </tr>
              <tr>
                <td className="muted">On-time fulfilment</td>
                <td style={{ textAlign: 'right' }}>{rate(s.fulfillmentRate)}</td>
              </tr>
              <tr>
                <td className="muted">Trading since</td>
                <td style={{ textAlign: 'right' }}>{s.since ?? '—'}</td>
              </tr>
              <tr>
                <td className="muted">Active listings</td>
                <td style={{ textAlign: 'right' }}>{s.productCount.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="grid" style={{ gridTemplateColumns: '1fr' }}>
          <div className="card">
            <div className="hd"><h2>Contact</h2></div>
            <div className="bd">
              <p className="muted" style={{ margin: '0 0 10px' }}>
                Inspection reports and verification documents are shared with members after first contact.
              </p>
              <button
                className="btn btn-gold"
                style={{ width: '100%' }}
                onClick={() => {
                  if (!me) { requireAuthGate(); return; }
                  // Messaging between members is not built yet, so we send the
                  // buyer to the RFQ exchange instead of pretending to open a thread.
                  navigate('/rfqs');
                }}
              >
                Contact supplier
              </button>
              <p className="hint" style={{ textAlign: 'center' }}>
                {me ? 'Opens the RFQ exchange — the quote thread lives there.' : 'Members only · free to join'}
              </p>
            </div>
          </div>

          <div className="card">
            <div className="hd"><h2>Trade services</h2></div>
            <div className="bd grid" style={{ gridTemplateColumns: '1fr', gap: 6 }}>
              {[
                'Factory inspection before payment',
                'Laboratory testing and material analysis',
                'Container loading supervision',
                'Export documentation support',
              ].map((line) => (
                <div key={line} className="row" style={{ gap: 7, alignItems: 'flex-start' }}>
                  <span className="pill p-green">✓</span>
                  <span style={{ fontSize: 12.5 }}>{line}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="hd">
          <h2>Stock from {s.companyName}</h2>
          <span className="link muted">
            {products.isLoading ? 'Loading…' : `${mine.length} shown`}
          </span>
        </div>
        {products.isLoading ? (
          <div className="empty">Loading live lots…</div>
        ) : mine.length === 0 ? (
          <div className="empty">
            <b>No active listings shown</b>
            The API reports {s.productCount.toLocaleString()} listing{s.productCount === 1 ? '' : 's'} for this
            supplier, but none came back in the current listing view. Post a request through the RFQ exchange
            to ask about their catalogue.
          </div>
        ) : (
          <div className="bd">
            <div className="feedgrid">
              {mine.map((p) => <ProductCard key={p.id} p={p} />)}
            </div>
          </div>
        )}
      </div>
    </View>
  );
}
