/**
 * AdminKit.tsx — the shared pieces of the admin control plane (T17).
 *
 * Everything here talks to the committed /api/admin/* routes. Two notes on
 * WHY this module holds its own queries instead of the shipped hooks:
 *
 *  1. `GET /api/admin/listings` takes the admin-only `?moderation=visible|pulled`
 *     parameter and `GET /api/admin/audit` takes `?limit` / `?entity` /
 *     `?entityId`, while the shipped hooks (`useAdminListings`, `useAdminAudit`)
 *     expose no such parameter. The pages here call the SAME endpoints through
 *     the exported `apiFetch` and use the SAME query-key prefixes
 *     ('admin-listings' / 'admin-audit'), so the mutation hooks that invalidate
 *     those prefixes still refresh these screens. lib/** is untouched.
 *  2. Nothing is inferred: every number on these screens comes from the API, and
 *     the audit diff renders the stored `before` / `after` payloads verbatim.
 *
 * The audit trail is the point of the screen, so the diff renderer treats the
 * three shapes the API can emit honestly:
 *   - a patch diff (`{field: value}`, only the changed fields);
 *   - a moderation snapshot (pull / restore);
 *   - a delete, where `after` is legitimately null — that renders as "removed",
 *     never as a blank cell, and the entry keeps the last stored fields.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import {
  ApiError,
  apiFetch,
  getToken,
  useAdminPullListing,
  useAdminRestoreListing,
  useMe,
} from '@workspace/api-client-react';
import type { AdminAuditList, AdminAuditRow, Product } from '@workspace/api-zod';
import { Empty, Spinner } from '../components';
import { PageHeader, Timeline, type TlItem } from '../dash';
import { useI18n, type DictKey } from '../i18n';

/* ============================== data access ============================= */

/** An admin listing row: the frozen product shape plus its moderation state. */
export type AdminListing = Product & { moderationStatus?: string; pulledReason?: string | null };

export interface AdminListingPage {
  items: AdminListing[];
  total: number;
  page: number;
  pages: number;
}

export interface AdminListingQuery {
  q?: string;
  category?: string;
  country?: string;
  hasImage?: number;
  listingType?: string;
  page?: number;
  limit?: number;
  /** `visible` / `pulled`; omitted means both (the API's own default). */
  moderation?: 'visible' | 'pulled';
}

/**
 * The admin catalogue, on the API's own query contract. The key mirrors the
 * shipped `useAdminListings` key ('admin-listings', query) so mutations that
 * invalidate that prefix still land here.
 */
export function useAdminListingPage(query: AdminListingQuery, enabled: boolean) {
  return useQuery({
    queryKey: ['admin-listings', query],
    queryFn: () => apiFetch<AdminListingPage>('/admin/listings', { query: { ...query } }),
    enabled,
  });
}

export interface AdminTrailQuery {
  entity?: string;
  entityId?: number;
  limit?: number;
}

/** The audit trail, newest first. `total` is the API's real COUNT. */
export function useAdminTrail(query: AdminTrailQuery, enabled = true) {
  return useQuery({
    queryKey: ['admin-audit', query],
    queryFn: () => apiFetch<AdminAuditList>('/admin/audit', { query: { ...query } }),
    enabled,
  });
}

/* ================================ helpers ============================== */

/** A stored `before` / `after` payload as an object (never a crash on a scalar). */
export function asRecord(v: unknown): Record<string, unknown> {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  return {};
}

/**
 * Which listing ids the LOADED trail records as deleted, and by which entry.
 * This is the audit feed's own evidence — no extra request, and no guess: a
 * product row whose id a later entry deleted points at a row that is gone.
 */
export function deletedProductIds(rows: AdminAuditRow[]): Map<number, AdminAuditRow> {
  const out = new Map<number, AdminAuditRow>();
  for (const r of rows) {
    if (r.entity !== 'product' || r.action !== 'listing.delete') continue;
    if (typeof r.entityId !== 'number') continue;
    const seen = out.get(r.entityId);
    if (!seen || r.id > seen.id) out.set(r.entityId, r);
  }
  return out;
}

/** Field labels the trail can name, in the interface language. */
const FIELD_KEYS: Record<string, DictKey> = {
  name: 'admin.edit.name',
  category: 'admin.edit.category',
  price: 'admin.edit.price',
  currency: 'admin.edit.currency',
  unit: 'admin.edit.unit',
  moq: 'admin.edit.moq',
  quantityAvailable: 'admin.edit.qty',
  status: 'admin.edit.status',
  listingType: 'admin.edit.listingType',
  originCountry: 'admin.edit.country',
  location: 'admin.edit.location',
  leadTimeDays: 'admin.edit.lead',
  description: 'admin.edit.desc',
  verifiedLevel: 'shop.verifiedLevel',
  tags: 'admin.suppliers.tagsLabel',
  moderationStatus: 'admin.mod.colModeration',
  pulledReason: 'admin.mod.pulledReason',
};

/** The action names the API writes today; an unknown one still renders. */
const ACTION_KEYS: Record<string, DictKey> = {
  'listing.update': 'admin.audit.action.listingUpdate',
  'listing.pull': 'admin.audit.action.listingPull',
  'listing.restore': 'admin.audit.action.listingRestore',
  'listing.delete': 'admin.audit.action.listingDelete',
  'supplier.update': 'admin.audit.action.supplierUpdate',
};

export function useFieldLabel(): (field: string) => string {
  const { t } = useI18n();
  return (field) => {
    const key = FIELD_KEYS[field];
    return key ? t(key) : field;
  };
}

/* ============================= composition ============================= */

/**
 * The stored before → after pairs of one entry, as a small table. Values are
 * what the API recorded — numbers formatted for reading, everything else
 * verbatim; `null` renders as an em dash (and, for a delete, as "removed" with
 * the note above the table, because there is no after-value to show).
 */
export function AuditDiff({
  before,
  after,
  action,
}: {
  before: unknown;
  after: unknown;
  action: string;
}) {
  const { t, locale } = useI18n();
  const fieldLabel = useFieldLabel();
  const b = asRecord(before);
  const a = asRecord(after);
  const removed = after === null || after === undefined;
  const keys = useMemo(() => {
    const seen: string[] = [];
    for (const k of [...Object.keys(b), ...Object.keys(a)]) if (!seen.includes(k)) seen.push(k);
    return seen.sort();
  }, [b, a]);

  if (keys.length === 0) {
    return <span className="diffnote">{t('admin.audit.noFields')}</span>;
  }

  const fmt = (v: unknown): ReactNode => {
    if (v === null || v === undefined) return <span className="diffnull">{t('admin.audit.noneValue')}</span>;
    if (typeof v === 'number') return v.toLocaleString(locale, { maximumFractionDigits: 2 });
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (Array.isArray(v)) {
      if (v.length === 0) return <span className="diffnull">{t('admin.audit.noneValue')}</span>;
      return v.map((x) => (x === null || x === undefined ? '' : typeof x === 'object' ? JSON.stringify(x) : String(x))).join(', ');
    }
    if (typeof v === 'object') return JSON.stringify(v);
    const s = String(v);
    return s === '' ? <span className="diffnull">{t('admin.audit.cleared')}</span> : s;
  };

  return (
    <div className="diffbox">
      {removed ? (
        <div className="diffnote" style={{ padding: '5px 8px' }}>
          {t('admin.audit.deleteNote')}
        </div>
      ) : null}
      <table className="difftbl">
        <thead>
          <tr>
            <th>{t('admin.audit.fieldName')}</th>
            <th>{t('admin.audit.fieldBefore')}</th>
            <th>{t('admin.audit.fieldAfter')}</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k}>
              <td className="diffk">{fieldLabel(k)}</td>
              <td className="diffold">
                <span className="diffval">{fmt(b[k])}</span>
              </td>
              <td className="diffnew">
                <span className="diffval">{fmt(a[k])}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The action of an entry as a chip; an unknown action string is shown as-is. */
export function ActionChip({ action }: { action: string }) {
  const { t } = useI18n();
  const key = ACTION_KEYS[action];
  const kind =
    action === 'listing.pull' ? 'pull'
    : action === 'listing.restore' ? 'restore'
    : action === 'listing.delete' ? 'delete'
    : action === 'supplier.update' ? 'sup'
    : 'edit';
  return (
    <span className={`actchip ${kind}`} title={action}>
      {key ? t(key) : t('admin.audit.actionOther', { action })}
    </span>
  );
}

/** The acting admin, or an honest note when the account row is gone. */
export function ActorCell({ row }: { row: AdminAuditRow }) {
  const { t } = useI18n();
  if (row.adminName) {
    return (
      <span>
        <span className="strong">{row.adminName}</span>
        <span className="cellsub">#{row.adminUserId}</span>
      </span>
    );
  }
  return <span className="muted">{t('admin.audit.actorUnknown', { id: row.adminUserId })}</span>;
}

/**
 * One entry's subject: entity, id, and — when the LOADED trail records a later
 * delete of that id — an explicit "no longer exists" chip. A known-deleted
 * listing is never a link (it would only 404).
 */
export function EntityCell({
  row,
  deleted,
}: {
  row: AdminAuditRow;
  deleted?: AdminAuditRow;
}) {
  const { t } = useI18n();
  const isProduct = row.entity === 'product';
  const gone = !!deleted;
  const label = isProduct ? t('admin.audit.entityProduct') : row.entity === 'supplier' ? t('admin.audit.entitySupplier') : row.entity;
  const id = row.entityId ?? null;
  const name = isProduct && gone ? asRecord(row.before).name : undefined;
  return (
    <div className="entcell">
      <div className="entline">
        <span>{label}</span>
        <span className="entityid">{id === null ? '—' : `#${id}`}</span>
        {gone ? (
          <span className="stalechip" title={t('admin.audit.goneTitle')}>
            {t('admin.audit.gone')}
          </span>
        ) : null}
      </div>
      <div className="entline">
        {gone && typeof name === 'string' ? <span className="muted">{name.slice(0, 60)}</span> : null}
        {gone && deleted ? (
          <span className="muted">{t('admin.audit.deletedBy', { id: deleted.id })}</span>
        ) : id !== null && isProduct ? (
          <Link href={`/admin/listings/${id}`}>{t('admin.audit.openListing')}</Link>
        ) : id !== null ? (
          <Link href={`/suppliers/${id}`}>{t('admin.audit.openSupplier')}</Link>
        ) : null}
      </div>
    </div>
  );
}

/** A compact activity list of trail entries for one subject (editor side). */
export function EntityTrail({
  rows,
  empty,
  deleted,
}: {
  rows: AdminAuditRow[];
  empty?: string;
  deleted?: Map<number, AdminAuditRow>;
}) {
  const { t, locale } = useI18n();
  const fieldLabel = useFieldLabel();
  if (rows.length === 0) return <div className="muted">{empty ?? '—'}</div>;
  const items: TlItem[] = rows.map((r) => {
    const a = asRecord(r.after);
    const b = asRecord(r.before);
    const keys = Object.keys(a).length > 0 ? Object.keys(a) : Object.keys(b);
    const tone =
      r.action === 'listing.pull' ? 'red'
      : r.action === 'listing.restore' ? 'green'
      : r.action === 'listing.delete' ? 'red'
      : 'blue';
    const who = r.adminName ?? t('admin.audit.actorUnknown', { id: r.adminUserId });
    return {
      tone,
      text: (
        <span>
          <ActionChip action={r.action} />
          {' '}
          <span className="muted">{who}</span>
          {' · '}
          {new Date(r.createdAt).toLocaleString(locale)}
          {keys.length > 0 ? (
            <span className="muted">
              {' · '}
              {keys
                .slice(0, 4)
                .map((k) => `${fieldLabel(k)}: ${String(a[k] ?? b[k] ?? '—')}`)
                .join(' · ')}
            </span>
          ) : null}
        </span>
      ),
      meta: r.entityId !== null && r.entityId !== undefined && deleted?.has(r.entityId) ? (
        <span className="stalechip">{t('admin.audit.gone')}</span>
      ) : undefined,
    };
  });
  return <Timeline items={items} />;
}

/* ================================ guards =============================== */

/** The shared "admins only" wall for the control-plane pages. */
export function AdminWall({ signedIn, role, subKey, bodyKey, backTo }: {
  signedIn: boolean;
  role?: string;
  subKey: DictKey;
  bodyKey: DictKey;
  backTo: string;
}) {
  const { t } = useI18n();
  return (
    <>
      <PageHeader title={t('admin.common.adminsOnly')} sub={t(subKey)} />
      <Empty title={signedIn ? t('admin.common.notAdmin') : t('admin.common.notSignedIn')}>
        {signedIn ? t(bodyKey, { role: role ?? t('admin.common.nonAdminRole') }) : t('admin.audit.signedOutBody')}
        <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
          {signedIn ? (
            <Link href={backTo} className="btn btn-sm btn-grey">{t('admin.common.backToMarketplace')}</Link>
          ) : (
            <Link href={`/sign-in?next=${encodeURIComponent(backTo)}`} className="btn btn-sm btn-primary">
              {t('action.signIn')}
            </Link>
          )}
        </div>
      </Empty>
    </>
  );
}

/**
 * The signed-in-admin gate + the loading spinner every control-plane page needs
 * before it can ask for anything. Returns the role state the page branches on.
 */
export function useAdminGate() {
  const me = useMe();
  return {
    me,
    signedIn: !!getToken(),
    isAdmin: me.data?.role === 'admin',
    loading: me.isLoading,
  };
}

/** A page-level banner (success / failure) — the seller surface's `.flash`. */
export function Flash({ kind, children }: { kind: 'ok' | 'bad'; children: ReactNode }) {
  return (
    <div className={`flash ${kind}`} role="status">
      <span className="ic">{kind === 'ok' ? '✓' : '⚠'}</span>
      <span>{children}</span>
    </div>
  );
}

/** Map an API failure onto an honest sentence; unknown codes stay generic. */
export function apiErrorText(e: unknown, t: (k: DictKey, v?: Record<string, string | number>) => string): string {
  if (e instanceof ApiError) {
    if (e.code === 'already_pulled') return t('admin.mod.errAlreadyPulled');
    if (e.code === 'not_pulled') return t('admin.mod.errNotPulled');
    if (e.code === 'listing_in_use') return t('admin.edit.inUse');
  }
  // The API's own message (its `details`/`error` text) when there is one — an
  // empty string tells the caller to use its own honest fallback.
  return e instanceof Error && e.message ? e.message : '';
}

/** True when the API answered 404 for the subject (not a network/other failure). */
export function isNotFound(e: unknown): boolean {
  return e instanceof ApiError && e.code === 'not_found';
}

/* ============================ pull / restore =========================== */

/**
 * Pull a listing off the catalogue: a typed reason is MANDATORY (buttons stay
 * disabled below 3 characters, the API's own minimum, and the modal says why).
 */
export function PullModal({
  listing,
  onClose,
  onDone,
}: {
  listing: { id: number; name: string };
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { t } = useI18n();
  const pull = useAdminPullListing();
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const trimmed = reason.trim();
  const ready = trimmed.length >= 3;

  const confirm = async () => {
    if (!ready) return;
    setErr(null);
    try {
      await pull.mutateAsync({ id: listing.id, reason: trimmed });
      onDone(t('admin.mod.pullDone', { id: listing.id }));
    } catch (e) {
      setErr(apiErrorText(e, t) || t('admin.mod.errGeneric'));
    }
  };

  return (
    <div className="overlay" onClick={() => { if (!pull.isPending) onClose(); }}>
      <div className="modal" style={{ width: 'min(560px,100%)' }} onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <h2>{t('admin.mod.pullTitle', { id: listing.id })}</h2>
          <button className="x" onClick={onClose} aria-label={t('action.close')} disabled={pull.isPending}>✕</button>
        </div>
        <div className="mb">
          <p className="strong" style={{ marginTop: 0 }}>{listing.name}</p>
          <p className="muted" style={{ fontSize: 12, lineHeight: 1.6 }}>{t('admin.mod.pullBody')}</p>
          <label htmlFor="admin-pull-reason" style={{ display: 'block', fontSize: 11.5, color: 'var(--mute)', marginBottom: 4 }}>
            {t('admin.mod.reasonLabel')}
          </label>
          <textarea
            id="admin-pull-reason"
            className="in"
            style={{ width: '100%', minHeight: 74, font: 'inherit', fontSize: 12.5, padding: '7px 9px', border: '1px solid var(--line)', borderRadius: 5 }}
            placeholder={t('admin.mod.reasonPlaceholder')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-label={t('admin.mod.reasonLabel')}
          />
          {!ready ? <div className="diffnote" style={{ marginTop: 5 }}>{t('admin.mod.reasonTooShort')}</div> : null}
          {err ? <div className="errtext" style={{ marginTop: 8 }}>{err}</div> : null}
        </div>
        <div className="mf">
          <button className="btn btn-grey" onClick={onClose} disabled={pull.isPending}>{t('action.cancel')}</button>
          <button id="admin-pull-confirm" className="btn btn-red" onClick={() => void confirm()} disabled={!ready || pull.isPending}>
            {pull.isPending ? t('admin.common.working') : t('admin.mod.confirmPull')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Restore a pulled listing: no reason required, the trail records the actor. */
export function RestoreModal({
  listing,
  onClose,
  onDone,
}: {
  listing: { id: number; name: string };
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { t } = useI18n();
  const restore = useAdminRestoreListing();
  const [err, setErr] = useState<string | null>(null);

  const confirm = async () => {
    setErr(null);
    try {
      await restore.mutateAsync({ id: listing.id });
      onDone(t('admin.mod.restoreDone', { id: listing.id }));
    } catch (e) {
      setErr(apiErrorText(e, t) || t('admin.mod.errGeneric'));
    }
  };

  return (
    <div className="overlay" onClick={() => { if (!restore.isPending) onClose(); }}>
      <div className="modal" style={{ width: 'min(520px,100%)' }} onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <h2>{t('admin.mod.restoreTitle', { id: listing.id })}</h2>
          <button className="x" onClick={onClose} aria-label={t('action.close')} disabled={restore.isPending}>✕</button>
        </div>
        <div className="mb">
          <p className="strong" style={{ marginTop: 0 }}>{listing.name}</p>
          <p className="muted" style={{ fontSize: 12, lineHeight: 1.6 }}>{t('admin.mod.restoreBody')}</p>
          {err ? <div className="errtext" style={{ marginTop: 8 }}>{err}</div> : null}
        </div>
        <div className="mf">
          <button className="btn btn-grey" onClick={onClose} disabled={restore.isPending}>{t('action.cancel')}</button>
          <button id="admin-restore-confirm" className="btn btn-primary" onClick={() => void confirm()} disabled={restore.isPending}>
            {restore.isPending ? t('admin.common.working') : t('admin.mod.confirmRestore')}
          </button>
        </div>
      </div>
    </div>
  );
}
