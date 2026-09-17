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
import { useI18n } from '../i18n';

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

function day(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(locale);
}

function fileName(key: string): string {
  const parts = key.split('/');
  return parts[parts.length - 1] || key;
}

function AdminOnly({ signedIn, role }: { signedIn: boolean; role?: string }) {
  const { t } = useI18n();
  return (
    <View title={t('admin.common.adminsOnly')} sub={t('admin.verification.adminOnlySub')}>
      <Empty title={signedIn ? t('admin.common.notAdmin') : t('admin.common.notSignedIn')}>
        {signedIn
          ? t('admin.verification.signedInBody', { role: role ?? t('admin.common.nonAdminRole') })
          : t('admin.verification.signedOutBody')}
        <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
          {signedIn ? (
            <Link href="/explore" className="btn btn-sm btn-grey">{t('admin.common.backToMarketplace')}</Link>
          ) : (
            <Link href="/sign-in?next=%2Fadmin%2Fverification" className="btn btn-sm btn-primary">{t('action.signIn')}</Link>
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
  const { t } = useI18n();
  const approving = decision === 'approved';
  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <h2>{approving ? t('admin.verification.modalApproveTitle') : t('admin.verification.modalRejectTitle')}</h2>
          <button className="x" onClick={onCancel} aria-label={t('action.close')}>✕</button>
        </div>
        <div className="mb">
          <p className="strong" style={{ marginTop: 0 }}>{doc.docType}</p>
          <p className="muted" style={{ fontSize: 12 }}>
            {supplier ? supplier.companyName : t('admin.verification.supplierFallback', { id: doc.supplierId })} · {t('admin.verification.docRef', { id: doc.id })}
          </p>

          <p style={{ fontSize: 12.5, lineHeight: 1.7, margin: '10px 0' }}>
            {approving ? (
              <>
                <b>{t('admin.verification.approveLead')}</b> {t('admin.verification.approveBody')}
              </>
            ) : (
              <>
                <b>{t('admin.verification.rejectLead')}</b> {t('admin.verification.rejectBody')}
              </>
            )}
          </p>

          <div className="field">
            <label htmlFor="review-note">{t('admin.verification.noteLabel')}</label>
            <textarea
              id="review-note"
              className="in"
              rows={3}
              maxLength={1000}
              placeholder={approving ? t('admin.verification.notePlaceholderApprove') : t('admin.verification.notePlaceholderReject')}
              value={note}
              onChange={(e) => onNote(e.target.value)}
            />
            <div className="hint">
              {t('admin.verification.noteHint')}
            </div>
          </div>

          {error && <div className="errtext">{error}</div>}
        </div>
        <div className="mf">
          <button className="btn btn-grey" onClick={onCancel} disabled={pending}>{t('action.cancel')}</button>
          <button
            className={approving ? 'btn btn-primary' : 'btn btn-red'}
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? t('admin.common.working') : approving ? t('admin.verification.modalApproveTitle') : t('admin.verification.modalRejectTitle')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminVerification() {
  const { t, locale } = useI18n();
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
      <View title={t('nav.adminVerify')}>
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
      setModalError(errText(e, t('admin.verification.errFallback')));
    }
  };

  const openModal = (doc: SupplierDoc, decision: Decision) => {
    setModalError(null);
    setNote('');
    setTarget({ doc, decision });
  };

  return (
    <View
      title={t('nav.adminVerify')}
      sub={t('admin.verification.sub')}
      actions={
        <Link href="/admin/suppliers" className="btn btn-sm btn-ghost">{t('nav.suppliers')}</Link>
      }
    >
      {docs.isLoading ? (
        <Spinner />
      ) : docs.isError || !docs.data ? (
        <Empty title={t('admin.verification.loadErrorTitle')}>
          {t('admin.verification.loadErrorBody')}
          <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
            <button className="btn btn-sm btn-primary" onClick={() => void docs.refetch()}>{t('action.tryAgain')}</button>
          </div>
        </Empty>
      ) : items.length === 0 ? (
        <Empty title={t('admin.verification.emptyTitle')}>
          {t('admin.verification.emptyBody')}
        </Empty>
      ) : (
        <>
          <div className="grid stats">
            <div className="card stat" title={t('admin.verification.statAwaitingTitle')}>
              <span className="ic" aria-hidden="true">⏳</span>
              <div>
                <div className="v">{counts.submitted.toLocaleString(locale)}</div>
                <div className="l">{t('admin.verification.statAwaiting')}</div>
              </div>
            </div>
            <div className="card stat">
              <span className="ic" aria-hidden="true">✅</span>
              <div>
                <div className="v">{counts.approved.toLocaleString(locale)}</div>
                <div className="l">{t('admin.verification.statApproved')}</div>
              </div>
            </div>
            <div className="card stat">
              <span className="ic" aria-hidden="true">⛔</span>
              <div>
                <div className="v">{counts.rejected.toLocaleString(locale)}</div>
                <div className="l">{t('admin.verification.statRejected')}</div>
              </div>
            </div>
            <div className="card stat" title={t('admin.verification.statMissingTitle')}>
              <span className="ic" aria-hidden="true">📄</span>
              <div>
                <div className="v">{counts.missing.toLocaleString(locale)}</div>
                <div className="l">{t('admin.verification.statMissing')}</div>
              </div>
            </div>
          </div>

          <div className="filters">
            {([
              ['submitted', t('admin.verification.filterSubmitted', { n: counts.submitted.toLocaleString(locale) })],
              ['approved', t('admin.verification.filterApproved', { n: counts.approved.toLocaleString(locale) })],
              ['rejected', t('admin.verification.filterRejected', { n: counts.rejected.toLocaleString(locale) })],
              ['missing', t('admin.verification.filterMissing', { n: counts.missing.toLocaleString(locale) })],
              ['all', t('admin.verification.filterAll', { n: items.length.toLocaleString(locale) })],
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
              {suppliers.isError
                ? t('admin.verification.namesError')
                : t('admin.verification.resolvedAgainst', { n: supplierById.size.toLocaleString(locale) })}
            </span>
          </div>

          {filtered.length === 0 ? (
            <Empty title={filter === 'submitted' ? t('admin.verification.nothingAwaitingTitle') : t('admin.verification.noStatusTitle')}>
              {filter === 'submitted'
                ? t('admin.verification.nothingAwaitingBody')
                : t('admin.verification.noStatusBody')}
              <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
                <button className="btn btn-sm btn-grey" onClick={() => setFilter('all')}>{t('admin.verification.showAll')}</button>
              </div>
            </Empty>
          ) : (
            <div className="card">
              <div className="hd">
                <b>
                  {filtered.length === 1
                    ? t('admin.verification.docCountOne', { n: filtered.length.toLocaleString(locale) })
                    : t('admin.verification.docCount', { n: filtered.length.toLocaleString(locale) })}
                </b>
                <span className="muted" style={{ marginLeft: 'auto' }}>
                  {t('admin.verification.submittedNote')}
                </span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>{t('admin.verification.colSupplier')}</th>
                      <th>{t('admin.verification.colDocument')}</th>
                      <th>{t('admin.verification.colStatus')}</th>
                      <th title={t('admin.verification.colSubmittedTitle')}>
                        {t('admin.verification.colSubmitted')}
                      </th>
                      <th className="hidem">{t('admin.verification.colFile')}</th>
                      <th className="hidem">{t('admin.verification.colNote')}</th>
                      <th className="hidem" title={t('admin.verification.colReviewedTitle')}>
                        {t('admin.verification.colReviewed')}
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
                              {s ? s.companyName : t('admin.verification.supplierFallback', { id: d.supplierId })}
                            </span>
                            <div className="row" style={{ gap: 5, marginTop: 2 }}>
                              {s ? (
                                s.dataSource === 'demo' ? (
                                  <>
                                    <DemoTag />
                                    <span className="muted">{t('admin.verification.seedSupplier')}</span>
                                  </>
                                ) : (
                                  <span className="muted">
                                    {s.country}{s.city ? ` · ${s.city}` : ''}
                                  </span>
                                )
                              ) : (
                                <span className="muted">{t('admin.verification.nameMissing')}</span>
                              )}
                            </div>
                          </td>
                          <td>{d.docType}</td>
                          <td><StatusChip status={d.status} /></td>
                          <td className="muted" title={new Date(d.createdAt).toLocaleString(locale)}>
                            {day(d.createdAt, locale)}
                          </td>
                          <td className="hidem">
                            {d.fileKey ? (
                              <>
                                <span className="pill p-blue" title={d.fileKey}>{t('admin.common.attached')}</span>
                                <div className="muted">{fileName(d.fileKey)}</div>
                              </>
                            ) : (
                              <span className="muted" title={t('admin.verification.noFileKeyTitle')}>
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
                              <span title={t('admin.verification.noNoteTitle')}>—</span>
                            )}
                          </td>
                          <td className="hidem muted">
                            {d.reviewedAt ? (
                              <>
                                {day(d.reviewedAt, locale)}
                                <div className="muted">
                                  {d.reviewedBy === null ? t('admin.verification.reviewerNotRecorded') : t('admin.common.byAdmin', { id: d.reviewedBy })}
                                </div>
                              </>
                            ) : (
                              <span title={t('admin.verification.notReviewed')}>—</span>
                            )}
                          </td>
                          <td>
                            {d.status === 'missing' ? (
                              <span className="muted" title={t('admin.verification.nothingToReviewTitle')}>
                                {t('admin.verification.nothingToReview')}
                              </span>
                            ) : (
                              <span className="row" style={{ gap: 5, justifyContent: 'flex-end' }}>
                                <button
                                  className="btn btn-sm btn-primary"
                                  disabled={d.status === 'approved'}
                                  title={d.status === 'approved' ? t('admin.verification.alreadyApproved') : t('admin.verification.approveTitle')}
                                  onClick={() => openModal(d, 'approved')}
                                >
                                  {t('admin.common.approve')}
                                </button>
                                <button
                                  className="btn btn-sm btn-red"
                                  disabled={d.status === 'rejected'}
                                  title={d.status === 'rejected' ? t('admin.verification.alreadyRejected') : t('admin.verification.rejectTitle')}
                                  onClick={() => openModal(d, 'rejected')}
                                >
                                  {t('admin.common.reject')}
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
                {t('admin.verification.footnote')}
              </div>
            </div>
          )}

          <div className="stripe" style={{ marginTop: 12 }}>
            <span>
              {t('admin.verification.stripeLead')}{' '}
              <Link href="/admin/suppliers">{t('nav.suppliers')}</Link> {t('admin.verification.stripeTail')}
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
