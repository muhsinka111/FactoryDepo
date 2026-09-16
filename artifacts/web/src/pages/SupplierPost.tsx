import { useEffect, useState } from 'react';
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
import { View, Spinner, Empty, requireAuthGate } from '../components';
import { useI18n, type I18nValue } from '../i18n';

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
 * Honesty notes on this screen
 *  • Image upload is NOT built. The field takes a pasted image URL and stores it
 *    in `imageKey`; the hint says exactly that rather than implying an uploader.
 *  • `dataSource` is set server-side ('platform' for anything a supplier posts),
 *    so nothing on this page invents provenance.
 *  • Nothing is shown as a metric here — the only numbers are the ones the
 *    supplier types in.
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
}

/**
 * The listing form itself, shared by the create and edit modes.
 * Exported so a listings screen can render it inline if that is ever wanted.
 */
export function ListingForm({ onSaved, onCancel, product }: ListingFormProps) {
  const { t } = useI18n();
  const create = useCreateProduct();
  const update = useUpdateProduct();
  const [form, setForm] = useState<FormState>(() => (product ? fromProduct(product) : { ...EMPTY_FORM }));
  const [err, setErr] = useState('');

  // A prefill that arrives after the first render (edit mode fetches by id).
  useEffect(() => {
    if (product) setForm(fromProduct(product));
  }, [product]);

  const pending = create.isPending || update.isPending;
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    setErr('');
    const problem = firstProblem(form, t);
    if (problem) {
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

  return (
    <>
      {err && (
        <div className="errtext" style={{ marginBottom: 10 }} role="alert">
          {err}
        </div>
      )}

      <div className="field">
        <label htmlFor="lot-name">{t('post.lotName')} <i>*</i></label>
        <input
          id="lot-name"
          className="in"
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
            className="in"
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

      <div className="field">
        <label htmlFor="lot-description">{t('post.description')}</label>
        <textarea
          id="lot-description"
          className="in"
          rows={3}
          placeholder={t('post.descriptionPlaceholder')}
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
        />
        <div className="hint">
          {t('post.descriptionHint')}
        </div>
      </div>

      <div className="f3">
        <div className="field">
          <label htmlFor="lot-price">{t('post.unitPrice')} <i>*</i></label>
          <input
            id="lot-price"
            className="in"
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
            className="in"
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
            className="in"
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
            className="in"
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
        {form.imageKey.trim() && (
          <div className="row" style={{ marginTop: 8, gap: 9 }}>
            <span className="thumb">
              <img src={form.imageKey.trim()} alt="" />
            </span>
            <span className="muted" style={{ fontSize: 11.5 }}>
              {t('post.preview')}
            </span>
          </div>
        )}
      </div>

      <div className="row" style={{ justifyContent: 'flex-end', gap: 7, marginTop: 4 }}>
        {onCancel && (
          <button type="button" className="btn btn-grey" onClick={onCancel} disabled={pending}>
            {t('action.cancel')}
          </button>
        )}
        <button
          type="button"
          className="btn btn-gold"
          onClick={submit}
          disabled={pending || !form.name.trim() || !form.price || !form.unit.trim()}
        >
          {pending ? t('post.saving') : product ? t('post.save') : t('nav.postStock')}
        </button>
      </div>
    </>
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
      <View title={t('post.title')}>
        <Spinner />
      </View>
    );
  }

  if (!loggedIn || !user) {
    return (
      <View title={t('post.title')} sub={t('post.signInSub')}>
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
      </View>
    );
  }

  if (!isSupplier) {
    return (
      <View title={t('post.title')} sub={t('post.signInSub')}>
        <Empty title={t('post.supplierOnly')}>
          {t('post.supplierOnlyBody', { role: user.role })}
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Link href="/supplier/listings" className="btn btn-sm btn-ghost">{t('post.myListings')}</Link>
          </div>
        </Empty>
      </View>
    );
  }

  if (editId !== undefined && existing.isLoading) {
    return (
      <View title={t('post.titleEdit')}>
        <Spinner />
      </View>
    );
  }

  if (editId !== undefined && (existing.isError || !existing.data)) {
    return (
      <View title={t('post.titleEdit')}>
        <Empty title={t('post.loadErrorTitle')}>
          {t('post.loadErrorBody')}
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <button className="btn btn-sm btn-grey" onClick={() => existing.refetch()}>{t('action.tryAgain')}</button>
            <Link href="/supplier/listings" className="btn btn-sm btn-ghost">{t('post.myListings')}</Link>
          </div>
        </Empty>
      </View>
    );
  }

  const editing = editId !== undefined ? existing.data : undefined;

  return (
    <View
      title={editing ? t('post.titleEdit') : t('post.title')}
      sub={editing ? t('post.subEdit', { id: editing.id }) : t('post.sub')}
      actions={
        <Link href="/supplier/listings" className="btn btn-sm btn-grey">{t('post.myListings')}</Link>
      }
    >
      <div className="cols">
        <div className="card">
          <div className="hd">
            <b>{editing ? t('post.details') : t('post.newListing')}</b>
            <span className="muted" style={{ marginLeft: 'auto' }}>{t('post.requiredMark')}</span>
          </div>
          <div className="bd">
            <ListingForm
              product={editing}
              onSaved={() => navigate('/supplier/listings')}
              onCancel={editing ? () => navigate('/supplier/listings') : undefined}
            />
          </div>
        </div>

        <div className="card">
          <div className="hd"><b>{t('post.behaviour')}</b></div>
          <div className="bd">
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
          </div>
        </div>
      </div>
    </View>
  );
}
