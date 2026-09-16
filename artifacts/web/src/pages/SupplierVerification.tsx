import { useState } from 'react';
import { Link } from 'wouter';
import {
  useSupplierDocs,
  useSubmitSupplierDoc,
  useMe,
  getToken,
} from '@workspace/api-client-react';
import type { ApiError } from '@workspace/api-client-react';
import type { SupplierDoc } from '@workspace/api-zod';
import {
  View,
  Empty,
  StatusChip,
  Spinner,
  Verified,
  requireAuthGate,
} from '../components';

/**
 * Supplier verification — the supplier's own side of the verification desk.
 *
 * Honest description of how this works, because the stakes are trust:
 *  • Submitting a document sets its status to 'submitted'. That is NOT approval.
 *  • A reviewer approves or rejects each document by hand (POST
 *    /api/admin/docs/:id/review). Until then no badge is shown to buyers.
 *  • Re-submitting a document CLEARS the previous decision — the API resets
 *    reviewedBy/reviewedAt/note — so refreshing an approved document sends it
 *    back to the queue. The form says so before it happens.
 *  • The verification tier is derived below from the statuses actually returned
 *    by the API for this supplier's documents. It is never invented.
 *  • File upload is not built: the reference field takes a URL/reference string
 *    and is optional. No screen pretends to accept a file.
 *
 * Counts in the stats row are plain counts of the rows this API returned, and are
 * '—' while loading — never a placeholder number.
 */

const DOC_TYPES = [
  'Business Licence',
  'Tax Certificate',
  'Factory Audit Report',
  'Product Certification',
  'Export Licence',
] as const;

const HELP: { status: string; title: string; state: string }[] = [
  {
    status: 'missing',
    title: 'Not filed',
    state: 'Nothing filed yet, or the document was never submitted.',
  },
  {
    status: 'submitted',
    title: 'Awaiting review',
    state: 'Filed and waiting in the review queue. No badge is shown to buyers yet.',
  },
  {
    status: 'approved',
    title: 'Approved',
    state: 'A reviewer checked it against the document itself. This is what buyers see.',
  },
  {
    status: 'rejected',
    title: 'Sent back',
    state: 'Rejected with a note. Fix the document and submit it again.',
  },
];

function shortDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function errorText(e: unknown, fallback: string): string {
  const err = e as Partial<ApiError> | undefined;
  if (err?.message) return err.message;
  return fallback;
}

/** Which document a supplier should file next — derived, not guessed. */
function nextGap(docs: SupplierDoc[]): string | null {
  const byType = new Map(docs.map((d) => [d.docType, d]));
  const never = DOC_TYPES.find((t) => !byType.has(t));
  if (never) return never;
  const needsWork = DOC_TYPES.find((t) => {
    const d = byType.get(t);
    return d ? d.status === 'missing' || d.status === 'rejected' : true;
  });
  return needsWork ?? null;
}

export default function SupplierVerification() {
  const { data: user, isLoading: meLoading } = useMe();
  const loggedIn = !!getToken();
  const isSupplier = user?.role === 'supplier';

  const docs = useSupplierDocs({ enabled: loggedIn && isSupplier });
  const submit = useSubmitSupplierDoc();

  const [docType, setDocType] = useState<string>(DOC_TYPES[0]);
  const [fileKey, setFileKey] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');

  if (meLoading) {
    return (
      <View title="Verification">
        <Spinner />
      </View>
    );
  }

  if (!loggedIn || !user) {
    return (
      <View title="Verification" sub="Documents buyers rely on before they commit money">
        <Empty title="You are not signed in">
          Verification documents belong to a supplier account and are never public in raw form.
          Sign in to file or refresh yours.
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Link
              href="/sign-in?next=%2Fsupplier%2Fverification"
              className="btn btn-sm btn-primary"
              onClick={() => requireAuthGate()}
            >
              Sign in
            </Link>
            <Link href="/sign-up?next=%2Fsupplier%2Fverification" className="btn btn-sm btn-ghost">
              Create a supplier account
            </Link>
          </div>
        </Empty>
      </View>
    );
  }

  if (!isSupplier) {
    return (
      <View title="Verification" sub="Documents buyers rely on before they commit money">
        <Empty title="Supplier accounts only">
          Your account is a {user.role} account, so there is no supplier checklist to complete.
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Link href="/suppliers" className="btn btn-sm btn-ghost">See verified suppliers</Link>
          </div>
        </Empty>
      </View>
    );
  }

  const items = docs.data?.items ?? [];
  const approved = items.filter((d) => d.status === 'approved');
  const waiting = items.filter((d) => d.status === 'submitted');
  const actionNeeded = items.filter((d) => d.status === 'missing' || d.status === 'rejected');
  const allCoreApproved = DOC_TYPES.every((t) => items.some((d) => d.docType === t && d.status === 'approved'));
  const anyApproved = approved.length > 0;
  const gap = nextGap(items);

  const existing = items.find((d) => d.docType === docType);

  const send = async () => {
    setErr('');
    setNotice('');
    try {
      await submit.mutateAsync({
        docType,
        fileKey: fileKey.trim() || undefined,
        note: note.trim() || undefined,
      });
      setFileKey('');
      setNote('');
      setNotice(
        `${docType} filed. Status is now "submitted" and it is waiting in the review queue — a badge only appears for buyers once a reviewer approves it.`,
      );
    } catch (e) {
      setErr(errorText(e, 'Could not file this document.'));
    }
  };

  return (
    <View
      title="Verification"
      sub="File your documents, track the review decision, and see what buyers are told about it"
      actions={
        <button
          className="btn btn-sm btn-grey"
          onClick={() => docs.refetch()}
          disabled={docs.isFetching}
        >
          {docs.isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      }
    >
      {notice && (
        <div className="stripe">
          <span>{notice}</span>
          <button className="x" onClick={() => setNotice('')} aria-label="Dismiss">✕</button>
        </div>
      )}

      <div className="grid stats">
        <div className="card stat">
          <span className="ic" aria-hidden="true">🛡️</span>
          <div>
            <div className="v">{docs.isLoading ? '—' : approved.length}</div>
            <div className="l">Documents approved</div>
          </div>
        </div>
        <div className="card stat">
          <span className="ic" aria-hidden="true">⏳</span>
          <div>
            <div className="v">{docs.isLoading ? '—' : waiting.length}</div>
            <div className="l">Waiting for a reviewer</div>
          </div>
        </div>
        <div className="card stat">
          <span className="ic" aria-hidden="true">📄</span>
          <div>
            <div className="v">{docs.isLoading ? '—' : actionNeeded.length}</div>
            <div className="l">Missing or sent back</div>
          </div>
        </div>
        <div className="card stat">
          <span className="ic" aria-hidden="true">🏅</span>
          <div>
            <div className="v">
              {docs.isLoading ? '—' : items.length === 0 ? '—' : allCoreApproved ? 'Confirmed' : 'Pending'}
            </div>
            <div className="l">Core documents approved</div>
          </div>
        </div>
      </div>

      <div className="cols">
        <div className="card">
          <div className="hd">
            <b>Your documents</b>
            <span className="muted" style={{ marginLeft: 'auto' }}>
              {docs.isLoading ? '—' : `${items.length} on file`}
            </span>
          </div>

          {docs.isLoading ? (
            <Spinner />
          ) : docs.isError ? (
            <div className="bd">
              <Empty title="Documents could not be loaded">
                Could not load your verification documents — try again. If this keeps failing, your
                account may not have a supplier profile yet.
                <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
                  <button className="btn btn-sm btn-grey" onClick={() => docs.refetch()}>Try again</button>
                </div>
              </Empty>
            </div>
          ) : items.length === 0 ? (
            <div className="empty">
              <b>No documents on file</b>
              Nothing has been filed yet, so no verification badge can be shown to buyers. Use the
              form to file your first document — start with {DOC_TYPES[0]}.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Status</th>
                    <th className="hidem">Reviewer note</th>
                    <th className="hidem">Reviewed</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <b>{d.docType}</b>
                        <div className="muted">
                          filed {shortDate(d.createdAt)}
                          {d.fileKey ? ` · reference: ${d.fileKey}` : ' · no reference given'}
                        </div>
                      </td>
                      <td><StatusChip status={d.status} /></td>
                      <td className="hidem muted">{d.note ?? '—'}</td>
                      <td className="hidem muted">{d.reviewedAt ? shortDate(d.reviewedAt) : '—'}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn btn-sm btn-ghost"
                          onClick={() => {
                            setNotice('');
                            setDocType(d.docType);
                            setFileKey(d.fileKey ?? '');
                            setNote('');
                          }}
                        >
                          {d.status === 'approved' ? 'Refresh' : 'Resubmit'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="bd" style={{ borderTop: '1px solid var(--line-2)' }}>
            <div className="muted" style={{ fontSize: 11.5 }}>
              Only the documents the API returns for your supplier profile are listed here. Missing
              types simply have no row yet — filing one creates it.
            </div>
          </div>
        </div>

        <div className="card">
          <div className="hd"><b>File or refresh a document</b></div>
          <div className="bd">
            {err && <div className="errtext" style={{ marginBottom: 10 }} role="alert">{err}</div>}

            <div className="field">
              <label htmlFor="doc-type">Document type <i>*</i></label>
              <select
                id="doc-type"
                className="in"
                value={docType}
                onChange={(e) => { setDocType(e.target.value); setNotice(''); setErr(''); }}
              >
                {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              {existing && (
                <div className="hint">
                  You already have a row for {docType} — status{' '}
                  <StatusChip status={existing.status} />. Filing again overwrites it and clears the
                  earlier decision, so an approved document would need re-approval.
                </div>
              )}
            </div>

            <div className="field">
              <label htmlFor="doc-ref">Reference / link to the document</label>
              <input
                id="doc-ref"
                className="in"
                placeholder="https://…/business-licence.pdf or your file reference"
                value={fileKey}
                onChange={(e) => setFileKey(e.target.value)}
              />
              <div className="hint">
                <b>File upload is not built.</b> Paste a link to the document, or a reference the
                review team can follow up on. It is stored as-is and is not shown publicly.
              </div>
            </div>

            <div className="field">
              <label htmlFor="doc-note">Note for the reviewer</label>
              <textarea
                id="doc-note"
                className="in"
                rows={3}
                placeholder="What changed, why it is being refreshed, anything the reviewer should know…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            <button
              className="btn btn-gold"
              style={{ width: '100%' }}
              onClick={send}
              disabled={submit.isPending || !docType}
            >
              {submit.isPending
                ? 'Filing…'
                : existing
                  ? `Resubmit ${docType}`
                  : `Submit ${docType}`}
            </button>

            <div className="stripe" style={{ marginTop: 12, marginBottom: 0 }}>
              <span>
                Submitting only puts the document in the queue. <b>A badge appears for buyers when a
                reviewer approves it</b> — never on submission, and never automatically.
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="cols" style={{ marginTop: 12 }}>
        <div className="card">
          <div className="hd"><b>What each status means</b></div>
          <div className="bd">
            <table>
              <tbody>
                {HELP.map((h) => (
                  <tr key={h.status}>
                    <td style={{ width: 150 }}>
                      <StatusChip status={h.status} />
                    </td>
                    <td className="muted">
                      <b style={{ color: 'var(--ink)', fontWeight: 600 }}>{h.title}</b> — {h.state}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="hd"><b>Verification tier</b></div>
          <div className="bd">
            <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {allCoreApproved
                ? <Verified label="Verified · every core document approved" />
                : anyApproved
                  ? <Verified label="Verified · documents approved" />
                  : <span className="pill p-grey">Not verified yet</span>}
            </div>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>
              {allCoreApproved
                ? 'Every core document type on this page has been approved by a reviewer.'
                : anyApproved
                  ? `At least one document is approved${approved.length > 1 ? ` (${approved.length})` : ''}; the remaining core types would strengthen the profile.`
                  : 'No document has been approved yet, so buyers are shown no verification badge for your company.'}
            </p>
            <p className="hint" style={{ marginTop: 0 }}>
              The tier your account carries is set by the review team from the approved documents —
              this screen reports the document statuses the API returns and does not compute a tier
              number of its own. Buyers see a badge only for approved documents.
            </p>
            {gap && !docs.isLoading && (
              <div className="stripe" style={{ marginBottom: 0 }}>
                <span>
                  Suggested next: <b>{gap}</b>{' '}
                  <button
                    className="btn btn-sm btn-grey"
                    onClick={() => { setNotice(''); setDocType(gap); }}
                  >
                    Select
                  </button>
                </span>
              </div>
            )}
            <p className="muted" style={{ fontSize: 11.5, marginBottom: 0, marginTop: 10 }}>
              Buyers also see other suppliers&apos; ratings and inspection counts on their profiles.
              Those figures are seeded marketplace data, not something this checklist produces — this
              page deliberately shows none of them.
            </p>
          </div>
        </div>
      </div>
    </View>
  );
}
