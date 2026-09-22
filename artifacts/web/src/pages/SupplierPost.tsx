import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import {
  useCreateProduct,
  useUpdateProduct,
  useProduct,
  useMe,
  getToken,
} from '@workspace/api-client-react';
import type { ApiError, CreateProductInput } from '@workspace/api-client-react';
import { CATEGORIES, COUNTRIES } from '@workspace/api-spec';
import type { Product } from '@workspace/api-zod';
import { Spinner, Empty, DemoTag, Verified, StockTypeBadge, requireAuthGate } from '../components';
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
 * 3 Description & photo → 4 Review, with `.stepbar` progress, per-step
 * validation feedback (the step's own error, plus the offending inputs marked),
 * a live preview of the catalogue card built from exactly what has been typed,
 * and a review step that restates what will be submitted. The same component
 * renders flat (no `stepped`) inside the listings page's edit modal, so the
 * quick-edit path is unchanged.
 *
 * Honesty notes on this screen
 *  • Image upload is NOT built. The field takes a pasted image URL and stores it
 *    in `imageKey`; the hint says exactly that rather than implying an uploader.
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
  purityGrade: '',
  imageKey: '',
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
  purityGrade: string;
  imageKey: string;
}

/** Every box on the form, in the order the wizard walks them. */
const FORM_FIELDS: (keyof FormState)[] = [
  'name', 'category', 'originCountry', 'price', 'currency', 'unit', 'moq',
  'quantityAvailable', 'purityGrade', 'description', 'imageKey',
];

type StepId = 1 | 2 | 3 | 4;

/** Step labels reuse existing dictionary keys — no new strings are invented. */
const STEP_LABEL: Record<StepId, DictKey> = {
  1: 'post.details',
  2: 'post.unitPrice',
  3: 'post.description',
  4: 'dash.overview',
};
const STEPS: StepId[] = [1, 2, 3, 4];

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
    purityGrade: p.purityGrade ?? '',
    imageKey: p.imageKey ?? '',
  };
}

/** Optional listing fields, left out entirely when the supplier did not fill them in. */
interface OptionalListingFields {
  description?: string;
  currency?: string;
  moq?: number;
  quantityAvailable?: number;
  originCountry?: string;
  purityGrade?: string;
  imageKey?: string;
}

/**
 * The four fields api-zod requires, plus everything the supplier actually filled
 * in. Empty boxes are omitted rather than sent as '' — an omitted MOQ becomes the
 * server default 1, an empty string would fail validation.
 */
function toInput(f: FormState): CreateProductInput {
  const base: CreateProductInput = {
    name: f.name.trim(),
    category: f.category,
    price: Number(f.price),
    unit: f.unit.trim(),
  };
  const extra: OptionalListingFields = {
    description: f.description.trim() || undefined,
    currency: f.currency.trim() || undefined,
    moq: f.moq.trim() ? Number(f.moq) : undefined,
    quantityAvailable: f.quantityAvailable.trim() ? Number(f.quantityAvailable) : undefined,
    originCountry: f.originCountry || undefined,
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
  return '';
}

/** Which step a field belongs to — used to jump back to the offending step. */
const FIELD_STEP: Partial<Record<keyof FormState, StepId>> = {
  name: 1, category: 1, originCountry: 1,
  unit: 2, price: 2, currency: 2, moq: 2, quantityAvailable: 2, purityGrade: 2,
  description: 3, imageKey: 3,
};

/** The first problem inside one step. Steps 3 and 4 hold only optional fields. */
function stepProblem(step: StepId, f: FormState, t: I18nValue['t']): string {
  if (step === 1) {
    if (f.name.trim().length < 2) return t('post.errName');
    if (!f.category) return t('post.errCategory');
    return '';
  }
  if (step === 2) {
    if (f.unit.trim().length < 1) return t('post.errUnit');
    const price = Number(f.price);
    if (!Number.isFinite(price) || price <= 0) return t('post.errPrice');
    if (f.moq.trim() && !(Number(f.moq) > 0)) return t('post.errMoq');
    if (f.quantityAvailable.trim() && Number(f.quantityAvailable) < 0) return t('post.errQty');
    return '';
  }
  return '';
}

function money(currency: string, amount: number): string {
  return `${currency === 'USD' ? '$' : `${currency} `}${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function errorText(e: unknown, fallback: string): string {
  const err = e as Partial<ApiError> | undefined;
  if (err?.code === 'validation_error' && err.message) return err.message;
  if (err?.message) return err.message;
  return fallback;
}

interface ListingFormProps {
  /** Called with the saved row once the API accepts it. */
  onSaved: (p: Product) => void;
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
  const [form, setForm] = useState<FormState>(() => (product ? fromProduct(product) : { ...EMPTY_FORM }));
  const [err, setErr] = useState('');
  const [step, setStep] = useState<StepId>(1);
  /** Steps the supplier has already tried to leave — their errors are shown. */
  const [tried, setTried] = useState<Set<StepId>>(() => new Set());
  /** Set when a full save was attempted, so every invalid box is marked. */
  const [revealAll, setRevealAll] = useState(false);

  // A prefill that arrives after the first render (edit mode fetches by id).
  useEffect(() => {
    if (product) setForm(fromProduct(product));
  }, [product]);

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
      onSaved(saved);
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
            <div className="meta">{form.originCountry || t('post.notStated')}</div>
            <div className="meta">{form.category}</div>
            {hasMoq ? <div className="meta">{t('cards.moq')} {moq.toLocaleString(locale)} {unit}</div> : null}
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

      <div className="f2">
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
            {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
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

  /** Step 4 restates exactly the values that will be sent — nothing else. */
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
            <td className="v">{form.originCountry || t('post.notStated')}</td>
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
      {stepped && step < 4 ? (
        <button type="button" className="btn btn-primary" onClick={() => next(step)} disabled={pending}>
          {t('dash.next')}
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-gold"
          onClick={save}
          disabled={pending || !form.name.trim() || !form.price || !form.unit.trim()}
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
          : review
    : (
      <>
        {basics}
        {priceStock}
        {description}
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
        onSaved={() => navigate('/supplier/listings')}
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
