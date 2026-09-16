import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { getToken, useMe, useAdminRfqs } from '@workspace/api-client-react';
import { View, Empty, StatusChip, Spinner } from '../components';

/**
 * AdminRfqs — every request for quotation on the platform, in one dense table.
 *
 * The buyer is shown as the id the API returns (`zRfq` carries `buyerId`, not a
 * name), and a missing deadline is an em dash rather than a guess.
 */

type Filter = 'all' | 'open' | 'quoted' | 'closed';

function day(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

function AdminOnly({ signedIn, role }: { signedIn: boolean; role?: string }) {
  return (
    <View title="Admins only" sub="The request queue is administrator-only">
      <Empty title={signedIn ? 'Your account is not an administrator' : 'You are not signed in'}>
        {signedIn
          ? `You are signed in as ${role ?? 'a non-admin role'}. Every request on the platform is visible to administrator accounts only.`
          : 'Sign in with an administrator account to see every request.'}
        <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
          {signedIn ? (
            <Link href="/explore" className="btn btn-sm btn-grey">Back to the marketplace</Link>
          ) : (
            <Link href="/sign-in?next=%2Fadmin%2Frfqs" className="btn btn-sm btn-primary">Sign in</Link>
          )}
        </div>
      </Empty>
    </View>
  );
}

export default function AdminRfqs() {
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
      <View title="Requests for quotation">
        <Spinner />
      </View>
    );
  }
  if (!isAdmin) return <AdminOnly signedIn role={me.data?.role} />;

  const quotes = items.reduce((sum, r) => sum + r.quoteCount, 0);

  return (
    <View
      title="Requests for quotation"
      sub="Every request posted on the platform, with the quote count the API has recorded against it."
    >
      {res.isLoading ? (
        <Spinner />
      ) : res.isError || !res.data ? (
        <Empty title="Could not load requests — try again">
          The request queue did not answer, so no rows and no counts are shown.
          <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
            <button className="btn btn-sm btn-primary" onClick={() => void res.refetch()}>Try again</button>
          </div>
        </Empty>
      ) : items.length === 0 ? (
        <Empty title="No requests yet">
          Requests appear here as soon as a buyer posts one. The API returns the whole exchange
          without a paging parameter.
        </Empty>
      ) : (
        <>
          <div className="grid stats">
            <div className="card stat">
              <span className="ic" aria-hidden="true">📄</span>
              <div>
                <div className="v">{res.data.total.toLocaleString()}</div>
                <div className="l">Requests total</div>
              </div>
            </div>
            <div className="card stat">
              <span className="ic" aria-hidden="true">🟢</span>
              <div>
                <div className="v">{counts.open.toLocaleString()}</div>
                <div className="l">Open</div>
              </div>
            </div>
            <div className="card stat">
              <span className="ic" aria-hidden="true">💬</span>
              <div>
                <div className="v">{counts.quoted.toLocaleString()}</div>
                <div className="l">Quoted</div>
              </div>
            </div>
            <div className="card stat">
              <span className="ic" aria-hidden="true">📁</span>
              <div>
                <div className="v">{counts.closed.toLocaleString()}</div>
                <div className="l">Closed</div>
              </div>
            </div>
            <div className="card stat" title="Sum of the quote counts the API returned per request">
              <span className="ic" aria-hidden="true">🏷️</span>
              <div>
                <div className="v">{quotes.toLocaleString()}</div>
                <div className="l">Quotes attached</div>
              </div>
            </div>
          </div>

          <div className="filters">
            <input
              className="in"
              style={{ width: 240 }}
              placeholder="Title, category, target country…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search requests"
            />
            {([
              ['all', `All (${items.length})`],
              ['open', `Open (${counts.open})`],
              ['quoted', `Quoted (${counts.quoted})`],
              ['closed', `Closed (${counts.closed})`],
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
              Showing {filtered.length.toLocaleString()} of {items.length.toLocaleString()}
            </span>
          </div>

          {filtered.length === 0 ? (
            <Empty title="No requests match those filters">
              Try another status, or clear the search box.
            </Empty>
          ) : (
            <div className="card">
              <div className="hd">
                <b>{filtered.length.toLocaleString()} request{filtered.length === 1 ? '' : 's'}</b>
                <span className="muted" style={{ marginLeft: 'auto' }}>In the order the API returned them</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Request</th>
                      <th className="hidem">Buyer</th>
                      <th className="hidem">Category</th>
                      <th style={{ textAlign: 'right' }}>Quantity</th>
                      <th className="hidem">Deliver to</th>
                      <th style={{ textAlign: 'right' }}>Quotes</th>
                      <th>Status</th>
                      <th className="hidem">Posted</th>
                      <th className="hidem">Deadline</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <Link href={`/rfqs/${r.id}`} className="strong">{r.title}</Link>
                          <div className="muted">#{r.id}{r.description ? ' · has a specification' : ''}</div>
                        </td>
                        <td className="hidem">
                          <span className="muted">Buyer #{r.buyerId}</span>
                          <div className="muted">buyer id only in this response</div>
                        </td>
                        <td className="hidem muted">{r.category}</td>
                        <td style={{ textAlign: 'right' }}>
                          {r.quantity.toLocaleString()} {r.unit}
                        </td>
                        <td className="hidem muted" title={r.targetCountry ?? 'No target country on this request'}>
                          {r.targetCountry ?? '—'}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {r.quoteCount > 0 ? (
                            <span className="pill p-blue">{r.quoteCount}</span>
                          ) : (
                            <span className="muted" title="No quotes recorded against this request yet">0</span>
                          )}
                        </td>
                        <td><StatusChip status={r.status} /></td>
                        <td className="hidem muted" title={new Date(r.createdAt).toLocaleString()}>
                          {day(r.createdAt)}
                        </td>
                        <td className="hidem muted" title={r.deadline ? new Date(r.deadline).toLocaleString() : 'No deadline set on this request'}>
                          {day(r.deadline)}
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
              Buyer names are not part of the admin request response — only the buyer id is returned,
              so no name is shown here.
            </span>
          </div>
        </>
      )}
    </View>
  );
}
