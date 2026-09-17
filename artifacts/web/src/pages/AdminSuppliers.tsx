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
import { useI18n } from '../i18n';

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

function day(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(locale);
}

function AdminOnly({ signedIn, role }: { signedIn: boolean; role?: string }) {
  const { t } = useI18n();
  return (
    <View title={t('admin.common.adminsOnly')} sub={t('admin.suppliers.adminOnlySub')}>
      <Empty title={signedIn ? t('admin.common.notAdmin') : t('admin.common.notSignedIn')}>
        {signedIn
          ? t('admin.suppliers.signedInBody', { role: role ?? t('admin.common.nonAdminRole') })
          : t('admin.suppliers.signedOutBody')}
        <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
          {signedIn ? (
            <Link href="/explore" className="btn btn-sm btn-grey">{t('admin.common.backToMarketplace')}</Link>
          ) : (
            <Link href="/sign-in?next=%2Fadmin%2Fsuppliers" className="btn btn-sm btn-primary">{t('action.signIn')}</Link>
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
  const { t, locale } = useI18n();
  const s = decision.supplier;
  const approving = decision.action === 'approve';

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <h2>{approving ? t('admin.suppliers.modalApproveTitle') : t('admin.suppliers.modalRejectTitle')}</h2>
          <button className="x" onClick={onCancel} aria-label={t('action.close')}>✕</button>
        </div>
        <div className="mb">
          <p className="strong" style={{ marginTop: 0 }}>{s.companyName}</p>
          <p className="muted" style={{ fontSize: 12 }}>
            {s.country}{s.city ? ` · ${s.city}` : ''} · {t('admin.suppliers.supplierRef', { id: s.id })} ·{' '}
            {s.productCount === 1
              ? t('admin.suppliers.listingCountOne', { n: s.productCount.toLocaleString(locale) })
              : t('admin.suppliers.listingCount', { n: s.productCount.toLocaleString(locale) })}
          </p>

          <p style={{ fontSize: 12.5, lineHeight: 1.7, margin: '10px 0' }}>
            {approving ? (
              <>
                <b>{t('admin.suppliers.approveLead')}</b> {t('admin.suppliers.approveBody')}
              </>
            ) : (
              <>
                <b>{t('admin.suppliers.rejectLead')}</b> {t('admin.suppliers.rejectBody')}
              </>
            )}
          </p>

          <div className="card">
            <div className="bd muted" style={{ fontSize: 12, lineHeight: 1.7 }}>
              {t('admin.suppliers.docsOnFile')} <b>{s.docsApproved}</b> {t('admin.common.docsApproved')} ·{' '}
              <b>{s.docsSubmitted}</b> {t('admin.common.docsSubmitted')} · <b>{s.docsRejected}</b> {t('admin.common.docsRejected')} ·{' '}
              <b>{s.docsMissing}</b> {t('admin.suppliers.docsNotSubmitted')}.
              <div style={{ marginTop: 4 }}>
                {t('admin.suppliers.docsAtDeskLead')}{' '}
                <Link href="/admin/verification">{t('nav.adminVerify')}</Link>{t('admin.suppliers.docsAtDeskTail')}
              </div>
            </div>
          </div>

          {error && <div className="errtext" style={{ marginTop: 10 }}>{error}</div>}
        </div>
        <div className="mf">
          <button className="btn btn-grey" onClick={onCancel} disabled={pending}>{t('action.cancel')}</button>
          <button
            className={approving ? 'btn btn-primary' : 'btn btn-red'}
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? t('admin.common.working') : approving ? t('admin.suppliers.confirmApprove') : t('admin.suppliers.confirmReject')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminSuppliers() {
  const { t, locale } = useI18n();
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
      <View title={t('nav.suppliers')}>
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
      setModalError(errText(e, t('admin.suppliers.errFallback')));
    }
  };

  const pending = approve.isPending || reject.isPending;

  const attested = items.filter((s) => !!s.attestedAt).length;
  const demoRows = items.filter((s) => s.dataSource === 'demo').length;
  const docsSubmitted = items.reduce((sum, s) => sum + s.docsSubmitted, 0);

  return (
    <View
      title={t('admin.suppliers.title')}
      sub={t('admin.suppliers.sub')}
      actions={
        <div className="row" style={{ gap: 6 }}>
          <Link href="/admin/sources" className="btn btn-sm btn-ghost">{t('nav.sources')}</Link>
          <Link href="/admin/verification" className="btn btn-sm btn-ghost">{t('nav.adminVerify')}</Link>
        </div>
      }
    >
      {res.isLoading ? (
        <Spinner />
      ) : res.isError || !res.data ? (
        <Empty title={t('admin.suppliers.loadErrorTitle')}>
          {t('admin.suppliers.loadErrorBody')}
          <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
            <button className="btn btn-sm btn-primary" onClick={() => void res.refetch()}>{t('action.tryAgain')}</button>
          </div>
        </Empty>
      ) : items.length === 0 ? (
        <Empty title={t('admin.suppliers.emptyTitle')}>
          {t('admin.suppliers.emptyBodyLead')}{' '}
          <Link href="/admin/sources">{t('nav.sources')}</Link>{t('admin.suppliers.emptyBodyTail')}
        </Empty>
      ) : (
        <>
          <div className="grid stats">
            <div className="card stat">
              <span className="ic" aria-hidden="true">🚚</span>
              <div>
                <div className="v">{res.data.total.toLocaleString(locale)}</div>
                <div className="l">{t('admin.suppliers.statListed')}</div>
              </div>
            </div>
            <div className="card stat" title={t('admin.suppliers.statAttestedTitle')}>
              <span className="ic" aria-hidden="true">✅</span>
              <div>
                <div className="v">{attested.toLocaleString(locale)}</div>
                <div className="l">{t('admin.suppliers.statAttested')}</div>
              </div>
            </div>
            <div className="card stat">
              <span className="ic" aria-hidden="true">⏳</span>
              <div>
                <div className="v">{(items.length - attested).toLocaleString(locale)}</div>
                <div className="l">{t('admin.suppliers.statAwaiting')}</div>
              </div>
            </div>
            <div className="card stat" title={t('admin.suppliers.statDocsTitle')}>
              <span className="ic" aria-hidden="true">📄</span>
              <div>
                <div className="v">{docsSubmitted.toLocaleString(locale)}</div>
                <div className="l">{t('admin.suppliers.statDocs')}</div>
              </div>
            </div>
            <div className="card stat" title={t('admin.suppliers.statSeedTitle')}>
              <span className="ic" aria-hidden="true">🧪</span>
              <div>
                <div className="v">{demoRows.toLocaleString(locale)}</div>
                <div className="l">{t('admin.suppliers.statSeed')}</div>
              </div>
            </div>
          </div>

          <div className="filters">
            <input
              className="in"
              style={{ width: 240 }}
              placeholder={t('admin.suppliers.searchPlaceholder')}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label={t('admin.suppliers.searchAria')}
            />
            {([
              ['all', t('admin.suppliers.filterAll')],
              ['unattested', t('admin.suppliers.statAwaiting')],
              ['attested', t('admin.suppliers.statAttested')],
              ['demo', t('admin.suppliers.filterSeedOnly')],
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
              {t('admin.common.showingOf', {
                shown: filtered.length.toLocaleString(locale),
                total: items.length.toLocaleString(locale),
              })}
            </span>
          </div>

          {filtered.length === 0 ? (
            <Empty title={t('admin.suppliers.noMatchTitle')}>
              {t('admin.suppliers.noMatchBody')}
            </Empty>
          ) : (
            <div className="card">
              <div className="hd">
                <b>{t('admin.suppliers.queueTitle')}</b>
                <span className="muted" style={{ marginLeft: 'auto' }}>
                  {t('admin.suppliers.queueNote')}
                </span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>{t('admin.suppliers.colSupplier')}</th>
                      <th className="hidem">{t('admin.suppliers.colContact')}</th>
                      <th>{t('admin.suppliers.colSource')}</th>
                      <th>{t('admin.suppliers.colDocuments')}</th>
                      <th className="hidem">{t('admin.suppliers.colListings')}</th>
                      <th className="hidem">{t('admin.suppliers.colAttested')}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <span className="strong">{s.companyName}</span>
                          <div className="muted">
                            {s.country}{s.city ? ` · ${s.city}` : ''} · #{s.id} ·{' '}
                            {t('admin.suppliers.ratingTrust', {
                              rating: s.rating > 0 ? s.rating.toFixed(1) : '—',
                              trust: s.trustScore > 0 ? s.trustScore.toFixed(0) : '—',
                            })}
                          </div>
                        </td>
                        <td className="hidem muted">{s.contactEmail ?? '—'}</td>
                        <td>
                          {s.dataSource === 'demo' ? (
                            <span className="row" style={{ gap: 4 }}>
                              <DemoTag />
                              <span className="muted">{t('admin.common.seed')}</span>
                            </span>
                          ) : (
                            <span className="pill p-green" title={t('admin.common.registeredThroughApp')}>
                              {t('admin.common.real')}
                            </span>
                          )}
                        </td>
                        <td>
                          <span className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                            <span className={`pill ${s.docsApproved > 0 ? 'p-green' : 'p-grey'}`} title={t('admin.suppliers.docsApprovedTitle')}>
                              {s.docsApproved} {t('admin.common.docsApproved')}
                            </span>
                            <span className={`pill ${s.docsSubmitted > 0 ? 'p-blue' : 'p-grey'}`} title={t('admin.suppliers.docsSubmittedTitle')}>
                              {s.docsSubmitted} {t('admin.common.docsSubmitted')}
                            </span>
                            <span className={`pill ${s.docsRejected > 0 ? 'p-red' : 'p-grey'}`} title={t('admin.suppliers.docsRejectedTitle')}>
                              {s.docsRejected} {t('admin.common.docsRejected')}
                            </span>
                            <span className="pill p-grey" title={t('admin.suppliers.docsMissingTitle')}>
                              {s.docsMissing} {t('admin.common.docsMissing')}
                            </span>
                          </span>
                        </td>
                        <td className="hidem">{s.productCount.toLocaleString(locale)}</td>
                        <td className="hidem">
                          {s.attestedAt ? (
                            <>
                              <span className="muted">{day(s.attestedAt, locale)}</span>
                              <div className="muted">
                                {s.attestedBy === null ? t('admin.suppliers.attestingAdminNotRecorded') : t('admin.common.byAdmin', { id: s.attestedBy })}
                              </div>
                            </>
                          ) : (
                            <span className="muted">{t('admin.suppliers.notAttested')}</span>
                          )}
                        </td>
                        <td>
                          <span className="row" style={{ gap: 5, justifyContent: 'flex-end' }}>
                            <button
                              className="btn btn-sm btn-primary"
                              onClick={() => { setModalError(null); setDecision({ supplier: s, action: 'approve' }); }}
                            >
                              {t('admin.suppliers.attest')}
                            </button>
                            <button
                              className="btn btn-sm btn-red"
                              onClick={() => { setModalError(null); setDecision({ supplier: s, action: 'reject' }); }}
                            >
                              {t('admin.common.reject')}
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
              {t('admin.suppliers.stripe')}
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
