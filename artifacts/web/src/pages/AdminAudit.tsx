/**
 * AdminAudit — the audit trail of admin actions (`GET /api/admin/audit`).
 *
 * This screen exists because the owner's rule is that an admin state change is
 * AUDITABLE rather than silent: every admin mutation writes an `admin_audit` row
 * in the same transaction as the change, and this page shows that trail as it is —
 * the actor, the action, the subject, the moment, and the stored before → after
 * payload. Nothing here is reconstructed, summarised or invented.
 *
 * Three honesty rules are baked in and must stay:
 *
 *  1. `total` is the API's own COUNT for the current filter. The rows on screen
 *     are the newest `limit` of them — the KPI tiles say "loaded now" and the
 *     stripe spells out the window, so a page never reads as the whole trail.
 *  2. A delete entry has no `after` — it renders as "removed" with the last
 *     stored fields, never as a blank cell.
 *  3. An entity the trail itself records as deleted gets an explicit
 *     "no longer exists" chip instead of a dead link or an empty cell. The trail
 *     is append-only: those rows stay, and nothing here deletes them.
 */
import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { AdminWall,
  ActionChip,
  ActorCell,
  AuditDiff,
  EntityCell,
  deletedProductIds,
  useAdminGate,
  useAdminTrail,
} from './AdminKit';
import { Spinner } from '../components';
import {
  EmptyState,
  Kpi,
  KpiRow,
  PageHeader,
  Pager,
  TableWrap,
  ToolSelect,
  Toolbar,
  metric,
} from '../dash';
import { useI18n } from '../i18n';

/** Client-side page size over the loaded window (the API has no offset). */
const PAGE = 25;

const LIMIT_OPTIONS = [25, 50, 100, 200];

function readSearch(): { entity: string; entityId: string; limit: number } {
  const sp = new URLSearchParams(window.location.search);
  const entity = sp.get('entity') ?? '';
  const entityId = sp.get('entityId') ?? '';
  const rawLimit = Number(sp.get('limit'));
  return {
    entity,
    entityId,
    limit: LIMIT_OPTIONS.includes(rawLimit) ? rawLimit : 200,
  };
}

function when(iso: string, locale: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(locale);
}

export default function AdminAudit() {
  const { t, locale } = useI18n();
  const gate = useAdminGate();

  // Deep-linkable: /admin/audit?entity=product&entityId=42 (the listing editor
  // and the supplier queue link here with that query).
  const initial = useMemo(() => readSearch(), []);
  const [entity, setEntity] = useState(initial.entity);
  const [entityIdText, setEntityIdText] = useState(initial.entityId);
  const [limit, setLimit] = useState(initial.limit);
  const [page, setPage] = useState(1);

  // The applied filter is what the request uses; the inputs above are drafts, so
  // a half-typed entity id never fires a request.
  const [applied, setApplied] = useState({ entity: initial.entity, entityId: initial.entityId, limit: initial.limit });

  const parsedId = applied.entityId.trim() === '' ? undefined : Number(applied.entityId.trim());
  const badId = applied.entityId.trim() !== '' && !Number.isFinite(parsedId);

  const res = useAdminTrail(
    {
      entity: applied.entity || undefined,
      entityId: Number.isFinite(parsedId) ? parsedId : undefined,
      limit: applied.limit,
    },
    gate.isAdmin && !badId,
  );

  const rows = useMemo(() => res.data?.items ?? [], [res.data]);
  const total = res.data?.total;
  const deleted = useMemo(() => deletedProductIds(rows), [rows]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE));
  const safePage = Math.min(page, pageCount);
  const shown = rows.slice((safePage - 1) * PAGE, safePage * PAGE);
  const adminsInView = new Set(rows.map((r) => r.adminUserId)).size;

  if (!gate.signedIn) {
    return <AdminWall signedIn={false} subKey="admin.audit.adminOnlySub" bodyKey="admin.audit.signedInBody" backTo="/admin/audit" />;
  }
  if (gate.loading) {
    return (
      <>
        <PageHeader title={t('admin.audit.title')} />
        <Spinner />
      </>
    );
  }
  if (!gate.isAdmin) {
    return <AdminWall signedIn role={gate.me.data?.role} subKey="admin.audit.adminOnlySub" bodyKey="admin.audit.signedInBody" backTo="/admin/listings" />;
  }

  const apply = () => {
    const next = { entity, entityId: entityIdText.trim(), limit };
    setApplied(next);
    setPage(1);
    const sp = new URLSearchParams();
    if (next.entity) sp.set('entity', next.entity);
    if (next.entityId) sp.set('entityId', next.entityId);
    if (next.limit !== 200) sp.set('limit', String(next.limit));
    const qs = sp.toString();
    window.history.replaceState(null, '', `/admin/audit${qs ? `?${qs}` : ''}`);
  };

  const clear = () => {
    setEntity('');
    setEntityIdText('');
    setLimit(200);
    setApplied({ entity: '', entityId: '', limit: 200 });
    setPage(1);
    window.history.replaceState(null, '', '/admin/audit');
  };

  const filtered = !!applied.entity || applied.entityId.trim() !== '';
  const filterLabel = applied.entity === 'product'
    ? t('admin.audit.entityProduct')
    : applied.entity === 'supplier'
      ? t('admin.audit.entitySupplier')
      : applied.entity || '—';

  return (
    <>
      <PageHeader
        title={t('admin.audit.title')}
        sub={t('admin.audit.sub')}
        crumb={filtered ? <span>{t('admin.audit.forEntity', { id: `${filterLabel} ${applied.entityId || ''}`.trim() })}</span> : undefined}
        actions={
          <>
            <button className="btn btn-sm btn-grey" onClick={clear}>{t('action.clearFilters')}</button>
            <button className="btn btn-sm btn-ghost" onClick={() => void res.refetch()} disabled={res.isFetching}>
              {res.isFetching ? t('action.refreshing') : t('action.refresh')}
            </button>
            <Link href="/admin/listings" className="btn btn-sm btn-ghost">{t('nav.adminListings')}</Link>
          </>
        }
      />

      <KpiRow>
        <Kpi
          ic="🧾"
          label={t('admin.audit.statTotal')}
          value={metric(total, (v) => v.toLocaleString(locale))}
          hint={<span title={t('admin.audit.statTotalTitle')}>{filtered ? t('admin.audit.filterActive', { what: filterLabel }) : 'GET /api/admin/audit'}</span>}
        />
        <Kpi
          ic="📥"
          label={t('admin.audit.statLoaded')}
          value={rows.length.toLocaleString(locale)}
          hint={<span title={t('admin.audit.statLoadedTitle', { n: applied.limit })}>{t('admin.audit.limitOption', { n: applied.limit })}</span>}
        />
        <Kpi
          ic="👤"
          label={<span title={t('admin.audit.statAdminsTitle')}>{t('admin.audit.statAdmins')}</span>}
          value={rows.length === 0 ? '—' : adminsInView.toLocaleString(locale)}
        />
        <Kpi ic="📄" label={t('admin.audit.statVisible')} value={shown.length.toLocaleString(locale)} />
      </KpiRow>

      <Toolbar>
        <ToolSelect
          label={t('admin.audit.filterEntity')}
          value={entity}
          onChange={setEntity}
          options={[
            { value: '', label: t('admin.audit.entityAll') },
            { value: 'product', label: t('admin.audit.entityProduct') },
            { value: 'supplier', label: t('admin.audit.entitySupplier') },
          ]}
        />
        <label className="row" style={{ gap: 6, fontSize: 11.5, color: 'var(--mute)' }}>
          <span>{t('admin.audit.colEntity')} #</span>
          <input
            id="audit-entity-id"
            type="number"
            min={1}
            style={{ width: 108 }}
            placeholder={t('admin.audit.entityIdPlaceholder')}
            value={entityIdText}
            onChange={(e) => setEntityIdText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && apply()}
            aria-label={t('admin.audit.entityIdAria')}
          />
        </label>
        <ToolSelect
          label={t('admin.audit.limitAria')}
          value={String(limit)}
          onChange={(v) => setLimit(Number(v))}
          options={LIMIT_OPTIONS.map((n) => ({ value: String(n), label: t('admin.audit.limitOption', { n }) }))}
        />
        <button className="btn btn-sm btn-primary" onClick={apply}>{t('admin.audit.applyFilter')}</button>
        <span className="grow" />
        <span className="tl tnum">
          {typeof total === 'number' ? t('admin.audit.windowNote', { shown: rows.length.toLocaleString(locale), total: total.toLocaleString(locale) }) : '—'}
        </span>
      </Toolbar>

      {badId ? (
        <div className="stripe"><span>{t('admin.audit.entityIdPlaceholder')}</span></div>
      ) : null}

      {res.isLoading ? (
        <Spinner />
      ) : res.isError || !res.data ? (
        <EmptyState
          icon="⚠"
          title={t('admin.audit.loadErrorTitle')}
          body={t('admin.audit.loadErrorBody')}
          action={<button className="btn btn-sm btn-primary" onClick={() => void res.refetch()}>{t('action.tryAgain')}</button>}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={filtered ? '🔎' : '🧾'}
          title={filtered ? t('admin.audit.noMatchTitle') : t('admin.audit.emptyTitle')}
          body={filtered ? t('admin.audit.noMatchBody') : t('admin.audit.emptyBody')}
          action={filtered ? <button className="btn btn-sm btn-grey" onClick={clear}>{t('action.clearFilters')}</button> : undefined}
        />
      ) : (
        <>
          <div className="card">
            <div className="hd">
              <b>{t('admin.audit.rowsOnPage', { n: shown.length.toLocaleString(locale) })}</b>
              <span className="muted" style={{ marginLeft: 'auto' }}>
                {t('admin.audit.windowNote', { shown: rows.length.toLocaleString(locale), total: (total ?? rows.length).toLocaleString(locale) })}
              </span>
            </div>
            <TableWrap>
              <table>
                <thead>
                  <tr>
                    <th>{t('admin.audit.colWhen')}</th>
                    <th className="hidem" title={t('admin.audit.actorTitle')}>{t('admin.audit.colActor')}</th>
                    <th>{t('admin.audit.colAction')}</th>
                    <th>{t('admin.audit.colEntity')}</th>
                    <th title={t('admin.audit.colChangeTitle')}>{t('admin.audit.colChange')}</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.id}>
                      <td className="nowrap" title={r.createdAt}>
                        {when(r.createdAt, locale)}
                        <span className="cellsub">#{r.id}</span>
                      </td>
                      <td className="hidem"><ActorCell row={r} /></td>
                      <td><ActionChip action={r.action} /></td>
                      <td>
                        <EntityCell row={r} deleted={typeof r.entityId === 'number' ? deleted.get(r.entityId) : undefined} />
                      </td>
                      <td>
                        <AuditDiff before={r.before} after={r.after} action={r.action} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
            <Pager
              page={safePage}
              pageSize={PAGE}
              total={rows.length}
              onPage={setPage}
              left={
                filtered ? (
                  <span className="filterednote">
                    {t('admin.audit.filterActive', { what: `${filterLabel}${applied.entityId ? ` #${applied.entityId}` : ''}` })}
                  </span>
                ) : undefined
              }
            />
          </div>

          <div className="stripe" style={{ marginTop: 12 }}>
            <span>{t('admin.audit.appendOnly')}</span>
          </div>
        </>
      )}
    </>
  );
}
