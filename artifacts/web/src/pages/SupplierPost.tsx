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
function firstProblem(f: FormState): string {
  if (f.name.trim().length < 2) return 'Give the lot a name — at least 2 characters.';
  if (!f.category) return 'Pick a category.';
  if (f.unit.trim().length < 1) return 'State the unit you sell in (MT, KG, pcs…).';
  const price = Number(f.price);
  if (!Number.isFinite(price) || price <= 0) return 'Unit price must be a number greater than zero.';
  if (f.moq.trim() && !(Number(f.moq) > 0)) return 'MOQ must be a number greater than zero.';
  if (f.quantityAvailable.trim() && Number(f.quantityAvailable) < 0) {
    return 'Available quantity cannot be negative.';
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
    const problem = firstProblem(form);
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
      setErr(errorText(e, product ? 'Could not save this listing.' : 'Could not post this listing.'));
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
        <label htmlFor="lot-name">Lot name <i>*</i></label>
        <input
          id="lot-name"
          className="in"
          placeholder="e.g. Copper cathode grade A, 99.99%"
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
        />
      </div>

      <div className="f2">
        <div className="field">
          <label htmlFor="lot-category">Category <i>*</i></label>
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
          <label htmlFor="lot-country">Origin country</label>
          <select
            id="lot-country"
            className="in"
            value={form.originCountry}
            onChange={(e) => set('originCountry', e.target.value)}
          >
            <option value="">Not stated</option>
            {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div className="field">
        <label htmlFor="lot-description">Description</label>
        <textarea
          id="lot-description"
          className="in"
          rows={3}
          placeholder="Grade, packing, Incoterms, lead time, certificates…"
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
        />
        <div className="hint">
          Buyers decide from this text. Say what is in the lot and how it ships.
        </div>
      </div>

      <div className="f3">
        <div className="field">
          <label htmlFor="lot-price">Unit price <i>*</i></label>
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
          <label htmlFor="lot-currency">Currency</label>
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
          <label htmlFor="lot-unit">Unit <i>*</i></label>
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
          <label htmlFor="lot-moq">Minimum order (MOQ)</label>
          <input
            id="lot-moq"
            className="in"
            inputMode="decimal"
            placeholder="25"
            value={form.moq}
            onChange={(e) => set('moq', e.target.value)}
          />
          <div className="hint">Defaults to 1.</div>
        </div>
        <div className="field">
          <label htmlFor="lot-qty">Available now</label>
          <input
            id="lot-qty"
            className="in"
            inputMode="decimal"
            placeholder="500"
            value={form.quantityAvailable}
            onChange={(e) => set('quantityAvailable', e.target.value)}
          />
          <div className="hint">Defaults to 0 — the stock you can ship today.</div>
        </div>
        <div className="field">
          <label htmlFor="lot-purity">Purity / grade</label>
          <input
            id="lot-purity"
            className="in"
            placeholder="99.99% / Grade A"
            value={form.purityGrade}
            onChange={(e) => set('purityGrade', e.target.value)}
          />
          <div className="hint">Optional.</div>
        </div>
      </div>

      <div className="field">
        <label htmlFor="lot-image">Photo URL</label>
        <input
          id="lot-image"
          className="in"
          placeholder="https://…/copper-cathode.jpg"
          value={form.imageKey}
          onChange={(e) => set('imageKey', e.target.value)}
        />
        <div className="hint">
          <b>File upload is not built yet.</b> Paste a public link to the photo and it is stored
          as this lot&apos;s image. Lots without a photo show a plain placeholder.
        </div>
        {form.imageKey.trim() && (
          <div className="row" style={{ marginTop: 8, gap: 9 }}>
            <span className="thumb">
              <img src={form.imageKey.trim()} alt="Listing photo preview" />
            </span>
            <span className="muted" style={{ fontSize: 11.5 }}>
              Preview — if nothing loads, the link is not a direct image.
            </span>
          </div>
        )}
      </div>

      <div className="row" style={{ justifyContent: 'flex-end', gap: 7, marginTop: 4 }}>
        {onCancel && (
          <button type="button" className="btn btn-grey" onClick={onCancel} disabled={pending}>
            Cancel
          </button>
        )}
        <button
          type="button"
          className="btn btn-gold"
          onClick={submit}
          disabled={pending || !form.name.trim() || !form.price || !form.unit.trim()}
        >
          {pending ? 'Saving…' : product ? 'Save changes' : 'Post stock'}
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
  const [, navigate] = useLocation();
  const { data: user, isLoading: meLoading } = useMe();
  const loggedIn = !!getToken();

  // `?id=` is read once on mount; the supplier stays on the same lot while editing.
  const [editId] = useState<number | undefined>(() => readId());
  const existing = useProduct(editId);
  const isSupplier = user?.role === 'supplier';

  if (meLoading) {
    return (
      <View title="Post stock">
        <Spinner />
      </View>
    );
  }

  if (!loggedIn || !user) {
    return (
      <View title="Post stock" sub="List ready stock so buyers can order or negotiate on it">
        <Empty title="You are not signed in">
          Posting stock is a supplier action. Sign in with a supplier account to publish a lot.
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Link
              href="/sign-in?next=%2Fsupplier%2Fpost"
              className="btn btn-sm btn-primary"
              onClick={() => requireAuthGate()}
            >
              Sign in
            </Link>
            <Link href="/sign-up?next=%2Fsupplier%2Fpost" className="btn btn-sm btn-ghost">
              Create a supplier account
            </Link>
          </div>
        </Empty>
      </View>
    );
  }

  if (!isSupplier) {
    return (
      <View title="Post stock" sub="List ready stock so buyers can order or negotiate on it">
        <Empty title="Supplier accounts only">
          Your account is a {user.role} account, so the API will not accept a listing from it.
          A supplier profile is required before stock can be posted.
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Link href="/supplier/listings" className="btn btn-sm btn-ghost">My listings</Link>
          </div>
        </Empty>
      </View>
    );
  }

  if (editId !== undefined && existing.isLoading) {
    return (
      <View title="Edit listing">
        <Spinner />
      </View>
    );
  }

  if (editId !== undefined && (existing.isError || !existing.data)) {
    return (
      <View title="Edit listing">
        <Empty title="Listing could not be loaded">
          This lot could not be loaded — try again, or return to your listings.
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <button className="btn btn-sm btn-grey" onClick={() => existing.refetch()}>Try again</button>
            <Link href="/supplier/listings" className="btn btn-sm btn-ghost">My listings</Link>
          </div>
        </Empty>
      </View>
    );
  }

  const editing = editId !== undefined ? existing.data : undefined;

  return (
    <View
      title={editing ? 'Edit listing' : 'Post stock'}
      sub={
        editing
          ? <>Changing lot #{editing.id} — saving overwrites the live listing</>
          : 'One lot per listing: what it is, what it costs and how much you can ship today'
      }
      actions={
        <Link href="/supplier/listings" className="btn btn-sm btn-grey">My listings</Link>
      }
    >
      <div className="cols">
        <div className="card">
          <div className="hd">
            <b>{editing ? 'Listing details' : 'New listing'}</b>
            <span className="muted" style={{ marginLeft: 'auto' }}>* required</span>
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
          <div className="hd"><b>How this listing behaves</b></div>
          <div className="bd">
            <p className="muted" style={{ marginTop: 0, fontSize: 12.5 }}>
              A posted lot appears in Explore straight away and can be ordered by any signed-in
              buyer. Buyers may also open an offer below your asking price; you answer those from
              <Link href="/supplier/offers"> Offers</Link>.
            </p>
            <table>
              <tbody>
                <tr>
                  <td className="muted">Provenance</td>
                  <td style={{ textAlign: 'right' }}>Platform listing</td>
                </tr>
                <tr>
                  <td className="muted">Photo</td>
                  <td style={{ textAlign: 'right' }}>URL only — upload not built</td>
                </tr>
                <tr>
                  <td className="muted">Buyer pays by</td>
                  <td style={{ textAlign: 'right' }}>Bank transfer</td>
                </tr>
              </tbody>
            </table>
            <div className="stripe" style={{ marginTop: 12, marginBottom: 0 }}>
              <span>
                Nothing on this page reports views, ratings or order counts — those figures are not
                measured yet, so they are not shown.
              </span>
            </div>
          </div>
        </div>
      </div>
    </View>
  );
}
