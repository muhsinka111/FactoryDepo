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
 * AdminSources — manual, consent-based supplier intake.
 *
 * This screen is the opposite of an importer. The project's data-provenance
 * policy (docs/DATA_PROVENANCE.md) removed the platform scrapers and the images
 * they downloaded, for three independent reasons: the source marketplaces
 * prohibit automated collection, their photographs are not ours to re-serve, and
 * listing companies that never agreed to be here at prices we cannot honour is
 * the exact dishonesty this marketplace exists to prevent.
 *
 * So intake is a deliberate, attributable act: a supplier registers itself, an
 * administrator confirms the company and attests it. There is no bulk import to
 * offer — and no import endpoint exists to call, even if this screen wanted one.
 */

type CheckKey = 'selfRegistered' | 'contactVerified' | 'detailsMatch' | 'notImported';

const CHECKS: { key: CheckKey; label: string }[] = [
  { key: 'selfRegistered', label: 'This company registered its own account on FactoryDepo — nobody added it on its behalf.' },
  { key: 'contactVerified', label: 'I confirmed the contact email on the account reaches the company itself.' },
  { key: 'detailsMatch', label: 'The company name, country and city match the company’s own registration documents.' },
  { key: 'notImported', label: 'This company was not lifted from a third-party directory, marketplace listing or scraped dataset.' },
];

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
    <View title="Admins only" sub="Supplier intake is an administrator action">
      <Empty title={signedIn ? 'Your account is not an administrator' : 'You are not signed in'}>
        {signedIn
          ? `You are signed in as ${role ?? 'a non-admin role'}. Only administrator accounts can attest a supplier.`
          : 'Sign in with an administrator account to review supplier intake.'}
        <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
          {signedIn ? (
            <Link href="/explore" className="btn btn-sm btn-grey">Back to the marketplace</Link>
          ) : (
            <Link href="/sign-in?next=%2Fadmin%2Fsources" className="btn btn-sm btn-primary">Sign in</Link>
          )}
        </div>
      </Empty>
    </View>
  );
}

function AttestModal({
  supplier,
  action,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  supplier: AdminSupplier;
  action: 'attest' | 'reject';
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const attesting = action === 'attest';
  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <h2>{attesting ? 'Attest this supplier' : 'Reject this attestation'}</h2>
          <button className="x" onClick={onCancel} aria-label="Close">✕</button>
        </div>
        <div className="mb">
          <p className="strong" style={{ marginTop: 0 }}>{supplier.companyName}</p>
          <p className="muted" style={{ fontSize: 12 }}>
            {supplier.country}{supplier.city ? ` · ${supplier.city}` : ''} · supplier #{supplier.id} ·{' '}
            {supplier.contactEmail ?? 'no contact email on record'}
          </p>

          <p style={{ fontSize: 12.5, lineHeight: 1.7, margin: '10px 0' }}>
            {attesting ? (
              <>
                <b>Attesting confirms that FactoryDepo has checked this company.</b> The API records
                you as the attesting administrator and stores the attestation time on the supplier
                row, so the decision is attributable. Attest only a company that registered itself and
                whose documents you have reviewed.
              </>
            ) : (
              <>
                <b>Rejecting refuses the attestation.</b> No attestation time or attesting
                administrator is recorded, so this company is not shown as attested. Its account and
                documents are untouched.
              </>
            )}
          </p>

          <div className="card">
            <div className="bd muted" style={{ fontSize: 12, lineHeight: 1.7 }}>
              Documents on file: <b>{supplier.docsApproved}</b> approved ·{' '}
              <b>{supplier.docsSubmitted}</b> submitted · <b>{supplier.docsRejected}</b> rejected ·{' '}
              <b>{supplier.docsMissing}</b> not submitted.
              <div style={{ marginTop: 4 }}>
                This action does not change any document — review them at the{' '}
                <Link href="/admin/verification">verification desk</Link>.
              </div>
            </div>
          </div>

          <p className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>
            The checklist on the intake form is a deliberate step for you. The API records only who
            attested the supplier and when — the tick boxes themselves are not stored.
          </p>

          {error && <div className="errtext">{error}</div>}
        </div>
        <div className="mf">
          <button className="btn btn-grey" onClick={onCancel} disabled={pending}>Cancel</button>
          <button
            className={attesting ? 'btn btn-primary' : 'btn btn-red'}
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? 'Working…' : attesting ? 'Attest supplier' : 'Reject attestation'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminSources() {
  const me = useMe();
  const signedIn = !!getToken();
  const isAdmin = me.data?.role === 'admin';

  const res = useAdminSuppliers({ enabled: isAdmin });
  const approve = useApproveSupplier();
  const reject = useRejectSupplier();

  const [selectedId, setSelectedId] = useState('');
  const [checks, setChecks] = useState<Record<CheckKey, boolean>>({
    selfRegistered: false,
    contactVerified: false,
    detailsMatch: false,
    notImported: false,
  });
  const [decision, setDecision] = useState<{ supplier: AdminSupplier; action: 'attest' | 'reject' } | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const items = useMemo(() => res.data?.items ?? [], [res.data]);

  const unattested = useMemo(
    () => items.filter((s) => !s.attestedAt).sort((a, b) => a.companyName.localeCompare(b.companyName)),
    [items],
  );
  const attestedCount = items.length - unattested.length;

  const selected = unattested.find((s) => String(s.id) === selectedId);
  const allChecked = CHECKS.every((c) => checks[c.key]);

  if (!signedIn) return <AdminOnly signedIn={false} />;
  if (me.isLoading) {
    return (
      <View title="Supply sources">
        <Spinner />
      </View>
    );
  }
  if (!isAdmin) return <AdminOnly signedIn role={me.data?.role} />;

  const submitForm = () => {
    if (!selected) { setFormError('Choose the supplier you are attesting.'); return; }
    if (!allChecked) { setFormError('Every confirmation must be ticked before a supplier can be attested.'); return; }
    setFormError(null);
    setModalError(null);
    setDecision({ supplier: selected, action: 'attest' });
  };

  const run = async () => {
    if (!decision) return;
    setModalError(null);
    try {
      if (decision.action === 'attest') await approve.mutateAsync({ id: decision.supplier.id });
      else await reject.mutateAsync({ id: decision.supplier.id });
      setDecision(null);
      setSelectedId('');
      setChecks({ selfRegistered: false, contactVerified: false, detailsMatch: false, notImported: false });
    } catch (e) {
      setModalError(errText(e, 'The attestation could not be recorded — try again.'));
    }
  };

  const pending = approve.isPending || reject.isPending;

  return (
    <View
      title="Supply sources"
      sub="Manual supplier intake: a company joins by registering itself, and an administrator attests it. No directory is imported, and no catalogue is scraped."
      actions={<Link href="/admin/suppliers" className="btn btn-sm btn-ghost">All suppliers</Link>}
    >
      <div className="cols">
        <div className="card">
          <div className="hd"><h2>How supply enters FactoryDepo</h2></div>
          <div className="bd" style={{ lineHeight: 1.7 }}>
            <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <li><b>The company registers its own account.</b> A supplier row exists only because the supplier created it — there is no create-supplier endpoint, by design.</li>
              <li><b>The supplier submits its own documents</b> from its verification screen: business licence, registration, certifications.</li>
              <li><b>An administrator reviews each document</b> at the <Link href="/admin/verification">verification desk</Link> and approves or rejects it with a note.</li>
              <li><b>An administrator attests the supplier here</b>, which records who confirmed the company and when.</li>
              <li><b>The supplier posts its own stock.</b> Those listings carry <b>dataSource: platform</b> and are shown to buyers as real supply.</li>
            </ol>
          </div>
        </div>

        <div className="card">
          <div className="hd"><h2>Deliberately not offered: bulk import and scraping</h2></div>
          <div className="bd" style={{ lineHeight: 1.7 }}>
            <p className="muted" style={{ marginTop: 0 }}>
              There is no import button on this screen, and no endpoint behind one. That is a policy
              decision, not a missing feature:
            </p>
            <ul style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6, margin: 0 }}>
              <li><b>Marketplace terms.</b> Alibaba, Made-in-China and IndiaMART all prohibit automated collection of their listings.</li>
              <li><b>Image rights.</b> Product photographs belong to the suppliers or the source platforms — re-serving them from our own domain as “our” catalogue is infringement, not attribution.</li>
              <li><b>Product honesty.</b> An imported listing shows a real company that never agreed to be here, at a price we cannot honour. That is the failure this marketplace exists to prevent.</li>
            </ul>
            <p className="muted" style={{ marginBottom: 0, marginTop: 8 }}>
              The scrapers this project once shipped, their ~6,800 scraped listings and 1,788
              downloaded product photographs were deleted and are not kept. A catalogue row can only
              be <b>platform</b> (real, supplier-created) or <b>demo</b> (labelled seed data).
            </p>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="hd">
          <h2>Attest a supplier that registered itself</h2>
          <span className="muted" style={{ marginLeft: 'auto' }}>
            {unattested.length.toLocaleString()} awaiting attestation of {items.length.toLocaleString()} listed
          </span>
        </div>
        <div className="bd">
          {res.isLoading ? (
            <Spinner />
          ) : res.isError || !res.data ? (
            <div className="empty">
              <b>Could not load suppliers — try again</b>
              The supplier list did not answer, so no intake decision can be recorded.
              <div className="row" style={{ justifyContent: 'center', marginTop: 10 }}>
                <button className="btn btn-sm btn-primary" onClick={() => void res.refetch()}>Try again</button>
              </div>
            </div>
          ) : items.length === 0 ? (
            <div className="empty">
              <b>No suppliers yet</b>
              A company appears here after it registers its own account. This screen cannot create one.
            </div>
          ) : unattested.length === 0 ? (
            <div className="empty">
              <b>Every listed supplier is attested</b>
              Nothing is waiting for intake review. Approve or revoke an individual attestation on the{' '}
              <Link href="/admin/suppliers">suppliers</Link> screen.
            </div>
          ) : (
            <>
              <div className="f2">
                <div className="field">
                  <label htmlFor="intake-supplier">Supplier that registered itself <i>*</i></label>
                  <select
                    id="intake-supplier"
                    className="in"
                    value={selectedId}
                    onChange={(e) => { setSelectedId(e.target.value); setFormError(null); }}
                  >
                    <option value="">Choose a supplier awaiting attestation…</option>
                    {unattested.map((s) => (
                      <option key={s.id} value={String(s.id)}>
                        {s.companyName} — {s.country}
                        {s.city ? `, ${s.city}` : ''} ({s.docsApproved} docs approved)
                      </option>
                    ))}
                  </select>
                  <div className="hint">
                    Only suppliers without an attestation are listed. Company details come from the
                    supplier's own registration.
                  </div>
                </div>

                <div className="field">
                  <label>Confirm before attesting <i>*</i></label>
                  <div className="card">
                    <div className="bd" style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      {CHECKS.map((c) => (
                        <label key={c.key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', margin: 0, fontWeight: 400 }}>
                          <input
                            type="checkbox"
                            checked={checks[c.key]}
                            onChange={(e) => { setChecks((prev) => ({ ...prev, [c.key]: e.target.checked })); setFormError(null); }}
                            style={{ marginTop: 3 }}
                          />
                          <span style={{ fontSize: 12.5 }}>{c.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="hint">
                    These confirmations are not stored anywhere — the API records only who attested
                    the supplier, and when.
                  </div>
                </div>
              </div>

              {formError && <div className="errtext" style={{ marginBottom: 10 }}>{formError}</div>}

              <div className="row" style={{ gap: 8 }}>
                <button
                  className="btn btn-primary"
                  onClick={submitForm}
                  disabled={!selected || !allChecked || pending}
                  title={
                    !selected
                      ? 'Choose a supplier first'
                      : !allChecked
                        ? 'Tick every confirmation first'
                        : 'Review the consequence in the next step'
                  }
                >
                  Attest supplier…
                </button>
                <span className="muted">
                  You will see exactly what attesting records before it happens.
                </span>
              </div>

              <div style={{ overflowX: 'auto', marginTop: 12 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Supplier awaiting attestation</th>
                      <th className="hidem">Contact</th>
                      <th>Source</th>
                      <th>Documents</th>
                      <th className="hidem">Registered</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {unattested.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <span className="strong">{s.companyName}</span>
                          <div className="muted">
                            {s.country}{s.city ? ` · ${s.city}` : ''} · #{s.id} · {s.productCount.toLocaleString()} listing{s.productCount === 1 ? '' : 's'}
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
                            <span className={`pill ${s.docsApproved > 0 ? 'p-green' : 'p-grey'}`}>{s.docsApproved} approved</span>
                            <span className={`pill ${s.docsSubmitted > 0 ? 'p-blue' : 'p-grey'}`}>{s.docsSubmitted} submitted</span>
                            <span className={`pill ${s.docsRejected > 0 ? 'p-red' : 'p-grey'}`}>{s.docsRejected} rejected</span>
                            <span className="pill p-grey">{s.docsMissing} missing</span>
                          </span>
                        </td>
                        <td className="hidem muted" title={new Date(s.createdAt).toLocaleString()}>{day(s.createdAt)}</td>
                        <td>
                          <span className="row" style={{ gap: 5, justifyContent: 'flex-end' }}>
                            <button
                              className="btn btn-sm btn-primary"
                              onClick={() => { setSelectedId(String(s.id)); setFormError(null); }}
                              title="Load this supplier into the attestation form"
                            >
                              Select
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
            </>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="hd"><h2>What a listing's source can be</h2></div>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>dataSource</th>
                <th>Meaning</th>
                <th>How it is shown</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><span className="pill p-green">platform</span></td>
                <td className="muted">A real listing, created by a real supplier through the app</td>
                <td className="muted">Shown as real supply, with the supplier's own documents behind it</td>
              </tr>
              <tr>
                <td><span className="pill p-amber">demo</span></td>
                <td className="muted">Bootstrap seed data that gives an empty database a working marketplace to demo</td>
                <td className="muted">Always rendered with a <DemoTag /> tag, never as a real offer</td>
              </tr>
              <tr>
                <td className="muted">scraped</td>
                <td className="muted">Not a value. Scraped listings are not kept on this platform.</td>
                <td className="muted">Nothing to show — there is no third source</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="bd muted" style={{ borderTop: '1px solid var(--line-2)' }}>
          {attestedCount.toLocaleString()} of {items.length.toLocaleString()} listed suppliers already
          carry an attestation. Attestation state, document counts and provenance all come from the
          API — none of it is estimated on this screen.
        </div>
      </div>

      {decision && (
        <AttestModal
          supplier={decision.supplier}
          action={decision.action}
          pending={pending}
          error={modalError}
          onCancel={() => { if (!pending) { setDecision(null); setModalError(null); } }}
          onConfirm={() => void run()}
        />
      )}
    </View>
  );
}
