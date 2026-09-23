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
  canSell,
} from '../components';
import { useI18n, type DictKey } from '../i18n';

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
 *
 * Every document type below keeps its canonical English value (that is what the
 * API stores and returns); only the label shown to the user is translated.
 */

const DOC_TYPES = [
  'Business Licence',
  'Tax Certificate',
  'Factory Audit Report',
  'Product Certification',
  'Export Licence',
] as const;

const DOC_LABEL: Record<string, DictKey> = {
  'Business Licence': 'verify.doc.businessLicence',
  'Tax Certificate': 'verify.doc.taxCertificate',
  'Factory Audit Report': 'verify.doc.factoryAudit',
  'Product Certification': 'verify.doc.productCert',
  'Export Licence': 'verify.doc.exportLicence',
};

const HELP: { status: string; title: DictKey; state: DictKey }[] = [
  { status: 'missing', title: 'verify.help.missing.title', state: 'verify.help.missing.state' },
  { status: 'submitted', title: 'verify.help.submitted.title', state: 'verify.help.submitted.state' },
  { status: 'approved', title: 'verify.help.approved.title', state: 'verify.help.approved.state' },
  { status: 'rejected', title: 'verify.help.rejected.title', state: 'verify.help.rejected.state' },
];

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

function errorText(e: unknown, fallback: string): string {
  const err = e as Partial<ApiError> | undefined;
  if (err?.message) return err.message;
  return fallback;
}

export default function SupplierVerification() {
  const { t, locale } = useI18n();
  const { data: user, isLoading: meLoading } = useMe();
  const loggedIn = !!getToken();
  const isSupplier = canSell(user);

  const docs = useSupplierDocs({ enabled: loggedIn && isSupplier });
  const submit = useSubmitSupplierDoc();

  const [docType, setDocType] = useState<string>(DOC_TYPES[0]);
  const [fileKey, setFileKey] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');

  /** English canonical value → translated label (falls back to the value itself). */
  const docLabel = (value: string): string => {
    const key = DOC_LABEL[value];
    return key ? t(key) : value;
  };

  const shortDate = (iso: string | null): string => {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? '—'
      : d.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
  };

  if (meLoading) {
    return (
      <View title={t('verify.title')}>
        <Spinner />
      </View>
    );
  }

  if (!loggedIn || !user) {
    return (
      <View title={t('verify.title')} sub={t('verify.signInSub')}>
        <Empty title={t('verify.notSignedIn')}>
          {t('verify.notSignedInBody')}
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Link
              href="/sign-in?next=%2Fsupplier%2Fverification"
              className="btn btn-sm btn-primary"
              onClick={() => requireAuthGate()}
            >
              {t('action.signIn')}
            </Link>
            <Link href="/sign-up?next=%2Fsupplier%2Fverification" className="btn btn-sm btn-ghost">
              {t('verify.createSupplierAccount')}
            </Link>
          </div>
        </Empty>
      </View>
    );
  }

  if (!isSupplier) {
    return (
      <View title={t('verify.title')} sub={t('verify.signInSub')}>
        <Empty title={t('verify.supplierOnly')}>
          {t('verify.supplierOnlyBody', { role: user.role })}
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Link href="/suppliers" className="btn btn-sm btn-ghost">{t('verify.seeSuppliers')}</Link>
          </div>
        </Empty>
      </View>
    );
  }

  const items = docs.data?.items ?? [];
  const approved = items.filter((d) => d.status === 'approved');
  const waiting = items.filter((d) => d.status === 'submitted');
  const actionNeeded = items.filter((d) => d.status === 'missing' || d.status === 'rejected');
  const allCoreApproved = DOC_TYPES.every((type) => items.some((d) => d.docType === type && d.status === 'approved'));
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
      setNotice(t('verify.filedNotice', { doc: docLabel(docType) }));
    } catch (e) {
      setErr(errorText(e, t('verify.errFile')));
    }
  };

  return (
    <View
      title={t('verify.title')}
      sub={t('verify.sub')}
      actions={
        <button
          className="btn btn-sm btn-grey"
          onClick={() => docs.refetch()}
          disabled={docs.isFetching}
        >
          {docs.isFetching ? t('action.refreshing') : t('action.refresh')}
        </button>
      }
    >
      {notice && (
        <div className="stripe">
          <span>{notice}</span>
          <button className="x" onClick={() => setNotice('')} aria-label={t('action.dismiss')}>✕</button>
        </div>
      )}

      <div className="grid stats">
        <div className="card stat">
          <span className="ic" aria-hidden="true">🛡️</span>
          <div>
            <div className="v">{docs.isLoading ? '—' : approved.length.toLocaleString(locale)}</div>
            <div className="l">{t('verify.approved')}</div>
          </div>
        </div>
        <div className="card stat">
          <span className="ic" aria-hidden="true">⏳</span>
          <div>
            <div className="v">{docs.isLoading ? '—' : waiting.length.toLocaleString(locale)}</div>
            <div className="l">{t('verify.waiting')}</div>
          </div>
        </div>
        <div className="card stat">
          <span className="ic" aria-hidden="true">📄</span>
          <div>
            <div className="v">{docs.isLoading ? '—' : actionNeeded.length.toLocaleString(locale)}</div>
            <div className="l">{t('verify.actionNeeded')}</div>
          </div>
        </div>
        <div className="card stat">
          <span className="ic" aria-hidden="true">🏅</span>
          <div>
            <div className="v">
              {docs.isLoading ? '—' : items.length === 0 ? '—' : allCoreApproved ? t('verify.confirmed') : t('verify.pending')}
            </div>
            <div className="l">{t('verify.coreApproved')}</div>
          </div>
        </div>
      </div>

      <div className="cols">
        <div className="card">
          <div className="hd">
            <b>{t('verify.yourDocs')}</b>
            <span className="muted" style={{ marginLeft: 'auto' }}>
              {docs.isLoading ? '—' : t('verify.onFile', { n: items.length.toLocaleString(locale) })}
            </span>
          </div>

          {docs.isLoading ? (
            <Spinner />
          ) : docs.isError ? (
            <div className="bd">
              <Empty title={t('verify.loadErrorTitle')}>
                {t('verify.loadErrorBody')}
                <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
                  <button className="btn btn-sm btn-grey" onClick={() => docs.refetch()}>{t('action.tryAgain')}</button>
                </div>
              </Empty>
            </div>
          ) : items.length === 0 ? (
            <div className="empty">
              <b>{t('verify.emptyTitle')}</b>
              {t('verify.emptyBody', { first: docLabel(DOC_TYPES[0]) })}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>{t('verify.col.document')}</th>
                    <th>{t('verify.col.status')}</th>
                    <th className="hidem">{t('verify.col.note')}</th>
                    <th className="hidem">{t('verify.col.reviewed')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <b>{docLabel(d.docType)}</b>
                        <div className="muted">
                          {t('verify.filed', { date: shortDate(d.createdAt) })}
                          {d.fileKey
                            ? ` · ${t('verify.reference', { ref: d.fileKey })}`
                            : ` · ${t('verify.noReference')}`}
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
                          {d.status === 'approved' ? t('action.refresh') : t('verify.resubmit')}
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
              {t('verify.tierFootnote')}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="hd"><b>{t('verify.fileTitle')}</b></div>
          <div className="bd">
            {err && <div className="errtext" style={{ marginBottom: 10 }} role="alert">{err}</div>}

            <div className="field">
              <label htmlFor="doc-type">{t('verify.docType')} <i>*</i></label>
              <select
                id="doc-type"
                className="in"
                value={docType}
                onChange={(e) => { setDocType(e.target.value); setNotice(''); setErr(''); }}
              >
                {DOC_TYPES.map((type) => <option key={type} value={type}>{docLabel(type)}</option>)}
              </select>
              {existing && (
                <div className="hint">
                  {t('verify.existingHintPre', { doc: docLabel(docType) })}{' '}
                  <StatusChip status={existing.status} />
                  {t('verify.existingHintPost')}
                </div>
              )}
            </div>

            <div className="field">
              <label htmlFor="doc-ref">{t('verify.refLabel')}</label>
              <input
                id="doc-ref"
                className="in"
                placeholder={t('verify.refPlaceholder')}
                value={fileKey}
                onChange={(e) => setFileKey(e.target.value)}
              />
              <div className="hint">
                <b>{t('verify.refHintLead')}</b> {t('verify.refHintTail')}
              </div>
            </div>

            <div className="field">
              <label htmlFor="doc-note">{t('verify.noteLabel')}</label>
              <textarea
                id="doc-note"
                className="in"
                rows={3}
                placeholder={t('verify.notePlaceholder')}
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
                ? t('verify.filing')
                : existing
                  ? t('verify.resubmitDoc', { doc: docLabel(docType) })
                  : t('verify.submitDoc', { doc: docLabel(docType) })}
            </button>

            <div className="stripe" style={{ marginTop: 12, marginBottom: 0 }}>
              <span>
                {t('verify.queueNoteLead')} <b>{t('verify.queueNoteStrong')}</b> {t('verify.queueNoteTail')}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="cols" style={{ marginTop: 12 }}>
        <div className="card">
          <div className="hd"><b>{t('verify.statusMeans')}</b></div>
          <div className="bd">
            <table>
              <tbody>
                {HELP.map((h) => (
                  <tr key={h.status}>
                    <td style={{ width: 150 }}>
                      <StatusChip status={h.status} />
                    </td>
                    <td className="muted">
                      <b style={{ color: 'var(--ink)', fontWeight: 600 }}>{t(h.title)}</b> — {t(h.state)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="hd"><b>{t('verify.tierTitle')}</b></div>
          <div className="bd">
            <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {allCoreApproved
                ? <Verified label={t('verify.tierAll')} />
                : anyApproved
                  ? <Verified label={t('verify.tierSome')} />
                  : <span className="pill p-grey">{t('verify.tierNone')}</span>}
            </div>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>
              {allCoreApproved
                ? t('verify.tierAllBody')
                : anyApproved
                  ? t('verify.tierSomeBody', { n: approved.length > 1 ? ` (${approved.length})` : '' })
                  : t('verify.tierNoneBody')}
            </p>
            <p className="hint" style={{ marginTop: 0 }}>
              {t('verify.tierHint')}
            </p>
            {gap && !docs.isLoading && (
              <div className="stripe" style={{ marginBottom: 0 }}>
                <span>
                  {t('verify.suggested')} <b>{docLabel(gap)}</b>{' '}
                  <button
                    className="btn btn-sm btn-grey"
                    onClick={() => { setNotice(''); setDocType(gap); }}
                  >
                    {t('verify.select')}
                  </button>
                </span>
              </div>
            )}
            <p className="muted" style={{ fontSize: 11.5, marginBottom: 0, marginTop: 10 }}>
              {t('verify.othersNote')}
            </p>
          </div>
        </div>
      </div>
    </View>
  );
}
