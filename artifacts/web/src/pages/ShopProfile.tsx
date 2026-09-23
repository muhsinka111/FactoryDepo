import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import {
  useMyShop,
  useUpdateMyShop,
  useUploadMedia,
  useMe,
  getToken,
} from '@workspace/api-client-react';
import type { ApiError } from '@workspace/api-client-react';
import type { MyShop, UpdateShopProfileInput } from '@workspace/api-zod';
import { COUNTRIES } from '@workspace/api-spec';
import { DemoTag, Empty, Spinner, countryCode, countryName, requireAuthGate, canSell } from '../components';
import { PageHeader, KpiRow, Kpi, SectionCard, EmptyState, metric } from '../dash';
import { useI18n, type I18nValue } from '../i18n';

/**
 * Your shop — the seller's own company record (GET/PATCH /api/suppliers/me).
 *
 * Identity, not an id: the API derives the row from the token, so this screen
 * holds no id anywhere and can only ever edit the caller's own shop.
 *
 * Honesty rules applied here
 *  • Every value on this page comes from the API. A column it did not return is
 *    an empty optional box, a figure it did not return is '—' (metric()), and
 *    `listingCount` is the API's own COUNT over this seller's listings.
 *  • Clearing an OPTIONAL input sends `null`, which is how the seller removes a
 *    value they once set. The copy says so before they save.
 *  • `verifiedLevel` is READ-ONLY and granted by the verification desk. Nothing
 *    here promises an upgrade; the link goes to the real document screen
 *    (/supplier/verification).
 *  • The country picker offers COUNTRIES from @workspace/api-spec — the one list
 *    every picker in the app shares — and additionally shows whatever value the
 *    row already stores (seeded rows hold a short code like 'TR'), marked "as
 *    stored", so keeping or changing it is a deliberate act rather than a silent
 *    rewrite of the record.
 *  • The logo is uploaded through POST /api/media and then attached with
 *    `logoMediaId`. The API accepts image/* up to 2 MB only; its 415/413
 *    `details` string is shown to the seller instead of a generic failure.
 */

interface ShopForm {
  companyName: string;
  country: string;
  city: string;
  addressLine: string;
  description: string;
  contactEmail: string;
  contactPhone: string;
  website: string;
  incoterms: string;
  leadTimeDays: string;
  paymentTerms: string;
}

const EMPTY_FORM: ShopForm = {
  companyName: '',
  country: '',
  city: '',
  addressLine: '',
  description: '',
  contactEmail: '',
  contactPhone: '',
  website: '',
  incoterms: '',
  leadTimeDays: '',
  paymentTerms: '',
};

/** The API's row, as the form's strings. A null column is an empty box. */
function fromShop(s: MyShop): ShopForm {
  const str = (v: string | null | undefined) => (v == null ? '' : String(v));
  return {
    companyName: str(s.companyName),
    country: str(s.country),
    city: str(s.city),
    addressLine: str(s.addressLine),
    description: str(s.description),
    contactEmail: str(s.contactEmail),
    contactPhone: str(s.contactPhone),
    website: str(s.website),
    incoterms: str(s.incoterms),
    leadTimeDays: s.leadTimeDays == null ? '' : String(s.leadTimeDays),
    paymentTerms: str(s.paymentTerms),
  };
}

/** An optional box: text clears it with `null`, empty text clears it too. */
function clearable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * The PATCH body. The two required fields are sent trimmed; an optional field
 * that has been emptied is sent as `null` so the API CLEARS it, and one that
 * still holds text is sent as that text. (Empty string is never sent: the
 * contract's clear signal is `null`.)
 */
function toInput(f: ShopForm): UpdateShopProfileInput {
  return {
    companyName: f.companyName.trim(),
    country: f.country,
    city: clearable(f.city),
    addressLine: clearable(f.addressLine),
    description: clearable(f.description),
    contactEmail: clearable(f.contactEmail),
    contactPhone: clearable(f.contactPhone),
    website: clearable(f.website),
    incoterms: clearable(f.incoterms),
    paymentTerms: clearable(f.paymentTerms),
    leadTimeDays: f.leadTimeDays.trim() === '' ? null : Number(f.leadTimeDays),
  };
}

/** The first thing the API would reject — caught here, before the request. */
function firstProblem(f: ShopForm, t: I18nValue['t']): string {
  if (f.companyName.trim().length < 2) return t('shop.errName');
  if (!f.country.trim()) return t('shop.errCountry');
  const email = f.contactEmail.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return t('shop.errEmail');
  const lead = f.leadTimeDays.trim();
  if (lead) {
    const n = Number(lead);
    if (!Number.isInteger(n) || n < 0 || n > 365) return t('shop.errLead');
  }
  return '';
}

/**
 * The API's own sentence when it has one, else the caller's. `apiFetch` builds
 * `ApiError(code, details ?? error)`, so a refused upload (415 / 413) arrives as
 * the media route's `details` sentence and is shown verbatim; a body that never
 * reached the route arrives as a bare code (`payload_too_large`), and a raw code
 * is not an answer — the caller's sentence states the rule the API enforces.
 */
function errorText(e: unknown, fallback: string): string {
  const err = e as Partial<ApiError> | undefined;
  const msg = err?.message;
  if (typeof msg === 'string' && /\s/.test(msg)) return msg;
  return fallback;
}

/** The public read URL the API built for a media id (GET /api/media/:id). */
function mediaUrl(id: number | null | undefined): string | null {
  return typeof id === 'number' && id > 0 ? `/api/media/${id}` : null;
}

/**
 * The picker is the market list ∪ the stored value. COUNTRIES holds display
 * names, but every stored row holds the ISO code, so the option VALUE is the
 * code and only the label is human — a picker written the other way round
 * silently rewrites 'TR' into 'Türkiye' on the first save. A value outside the
 * market list keeps its place, visibly, instead of the select falling back to
 * its first option.
 */
function countryOptions(stored: string): { value: string; label: string; extra: boolean }[] {
  const list = COUNTRIES.map((c) => ({ value: countryCode(c as string), label: c as string, extra: false }));
  if (stored && !list.some((o) => o.value === stored)) {
    list.unshift({ value: stored, label: countryName(stored), extra: true });
  }
  return list;
}

export default function ShopProfile() {
  const { t } = useI18n();
  const { data: user, isLoading: meLoading } = useMe();
  const loggedIn = !!getToken();
  const isSupplier = canSell(user);
  const ready = loggedIn && isSupplier;

  const shop = useMyShop({ enabled: ready });
  const update = useUpdateMyShop();
  const upload = useUploadMedia();

  /**
   * The hook's query options are typed from an un-parameterised
   * `UseQueryOptions`, so its `data` comes back as `unknown`. The response
   * contract is zMyShop, so the cast states exactly what the API returns.
   */
  const row = shop.data as MyShop | undefined;

  const [form, setForm] = useState<ShopForm>(EMPTY_FORM);
  const [hydrated, setHydrated] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');

  // Fill the boxes from the API row. Re-runs only while the seller has nothing
  // unsaved, so a background refetch can never overwrite typing — and after a
  // save it shows exactly the values the API stored.
  useEffect(() => {
    if (row && !dirty) {
      setForm(fromShop(row));
      setHydrated(true);
    }
  }, [row, dirty]);

  const set = <K extends keyof ShopForm>(key: K, value: ShopForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
    setNotice('');
  };

  const save = async () => {
    setErr('');
    setNotice('');
    const problem = firstProblem(form, t);
    if (problem) {
      setErr(problem);
      return;
    }
    try {
      await update.mutateAsync(toInput(form));
      setDirty(false);
      setNotice(t('shop.saved'));
    } catch (e) {
      setErr(errorText(e, t('shop.errSave')));
    }
  };

  /** Upload one image, then point the shop's logo at it. */
  const chooseLogo = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setErr('');
    setNotice('');
    // No client-side rule book here: the API owns the limits (image/* and 2 MB
    // decoded) and its 415/413 `details` sentence is what the seller reads, so
    // the two can never disagree. The rule is stated up front in `.hint` instead.
    try {
      const ref = await upload.mutateAsync(file);
      await update.mutateAsync({ logoMediaId: ref.id });
      setNotice(t('shop.logoUploaded'));
    } catch (e) {
      setErr(errorText(e, t('shop.logoFailed')));
    }
  };

  const removeLogo = async () => {
    setErr('');
    setNotice('');
    try {
      await update.mutateAsync({ logoMediaId: null });
      setNotice(t('shop.logoRemoved'));
    } catch (e) {
      setErr(errorText(e, t('shop.logoFailed')));
    }
  };

  /* ------------------------------- gates -------------------------------- */

  if (meLoading) {
    return (
      <>
        <PageHeader title={t('shop.title')} />
        <Spinner />
      </>
    );
  }

  if (!loggedIn || !user) {
    return (
      <>
        <PageHeader title={t('shop.title')} sub={t('shop.signInSub')} />
        <Empty title={t('shop.notSignedIn')}>
          {t('shop.notSignedInBody')}
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Link
              href="/sign-in?next=%2Fsupplier%2Fshop"
              className="btn btn-sm btn-primary"
              onClick={() => requireAuthGate()}
            >
              {t('action.signIn')}
            </Link>
            <Link href="/sign-up?next=%2Fsupplier%2Fshop" className="btn btn-sm btn-ghost">
              {t('action.createAccount')}
            </Link>
          </div>
        </Empty>
      </>
    );
  }

  if (!isSupplier) {
    return (
      <>
        <PageHeader title={t('shop.title')} sub={t('shop.signInSub')} />
        <Empty title={t('shop.supplierOnly')}>
          {t('shop.supplierOnlyBody', { role: user.role })}
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Link href="/supplier/listings" className="btn btn-sm btn-ghost">{t('shop.manageListings')}</Link>
          </div>
        </Empty>
      </>
    );
  }

  if (shop.isLoading) {
    return (
      <>
        <PageHeader title={t('shop.title')} />
        <Spinner />
      </>
    );
  }

  const missing = (shop.error as Partial<ApiError> | null)?.code === 'no_supplier';
  if (shop.isError && !shop.data) {
    return (
      <>
        <PageHeader title={t('shop.title')} sub={t('shop.signInSub')} />
        <EmptyState
          icon={missing ? '🏪' : '⚠️'}
          title={missing ? t('shop.noSupplierTitle') : t('shop.loadErrorTitle')}
          body={missing ? t('shop.noSupplierBody') : t('shop.loadErrorBody')}
          action={
            <div className="row" style={{ justifyContent: 'center', gap: 8 }}>
              <button className="btn btn-sm btn-grey" onClick={() => shop.refetch()}>{t('action.tryAgain')}</button>
              <Link href="/supplier/listings" className="btn btn-sm btn-ghost">{t('shop.manageListings')}</Link>
            </div>
          }
        />
      </>
    );
  }

  /* ------------------------------- the page ----------------------------- */

  const logoHref = mediaUrl(row?.logoMediaId);
  const level = row?.verifiedLevel;
  const levelText =
    typeof level !== 'number'
      ? '—'
      : level > 0
        ? t('shop.level', { n: level })
        : t('shop.notGranted');
  const pending = update.isPending || upload.isPending;

  return (
    <>
      <PageHeader
        title={t('shop.title')}
        sub={t('shop.sub')}
        actions={
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {row ? (
              <Link href={`/suppliers/${row.id}`} className="btn btn-sm btn-grey">
                {t('shop.viewPublic')}
              </Link>
            ) : null}
            <Link href="/supplier/listings" className="btn btn-sm btn-ghost">{t('shop.manageListings')}</Link>
          </div>
        }
      />

      {err && (
        <div className="flash bad" role="alert">
          <span>⚠</span>
          <span>{err}</span>
          <button className="x" onClick={() => setErr('')} aria-label={t('action.dismiss')}>✕</button>
        </div>
      )}
      {notice && (
        <div className="flash ok" role="status">
          <span>✓</span>
          <span>{notice}</span>
          <button className="x" onClick={() => setNotice('')} aria-label={t('action.dismiss')}>✕</button>
        </div>
      )}

      <KpiRow>
        <Kpi ic="📦" label={t('shop.listingCount')} value={metric(row?.listingCount)} />
        <Kpi ic="🛡️" label={t('shop.verifiedLevel')} value={levelText} />
      </KpiRow>

      <div className="shopgrid">
        <SectionCard title={t('shop.profileCard')}>
          <div className="f2">
            <div className="field">
              <label htmlFor="shop-name">{t('shop.company')} <i>*</i></label>
              <input
                id="shop-name"
                className="in"
                value={form.companyName}
                onChange={(e) => set('companyName', e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="shop-country">{t('shop.country')} <i>*</i></label>
              <select
                id="shop-country"
                className="in"
                value={form.country}
                onChange={(e) => set('country', e.target.value)}
              >
                {countryOptions(form.country).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.extra ? `${o.label} — ${t('shop.asStored')}` : o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="f2">
            <div className="field">
              <label htmlFor="shop-city">{t('shop.city')}</label>
              <input
                id="shop-city"
                className="in"
                value={form.city}
                onChange={(e) => set('city', e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="shop-address">{t('shop.address')}</label>
              <input
                id="shop-address"
                className="in"
                value={form.addressLine}
                onChange={(e) => set('addressLine', e.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="shop-about">{t('shop.about')}</label>
            <textarea
              id="shop-about"
              className="in"
              rows={4}
              placeholder={t('shop.aboutPlaceholder')}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </div>

          <div className="f2">
            <div className="field">
              <label htmlFor="shop-email">{t('shop.contactEmail')}</label>
              <input
                id="shop-email"
                className="in"
                inputMode="email"
                placeholder="sales@example.com"
                value={form.contactEmail}
                onChange={(e) => set('contactEmail', e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="shop-phone">{t('shop.contactPhone')}</label>
              <input
                id="shop-phone"
                className="in"
                inputMode="tel"
                placeholder="+90 232 000 00 00"
                value={form.contactPhone}
                onChange={(e) => set('contactPhone', e.target.value)}
              />
            </div>
          </div>

          <div className="f2">
            <div className="field">
              <label htmlFor="shop-web">{t('shop.website')}</label>
              <input
                id="shop-web"
                className="in"
                placeholder="example.com"
                value={form.website}
                onChange={(e) => set('website', e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="shop-incoterms">{t('shop.incoterms')}</label>
              <input
                id="shop-incoterms"
                className="in"
                placeholder="FOB Izmir"
                value={form.incoterms}
                onChange={(e) => set('incoterms', e.target.value)}
              />
            </div>
          </div>

          <div className="f2">
            <div className="field">
              <label htmlFor="shop-lead">{t('shop.leadTime')}</label>
              <input
                id="shop-lead"
                className="in"
                inputMode="numeric"
                placeholder="21"
                value={form.leadTimeDays}
                onChange={(e) => set('leadTimeDays', e.target.value)}
              />
              <div className="hint">{t('shop.leadTimeHint')}</div>
            </div>
            <div className="field">
              <label htmlFor="shop-payment">{t('shop.paymentTerms')}</label>
              <input
                id="shop-payment"
                className="in"
                placeholder="30% deposit / 70% before shipment"
                value={form.paymentTerms}
                onChange={(e) => set('paymentTerms', e.target.value)}
              />
            </div>
          </div>

          <div className="hintbox">
            <b>{t('shop.publicHint')}</b> {t('shop.clearsHint')}
          </div>

          <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <span className="muted" style={{ marginRight: 'auto' }}>
              {dirty ? t('shop.unsaved') : hydrated ? t('shop.upToDate') : ''}
            </span>
            <button className="btn btn-gold" onClick={save} disabled={pending}>
              {update.isPending ? t('shop.saving') : t('shop.save')}
            </button>
          </div>
        </SectionCard>

        <div className="grid" style={{ gap: 12 }}>
          <SectionCard title={t('shop.logo')}>
            <div className="showcard">
              <span className="shoplogo">
                {logoHref ? (
                  <img src={logoHref} alt={t('shop.logo')} />
                ) : (
                  <span className="blank">{t('shop.noLogo')}</span>
                )}
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="hint" style={{ marginTop: 0 }}>{t('shop.logoHint')}</div>
                <div className="galbar">
                  <label className={`upl${pending ? ' off' : ''}`} htmlFor="shop-logo-file">
                    {upload.isPending ? t('shop.uploading') : logoHref ? t('shop.logoReplace') : t('shop.logoUpload')}
                    <input
                      id="shop-logo-file"
                      type="file"
                      accept="image/*"
                      disabled={pending}
                      onChange={(e) => {
                        void chooseLogo(e.target.files);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  {logoHref ? (
                    <button className="btn btn-sm btn-ghost" onClick={removeLogo} disabled={pending}>
                      {t('shop.logoRemove')}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title={t('shop.verification')}>
            <table className="spectbl">
              <tbody>
                <tr>
                  <td className="k">{t('shop.verifiedLevel')}</td>
                  <td className="v">{levelText}</td>
                </tr>
                <tr>
                  <td className="k">{t('shop.listingCount')}</td>
                  <td className="v">{metric(row?.listingCount)}</td>
                </tr>
                <tr>
                  <td className="k">{t('shop.country')}</td>
                  <td className="v">{row?.country ? countryName(row.country) : '—'}</td>
                </tr>
              </tbody>
            </table>
            <p className="hint" style={{ marginTop: 10 }}>{t('shop.verificationNote')}</p>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              <Link href="/supplier/verification" className="btn btn-sm btn-grey">
                {t('shop.verificationLink')}
              </Link>
              {row?.dataSource === 'demo' ? <DemoTag /> : null}
            </div>
          </SectionCard>
        </div>
      </div>
    </>
  );
}
