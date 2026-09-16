import { useState } from 'react';
import { Link } from 'wouter';
import { getToken, useMe, useAdminListings } from '@workspace/api-client-react';
import { CATEGORIES, COUNTRIES } from '@workspace/api-spec';
import { View, Empty, StatusChip, Spinner, DemoTag } from '../components';

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

function money(currency: string, value: number): string {
  return `${currency === 'USD' ? '$' : `${currency} `}${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function day(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

function AdminOnly({ signedIn, role }: { signedIn: boolean; role?: string }) {
  return (
    <View title="Admins only" sub="Listing provenance is administrator-only information">
      <Empty title={signedIn ? 'Your account is not an administrator' : 'You are not signed in'}>
        {signedIn
          ? `You are signed in as ${role ?? 'a non-admin role'}. The provenance view is limited to administrator accounts.`
          : 'Sign in with an administrator account to inspect every listing and its source.'}
        <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
          {signedIn ? (
            <Link href="/explore" className="btn btn-sm btn-grey">Browse public stock</Link>
          ) : (
            <Link href="/sign-in?next=%2Fadmin%2Flistings" className="btn btn-sm btn-primary">Sign in</Link>
          )}
        </div>
      </Empty>
    </View>
  );
}

export default function AdminListings() {
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
      <View title="Listings">
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
      title="Listings"
      sub="Every listing on the platform, with the source the API stores for it. Filtering and paging are the server's, so these counts are the server's."
      actions={<button className="btn btn-sm btn-grey" onClick={clear}>Clear filters</button>}
    >
      <div className="stripe">
        <span>
          <b>Real</b> = created by a real supplier inside the app (<b>dataSource: platform</b>).
        </span>
        <span>
          <b>Demo</b> = bootstrap seed data (<b>dataSource: demo</b>), shown with a Demo tag and
          never presented as a real offer.
        </span>
        <span>Scraped catalogues are not kept on this platform.</span>
      </div>

      <div className="filters">
        <input
          className="in"
          style={{ width: 220 }}
          placeholder="Listing name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && apply(1)}
          aria-label="Search listings"
        />
        <button className="btn btn-sm btn-primary" onClick={() => apply(1)}>Search</button>
        <select
          value={category}
          onChange={(e) => { setCategory(e.target.value); setPage(1); }}
          aria-label="Category"
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={country}
          onChange={(e) => { setCountry(e.target.value); setPage(1); }}
          aria-label="Origin country"
        >
          <option value="">All origin countries</option>
          {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button
          className={`chip ${hasImageOnly ? 'on' : ''}`}
          onClick={() => { setHasImageOnly((v) => !v); setPage(1); }}
          aria-pressed={hasImageOnly}
        >
          With a photo only
        </button>
        <select
          value={String(limit)}
          onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
          aria-label="Rows per page"
        >
          <option value="20">20 per page</option>
          <option value="50">50 per page</option>
          <option value="100">100 per page</option>
        </select>
        <span className="muted" style={{ marginLeft: 'auto' }}>
          {typeof total === 'number' ? `${total.toLocaleString()} matching` : '—'}
        </span>
      </div>

      {res.isLoading ? (
        <Spinner />
      ) : res.isError || !res.data ? (
        <Empty title="Could not load listings — try again">
          The listing endpoint did not answer. No rows are shown, because a partial catalogue would
          misrepresent what is real.
          <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
            <button className="btn btn-sm btn-primary" onClick={() => void res.refetch()}>Try again</button>
          </div>
        </Empty>
      ) : items.length === 0 ? (
        <Empty title={hasFilters ? 'No listings match those filters' : 'No listings yet'}>
          {hasFilters
            ? 'Try a broader category, a different origin country, or clear the filters.'
            : 'Listings appear here once a supplier posts stock. Seed data appears only when the database is seeded.'}
        </Empty>
      ) : (
        <>
          <div className="grid stats">
            <div className="card stat">
              <span className="ic" aria-hidden="true">📦</span>
              <div>
                <div className="v">{typeof total === 'number' ? total.toLocaleString() : '—'}</div>
                <div className="l">Listings matching these filters</div>
              </div>
            </div>
            <div className="card stat" title="Rows on this page only — the API does not return a provenance split">
              <span className="ic" aria-hidden="true">✅</span>
              <div>
                <div className="v">{pageReal.toLocaleString()}</div>
                <div className="l">Real rows on this page</div>
              </div>
            </div>
            <div className="card stat" title="Rows on this page only — the API does not return a provenance split">
              <span className="ic" aria-hidden="true">🧪</span>
              <div>
                <div className="v">{pageDemo.toLocaleString()}</div>
                <div className="l">Seed rows on this page</div>
              </div>
            </div>
            <div className="card stat">
              <span className="ic" aria-hidden="true">📄</span>
              <div>
                <div className="v">
                  {res.data.page ?? page} / {pages}
                </div>
                <div className="l">Page of {pages === 1 ? '1 page' : `${pages} pages`}</div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="hd">
              <b>{items.length.toLocaleString()} row{items.length === 1 ? '' : 's'} on this page</b>
              <span className="muted" style={{ marginLeft: 'auto' }}>
                In the order the API returned them
              </span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Listing</th>
                    <th className="hidem">Supplier</th>
                    <th className="hidem">Category</th>
                    <th style={{ textAlign: 'right' }}>Price</th>
                    <th style={{ textAlign: 'right' }} className="hidem">Available</th>
                    <th>Source</th>
                    <th>Status</th>
                    <th className="hidem">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <Link href={`/products/${p.id}`} className="strong">{p.name}</Link>
                        <div className="muted">
                          #{p.id} · MOQ {p.moq.toLocaleString()} {p.unit}
                          {p.verified ? ' · verified' : ''}
                        </div>
                      </td>
                      <td className="hidem">
                        <Link href={`/suppliers/${p.supplierId}`}>{p.supplierName}</Link>
                        <div className="muted">{p.originCountry}</div>
                      </td>
                      <td className="hidem muted">{p.category}</td>
                      <td style={{ textAlign: 'right' }} className="strong">
                        {money(p.currency, p.price)}
                        <div className="muted">/ {p.unit}</div>
                      </td>
                      <td style={{ textAlign: 'right' }} className="hidem">
                        {p.quantityAvailable.toLocaleString()} {p.unit}
                      </td>
                      <td>
                        {p.dataSource === 'demo' ? (
                          <span className="row" style={{ gap: 4 }}>
                            <DemoTag />
                            <span className="muted">seed</span>
                          </span>
                        ) : (
                          <span className="pill p-green" title="Posted by a real supplier through the app">
                            Real
                          </span>
                        )}
                      </td>
                      <td><StatusChip status={p.status} /></td>
                      <td className="hidem muted" title={new Date(p.createdAt).toLocaleString()}>
                        {day(p.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pages > 1 && (
              <div className="row" style={{ justifyContent: 'center', gap: 6, padding: '10px 12px', borderTop: '1px solid var(--line-2)' }}>
                <button className="btn btn-sm btn-grey" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
                <span className="muted" style={{ fontSize: 12, alignSelf: 'center' }}>
                  Page {res.data.page ?? page} of {pages}
                </span>
                <button className="btn btn-sm btn-grey" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next →</button>
              </div>
            )}
          </div>

          <div className="stripe" style={{ marginTop: 12 }}>
            <span>
              The API has no provenance filter, so the Real/Demo figures above are counted over this
              page of rows only — not over the whole matching set.
            </span>
          </div>
        </>
      )}
    </View>
  );
}
