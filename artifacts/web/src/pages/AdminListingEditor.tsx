/**
 * AdminListingEditor — "admin can control and check everything" applied to ONE
 * listing: `/admin/listings/:id`.
 *
 * What this screen is for, and the rules it obeys:
 *
 *  1. It edits ANY listing, the price included, and an admin edit is NOT blocked
 *     by a pulled row (the seller's own PATCH is — 409 `listing_pulled`). It says
 *     out loud that the row belongs to somebody else: the seller's company name
 *     sits beside the price, in the summary bar and under the price input.
 *  2. Pull / restore / delete each go through a confirming step. Pulling REQUIRES
 *     a typed reason (the API's `zAdminPullListingInput` demands ≥3 characters);
 *     restoring needs none. The API hides a pulled listing from the public
 *     catalogue — the note states exactly that and nothing more, so no
 *     seller-private detail is echoed here.
 *  3. Every save, pull, restore and delete writes an `admin_audit` row in the
 *     same transaction as the change, and this listing's own trail is rendered on
 *     the same screen (loaded from `?entity=product&entityId=<id>`), so a
 *     mutation whose audit row never arrived would be visible immediately.
 *  4. Only the fields that actually change are sent, so the API writes no entry
 *     for a re-sent value; a save that changes nothing says so.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import {
  useAdminDeleteListing,
  useAdminUpdateListing,
  useProduct,
} from '@workspace/api-client-react';
import type { Product } from '@workspace/api-zod';
import { CATEGORIES, COUNTRIES } from '@workspace/api-spec';
import {
  DemoTag,
  Empty,
  Spinner,
  StatusChip,
  STOCK_TYPES,
  countryCode,
  countryName,
} from '../components';
import { PageHeader, SectionCard } from '../dash';
import { useI18n, type DictKey } from '../i18n';
import {
  AdminWall,
  EntityTrail,
  Flash,
  PullModal,
  RestoreModal,
  apiErrorText,
  asRecord,
  deletedProductIds,
  isNotFound,
  useAdminGate,
  useAdminTrail,
} from './AdminKit';

const CURRENCIES = ['USD', 'EUR', 'TRY', 'CNY', 'GBP'];

interface FormState {
  name: string;
  category: string;
  price: string;
  currency: string;
  unit: string;
  moq: string;
  quantityAvailable: string;
  status: string;
  listingType: string;
  originCountry: string;
  location: string;
  leadTimeDays: string;
  description: string;
}

/** The stored row is the only source for the form's starting values. */
function fromRow(p: Product): FormState {
  return {
    name: p.name,
    category: p.category,
    price: String(p.price),
    currency: p.currency,
    unit: p.unit,
    moq: String(p.moq),
    quantityAvailable: String(p.quantityAvailable),
    status: p.status,
    listingType: p.listingType ?? 'stock',
    originCountry: p.originCountry ?? '',
    location: p.location ?? '',
    leadTimeDays: p.leadTimeDays === null || p.leadTimeDays === undefined ? '' : String(p.leadTimeDays),
    description: p.description ?? '',
  };
}

/**
 * ONLY the changed fields, as numbers where the column is numeric. The API diffs
 * the stored row against this patch, so an unchanged field here would be a no-op
 * anyway — sending it is what would be wrong, because the trail records intent.
 */
function buildPatch(form: FormState, live: Product): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const name = form.name.trim();
  if (name !== live.name) out.name = name;
  if (form.category !== live.category) out.category = form.category;
  if (form.currency !== live.currency) out.currency = form.currency;
  if (form.unit.trim() !== live.unit) out.unit = form.unit.trim();
  if (form.status !== live.status) out.status = form.status;
  if (form.listingType !== (live.listingType ?? 'stock')) out.listingType = form.listingType;

  const num = (v: string) => (v.trim() === '' ? NaN : Number(v));
  const price = num(form.price);
  if (Number.isFinite(price) && price !== live.price) out.price = price;
  const moq = num(form.moq);
  if (Number.isFinite(moq) && moq !== live.moq) out.moq = moq;
  const qty = num(form.quantityAvailable);
  if (Number.isFinite(qty) && qty !== live.quantityAvailable) out.quantityAvailable = qty;

  const country = form.originCountry.trim();
  if (country !== '' && country !== (live.originCountry ?? '')) out.originCountry = country;

  // `location` / `description` accept an empty string, so clearing them works.
  const loc = form.location.trim();
  if (loc !== (live.location ?? '')) out.location = loc;
  if (form.description !== (live.description ?? '')) out.description = form.description;

  // `leadTimeDays` cannot be nulled through this contract — an emptied input is
  // therefore NOT sent, and the field's hint says so.
  const lead = num(form.leadTimeDays);
  if (Number.isFinite(lead) && lead !== (live.leadTimeDays ?? null)) out.leadTimeDays = lead;

  return out;
}

/** A clear confirmation for the one irreversible control on this page. */
function DeleteModal({
  listing,
  onClose,
  onDone,
}: {
  listing: { id: number; name: string };
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { t } = useI18n();
  const del = useAdminDeleteListing();
  const [err, setErr] = useState<string | null>(null);
  const confirm = async () => {
    setErr(null);
    try {
      await del.mutateAsync({ id: listing.id });
      onDone(t('admin.edit.deleteDone', { id: listing.id }));
    } catch (e) {
      setErr(apiErrorText(e, t) || t('admin.edit.deleteErrFallback'));
    }
  };
  return (
    <div className="overlay" onClick={() => { if (!del.isPending) onClose(); }}>
      <div className="modal" style={{ width: 'min(520px,100%)' }} onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <h2>{t('admin.edit.deleteTitle', { id: listing.id })}</h2>
          <button className="x" onClick={onClose} aria-label={t('action.close')} disabled={del.isPending}>✕</button>
        </div>
        <div className="mb">
          <p className="strong" style={{ marginTop: 0 }}>{listing.name}</p>
          <p className="muted" style={{ fontSize: 12, lineHeight: 1.6 }}>{t('admin.edit.deleteBody')}</p>
          {err ? <div className="errtext" style={{ marginTop: 8 }}>{err}</div> : null}
        </div>
        <div className="mf">
          <button className="btn btn-grey" onClick={onClose} disabled={del.isPending}>{t('action.cancel')}</button>
          <button id="admin-delete-confirm" className="btn btn-red" onClick={() => void confirm()} disabled={del.isPending}>
            {del.isPending ? t('admin.common.working') : t('admin.edit.confirmDelete')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminListingEditor({ params }: { params?: { id?: string } }) {
  const { t, locale } = useI18n();
  const [loc] = useLocation();
  const id = Number(params?.id ?? loc.split('/')[3] ?? NaN);
  const gate = useAdminGate();

  const detail = useProduct(Number.isFinite(id) ? id : undefined);
  const save = useAdminUpdateListing();
  const trail = useAdminTrail(
    { entity: 'product', entityId: Number.isFinite(id) ? id : undefined, limit: 20 },
    gate.isAdmin && Number.isFinite(id),
  );

  const live = detail.data;
  const [form, setForm] = useState<FormState | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);
  const [pulling, setPulling] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Seed (and re-seed) the form from the row the API returned — never from a
  // cached list row, so an admin always edits what is stored right now.
  useEffect(() => {
    if (live) setForm(fromRow(live));
  }, [live]);

  const patch = useMemo(() => (form && live ? buildPatch(form, live) : {}), [form, live]);
  const changed = Object.keys(patch).length;

  const errors = useMemo(() => {
    if (!form) return [] as DictKey[];
    const out: DictKey[] = [];
    if (form.name.trim().length < 2) out.push('admin.edit.name');
    if (!(Number(form.price) > 0)) out.push('admin.edit.price');
    if (!(Number(form.moq) > 0)) out.push('admin.edit.moq');
    if (form.unit.trim() === '') out.push('admin.edit.unit');
    const lead = form.leadTimeDays.trim();
    if (lead !== '' && (!Number.isInteger(Number(lead)) || Number(lead) < 0 || Number(lead) > 365)) {
      out.push('admin.edit.lead');
    }
    return out;
  }, [form]);

  const pulled = live?.moderationStatus === 'pulled';

  /**
   * Who pulled this listing, straight from the trail — the pull entry carries
   * `after.pulledBy` / `after.pulledAt`. When no pull entry is in the loaded
   * window the screen simply states the state without inventing an actor.
   */
  const pullEntry = useMemo(() => {
    if (!trail.data) return null;
    const pulls = trail.data.items.filter((r) => r.action === 'listing.pull' && asRecord(r.after).moderationStatus === 'pulled');
    if (pulls.length === 0) return null;
    if (live?.pulledReason) {
      const match = pulls.find((r) => asRecord(r.after).pulledReason === live.pulledReason);
      if (match) return match;
    }
    return pulls[0];
  }, [trail.data, live?.pulledReason]);

  if (!gate.signedIn) {
    return <AdminWall signedIn={false} subKey="admin.edit.adminOnlySub" bodyKey="admin.edit.signedInBody" backTo="/admin/listings" />;
  }
  if (gate.loading) {
    return (
      <>
        <PageHeader title={t('nav.adminListings')} />
        <Spinner />
      </>
    );
  }
  if (!gate.isAdmin) {
    return <AdminWall signedIn role={gate.me.data?.role} subKey="admin.edit.adminOnlySub" bodyKey="admin.edit.signedInBody" backTo="/admin/listings" />;
  }

  if (detail.isLoading) {
    return (
      <>
        <PageHeader title={t('admin.edit.title', { id })} />
        <Spinner />
      </>
    );
  }

  if (detail.isError || !live || !form) {
    // A 404 is a different fact from a failed request: only the first means the
    // listing is gone, and the trail below still answers for it either way.
    const gone = isNotFound(detail.error);
    return (
      <>
        <PageHeader
          title={t('admin.edit.title', { id })}
          actions={<Link href="/admin/listings" className="btn btn-sm btn-ghost">{t('admin.edit.backToList')}</Link>}
        />
        <Empty title={gone ? t('admin.edit.notFoundTitle') : t('admin.edit.loadErrorTitle')}>
          {gone ? t('admin.edit.notFoundBody') : t('admin.edit.loadErrorBody')}
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <button className="btn btn-sm btn-primary" onClick={() => void detail.refetch()}>{t('action.tryAgain')}</button>
            <Link href="/admin/listings" className="btn btn-sm btn-grey">{t('admin.edit.backToList')}</Link>
          </div>
        </Empty>
        <SectionCard title={t('admin.edit.trailTitle')}>
          {trail.data ? (
            <EntityTrail rows={trail.data.items} empty={t('admin.edit.trailEmpty')} deleted={deletedProductIds(trail.data.items)} />
          ) : (
            <div className="muted">—</div>
          )}
        </SectionCard>
      </>
    );
  }

  const row = { id: live.id, name: live.name };
  const set = (k: keyof FormState, v: string) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const doSave = async () => {
    if (changed === 0 || errors.length > 0) return;
    setMsg(null);
    try {
      await save.mutateAsync({ id: live.id, ...patch });
      setMsg({ kind: 'ok', text: t('admin.edit.saved') });
    } catch (e) {
      setMsg({ kind: 'bad', text: apiErrorText(e, t) || t('admin.edit.errFallback') });
    }
  };

  return (
    <>
      <PageHeader
        title={t('admin.edit.title', { id: live.id })}
        sub={t('admin.edit.sub')}
        crumb={
          <span>
            <Link href="/admin/listings">{t('admin.edit.crumbListings')}</Link>
            {' / '}
            {t('admin.edit.title', { id: live.id })}
          </span>
        }
        actions={
          <>
            <Link href={`/products/${live.id}`} className="btn btn-sm btn-ghost">{t('admin.edit.viewPublic')}</Link>
            <Link href={`/admin/audit?entity=product&entityId=${live.id}`} className="btn btn-sm btn-ghost">{t('admin.audit.viewFull')}</Link>
            <Link href="/admin/listings" className="btn btn-sm btn-grey">{t('admin.edit.backToList')}</Link>
          </>
        }
      />

      {msg ? <Flash kind={msg.kind}>{msg.text}</Flash> : null}

      {/* Whose row this is — said plainly, with the seller's name next to the price. */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="bd">
          <div className="ownerprice">
            <span className="amt">
              {live.currency === 'USD' ? '$' : `${live.currency} `}
              {live.price.toLocaleString(locale, { maximumFractionDigits: 2 })}
            </span>
            <span className="per">/ {live.unit}</span>
            <StatusChip status={live.status} />
            {pulled ? (
              <span className="pill pullpill">{t('admin.mod.pulled')}</span>
            ) : (
              <span className="pill p-green">{t('admin.mod.live')}</span>
            )}
            {live.dataSource === 'demo' ? <DemoTag /> : null}
          </div>
          <div className="ownerseller" title={t('admin.edit.priceOwnerTitle')}>
            {t('admin.edit.owner')}: <b>{live.supplierName}</b> · {t('admin.edit.supplierRef', { id: live.supplierId })} ·{' '}
            <Link href={`/suppliers/${live.supplierId}`}>{t('admin.audit.openSupplier')}</Link> ·{' '}
            <Link href={`/admin/audit?entity=supplier&entityId=${live.supplierId}`}>{t('admin.audit.forEntity', { id: live.supplierId })}</Link>
          </div>
          <div className="hintbox" style={{ marginTop: 9 }}>
            <b>{t('admin.edit.adminNoticeHead')}</b> — {t('admin.edit.adminNotice')}
          </div>
        </div>
      </div>

      <div className="admgrid">
        <div className="stack">
          <SectionCard
            title={t('admin.edit.sectionFields')}
            action={<span className="tnum">{changed === 0 ? t('admin.edit.clean') : t('admin.edit.dirty', { n: changed })}</span>}
          >
            {pulled ? (
              <div className="pullbar" style={{ marginBottom: 10 }}>
                <span className="ic">⚠</span>
                <span>
                  <b>{t('admin.mod.pulled')}.</b> {t('admin.mod.publicHidden')}
                  {live.pulledReason ? (
                    <>
                      {' '}
                      <b>{t('admin.mod.pulledReason')}:</b> {live.pulledReason}
                    </>
                  ) : null}
                  {pullEntry?.createdAt ? (
                    <span className="muted">
                      {' '}
                      {t('admin.mod.pulledBy', {
                        date: new Date(pullEntry.createdAt).toLocaleString(locale),
                        who: pullEntry.adminName ?? t('admin.audit.actorUnknown', { id: pullEntry.adminUserId }),
                      })}
                    </span>
                  ) : null}
                </span>
              </div>
            ) : null}

            <div className="edform">
              <div className="wide">
                <label htmlFor="admin-edit-name">{t('admin.edit.name')}</label>
                <input id="admin-edit-name" className="in" value={form.name} onChange={(e) => set('name', e.target.value)} />
              </div>
              <div>
                <label htmlFor="admin-edit-category">{t('admin.edit.category')}</label>
                <select id="admin-edit-category" className="in" value={form.category} onChange={(e) => set('category', e.target.value)}>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="admin-edit-price">{t('admin.edit.price')}</label>
                <input id="admin-edit-price" className="in" inputMode="decimal" value={form.price} onChange={(e) => set('price', e.target.value)} />
                <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>
                  {t('admin.edit.owner')}: {live.supplierName}
                </div>
              </div>
              <div>
                <label htmlFor="admin-edit-currency">{t('admin.edit.currency')}</label>
                <select id="admin-edit-currency" className="in" value={form.currency} onChange={(e) => set('currency', e.target.value)}>
                  {/* An unmapped stored currency stays visible instead of the select silently switching it. */}
                  {!CURRENCIES.includes(form.currency) ? <option value={form.currency}>{form.currency}</option> : null}
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="admin-edit-unit">{t('admin.edit.unit')}</label>
                <input id="admin-edit-unit" className="in" value={form.unit} onChange={(e) => set('unit', e.target.value)} />
              </div>
              <div>
                <label htmlFor="admin-edit-moq">{t('admin.edit.moq')}</label>
                <input id="admin-edit-moq" className="in" inputMode="numeric" value={form.moq} onChange={(e) => set('moq', e.target.value)} />
              </div>
              <div>
                <label htmlFor="admin-edit-qty">{t('admin.edit.qty')}</label>
                <input id="admin-edit-qty" className="in" inputMode="numeric" value={form.quantityAvailable} onChange={(e) => set('quantityAvailable', e.target.value)} />
              </div>
              <div>
                <label htmlFor="admin-edit-status">{t('admin.edit.status')}</label>
                <select id="admin-edit-status" className="in" value={form.status} onChange={(e) => set('status', e.target.value)}>
                  <option value="active">{t('status.active')}</option>
                  <option value="sold_out">{t('status.sold_out')}</option>
                </select>
              </div>
              <div>
                <label htmlFor="admin-edit-type">{t('admin.edit.listingType')}</label>
                <select id="admin-edit-type" className="in" value={form.listingType} onChange={(e) => set('listingType', e.target.value)}>
                  {STOCK_TYPES.map((ty) => (
                    <option key={ty} value={ty}>{t(`type.${ty}` as DictKey)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="admin-edit-country">{t('admin.edit.country')}</label>
                <select id="admin-edit-country" className="in" value={form.originCountry} onChange={(e) => set('originCountry', e.target.value)}>
                  <option value="">{t('admin.edit.notSet')}</option>
                  {/* The option VALUE is the stored ISO code (COUNTRIES holds display
                      names) — offering the names would rewrite the row on save. An
                      unmapped stored value stays visible instead of being dropped. */}
                  {form.originCountry && !COUNTRIES.some((c) => countryCode(c as string) === form.originCountry) ? (
                    <option value={form.originCountry}>
                      {countryName(form.originCountry)} — {t('admin.edit.notSet')}
                    </option>
                  ) : null}
                  {COUNTRIES.map((c) => (
                    <option key={c} value={countryCode(c as string)}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="admin-edit-location">{t('admin.edit.location')}</label>
                <input id="admin-edit-location" className="in" value={form.location} onChange={(e) => set('location', e.target.value)} />
              </div>
              <div>
                <label htmlFor="admin-edit-lead">{t('admin.edit.lead')}</label>
                <input id="admin-edit-lead" className="in" inputMode="numeric" value={form.leadTimeDays} onChange={(e) => set('leadTimeDays', e.target.value)} />
                <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>{t('admin.edit.leadKeep')}</div>
              </div>
              <div className="wide">
                <label htmlFor="admin-edit-desc">{t('admin.edit.desc')}</label>
                <textarea id="admin-edit-desc" value={form.description} onChange={(e) => set('description', e.target.value)} />
              </div>
            </div>

            {errors.length > 0 ? (
              <div className="errtext" style={{ marginTop: 8 }}>{errors.map((k) => t(k)).join(' · ')}</div>
            ) : null}

            <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button
                id="admin-edit-save"
                className="btn btn-primary"
                onClick={() => void doSave()}
                disabled={save.isPending || changed === 0 || errors.length > 0}
              >
                {save.isPending ? t('admin.common.working') : t('action.save')}
              </button>
              <button className="btn btn-grey" onClick={() => setForm(fromRow(live))} disabled={changed === 0}>
                {t('admin.edit.revert')}
              </button>
              {changed === 0 ? <span className="muted" style={{ fontSize: 12 }}>{t('admin.edit.noChangeNote')}</span> : null}
            </div>
          </SectionCard>

          <SectionCard
            title={t('admin.edit.trailTitle')}
            action={<Link href={`/admin/audit?entity=product&entityId=${live.id}`}>{t('admin.audit.viewFull')}</Link>}
          >
            {trail.isLoading ? (
              <Spinner />
            ) : trail.isError || !trail.data ? (
              <div className="muted">{t('admin.audit.loadErrorTitle')}</div>
            ) : (
              <EntityTrail rows={trail.data.items} empty={t('admin.edit.trailEmpty')} deleted={deletedProductIds(trail.data.items)} />
            )}
          </SectionCard>
        </div>

        <div className="stack">
          <SectionCard title={t('admin.mod.colModeration')}>
            <div className="stack tight">
              <div className="modstate">
                {pulled ? (
                  <span className="pill pullpill">{t('admin.mod.pulled')}</span>
                ) : (
                  <span className="pill p-green">{t('admin.mod.live')}</span>
                )}
              </div>
              {pulled ? <div className="warn">{t('admin.mod.publicHidden')}</div> : null}
              {pulled && live.pulledReason ? (
                <div className="kvline">
                  <span className="k">{t('admin.mod.pulledReason')}</span>
                  <span className="v">{live.pulledReason}</span>
                </div>
              ) : null}
              {pulled && pullEntry?.createdAt ? (
                <div className="kvline">
                  <span className="k">{t('admin.mod.colModeration')}</span>
                  <span className="v">
                    {t('admin.mod.pulledBy', {
                      date: new Date(pullEntry.createdAt).toLocaleString(locale),
                      who: pullEntry.adminName ?? t('admin.audit.actorUnknown', { id: pullEntry.adminUserId }),
                    })}
                  </span>
                </div>
              ) : null}
              <div className="row" style={{ gap: 7, flexWrap: 'wrap', marginTop: 4 }}>
                {pulled ? (
                  <button id="admin-restore-btn" className="btn btn-sm btn-primary" onClick={() => setRestoring(true)}>
                    {t('admin.mod.restore')}
                  </button>
                ) : (
                  <button id="admin-pull-btn" className="btn btn-sm btn-red" onClick={() => setPulling(true)}>
                    {t('admin.mod.pull')}
                  </button>
                )}
                <button id="admin-delete-btn" className="btn btn-sm btn-grey" onClick={() => setDeleting(true)}>
                  {t('admin.edit.delete')}
                </button>
              </div>
            </div>
          </SectionCard>

          <SectionCard title={t('admin.audit.colEntity')}>
            <div className="stack tight">
              <div className="kvline">
                <span className="k">{t('admin.audit.colEntity')}</span>
                <span className="v">
                  {t('admin.audit.entityProduct')} #{live.id}
                </span>
              </div>
              <div className="kvline">
                <span className="k">dataSource</span>
                <span className="v">
                  {live.dataSource === 'demo' ? (
                    <>
                      <DemoTag /> {t('admin.common.seed')}
                    </>
                  ) : (
                    t('admin.common.real')
                  )}
                </span>
              </div>
              <div className="kvline">
                <span className="k">{t('admin.listings.colCategory')}</span>
                <span className="v">{live.category}</span>
              </div>
              <div className="kvline">
                <span className="k">{t('admin.edit.country')}</span>
                <span className="v">{countryName(live.originCountry || '') || t('admin.edit.notSet')}</span>
              </div>
              <div className="kvline">
                <span className="k">{t('admin.listings.colCreated')}</span>
                <span className="v">{new Date(live.createdAt).toLocaleString(locale)}</span>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>

      {pulling ? (
        <PullModal
          listing={row}
          onClose={() => setPulling(false)}
          onDone={(text) => {
            setPulling(false);
            setMsg({ kind: 'ok', text });
          }}
        />
      ) : null}
      {restoring ? (
        <RestoreModal
          listing={row}
          onClose={() => setRestoring(false)}
          onDone={(text) => {
            setRestoring(false);
            setMsg({ kind: 'ok', text });
          }}
        />
      ) : null}
      {deleting ? (
        <DeleteModal
          listing={row}
          onClose={() => setDeleting(false)}
          onDone={(text) => {
            setDeleting(false);
            setMsg({ kind: 'ok', text });
          }}
        />
      ) : null}
    </>
  );
}
