import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import {
  getToken,
  useMe,
  useAdminDocs,
  useAdminSuppliers,
  useReviewDoc,
} from '@workspace/api-client-react';
import type { AdminSupplier, SupplierDoc } from '@workspace/api-zod';
import { View, Empty, StatusChip, Spinner, DemoTag } from '../components';

/**
 * AdminVerification — the verification desk.
 *
 * One row per supplier document, with the real review state the API stores.
 * Approve/reject always goes through a confirming modal that says what the
 * decision does, and a reviewer note is optional.
 *
 * The supplier's company name is resolved from the supplier list (the docs
 * endpoint returns `supplierId` only); when a supplier is missing from that
 * list the id is shown instead of guessing a name.
 */

type Decision = 'approved' | 'rejected';
type Filter = 'submitted' | 'all' | 'approved' | 'rejected' | 'missing';

function errText(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

function day(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

function fileName(key: string): string {
  const parts = key.split('/');
  return parts[parts.length - 1] || key;
}

function AdminOnly({ signedIn, role }: { signedIn: boolean; role?: string }) {
  return (
    <View title="Admins only" sub="Document review is an administrator action">
      <Empty title={signedIn ? 'Your account is not an administrator' : 'You are not signed in'}>
        {signedIn
          ? `You are signed in as ${role ?? 'a non-admin role'}. A supplier can never approve its own documents — only an administrator account can.`
          : 'Sign in with an administrator account to review supplier documents.'}
        <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
          {signedIn ? (
            <Link href="/explore" className="btn btn-sm btn-grey">Back to the marketplace</Link>
          ) : (
            <Link href="/sign-in?next=%2Fadmin%2Fverification" className="btn btn-sm btn-primary">Sign in</Link>
          )}
        </div>
      </Empty>
    </View>
  );
}

function ReviewModal({
  doc,
  supplier,
  decision,
  note,
  pending,
  error,
  onNote,
  onCancel,
  onConfirm,
}: {
  doc: SupplierDoc;
  supplier: AdminSupplier | undefined;
  decision: Decision;
  note: string;
  pending: boolean;
  error: string | null;
  onNote: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const approving = decision === 'approved';
  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <h2>{approving ? 'Approve document' : 'Reject document'}</h2>
          <button className="x" onClick={onCancel} aria-label="Close">✕</button>
        </div>
        <div className="mb">
          <p className="strong" style={{ marginTop: 0 }}>{doc.docType}</p>
          <p className="muted" style={{ fontSize: 12 }}>
            {supplier ? supplier.companyName : `Supplier #${doc.supplierId}`} · document #{doc.id}
          </p>

          <p style={{ fontSize: 12.5, lineHeight: 1.7, margin: '10px 0' }}>
            {approving ? (
              <>
                <b>Approving accepts this document as verification evidence.</b> The API records you
                as the reviewer, stamps the review time and stores your note on the document.
              </>
            ) : (
              <>
                <b>Rejecting marks the document as not accepted.</b> The API records you as the
                reviewer and stamps the review time. The supplier must submit a corrected document
                before this document type can count towards verification.
              </>
            )}
          </p>

          <div className="field">
            <label htmlFor="review-note">Reviewer note (optional)</label>
            <textarea
              id="review-note"
              className="in"
              rows={3}
              maxLength={1000}
              placeholder={approving ? 'What you checked on this document…' : 'Why this document was not accepted…'}
              value={note}
              onChange={(e) => onNote(e.target.value)}
            />
            <div className="hint">
              Stored on the document by the API and shown to the supplier. Leave blank to record the
              decision without a note.
            </div>
          </div>

          {error && <div className="errtext">{error}</div>}
        </div>
        <div className="mf">
          <button className="btn btn-grey" onClick={onCancel} disabled={pending}>Cancel</button>
          <button
            className={approving ? 'btn btn-primary' : 'btn btn-red'}
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? 'Working…' : approving ? 'Approve document' : 'Reject document'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminVerification() {
  const me = useMe();
  const signedIn = !!getToken();
  const isAdmin = me.data?.role === 'admin';

  const docs = useAdminDocs({ enabled: isAdmin });
  // Used only to resolve supplierId → company name; the desk stays useful if it fails.
  const suppliers = useAdminSuppliers({ enabled: isAdmin });
  const review = useReviewDoc();

  const [filter, setFilter] = useState<Filter>('submitted');
  const [target, setTarget] = useState<{ doc: SupplierDoc; decision: Decision } | null>(null);
  const [note, setNote] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);

  const supplierById = useMemo(() => {
    const map = new Map<number, AdminSupplier>();
    for (const s of suppliers.data?.items ?? []) map.set(s.id, s);
    return map;
  }, [suppliers.data]);

  const items = useMemo(() => docs.data?.items ?? [], [docs.data]);

  const counts = useMemo(() => {
    const c = { submitted: 0, approved: 0, rejected: 0, missing: 0 };
    for (const d of items) {
      if (d.status === 'submitted') c.submitted += 1;
      else if (d.status === 'approved') c.approved += 1;
      else if (d.status === 'rejected') c.rejected += 1;
      else c.missing += 1;
    }
    return c;
  }, [items]);

  const filtered = useMemo(
    () => (filter === 'all' ? items : items.filter((d) => d.status === filter)),
    [items, filter],
  );

  if (!signedIn) return <AdminOnly signedIn={false} />;
  if (me.isLoading) {
    return (
      <View title="Verification desk">
        <Spinner />
      </View>
    );
  }
  if (!isAdmin) return <AdminOnly signedIn role={me.data?.role} />;

  const run = async () => {
    if (!target) return;
    setModalError(null);
    try {
      await review.mutateAsync({
        id: target.doc.id,
        status: target.decision,
        note: note.trim() || undefined,
      });
      setTarget(null);
      setNote('');
    } catch (e) {
      setModalError(errText(e, 'The review could not be recorded — try again.'));
    }
  };

  const openModal = (doc: SupplierDoc, decision: Decision) => {
    setModalError(null);
    setNote('');
    setTarget({ doc, decision });
  };

  return (
    <View
      title="Verification desk"
      sub="Every supplier document on the platform, with its real review state. Approving a document is what makes a verification tier mean something."
      actions={
        <Link href="/admin/suppliers" className="btn btn-sm btn-ghost">Suppliers</Link>
      }
    >
      {docs.isLoading ? (
        <Spinner />
      ) : docs.isError || !docs.data ? (
        <Empty title="Could not load verification documents — try again">
          The document queue did not answer, so nothing is shown and no decision can be recorded.
          <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
            <button className="btn btn-sm btn-primary" onClick={() => void docs.refetch()}>Try again</button>
          </div>
        </Empty>
      ) : items.length === 0 ? (
        <Empty title="No documents submitted yet">
          Documents appear here when a supplier submits them from its own dashboard. Suppliers
          cannot approve their own documents.
        </Empty>
      ) : (
        <>
          <div className="grid stats">
            <div className="card stat" title="Documents with status 'submitted' — waiting for a decision">
              <span className="ic" aria-hidden="true">⏳</span>
              <div>
                <div className="v">{counts.submitted.toLocaleString()}</div>
                <div className="l">Awaiting review</div>
              </div>
            </div>
            <div className="card stat">
              <span className="ic" aria-hidden="true">✅</span>
              <div>
                <div className="v">{counts.approved.toLocaleString()}</div>
                <div className="l">Approved</div>
              </div>
            </div>
            <div className="card stat">
              <span className="ic" aria-hidden="true">⛔</span>
              <div>
                <div className="v">{counts.rejected.toLocaleString()}</div>
                <div className="l">Rejected</div>
              </div>
            </div>
            <div className="card stat" title="Document types the supplier has not submitted (status 'missing')">
              <span className="ic" aria-hidden="true">📄</span>
              <div>
                <div className="v">{counts.missing.toLocaleString()}</div>
                <div className="l">Not submitted</div>
              </div>
            </div>
          </div>

          <div className="filters">
            {([
              ['submitted', `Awaiting review (${counts.submitted})`],
              ['approved', `Approved (${counts.approved})`],
              ['rejected', `Rejected (${counts.rejected})`],
              ['missing', `Not submitted (${counts.missing})`],
              ['all', `All (${items.length})`],
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
              {suppliers.isError ? 'Supplier names could not be loaded — ids shown instead' : `Resolved against ${supplierById.size} supplier records`}
            </span>
          </div>

          {filtered.length === 0 ? (
            <Empty title={filter === 'submitted' ? 'Nothing is awaiting review' : 'No documents with that status'}>
              {filter === 'submitted'
                ? 'Every document in the queue has a decision recorded.'
                : 'Try another status filter.'}
              <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
                <button className="btn btn-sm btn-grey" onClick={() => setFilter('all')}>Show all documents</button>
              </div>
            </Empty>
          ) : (
            <div className="card">
              <div className="hd">
                <b>{filtered.length.toLocaleString()} document{filtered.length === 1 ? '' : 's'}</b>
                <span className="muted" style={{ marginLeft: 'auto' }}>
                  Submitted date is the row timestamp the API returns
                </span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Supplier</th>
                      <th>Document</th>
                      <th>Status</th>
                      <th title="The document row's creation timestamp. A resubmission changes the status without changing this timestamp.">
                        Submitted
                      </th>
                      <th className="hidem">File</th>
                      <th className="hidem">Note</th>
                      <th className="hidem" title="Reviewer and review time recorded by the API">
                        Reviewed
                      </th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((d) => {
                      const s = supplierById.get(d.supplierId);
                      return (
                        <tr key={d.id}>
                          <td>
                            <span className="strong">
                              {s ? s.companyName : `Supplier #${d.supplierId}`}
                            </span>
                            <div className="row" style={{ gap: 5, marginTop: 2 }}>
                              {s ? (
                                s.dataSource === 'demo' ? (
                                  <>
                                    <DemoTag />
                                    <span className="muted">seed supplier</span>
                                  </>
                                ) : (
                                  <span className="muted">
                                    {s.country}{s.city ? ` · ${s.city}` : ''}
                                  </span>
                                )
                              ) : (
                                <span className="muted">name not in the supplier list</span>
                              )}
                            </div>
                          </td>
                          <td>{d.docType}</td>
                          <td><StatusChip status={d.status} /></td>
                          <td className="muted" title={new Date(d.createdAt).toLocaleString()}>
                            {day(d.createdAt)}
                          </td>
                          <td className="hidem">
                            {d.fileKey ? (
                              <>
                                <span className="pill p-blue" title={d.fileKey}>Attached</span>
                                <div className="muted">{fileName(d.fileKey)}</div>
                              </>
                            ) : (
                              <span className="muted" title="The supplier submitted this document without a file key">
                                —
                              </span>
                            )}
                          </td>
                          <td className="hidem muted" style={{ maxWidth: 220 }}>
                            {d.note ? (
                              <span title={d.note}>
                                {d.note.length > 60 ? `${d.note.slice(0, 60)}…` : d.note}
                              </span>
                            ) : (
                              <span title="No note on this document">—</span>
                            )}
                          </td>
                          <td className="hidem muted">
                            {d.reviewedAt ? (
                              <>
                                {day(d.reviewedAt)}
                                <div className="muted">
                                  {d.reviewedBy === null ? 'reviewer not recorded' : `by admin #${d.reviewedBy}`}
                                </div>
                              </>
                            ) : (
                              <span title="Not reviewed yet">—</span>
                            )}
                          </td>
                          <td>
                            {d.status === 'missing' ? (
                              <span className="muted" title="There is no submitted document to review">
                                Nothing to review
                              </span>
                            ) : (
                              <span className="row" style={{ gap: 5, justifyContent: 'flex-end' }}>
                                <button
                                  className="btn btn-sm btn-primary"
                                  disabled={d.status === 'approved'}
                                  title={d.status === 'approved' ? 'Already approved' : 'Approve this document'}
                                  onClick={() => openModal(d, 'approved')}
                                >
                                  Approve
                                </button>
                                <button
                                  className="btn btn-sm btn-red"
                                  disabled={d.status === 'rejected'}
                                  title={d.status === 'rejected' ? 'Already rejected' : 'Reject this document'}
                                  onClick={() => openModal(d, 'rejected')}
                                >
                                  Reject
                                </button>
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="bd muted" style={{ borderTop: '1px solid var(--line-2)' }}>
                The API keeps one row per supplier and document type. A resubmission resets the
                review, so an approved document that is resubmitted returns to awaiting review.
              </div>
            </div>
          )}

          <div className="stripe" style={{ marginTop: 12 }}>
            <span>
              Approving documents here and attesting the supplier on the{' '}
              <Link href="/admin/suppliers">suppliers</Link> screen are two separate decisions.
            </span>
          </div>
        </>
      )}

      {target && (
        <ReviewModal
          doc={target.doc}
          supplier={supplierById.get(target.doc.supplierId)}
          decision={target.decision}
          note={note}
          pending={review.isPending}
          error={modalError}
          onNote={setNote}
          onCancel={() => { if (!review.isPending) { setTarget(null); setModalError(null); } }}
          onConfirm={() => void run()}
        />
      )}
    </View>
  );
}
