import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import {
  useCreateProduct,
  useUpdateProduct,
  useProduct,
  useUploadMedia,
  useAttachProductMedia,
  useDetachProductMedia,
  useMe,
  getToken,
} from '@workspace/api-client-react';
import type { ApiError } from '@workspace/api-client-react';
import { CATEGORIES, COUNTRIES } from '@workspace/api-spec';
// The request body is typed here, from the api-zod CONTRACT it is validated
// against. The client's own CreateProductInput/UpdateProductInput stop at the
// pre-022 field list and would hide `location`, `leadTimeDays` and `listingType`
// from this form entirely; and zCreateProductInput's OUTPUT type is not the
// request shape either (`.default()` makes those fields required only after
// parsing). Reported, not worked around: lib/** is out of this task's scope.
import type { ListingType, MediaRef, Product } from '@workspace/api-zod';

/** The request body POST /api/products (and PATCH /:id) accepts. */
interface ListingBody {
  name: string;
  category: string;
  price: number;
  unit: string;
  description?: string;
  currency?: string;
  moq?: number;
  quantityAvailable?: number;
  originCountry?: string;
  location?: string;
  leadTimeDays?: number;
  purityGrade?: string;
  imageKey?: string;
  listingType?: ListingType;
  status?: 'active' | 'sold_out';
}
import {
  Spinner,
  Empty,
  DemoTag,
  Verified,
  StockTypeBadge,
  STOCK_TYPES,
  countryCode,
  countryName,
  requireAuthGate,
} from '../components';
import { PageHeader, SectionCard } from '../dash';
import { useI18n, type DictKey, type I18nValue } from '../i18n';

/**
 * Post stock — create a new listing, or edit an existing one.
 *
 * Routing (decided here, wired centrally in App.tsx):
 *   /supplier/post            → create a new lot with useCreateProduct()
 *   /supplier/post?id=<id>    → edit that lot with useUpdateProduct()
 *
 * The `?id=` edit mode was chosen over a listings-inline form so that one
 * component owns the whole listing form: the supplier flow always has a URL,
 * a refresh keeps you on the lot you are editing, and the validation/error
 * handling exists once instead of twice.
 *
 * The publish flow is stepped (`stepped`): 1 Basics → 2 Price & stock →
 * 3 Description → 4 Photos → 5 Review, with `.stepbar` progress, per-step
 * validation feedback (the step's own error, plus the offending inputs marked),
 * a live preview of the catalogue card built from exactly what has been typed,
 * and a review step that restates what will be submitted. The same component
 * renders flat (no `stepped`) inside the listings page's edit modal, so the
 * quick-edit path is unchanged.
 *
 * Honesty notes on this screen
 *  • Photos are REAL uploads (POST /api/media, migration 022), capped by the API
 *    at image/* and 2 MB decoded. Whatever the API refuses — 415 wrong type, 413
 *    too large — reaches the seller as the API's own `details` sentence instead
 *    of a generic failure. `imageKey` stays a pasted cover-image URL and is
 *    labelled as exactly that.
 *  • A NEW listing has no id yet, so nothing can be attached to it before it
 *    exists: in create mode the files upload first and are attached the moment
 *    POST /api/products returns an id. A photo that fails to attach is reported
 *    as a count — never silently dropped.
 *  • `location` and `leadTimeDays` are optional but NOT nullable in the listing
 *    contract, so an emptied box is omitted (= unchanged) and the hint says so
 *    rather than pretending the clear worked.
 *  • `dataSource` is set server-side ('platform' for anything a supplier posts),
 *    so nothing on this page invents provenance.
 *  • The preview card and the review step only ever show what the supplier
 *    typed. An empty optional field reads "Not set" — the form never fills in a
 *    default the supplier did not choose. The review step states the API's own
 *    server-side defaults (MOQ → 1, available → 0) as a note where they apply.
 *  • Nothing is shown as a metric here — the only numbers are the ones the
 *    supplier types in. The step chip's percentage counts filled form fields,
 *    nothing else.
 *  • No per-listing view count is shown: the API has no such field.
 */

const EMPTY_FORM = {
  name: '',
  category: CATEGORIES[0] as string,
  description: '',
  unit: 'MT',
  price: '',
  currency: 'USD',
  moq: '',
  quantityAvailable: '',
  originCountry: '',
  location: '',
  leadTimeDays: '',
  purityGrade: '',
  imageKey: '',
  listingType: 'stock',
  status: 'active',
} satisfies FormState;

const CURRENCIES = ['USD', 'EUR', 'TRY', 'CNY', 'GBP'] as const;

interface FormState {
  name: string;
  category: string;
  description: string;
  unit: string;
  price: string;
  currency: string;
  moq: string;
  quantityAvailable: string;
  originCountry: string;
  location: string;
  leadTimeDays: string;
  purityGrade: string;
  imageKey: string;
  listingType: string;
  status: string;
}

/**
 * Every box the seller types into, in the order the wizard walks them. The two
 * always-set selects (stock type, status) are deliberately left out — counting
 * them would inflate the completion figure the step chip reports.
 */
const FORM_FIELDS: (keyof FormState)[] = [
  'name', 'category', 'originCountry', 'location', 'price', 'currency', 'unit', 'moq',
  'quantityAvailable', 'leadTimeDays', 'purityGrade', 'description', 'imageKey',
];

type StepId = 1 | 2 | 3 | 4 | 5;

/** Step labels reuse existing dictionary keys — no new strings are invented. */
const STEP_LABEL: Record<StepId, DictKey> = {
  1: 'post.details',
  2: 'post.unitPrice',
  3: 'post.description',
  4: 'post.photos',
  5: 'post.review',
};
const STEPS: StepId[] = [1, 2, 3, 4, 5];

/** A whole number of days inside the API's 0..365 window; '' is fine (unset). */
function badLeadTime(raw: string): boolean {
  if (raw.trim() === '') return false;
  const n = Number(raw);
  return !Number.isInteger(n) || n < 0 || n > 365;
}

function fromProduct(p: Product): FormState {
  return {
    name: p.name,
    category: p.category,
    description: p.description ?? '',
    unit: p.unit,
    price: String(p.price),
    currency: p.currency,
    moq: String(p.moq),
    quantityAvailable: String(p.quantityAvailable),
    originCountry: p.originCountry,
    location: p.location ?? '',
    leadTimeDays: p.leadTimeDays == null ? '' : String(p.leadTimeDays),
    purityGrade: p.purityGrade ?? '',
    imageKey: p.imageKey ?? '',
    listingType: p.listingType,
    status: p.status,
  };
}

/** Optional listing fields, left out entirely when the supplier did not fill them in. */
interface OptionalListingFields {
  description?: string;
  currency?: string;
  moq?: number;
  quantityAvailable?: number;
  originCountry?: string;
  location?: string;
  leadTimeDays?: number;
  purityGrade?: string;
  imageKey?: string;
  listingType?: ListingType;
  status?: 'active' | 'sold_out';
}

/**
 * The zCreateProductInput shape: the fields api-zod requires, plus everything
 * the supplier actually filled in. Empty boxes are omitted rather than sent as
 * '' — an omitted MOQ becomes the server default 1, an empty string would fail
 * validation. `location` / `leadTimeDays` are optional but not nullable, so an
 * emptied box is omitted too (the stored value stays) — the UI says so.
 */
function toInput(f: FormState): ListingBody {
  const base: ListingBody = {
    name: f.name.trim(),
    category: f.category,
    price: Number(f.price),
    unit: f.unit.trim(),
    listingType: (STOCK_TYPES as readonly string[]).includes(f.listingType)
      ? (f.listingType as ListingType)
      : 'stock',
    status: f.status === 'sold_out' ? 'sold_out' : 'active',
  };
  const extra: OptionalListingFields = {
    description: f.description.trim() || undefined,
    currency: f.currency.trim() || undefined,
    moq: f.moq.trim() ? Number(f.moq) : undefined,
    quantityAvailable: f.quantityAvailable.trim() ? Number(f.quantityAvailable) : undefined,
    originCountry: f.originCountry || undefined,
    location: f.location.trim() || undefined,
    leadTimeDays: f.leadTimeDays.trim() ? Number(f.leadTimeDays) : undefined,
    purityGrade: f.purityGrade.trim() || undefined,
    imageKey: f.imageKey.trim() || undefined,
  };
  return { ...base, ...extra };
}

/** Client-side validation. Returns the first problem, or '' when the form is usable. */
function firstProblem(f: FormState, t: I18nValue['t']): string {
  if (f.name.trim().length < 2) return t('post.errName');
  if (!f.category) return t('post.errCategory');
  if (f.unit.trim().length < 1) return t('post.errUnit');
  const price = Number(f.price);
  if (!Number.isFinite(price) || price <= 0) return t('post.errPrice');
  if (f.moq.trim() && !(Number(f.moq) > 0)) return t('post.errMoq');
  if (f.quantityAvailable.trim() && Number(f.quantityAvailable) < 0) {
    return t('post.errQty');
  }
  if (f.location.trim().length > 120) return t('post.errLocation');
  if (badLeadTime(f.leadTimeDays)) return t('post.errLead');
  return '';
}

/** Which step a field belongs to — used to jump back to the offending step. */
const FIELD_STEP: Partial<Record<keyof FormState, StepId>> = {
  name: 1, category: 1, originCountry: 1, location: 1,
  unit: 2, price: 2, currency: 2, moq: 2, quantityAvailable: 2, purityGrade: 2,
  leadTimeDays: 2, listingType: 2, status: 2,
  description: 3, imageKey: 3,
};

/** The first problem inside one step. Step 4 holds only optional fields. */
function stepProblem(step: StepId, f: FormState, t: I18nValue['t']): string {
  if (step === 1) {
    if (f.name.trim().length < 2) return t('post.errName');
    if (!f.category) return t('post.errCategory');
    if (f.location.trim().length > 120) return t('post.errLocation');
    return '';
  }
  if (step === 2) {
    if (f.unit.trim().length < 1) return t('post.errUnit');
    const price = Number(f.price);
    if (!Number.isFinite(price) || price <= 0) return t('post.errPrice');
    if (f.moq.trim() && !(Number(f.moq) > 0)) return t('post.errMoq');
    if (f.quantityAvailable.trim() && Number(f.quantityAvailable) < 0) return t('post.errQty');
    if (badLeadTime(f.leadTimeDays)) return t('post.errLead');
    return '';
  }
  return '';
}

function money(currency: string, amount: number): string {
  return `${currency === 'USD' ? '$' : `${currency} `}${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

/**
 * The API's own sentence when it has one, else the caller's. `ApiError` carries
 * `details ?? error` as its message, so the media route's 415/413 sentence is
 * shown verbatim, while a body that never reached the route (a bare
 * `payload_too_large` code) falls back to the caller's rule sentence.
 */
function errorText(e: unknown, fallback: string): string {
  const err = e as Partial<ApiError> | undefined;
  const msg = err?.message;
  if (typeof msg === 'string' && /\s/.test(msg)) return msg;
  return fallback;
}

interface ListingFormProps {
  /**
   * Called with the saved row once the API accepts it. `failedPhotos` counts the
   * gallery photos that could not be attached to a NEWLY created listing, so the
   * caller can say so instead of reporting a clean save.
   */
  onSaved: (p: Product, failedPhotos?: number) => void;
  onCancel?: () => void;
  /** Present in edit mode: the row being changed. */
  product?: Product | undefined;
  /** Render the stepped publish flow (page) instead of the flat form (modal). */
  stepped?: boolean;
  /** Extra right-hand column content in stepped mode (how the listing behaves). */
  aside?: ReactNode;
}

/**
 * The listing form itself, shared by the create and edit modes.
 * Exported so a listings screen can render it inline (the edit modal does).
 */
export function ListingForm({ onSaved, onCancel, product, stepped = false, aside }: ListingFormProps) {
  const { t, locale } = useI18n();
  const create = useCreateProduct();
  const update = useUpdateProduct();
  const upload = useUploadMedia();
  const attach = useAttachProductMedia();
  const detach = useDetachProductMedia();
  const [form, setForm] = useState<FormState>(() => (product ? fromProduct(product) : { ...EMPTY_FORM }));
  const [err, setErr] = useState('');
  const [step, setStep] = useState<StepId>(1);
  /** Steps the supplier has already tried to leave — their errors are shown. */
  const [tried, setTried] = useState<Set<StepId>>(() => new Set());
  /** Set when a full save was attempted, so every invalid box is marked. */
  const [revealAll, setRevealAll] = useState(false);
  /** Uploaded in create mode, waiting for the listing id that attach needs. */
  const [pendingMedia, setPendingMedia] = useState<MediaRef[]>([]);
  /** How many uploads are in flight — the save button waits for them. */
  const [busyPhotos, setBusyPhotos] = useState(0);
  const [photoErr, setPhotoErr] = useState('');
  const [photoNote, setPhotoNote] = useState('');

  // A prefill that arrives after the first render (edit mode fetches by id).
  // Keyed on the listing ID, not on the row object: a photo being added or
  // removed re-renders the parent with a new row object, and hydrating the form
  // from it would throw away whatever the seller had typed but not saved.
  const [hydratedId, setHydratedId] = useState<number | null>(null);
  useEffect(() => {
    if (product && hydratedId !== product.id) {
      setForm(fromProduct(product));
      setHydratedId(product.id);
    }
  }, [product, hydratedId]);

  const pending = create.isPending || update.isPending;
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const invalid = {
    name: form.name.trim().length < 2,
    category: !form.category,
    unit: form.unit.trim().length < 1,
    price: !(Number(form.price) > 0),
    moq: form.moq.trim() !== '' && !(Number(form.moq) > 0),
    quantityAvailable: form.quantityAvailable.trim() !== '' && Number(form.quantityAvailable) < 0,
    location: form.location.trim().length > 120,
    leadTimeDays: badLeadTime(form.leadTimeDays),
  };
  const mark = (fieldStep: StepId, bad: boolean): boolean =>
    bad && (tried.has(fieldStep) || revealAll);

  const filled = FORM_FIELDS.filter((k) => String(form[k]).trim() !== '').length;
  const completion = Math.round((filled / FORM_FIELDS.length) * 100);

  const price = Number(form.price);
  const hasPrice = Number.isFinite(price) && price > 0;
  const unit = form.unit.trim();
  const moq = Number(form.moq);
  const hasMoq = form.moq.trim() !== '' && Number.isFinite(moq) && moq > 0;
  const qty = Number(form.quantityAvailable);
  const hasQty = form.quantityAvailable.trim() !== '' && Number.isFinite(qty) && qty >= 0;
  const imageUrl = form.imageKey.trim();

  /** Walk every step and return the first problem together with its step. */
  const anyProblem = useMemo(() => {
    for (const s of [1, 2, 3] as StepId[]) {
      const p = stepProblem(s, form, t);
      if (p) return { step: s, problem: p };
    }
    return { step: null as StepId | null, problem: '' };
  }, [form, t]);

  /** The photos already on the listing (edit mode) — the API returns them ordered. */
  const savedMedia: MediaRef[] = product?.media ?? [];
  const shownPhotos = savedMedia.length + pendingMedia.length;

  /**
   * Upload one or more files, then attach them.
   *
   *  • Edit mode has a listing id, so the photo is attached immediately.
   *  • Create mode has none: the upload is held in `pendingMedia` and attached
   *    by `save()` the moment the API returns the new listing's id.
   *
   * There is deliberately NO client-side rule book here: the API owns the limits
   * (image/* only, 2 MB decoded) and its own 415 / 413 `details` sentence is what
   * the seller reads — `errorText` prefers `details` over the error code, so the
   * two sides can never state different rules. `.hint` says the rule up front.
   */
  const addPhotos = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setPhotoErr('');
    setPhotoNote('');
    for (const file of Array.from(files)) {
      setBusyPhotos((n) => n + 1);
      try {
        const ref = await upload.mutateAsync(file);
        if (product) {
          await attach.mutateAsync({ productId: product.id, mediaId: ref.id });
        } else {
          setPendingMedia((list) => [...list, ref]);
        }
        setPhotoNote(t('post.photoUploaded'));
      } catch (e) {
        setPhotoErr(errorText(e, t('post.photoUploadFailed')));
      } finally {
        setBusyPhotos((n) => n - 1);
      }
    }
  };

  const removeSaved = async (mediaId: number) => {
    if (!product) return;
    setPhotoErr('');
    setPhotoNote('');
    try {
      await detach.mutateAsync({ productId: product.id, mediaId });
      setPhotoNote(t('post.photoRemoved'));
    } catch (e) {
      setPhotoErr(errorText(e, t('post.photoDetachFailed')));
    }
  };

  const removePending = (mediaId: number) =>
    setPendingMedia((list) => list.filter((m) => m.id !== mediaId));

  const save = async () => {
    setErr('');
    const problem = firstProblem(form, t);
    if (problem) {
      // Reveal every field error and stand on the step that owns the problem.
      setTried(new Set<StepId>(STEPS));
      setRevealAll(true);
      if (stepped) setStep(anyProblem.step ?? 1);
      setErr(problem);
      return;
    }
    try {
      const input = toInput(form);
      const saved = product
        ? await update.mutateAsync({ id: product.id, ...input })
        : await create.mutateAsync(input);
      // Create mode only: the listing exists now, so its photos can be attached.
      let failed = 0;
      if (!product && pendingMedia.length > 0) {
        for (const m of pendingMedia) {
          try {
            await attach.mutateAsync({ productId: saved.id, mediaId: m.id });
          } catch {
            failed += 1;
          }
        }
      }
      onSaved(saved, failed);
    } catch (e) {
      setErr(errorText(e, product ? t('post.errSave') : t('post.errCreate')));
    }
  };

  const next = (from: StepId) => {
    const problem = stepProblem(from, form, t);
    setTried((s) => new Set(s).add(from));
    if (problem) {
      setErr(problem);
      return;
    }
    setErr('');
    setStep((from + 1) as StepId);
  };

  const back = () => {
    setErr('');
    setStep((s) => (s > 1 ? ((s - 1) as StepId) : s));
  };

  /* ------------------------------- preview ------------------------------- */

  const preview = (
    <div className="card">
      <div className="hd">
        <h2>{t('pd.keyFacts')}</h2>
      </div>
      <div className="bd">
        <div className="lcard">
          <div className="media">
            {imageUrl ? (
              <img src={imageUrl} alt="" />
            ) : (
              <div className="ph-empty">
                <span className="ph-cat">{form.category}</span>
                <span className="ph-note">{t('cards.noPhoto')}</span>
              </div>
            )}
            {product?.verified ? <span className="vtag"><Verified /></span> : null}
            {product?.dataSource === 'demo' ? <span className="ptag"><DemoTag /></span> : null}
            {product && product.listingType !== 'stock' ? (
              <span className="atag"><StockTypeBadge type={product.listingType} /></span>
            ) : null}
          </div>
          <div className="bd">
            <h3>{form.name.trim() || t('common.notSet')}</h3>
            <div className="meta">{form.originCountry ? countryName(form.originCountry) : t('post.notStated')}</div>
            <div className="meta">{form.category}</div>
            {hasMoq ? <div className="meta">{t('cards.moq')} {moq.toLocaleString(locale)} {unit}</div> : null}
            {/* The card shows `imageKey` (the cover URL), not the gallery — say so
                rather than letting an uploaded photo look like it vanished. */}
            {shownPhotos > 0 ? (
              <div className="meta">{t('post.previewGalleryNote', { n: shownPhotos })}</div>
            ) : null}
            <div className="between" style={{ marginTop: 'auto', paddingTop: 5 }}>
              <span className="price">
                {hasPrice ? money(form.currency, price) : t('common.notSet')}
                {hasPrice && unit ? <span> / {unit}</span> : null}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  /* -------------------------- per-step field groups ---------------------- */

  const basics = (
    <>
      <div className="field">
        <label htmlFor="lot-name">{t('post.lotName')} <i>*</i></label>
        <input
          id="lot-name"
          className={`in${mark(1, invalid.name) ? ' err' : ''}`}
          placeholder={t('post.lotNamePlaceholder')}
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
        />
      </div>

      <div className="f3">
        <div className="field">
          <label htmlFor="lot-category">{t('post.category')} <i>*</i></label>
          <select
            id="lot-category"
            className={`in${mark(1, invalid.category) ? ' err' : ''}`}
            value={form.category}
            onChange={(e) => set('category', e.target.value)}
          >
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="lot-country">{t('post.originCountry')}</label>
          <select
            id="lot-country"
            className="in"
            value={form.originCountry}
            onChange={(e) => set('originCountry', e.target.value)}
          >
            <option value="">{t('post.notStated')}</option>
            {/* The option VALUE is the ISO code because that is what a stored
                row holds (COUNTRIES only carries the display names): offering the
                names as values would rewrite every saved listing into a second
                representation. An unmapped stored value stays visible instead of
                the select falling back to its first option. */}
            {form.originCountry && !COUNTRIES.some((c) => countryCode(c as string) === form.originCountry) ? (
              <option value={form.originCountry}>
                {countryName(form.originCountry)} — {t('shop.asStored')}
              </option>
            ) : null}
            {COUNTRIES.map((c) => <option key={c} value={countryCode(c as string)}>{c}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="lot-location">{t('post.location')}</label>
          <input
            id="lot-location"
            className={`in${mark(1, invalid.location) ? ' err' : ''}`}
            placeholder="Izmir, TR"
            value={form.location}
            onChange={(e) => set('location', e.target.value)}
          />
          <div className="hint">{t('post.locationHint')}</div>
          {product ? <div className="hint">{t('post.noClearHint')}</div> : null}
        </div>
      </div>
    </>
  );

  const priceStock = (
    <>
      <div className="f3">
        <div className="field">
          <label htmlFor="lot-price">{t('post.unitPrice')} <i>*</i></label>
          <input
            id="lot-price"
            className={`in${mark(2, invalid.price) ? ' err' : ''}`}
            inputMode="decimal"
            placeholder="2450"
            value={form.price}
            onChange={(e) => set('price', e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="lot-currency">{t('post.currency')}</label>
          <select
            id="lot-currency"
            className="in"
            value={form.currency}
            onChange={(e) => set('currency', e.target.value)}
          >
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="lot-unit">{t('post.unit')} <i>*</i></label>
          <input
            id="lot-unit"
            className={`in${mark(2, invalid.unit) ? ' err' : ''}`}
            placeholder="MT"
            value={form.unit}
            onChange={(e) => set('unit', e.target.value)}
          />
        </div>
      </div>

      <div className="f3">
        <div className="field">
          <label htmlFor="lot-moq">{t('post.moq')}</label>
          <input
            id="lot-moq"
            className={`in${mark(2, invalid.moq) ? ' err' : ''}`}
            inputMode="decimal"
            placeholder="25"
            value={form.moq}
            onChange={(e) => set('moq', e.target.value)}
          />
          <div className="hint">{t('post.moqHint')}</div>
        </div>
        <div className="field">
          <label htmlFor="lot-qty">{t('post.available')}</label>
          <input
            id="lot-qty"
            className={`in${mark(2, invalid.quantityAvailable) ? ' err' : ''}`}
            inputMode="decimal"
            placeholder="500"
            value={form.quantityAvailable}
            onChange={(e) => set('quantityAvailable', e.target.value)}
          />
          <div className="hint">{t('post.availableHint')}</div>
        </div>
        <div className="field">
          <label htmlFor="lot-lead">{t('post.leadTime')}</label>
          <input
            id="lot-lead"
            className={`in${mark(2, invalid.leadTimeDays) ? ' err' : ''}`}
            inputMode="numeric"
            placeholder="21"
            value={form.leadTimeDays}
            onChange={(e) => set('leadTimeDays', e.target.value)}
          />
          <div className="hint">{t('post.leadTimeHint')}</div>
        </div>
      </div>

      <div className="f3">
        <div className="field">
          <label htmlFor="lot-purity">{t('post.purity')}</label>
          <input
            id="lot-purity"
            className="in"
            placeholder={t('post.purityPlaceholder')}
            value={form.purityGrade}
            onChange={(e) => set('purityGrade', e.target.value)}
          />
          <div className="hint">{t('post.optional')}</div>
        </div>
        <div className="field">
          <label htmlFor="lot-type">{t('post.stockType')}</label>
          <select
            id="lot-type"
            className="in"
            value={form.listingType}
            onChange={(e) => set('listingType', e.target.value)}
          >
            {STOCK_TYPES.map((ty) => (
              <option key={ty} value={ty}>{t(`type.${ty}` as DictKey)}</option>
            ))}
          </select>
        </div>
        <div className="field">
          {/* Status is a lifecycle field: a brand-new lot is published Active,
              and the seller changes it once the listing exists. */}
          <label htmlFor="lot-status">{t('post.status')}</label>
          {product ? (
            <>
              <select
                id="lot-status"
                className="in"
                value={form.status}
                onChange={(e) => set('status', e.target.value)}
              >
                <option value="active">{t('status.active')}</option>
                <option value="sold_out">{t('status.sold_out')}</option>
              </select>
              <div className="hint">{t('post.statusHint')}</div>
            </>
          ) : (
            <div className="hintbox">{t('post.statusNew')}</div>
          )}
        </div>
      </div>
    </>
  );

  const description = (
    <>
      <div className="field">
        <label htmlFor="lot-description">{t('post.description')}</label>
        <textarea
          id="lot-description"
          className="in"
          rows={4}
          placeholder={t('post.descriptionPlaceholder')}
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
        />
        <div className="hint">
          {t('post.descriptionHint')}
        </div>
      </div>

      <div className="field">
        <label htmlFor="lot-image">{t('post.photoUrl')}</label>
        <input
          id="lot-image"
          className="in"
          placeholder={t('post.photoPlaceholder')}
          value={form.imageKey}
          onChange={(e) => set('imageKey', e.target.value)}
        />
        <div className="hint">
          <b>{t('post.photoHintLead')}</b> {t('post.photoHintTail')}
        </div>
        {imageUrl && (
          <div className="row" style={{ marginTop: 8, gap: 9 }}>
            <span className="thumb">
              <img src={imageUrl} alt="" />
            </span>
            <span className="muted" style={{ fontSize: 11.5 }}>
              {t('post.preview')}
            </span>
          </div>
        )}
      </div>
    </>
  );

  /**
   * The photo gallery: the photos already on the listing, the ones uploaded but
   * not yet attached, and the real file input. Every button here does something
   * in both modes — Remove detaches from the API, Add photos uploads to it.
   */
  const gallery = (
    <div className="field">
      <label htmlFor="lot-photo-file">{t('post.photos')}</label>
      {photoErr && <div className="errtext" role="alert">{photoErr}</div>}
      {photoNote && <div className="hint">{photoNote}</div>}
      <div className="galgrid">
        {savedMedia.map((m) => (
          <div className="galitem" key={`saved-${m.id}`}>
            <img src={m.url} alt={m.filename} />
            <button
              type="button"
              className="rm"
              onClick={() => void removeSaved(m.id)}
              disabled={detach.isPending}
            >
              {t('action.remove')}
            </button>
          </div>
        ))}
        {pendingMedia.map((m) => (
          <div className="galitem" key={`pending-${m.id}`}>
            <img src={m.url} alt={m.filename} />
            <span className="tag">{t('post.pendingPhoto')}</span>
            <button type="button" className="rm" onClick={() => removePending(m.id)}>
              {t('action.remove')}
            </button>
          </div>
        ))}
        {shownPhotos === 0 && <div className="galempty">{t('post.noPhotos')}</div>}
      </div>
      <div className="galbar">
        <label className={`upl${busyPhotos > 0 ? ' off' : ''}`} htmlFor="lot-photo-file">
          {busyPhotos > 0 ? t('post.uploading') : t('post.addPhotos')}
          <input
            id="lot-photo-file"
            type="file"
            accept="image/*"
            multiple
            disabled={busyPhotos > 0}
            onChange={(e) => {
              void addPhotos(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
        <span className="hint" style={{ marginTop: 0 }}>{t('post.photosHint')}</span>
      </div>
      {!product && pendingMedia.length > 0 && (
        <div className="galnote">{t('post.photosOnSave')}</div>
      )}
    </div>
  );

  /** Step 4 — the photos of the lot. The block above states the rule; the grid,
   *  the remove buttons and the upload control are the gallery itself. */
  const photosStep = gallery;

  /** Step 5 restates exactly the values that will be sent — nothing else. */
  const review = (
    <>
      <table className="spectbl">
        <tbody>
          <tr>
            <td className="k">{t('post.lotName')}</td>
            <td className="v">{form.name.trim() || t('common.notSet')}</td>
          </tr>
          <tr>
            <td className="k">{t('post.category')}</td>
            <td className="v">{form.category}</td>
          </tr>
          <tr>
            <td className="k">{t('post.originCountry')}</td>
            <td className="v">{form.originCountry ? countryName(form.originCountry) : t('post.notStated')}</td>
          </tr>
          <tr>
            <td className="k">{t('post.location')}</td>
            <td className="v">{form.location.trim() || t('common.notSet')}</td>
          </tr>
          <tr>
            <td className="k">{t('post.unitPrice')}</td>
            <td className="v">{hasPrice ? money(form.currency, price) : t('common.notSet')}</td>
          </tr>
          <tr>
            <td className="k">{t('post.unit')}</td>
            <td className="v">{unit || t('common.notSet')}</td>
          </tr>
          <tr>
            <td className="k">{t('post.moq')}</td>
            <td className="v">{hasMoq ? `${moq.toLocaleString(locale)} ${unit}` : t('common.notSet')}</td>
          </tr>
          <tr>
            <td className="k">{t('post.available')}</td>
            <td className="v">{hasQty ? `${qty.toLocaleString(locale)} ${unit}` : t('common.notSet')}</td>
          </tr>
          <tr>
            <td className="k">{t('post.leadTime')}</td>
            <td className="v">{form.leadTimeDays.trim() || t('common.notSet')}</td>
          </tr>
          <tr>
            <td className="k">{t('post.stockType')}</td>
            <td className="v">{t(`type.${form.listingType}` as DictKey)}</td>
          </tr>
          {product ? (
            <tr>
              <td className="k">{t('post.status')}</td>
              <td className="v">{t(`status.${form.status}` as DictKey)}</td>
            </tr>
          ) : null}
          <tr>
            <td className="k">{t('post.purity')}</td>
            <td className="v">{form.purityGrade.trim() || t('common.notSet')}</td>
          </tr>
          <tr>
            <td className="k">{t('post.description')}</td>
            <td className="v" style={{ whiteSpace: 'pre-line' }}>
              {form.description.trim() || t('common.notSet')}
            </td>
          </tr>
          <tr>
            <td className="k">{t('post.photoUrl')}</td>
            <td className="v" style={{ wordBreak: 'break-all' }}>{imageUrl || t('common.notSet')}</td>
          </tr>
          <tr>
            <td className="k">{t('post.photos')}</td>
            <td className="v">
              {shownPhotos === 0
                ? t('post.noPhotos')
                : t('pd.photoCount', { n: shownPhotos })}
            </td>
          </tr>
          <tr>
            <td className="k">{t('post.provenance')}</td>
            <td className="v">{t('post.platformListing')}</td>
          </tr>
        </tbody>
      </table>

      {!hasMoq && <div className="hint">{t('post.moqHint')}</div>}
      {!hasQty && <div className="hint">{t('post.availableHint')}</div>}

      <div className="stripe" style={{ marginTop: 12, marginBottom: 0 }}>
        <span>
          <b>
            {product
              ? t('post.subEdit', { id: product.id })
              : t('post.sub')}
          </b>
        </span>
      </div>
    </>
  );

  const submitLabel = pending
    ? t('post.saving')
    : product
      ? t('post.save')
      : t('nav.postStock');

  const actions = (
    <div className="row" style={{ justifyContent: 'flex-end', gap: 7, marginTop: 4 }}>
      {onCancel && (
        <button type="button" className="btn btn-grey" onClick={onCancel} disabled={pending}>
          {t('action.cancel')}
        </button>
      )}
      {stepped && step > 1 && (
        <button type="button" className="btn btn-grey" onClick={back} disabled={pending}>
          {t('dash.prev')}
        </button>
      )}
      {stepped && step < 5 ? (
        <button type="button" className="btn btn-primary" onClick={() => next(step)} disabled={pending}>
          {t('dash.next')}
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-gold"
          onClick={save}
          disabled={pending || busyPhotos > 0 || !form.name.trim() || !form.price || !form.unit.trim()}
        >
          {submitLabel}
        </button>
      )}
    </div>
  );

  const stepBar = (
    <div className="stepbar">
      {STEPS.map((s) => {
        const done = s < step || (tried.has(s) && stepProblem(s, form, t) === '');
        const cls = s === step ? 'st on' : done ? 'st ok' : 'st';
        return (
          <button
            key={s}
            type="button"
            className={cls}
            onClick={() => {
              if (s <= step) {
                setErr('');
                setStep(s);
              }
            }}
          >
            <span className="n">{done && s !== step ? '✓' : s}</span>
            {t(STEP_LABEL[s])}
          </button>
        );
      })}
      <span className="pill p-grey tnum" style={{ marginLeft: 'auto' }}>
        {t('dash.completionPct', { n: completion })}
      </span>
    </div>
  );

  const stepBody = stepped
    ? step === 1
      ? basics
      : step === 2
        ? priceStock
        : step === 3
          ? description
          : step === 4
            ? photosStep
            : review
    : (
      <>
        {basics}
        {priceStock}
        {description}
        {gallery}
      </>
    );

  const alert = err && <div className="errtext mb10" role="alert">{err}</div>;

  if (!stepped) {
    return (
      <>
        {alert}
        {stepBody}
        {actions}
      </>
    );
  }

  return (
    <div className="cols">
      <div className="card">
        <div className="hd">
          <h2>{product ? t('post.details') : t('post.newListing')}</h2>
          <span className="link muted">{t('post.requiredMark')}</span>
        </div>
        <div className="bd">
          {stepBar}
          {alert}
          {stepBody}
          {actions}
        </div>
      </div>

      <div className="grid" style={{ gap: 12 }}>
        {preview}
        {aside}
      </div>
    </div>
  );
}

function readId(): number | undefined {
  const raw = new URLSearchParams(window.location.search).get('id');
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

export default function SupplierPost() {
  const { t } = useI18n();
  const [, navigate] = useLocation();
  const { data: user, isLoading: meLoading } = useMe();
  const loggedIn = !!getToken();

  // `?id=` is read once on mount; the supplier stays on the same lot while editing.
  const [editId] = useState<number | undefined>(() => readId());
  const existing = useProduct(editId);
  const isSupplier = user?.role === 'supplier';

  if (meLoading) {
    return (
      <>
        <PageHeader title={t('post.title')} />
        <Spinner />
      </>
    );
  }

  if (!loggedIn || !user) {
    return (
      <>
        <PageHeader title={t('post.title')} sub={t('post.signInSub')} />
        <Empty title={t('post.notSignedIn')}>
          {t('post.notSignedInBody')}
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Link
              href="/sign-in?next=%2Fsupplier%2Fpost"
              className="btn btn-sm btn-primary"
              onClick={() => requireAuthGate()}
            >
              {t('action.signIn')}
            </Link>
            <Link href="/sign-up?next=%2Fsupplier%2Fpost" className="btn btn-sm btn-ghost">
              {t('post.createSupplierAccount')}
            </Link>
          </div>
        </Empty>
      </>
    );
  }

  if (!isSupplier) {
    return (
      <>
        <PageHeader title={t('post.title')} sub={t('post.signInSub')} />
        <Empty title={t('post.supplierOnly')}>
          {t('post.supplierOnlyBody', { role: user.role })}
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Link href="/supplier/listings" className="btn btn-sm btn-ghost">{t('post.myListings')}</Link>
          </div>
        </Empty>
      </>
    );
  }

  if (editId !== undefined && existing.isLoading) {
    return (
      <>
        <PageHeader title={t('post.titleEdit')} />
        <Spinner />
      </>
    );
  }

  if (editId !== undefined && (existing.isError || !existing.data)) {
    return (
      <>
        <PageHeader title={t('post.titleEdit')} />
        <Empty title={t('post.loadErrorTitle')}>
          {t('post.loadErrorBody')}
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <button className="btn btn-sm btn-grey" onClick={() => existing.refetch()}>{t('action.tryAgain')}</button>
            <Link href="/supplier/listings" className="btn btn-sm btn-ghost">{t('post.myListings')}</Link>
          </div>
        </Empty>
      </>
    );
  }

  const editing = editId !== undefined ? existing.data : undefined;

  return (
    <>
      <PageHeader
        title={editing ? t('post.titleEdit') : t('post.title')}
        sub={editing ? t('post.subEdit', { id: editing.id }) : t('post.sub')}
        actions={
          <div className="row" style={{ gap: 6 }}>
            <Link href="/supplier/listings" className="btn btn-sm btn-grey">{t('post.myListings')}</Link>
            <Link href="/supplier/offers" className="btn btn-sm btn-ghost">{t('nav.offersSup')}</Link>
          </div>
        }
      />

      <ListingForm
        stepped
        product={editing}
        onSaved={(_saved, failedPhotos) =>
          navigate(failedPhotos ? '/supplier/listings?notice=photos' : '/supplier/listings')
        }
        onCancel={editing ? () => navigate('/supplier/listings') : undefined}
        aside={
          <SectionCard title={t('post.behaviour')}>
            <p className="muted" style={{ marginTop: 0, fontSize: 12.5 }}>
              {t('post.behaviourBody')}
              <Link href="/supplier/offers"> {t('post.offersLink')}</Link>.
            </p>
            <table>
              <tbody>
                <tr>
                  <td className="muted">{t('post.provenance')}</td>
                  <td style={{ textAlign: 'right' }}>{t('post.platformListing')}</td>
                </tr>
                <tr>
                  <td className="muted">{t('post.photo')}</td>
                  <td style={{ textAlign: 'right' }}>{t('post.urlOnly')}</td>
                </tr>
                <tr>
                  <td className="muted">{t('post.buyerPaysBy')}</td>
                  <td style={{ textAlign: 'right' }}>{t('post.bankTransfer')}</td>
                </tr>
              </tbody>
            </table>
            <div className="stripe" style={{ marginTop: 12, marginBottom: 0 }}>
              <span>
                {t('post.noMetrics')}
              </span>
            </div>
          </SectionCard>
        }
      />
    </>
  );
}
