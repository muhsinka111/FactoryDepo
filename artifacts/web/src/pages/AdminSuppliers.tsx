import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import {
  getToken,
  useMe,
  useAdminSuppliers,
  useApproveSupplier,
  useRejectSupplier,
} from '@workspace/api-client-react';
import type { AdminSupplier } from '@workspace/api-zod';
import { View, Empty, Spinner, DemoTag } from '../components';

/**
 * AdminSuppliers — the supplier attestation queue.
 *
 * The table shows the real per-status document counts the API returns for each
 * supplier (docsMissing / docsSubmitted / docsApproved / docsRejected), so an
 * attestation decision is made against facts, not a badge. Approving or
 * rejecting always goes through a confirming modal that states the consequence.
 */

interface Decision {
  supplier: AdminSupplier;
  action: 'approve' | 'reject';
}

function errText(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

function day(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

function AdminOnly({ signedIn, role }: { signedIn: boolean; role?: string }) {
  return (
    <View title="Admins only" sub="Supplier attestation is an administrator action">
      <Empty title={signedIn ? 'Your account is not an administrator' : 'You are not signed in'}>
        {signedIn
          ? `You are signed in as ${role ?? 'a non-admin role'}. The attestation endpoints accept administrator accounts only.`
          : 'Sign in with an administrator account to review suppliers.'}
        <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
          {signedIn ? (
            <Link href="/explore" className="btn btn-sm btn-grey">Back to the marketplace</Link>
          ) : (
            <Link href="/sign-in?next=%2Fadmin%2Fsuppliers" className="btn btn-sm btn-primary">Sign in</Link>
          )}
        </div>
      </Empty>
    </View>
  );
}

/** The confirming step for a deliberate attestation decision. */
function DecisionModal({
  decision,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  decision: Decision;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const s = decision.supplier;
  const approving = decision.action === 'approve';

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <h2>{approving ? 'Attest this supplier' : 'Reject this attestation'}</h2>
          <button className="x" onClick={onCancel} aria-label="Close">✕</button>
        </div>
        <div className="mb">
          <p className="strong" style={{ marginTop: 0 }}>{s.companyName}</p>
          <p className="muted" style={{ fontSize: 12 }}>
            {s.country}{s.city ? ` · ${s.city}` : ''} · supplier #{s.id} · {s.productCount.toLocaleString()} listing{s.productCount === 1 ? '' : 's'}
          </p>

          <p style={{ fontSize: 12.5, lineHeight: 1.7, margin: '10px 0' }}>
            {approving ? (
              <>
                <b>Attesting marks this supplier as confirmed by FactoryDepo.</b> The API records you
                as the attesting administrator and stamps the attestation time on the supplier row.
                Only attest a company whose own registration you have confirmed and whose documents
                you have checked.
              </>
            ) : (
              <>
                <b>Rejecting refuses the attestation.</b> No attestation time or attesting
                administrator is recorded, so the supplier is not shown as attested. The documents
                themselves are not changed by this action.
              </>
            )}
          </p>

          <div className="card">
            <div className="bd muted" style={{ fontSize: 12, lineHeight: 1.7 }}>
              Documents on file for this supplier: <b>{s.docsApproved}</b> approved ·{' '}
              <b>{s.docsSubmitted}</b> submitted · <b>{s.docsRejected}</b> rejected ·{' '}
              <b>{s.docsMissing}</b> not submitted.
              <div style={{ marginTop: 4 }}>
                Document decisions are made at the{' '}
                <Link href="/admin/verification">verification desk</Link>, not here.
              </div>
            </div>
          </div>

          {error && <div className="errtext" style={{ marginTop: 10 }}>{error}</div>}
        </div>
        <div className="mf">
          <button className="btn btn-grey" onClick={onCancel} disabled={pending}>Cancel</button>
          <button
            className={approving ? 'btn btn-primary' : 'btn btn-red'}
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? 'Working…' : approving ? 'Attest supplier' : 'Reject attestation'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminSuppliers() {
  const me = useMe();
  const signedIn = !!getToken();
  const isAdmin = me.data?.role === 'admin';

  const res = useAdminSuppliers({ enabled: isAdmin });
  const approve = useApproveSupplier();
  const reject = useRejectSupplier();

  const [decision, setDecision] = useState<Decision | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'unattested' | 'attested' | 'demo'>('all');

  const items = useMemo(() => res.data?.items ?? [], [res.data]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((s) => {
      if (filter === 'unattested' && s.attestedAt) return false;
      if (filter === 'attested' && !s.attestedAt) return false;
      if (filter === 'demo' && s.dataSource !== 'demo') return false;
      if (!needle) return true;
      return (
        s.companyName.toLowerCase().includes(needle) ||
        s.country.toLowerCase().includes(needle) ||
        (s.city ?? '').toLowerCase().includes(needle) ||
        (s.contactEmail ?? '').toLowerCase().includes(needle)
      );
    });
  }, [items, q, filter]);

  if (!signedIn) return <AdminOnly signedIn={false} />;
  if (me.isLoading) {
    return (
      <View title="Suppliers">
        <Spinner />
      </View>
    );
  }
  if (!isAdmin) return <AdminOnly signedIn role={me.data?.role} />;

  const run = async () => {
    if (!decision) return;
    setModalError(null);
    try {
      if (decision.action === 'approve') await approve.mutateAsync({ id: decision.supplier.id });
      else await reject.mutateAsync({ id: decision.supplier.id });
      setDecision(null);
    } catch (e) {
      setModalError(errText(e, 'The attestation could not be recorded — try again.'));
    }
  };

  const pending = approve.isPending || reject.isPending;

  const attested = items.filter((s) => !!s.attestedAt).length;
  const demoRows = items.filter((s) => s.dataSource === 'demo').length;
  const docsSubmitted = items.reduce((sum, s) => sum + s.docsSubmitted, 0);

  return (
    <View
      title="Suppliers"
      sub="Attest companies that registered themselves. Document counts below are the real per-status counts from the API."
      actions={
        <div className="row" style={{ gap: 6 }}>
          <Link href="/admin/sources" className="btn btn-sm btn-ghost">Supply sources</Link>
          <Link href="/admin/verification" className="btn btn-sm btn-ghost">Verification desk</Link>
        </div>
      }
    >
      {res.isLoading ? (
        <Spinner />
      ) : res.isError || !res.data ? (
        <Empty title="Could not load suppliers — try again">
          The supplier queue did not answer, so no rows and no counts are shown.
          <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
            <button className="btn btn-sm btn-primary" onClick={() => void res.refetch()}>Try again</button>
          </div>
        </Empty>
      ) : items.length === 0 ? (
        <Empty title="No suppliers yet">
          A supplier appears here after registering its own account on FactoryDepo. Administrators
          cannot create supplier rows — see <Link href="/admin/sources">supply sources</Link>.
        </Empty>
      ) : (
        <>
          <div className="grid stats">
            <div className="card stat">
              <span className="ic" aria-hidden="true">🚚</span>
              <div>
                <div className="v">{res.data.total.toLocaleString()}</div>
                <div className="l">Suppliers listed</div>
              </div>
            </div>
            <div className="card stat" title="Rows in this response carrying an attestation timestamp">
              <span className="ic" aria-hidden="true">✅</span>
              <div>
                <div className="v">{attested.toLocaleString()}</div>
                <div className="l">Attested</div>
              </div>
            </div>
            <div className="card stat">
              <span className="ic" aria-hidden="true">⏳</span>
              <div>
                <div className="v">{(items.length - attested).toLocaleString()}</div>
                <div className="l">Awaiting attestation</div>
              </div>
            </div>
            <div className="card stat" title="Sum of the per-supplier submitted counts the API returned">
              <span className="ic" aria-hidden="true">📄</span>
              <div>
                <div className="v">{docsSubmitted.toLocaleString()}</div>
                <div className="l">Documents submitted</div>
              </div>
            </div>
            <div className="card stat" title="Rows with dataSource: demo — bootstrap seed data, not real suppliers">
              <span className="ic" aria-hidden="true">🧪</span>
              <div>
                <div className="v">{demoRows.toLocaleString()}</div>
                <div className="l">Seed rows in this list</div>
              </div>
            </div>
          </div>

          <div className="filters">
            <input
              className="in"
              style={{ width: 240 }}
              placeholder="Company, country, contact email…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search suppliers"
            />
            {([
              ['all', 'All'],
              ['unattested', 'Awaiting attestation'],
              ['attested', 'Attested'],
              ['demo', 'Seed rows only'],
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
            <Empty title="No suppliers match those filters">
              Try a different filter, or clear the search box.
            </Empty>
          ) : (
            <div className="card">
              <div className="hd">
                <b>Attestation queue</b>
                <span className="muted" style={{ marginLeft: 'auto' }}>
                  Attestation records who confirmed the company and when — nothing else.
                </span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Supplier</th>
                      <th className="hidem">Contact</th>
                      <th>Source</th>
                      <th>Documents</th>
                      <th className="hidem">Listings</th>
                      <th className="hidem">Attested</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <span className="strong">{s.companyName}</span>
                          <div className="muted">
                            {s.country}{s.city ? ` · ${s.city}` : ''} · #{s.id} · rating{' '}
                            {s.rating > 0 ? s.rating.toFixed(1) : '—'} · trust{' '}
                            {s.trustScore > 0 ? s.trustScore.toFixed(0) : '—'}
                          </div>
                        </td>
                        <td className="hidem muted">{s.contactEmail ?? '—'}</td>
                        <td>
                          {s.dataSource === 'demo' ? (
                            <span className="row" style={{ gap: 4 }}>
                              <DemoTag />
                              <span className="muted">seed</span>
                            </span>
                          ) : (
                            <span className="pill p-green" title="Registered through the app (dataSource: platform)">
                              Real
                            </span>
                          )}
                        </td>
                        <td>
                          <span className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                            <span className={`pill ${s.docsApproved > 0 ? 'p-green' : 'p-grey'}`} title="Documents approved">
                              {s.docsApproved} approved
                            </span>
                            <span className={`pill ${s.docsSubmitted > 0 ? 'p-blue' : 'p-grey'}`} title="Documents submitted and awaiting review">
                              {s.docsSubmitted} submitted
                            </span>
                            <span className={`pill ${s.docsRejected > 0 ? 'p-red' : 'p-grey'}`} title="Documents rejected">
                              {s.docsRejected} rejected
                            </span>
                            <span className="pill p-grey" title="Document types not submitted yet">
                              {s.docsMissing} missing
                            </span>
                          </span>
                        </td>
                        <td className="hidem">{s.productCount.toLocaleString()}</td>
                        <td className="hidem">
                          {s.attestedAt ? (
                            <>
                              <span className="muted">{day(s.attestedAt)}</span>
                              <div className="muted">
                                {s.attestedBy === null ? 'attesting admin not recorded' : `by admin #${s.attestedBy}`}
                              </div>
                            </>
                          ) : (
                            <span className="muted">Not attested</span>
                          )}
                        </td>
                        <td>
                          <span className="row" style={{ gap: 5, justifyContent: 'flex-end' }}>
                            <button
                              className="btn btn-sm btn-primary"
                              onClick={() => { setModalError(null); setDecision({ supplier: s, action: 'approve' }); }}
                            >
                              Attest
                            </button>
                            <button
                              className="btn btn-sm btn-red"
                              onClick={() => { setModalError(null); setDecision({ supplier: s, action: 'reject' }); }}
                            >
                              Reject
                            </button>
                          </span>
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
              Verified tiers are not invented here: an attestation is a recorded administrator
              decision, and document counts come from the verification desk.
            </span>
          </div>
        </>
      )}

      {decision && (
        <DecisionModal
          decision={decision}
          pending={pending}
          error={modalError}
          onCancel={() => { if (!pending) { setDecision(null); setModalError(null); } }}
          onConfirm={() => void run()}
        />
      )}
    </View>
  );
}
