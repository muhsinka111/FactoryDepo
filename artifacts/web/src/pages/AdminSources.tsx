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
import { Pager } from '../dash';
import { useI18n, type DictKey } from '../i18n';

/**
 * AdminSources — supplier intake, stated truthfully.
 *
 * This screen used to say “No directory is imported, and no catalogue is
 * scraped.” That is not true of this platform: its supplier table holds records
 * imported from third-party B2B directories — hundreds of rows carry a `source`
 * value, and many carry the importer's own note in `description`. Imported rows
 * are exactly what the honesty rules on this platform exist for, so the copy
 * below states the real behaviour instead of a policy the data contradicts.
 *
 * Intake itself is still manual and attributable: a company registers itself, an
 * administrator confirms it and attests it. There is no bulk-import button and no
 * import endpoint behind one (that part of the old copy was accurate, and stays).
 *
 * Three strings need dictionary keys and are kept in honest English until they
 * land (reported, not invented):
 *
 *   'admin.sources.sub'
 *     EN: Two paths fill this list: companies that registered themselves
 *         (attested individually below) and records imported from third-party
 *         B2B directory sources. An imported row keeps its source label, is shown
 *         to buyers as an imported directory record — never with the source
 *         directory's store URL — and is never presented as a company that
 *         signed up. No bulk-import or scraping endpoint exists.
 *     TR: Bu listeyi iki yol doldurur: kendi hesabını açan şirketler (aşağıda tek
 *         tek onaylanır) ve üçüncü taraf B2B dizin kaynaklarından içe aktarılan
 *         kayıtlar. İçe aktarılan satır kaynak etiketini taşır, alıcıya kaynak
 *         dizinin mağaza adresiyle değil “içe aktarılmış dizin kaydı” olarak
 *         gösterilir ve kendini kaydetmiş bir şirket gibi sunulmaz. Toplu içe
 *         aktarma veya kazıma uç noktası yoktur.
 *
 *   'admin.sources.step1Body'
 *     EN: Most supplier rows are created by the supplier itself — there is no
 *         create-supplier endpoint, by design. Rows imported from a B2B directory
 *         source carry that source instead.
 *     TR: Tedarikçi satırlarının çoğunu tedarikçinin kendisi oluşturur — tasarım
 *         gereği tedarikçi oluşturma uç noktası yoktur. B2B dizin kaynağından
 *         içe aktarılan satırlar ise o kaynağı taşır.
 *
 *   'admin.sources.supplierHint'
 *     EN: Only suppliers without an attestation are listed. Company details come
 *         from the supplier's own registration, or from the directory record the
 *         row was imported from.
 *     TR: Yalnızca onayı olmayan tedarikçiler listelenir. Şirket bilgileri
 *         tedarikçinin kendi kaydından veya satırın içe aktarıldığı dizin
 *         kaydından gelir.
 */
const TRUE_INTAKE_SUB =
  'Two paths fill this list: companies that registered themselves (attested individually below) and records imported from third-party B2B directory sources. An imported row keeps its source label, is shown to buyers as an imported directory record — never with the source directory’s store URL — and is never presented as a company that signed up. No bulk-import or scraping endpoint exists.';
const TRUE_STEP1_BODY =
  'Most supplier rows are created by the supplier itself — there is no create-supplier endpoint, by design. Rows imported from a B2B directory source carry that source instead.';
const TRUE_SUPPLIER_HINT =
  'Only suppliers without an attestation are listed. Company details come from the supplier’s own registration, or from the directory record the row was imported from.';

/**
 * The intake table renders one page at a time. GET /api/admin/suppliers returns
 * every row plus a `total` and takes no limit/offset, so paging is client-side
 * over the rows already in memory; rendering all ~1,600 rows at once was the
 * whole cost of this screen. The supplier picker below the table is a form
 * control, not a list: it keeps one option per unattested supplier so any of them
 * can still be selected.
 */
const PAGE_SIZE = 25;


type CheckKey = 'selfRegistered' | 'contactVerified' | 'detailsMatch' | 'notImported';

const CHECKS: { key: CheckKey; labelKey: DictKey }[] = [
  { key: 'selfRegistered', labelKey: 'admin.sources.checkSelfRegistered' },
  { key: 'contactVerified', labelKey: 'admin.sources.checkContactVerified' },
  { key: 'detailsMatch', labelKey: 'admin.sources.checkDetailsMatch' },
  { key: 'notImported', labelKey: 'admin.sources.checkNotImported' },
];

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
    <View title={t('admin.common.adminsOnly')} sub={t('admin.sources.adminOnlySub')}>
      <Empty title={signedIn ? t('admin.common.notAdmin') : t('admin.common.notSignedIn')}>
        {signedIn
          ? t('admin.sources.signedInBody', { role: role ?? t('admin.common.nonAdminRole') })
          : t('admin.sources.signedOutBody')}
        <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
          {signedIn ? (
            <Link href="/explore" className="btn btn-sm btn-grey">{t('admin.common.backToMarketplace')}</Link>
          ) : (
            <Link href="/sign-in?next=%2Fadmin%2Fsources" className="btn btn-sm btn-primary">{t('action.signIn')}</Link>
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
  const { t } = useI18n();
  const attesting = action === 'attest';
  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <h2>{attesting ? t('admin.sources.modalAttestTitle') : t('admin.sources.modalRejectTitle')}</h2>
          <button className="x" onClick={onCancel} aria-label={t('action.close')}>✕</button>
        </div>
        <div className="mb">
          <p className="strong" style={{ marginTop: 0 }}>{supplier.companyName}</p>
          <p className="muted" style={{ fontSize: 12 }}>
            {supplier.country}{supplier.city ? ` · ${supplier.city}` : ''} · {t('admin.sources.supplierRef', { id: supplier.id })} ·{' '}
            {supplier.contactEmail ?? t('admin.sources.noContactEmail')}
          </p>

          <p style={{ fontSize: 12.5, lineHeight: 1.7, margin: '10px 0' }}>
            {attesting ? (
              <>
                <b>{t('admin.sources.attestLead')}</b> {t('admin.sources.attestBody')}
              </>
            ) : (
              <>
                <b>{t('admin.sources.rejectLead')}</b> {t('admin.sources.rejectBody')}
              </>
            )}
          </p>

          <div className="card">
            <div className="bd muted" style={{ fontSize: 12, lineHeight: 1.7 }}>
              {t('admin.sources.docsOnFile')} <b>{supplier.docsApproved}</b> {t('admin.common.docsApproved')} ·{' '}
              <b>{supplier.docsSubmitted}</b> {t('admin.common.docsSubmitted')} · <b>{supplier.docsRejected}</b> {t('admin.common.docsRejected')} ·{' '}
              <b>{supplier.docsMissing}</b> {t('admin.common.docsMissing')}.
              <div style={{ marginTop: 4 }}>
                {t('admin.sources.docsAtDeskLead')}{' '}
                <Link href="/admin/verification">{t('nav.adminVerify')}</Link>.
              </div>
            </div>
          </div>

          <p className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>
            {t('admin.sources.modalChecklistNote')}
          </p>

          {error && <div className="errtext">{error}</div>}
        </div>
        <div className="mf">
          <button className="btn btn-grey" onClick={onCancel} disabled={pending}>{t('action.cancel')}</button>
          <button
            className={attesting ? 'btn btn-primary' : 'btn btn-red'}
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? t('admin.common.working') : attesting ? t('admin.sources.confirmApprove') : t('admin.sources.confirmReject')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminSources() {
  const { t, locale } = useI18n();
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
  const [page, setPage] = useState(1);

  const items = useMemo(() => res.data?.items ?? [], [res.data]);

  const unattested = useMemo(
    () => items.filter((s) => !s.attestedAt).sort((a, b) => a.companyName.localeCompare(b.companyName)),
    [items],
  );
  const attestedCount = items.length - unattested.length;

  const selected = unattested.find((s) => String(s.id) === selectedId);
  const allChecked = CHECKS.every((c) => checks[c.key]);

  // One page of the intake table at a time (see PAGE_SIZE above). The picker keeps
  // the full `unattested` list, so any supplier can still be chosen.
  const pageCount = Math.max(1, Math.ceil(unattested.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const shown = unattested.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  if (!signedIn) return <AdminOnly signedIn={false} />;
  if (me.isLoading) {
    return (
      <View title={t('nav.sources')}>
        <Spinner />
      </View>
    );
  }
  if (!isAdmin) return <AdminOnly signedIn role={me.data?.role} />;

  const submitForm = () => {
    if (!selected) { setFormError(t('admin.sources.errPickSupplier')); return; }
    if (!allChecked) { setFormError(t('admin.sources.errTickAll')); return; }
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
      setModalError(errText(e, t('admin.sources.errFallback')));
    }
  };

  const pending = approve.isPending || reject.isPending;

  return (
    <View
      title={t('nav.sources')}
      sub={TRUE_INTAKE_SUB}
      actions={<Link href="/admin/suppliers" className="btn btn-sm btn-ghost">{t('admin.sources.allSuppliers')}</Link>}
    >
      <div className="cols">
        <div className="card">
          <div className="hd"><h2>{t('admin.sources.howTitle')}</h2></div>
          <div className="bd" style={{ lineHeight: 1.7 }}>
            <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <li><b>{t('admin.sources.step1Lead')}</b> {TRUE_STEP1_BODY}</li>
              <li><b>{t('admin.sources.step2Lead')}</b> {t('admin.sources.step2Body')}</li>
              <li><b>{t('admin.sources.step3Lead')}</b> <Link href="/admin/verification">{t('nav.adminVerify')}</Link> {t('admin.sources.step3Tail')}</li>
              <li><b>{t('admin.sources.step4Lead')}</b>{t('admin.sources.step4Body')}</li>
              <li><b>{t('admin.sources.step5Lead')}</b> {t('admin.sources.step5BodyLead')} <b>dataSource: platform</b> {t('admin.sources.step5BodyTail')}</li>
            </ol>
          </div>
        </div>

        <div className="card">
          <div className="hd"><h2>{t('admin.sources.notOfferedTitle')}</h2></div>
          <div className="bd" style={{ lineHeight: 1.7 }}>
            <p className="muted" style={{ marginTop: 0 }}>
              {t('admin.sources.notOfferedLead')}
            </p>
            <ul style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6, margin: 0 }}>
              <li><b>{t('admin.sources.termsLead')}</b> {t('admin.sources.termsBody')}</li>
              <li><b>{t('admin.sources.imageLead')}</b> {t('admin.sources.imageBody')}</li>
              <li><b>{t('admin.sources.honestyLead')}</b> {t('admin.sources.honestyBody')}</li>
            </ul>
            <p className="muted" style={{ marginBottom: 0, marginTop: 8 }}>
              {t('admin.sources.notOfferedFootLead')} <b>platform</b> {t('admin.sources.notOfferedFootMid')} <b>demo</b> {t('admin.sources.notOfferedFootTail')}
            </p>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="hd">
          <h2>{t('admin.sources.attestTitle')}</h2>
          <span className="muted" style={{ marginLeft: 'auto' }}>
            {t('admin.sources.awaitingOf', {
              pending: unattested.length.toLocaleString(locale),
              total: items.length.toLocaleString(locale),
            })}
          </span>
        </div>
        <div className="bd">
          {res.isLoading ? (
            <Spinner />
          ) : res.isError || !res.data ? (
            <div className="empty">
              <b>{t('admin.sources.loadErrorTitle')}</b>
              {t('admin.sources.loadErrorBody')}
              <div className="row" style={{ justifyContent: 'center', marginTop: 10 }}>
                <button className="btn btn-sm btn-primary" onClick={() => void res.refetch()}>{t('action.tryAgain')}</button>
              </div>
            </div>
          ) : items.length === 0 ? (
            <div className="empty">
              <b>{t('admin.sources.emptyTitle')}</b>
              {t('admin.sources.emptyBody')}
            </div>
          ) : unattested.length === 0 ? (
            <div className="empty">
              <b>{t('admin.sources.allAttestedTitle')}</b>
              {t('admin.sources.allAttestedLead')}{' '}
              <Link href="/admin/suppliers">{t('nav.suppliers')}</Link> {t('admin.sources.allAttestedTail')}
            </div>
          ) : (
            <>
              <div className="f2">
                <div className="field">
                  <label htmlFor="intake-supplier">{t('admin.sources.formSupplier')} <i>*</i></label>
                  <select
                    id="intake-supplier"
                    className="in"
                    value={selectedId}
                    onChange={(e) => { setSelectedId(e.target.value); setFormError(null); }}
                  >
                    <option value="">{t('admin.sources.chooseSupplier')}</option>
                    {unattested.map((s) => (
                      <option key={s.id} value={String(s.id)}>
                        {s.companyName} — {s.country}
                        {s.city ? `, ${s.city}` : ''} ({t('admin.sources.docsApprovedCount', { n: s.docsApproved.toLocaleString(locale) })})
                      </option>
                    ))}
                  </select>
                  <div className="hint">
                    {TRUE_SUPPLIER_HINT}
                  </div>
                </div>

                <div className="field">
                  <label>{t('admin.sources.confirmLabel')} <i>*</i></label>
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
                          <span style={{ fontSize: 12.5 }}>{t(c.labelKey)}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="hint">
                    {t('admin.sources.checksHint')}
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
                      ? t('admin.sources.titlePickSupplier')
                      : !allChecked
                        ? t('admin.sources.titleTickAll')
                        : t('admin.sources.titleReview')
                  }
                >
                  {t('admin.sources.attestButton')}
                </button>
                <span className="muted">
                  {t('admin.sources.attestHint')}
                </span>
              </div>

              <div style={{ overflowX: 'auto', marginTop: 12 }}>
                <table>
                  <thead>
                    <tr>
                      <th>{t('admin.sources.colSupplierAwaiting')}</th>
                      <th className="hidem">{t('admin.sources.colContact')}</th>
                      <th>{t('admin.sources.colSource')}</th>
                      <th>{t('admin.sources.colDocuments')}</th>
                      <th className="hidem">{t('admin.sources.colRegistered')}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <span className="strong">{s.companyName}</span>
                          <div className="muted">
                            {s.country}{s.city ? ` · ${s.city}` : ''} · #{s.id} ·{' '}
                            {s.productCount === 1
                              ? t('admin.sources.listingCountOne', { n: s.productCount.toLocaleString(locale) })
                              : t('admin.sources.listingCount', { n: s.productCount.toLocaleString(locale) })}
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
                            <span className={`pill ${s.docsApproved > 0 ? 'p-green' : 'p-grey'}`}>{s.docsApproved} {t('admin.common.docsApproved')}</span>
                            <span className={`pill ${s.docsSubmitted > 0 ? 'p-blue' : 'p-grey'}`}>{s.docsSubmitted} {t('admin.common.docsSubmitted')}</span>
                            <span className={`pill ${s.docsRejected > 0 ? 'p-red' : 'p-grey'}`}>{s.docsRejected} {t('admin.common.docsRejected')}</span>
                            <span className="pill p-grey">{s.docsMissing} {t('admin.common.docsMissing')}</span>
                          </span>
                        </td>
                        <td className="hidem muted" title={new Date(s.createdAt).toLocaleString(locale)}>{day(s.createdAt, locale)}</td>
                        <td>
                          <span className="row" style={{ gap: 5, justifyContent: 'flex-end' }}>
                            <button
                              className="btn btn-sm btn-primary"
                              onClick={() => { setSelectedId(String(s.id)); setFormError(null); }}
                              title={t('admin.sources.selectTitle')}
                            >
                              {t('admin.sources.select')}
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
              <Pager
                page={safePage}
                pageSize={PAGE_SIZE}
                total={unattested.length}
                onPage={setPage}
              />
            </>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="hd"><h2>{t('admin.sources.sourceCardTitle')}</h2></div>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>dataSource</th>
                <th>{t('admin.sources.colMeaning')}</th>
                <th>{t('admin.sources.colShown')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><span className="pill p-green">platform</span></td>
                <td className="muted">{t('admin.sources.srcPlatformMeaning')}</td>
                <td className="muted">{t('admin.sources.srcPlatformShown')}</td>
              </tr>
              <tr>
                <td><span className="pill p-amber">demo</span></td>
                <td className="muted">{t('admin.sources.srcDemoMeaning')}</td>
                <td className="muted">{t('admin.sources.srcDemoShownLead')} <DemoTag /> {t('admin.sources.srcDemoShownTail')}</td>
              </tr>
              <tr>
                <td className="muted">scraped</td>
                <td className="muted">{t('admin.sources.srcScrapedMeaning')}</td>
                <td className="muted">{t('admin.sources.srcScrapedShown')}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="bd muted" style={{ borderTop: '1px solid var(--line-2)' }}>
          {t('admin.sources.footnote', {
            attested: attestedCount.toLocaleString(locale),
            total: items.length.toLocaleString(locale),
          })}
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
