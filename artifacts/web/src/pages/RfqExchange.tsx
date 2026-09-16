import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useRfqs, useCreateRfq, useMe } from '@workspace/api-client-react';
import { View, Empty, StatusChip, Spinner, requireAuthGate } from '../components';
import { CATEGORIES, COUNTRIES } from '@workspace/api-spec';
import type { Rfq } from '@workspace/api-zod';
import type { ApiError } from '@workspace/api-client-react';

/**
 * RFQ exchange — one page, two roles.
 *
 *  • /rfqs                        buyer  → "My requests": everything they posted + a form to post more.
 *  • /supplier/rfq-opportunities  supplier → open requests they can quote.
 *
 * Every number shown is served by GET /api/rfqs. Nothing is inferred or embellished,
 * and fields the API does not return (e.g. the requesting company) are rendered "—".
 */

const UNITS = ['MT', 'KG', 'pcs', 'units', 'm', 'm²', 'm³', 'L', 'rolls', 'pallets', 'containers'] as const;

const EMPTY_FORM = {
  title: '',
  category: CATEGORIES[0] as string,
  description: '',
  quantity: '',
  unit: 'MT',
  targetCountry: '',
};

interface RfqForm {
  title: string;
  category: string;
  description: string;
  quantity: string;
  unit: string;
  targetCountry: string;
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** One dense table row for a request. */
function RequestRow({ r }: { r: Rfq }) {
  const [, navigate] = useLocation();
  return (
    <tr
      onClick={() => navigate(`/rfqs/${r.id}`)}
      style={{ cursor: 'pointer' }}
      title={`Open RFQ #${r.id}`}
    >
      <td>
        <b>{r.title}</b>
        <div className="muted">{r.category} · request #{r.id}</div>
      </td>
      <td className="strong">
        {r.quantity.toLocaleString()} {r.unit}
      </td>
      <td className="hidem">{r.targetCountry ?? '—'}</td>
      <td className="hidem">
        {r.quoteCount} quote{r.quoteCount === 1 ? '' : 's'}
      </td>
      <td className="hidem">{shortDate(r.createdAt)}</td>
      <td>
        <StatusChip status={r.status} />
      </td>
      <td style={{ textAlign: 'right' }}>
        <button
          className="btn btn-sm btn-ghost"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/rfqs/${r.id}`);
          }}
        >
          Open
        </button>
      </td>
    </tr>
  );
}

export default function RfqExchange() {
  const [, navigate] = useLocation();
  const res = useRfqs();
  const { data: user } = useMe();
  const create = useCreateRfq();

  const [showForm, setShowForm] = useState(false);
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');
  const [status, setStatus] = useState<'all' | 'open' | 'quoted' | 'closed'>('all');
  const [form, setForm] = useState<RfqForm>(EMPTY_FORM);

  const role = user?.role;
  const isSupplier = role === 'supplier';
  const isBuyer = role === 'buyer';
  const items = res.data?.items ?? [];
  const total = res.data?.total ?? items.length;

  // Suppliers see what they can act on; buyers see the requests they own.
  // Sorting a copied array — never the react-query cache.
  const base = isSupplier
    ? items.filter((r) => r.status === 'open').slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    : items;
  const visible = base.filter((r) => status === 'all' || r.status === status);

  const openCount = items.filter((r) => r.status === 'open').length;
  const quotedCount = items.filter((r) => r.status === 'quoted').length;
  const closedCount = items.filter((r) => r.status === 'closed').length;

  const closeForm = () => {
    setShowForm(false);
    setErr('');
  };

  const submit = async () => {
    setErr('');
    if (form.title.trim().length < 5) {
      setErr('Give the request a clear title — at least 5 characters.');
      return;
    }
    const quantity = Number(form.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setErr('Quantity must be a number greater than zero.');
      return;
    }
    try {
      const created = await create.mutateAsync({
        title: form.title.trim(),
        category: form.category,
        description: form.description.trim() || undefined,
        quantity,
        unit: form.unit.trim() || 'MT',
        targetCountry: form.targetCountry || undefined,
      });
      setForm(EMPTY_FORM);
      closeForm();
      navigate(`/rfqs/${created.id}`);
    } catch (e) {
      setErr((e as ApiError).message ?? 'Could not post this request.');
    }
  };

  const title = isSupplier ? 'RFQ opportunities' : 'Requests';
  const sub = isSupplier
    ? 'Open requirements posted by buyers. Respond with your price and lead time.'
    : 'Requirements currently on the exchange, newest first. Open one to see the quotations it has received.';

  return (
    <View
      title={title}
      sub={sub}
      actions={
        <div className="row">
          <button
            className="btn btn-sm btn-grey"
            onClick={() => res.refetch()}
            disabled={res.isFetching}
          >
            {res.isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
          <button
            className="btn btn-gold"
            onClick={() => {
              // POST /api/rfqs is buyer-only: logged-out visitors get the member
              // gate, and anyone with another role sees an honest notice instead
              // of a form the API would reject.
              if (isBuyer) setShowForm(true);
              else if (!user) requireAuthGate();
              else setNotice('Only buyer accounts can post a request. Sign in with a buyer profile to post one.');
            }}
          >
            + Post a request
          </button>
        </div>
      }
    >
      {notice && (
        <div className="stripe">
          <span>{notice}</span>
          <button className="x" onClick={() => setNotice('')} aria-label="Dismiss">✕</button>
        </div>
      )}

      {/* honest headline counts, straight off the list response */}
      <div className="stripe">
        <span>
          <b>{res.isLoading ? '—' : total.toLocaleString()}</b> requests total
        </span>
        <span>
          <b>{res.isLoading ? '—' : openCount}</b> open
        </span>
        <span>
          <b>{res.isLoading ? '—' : quotedCount}</b> quoted
        </span>
        <span>
          <b>{res.isLoading ? '—' : closedCount}</b> closed
        </span>
      </div>

      <div className="card">
        <div className="hd">
          <h2>{isSupplier ? 'Requests you can quote' : 'All requests'}</h2>
          <span className="muted" style={{ marginLeft: 'auto' }}>
            {res.isLoading ? '—' : `${visible.length} shown`}
          </span>
        </div>

        {isSupplier && (
          <div className="filters" style={{ padding: '9px 12px 0' }}>
            <button
              className={`chip ${status === 'all' ? 'on' : ''}`}
              onClick={() => setStatus('all')}
            >
              All
            </button>
            <button
              className={`chip ${status === 'open' ? 'on' : ''}`}
              onClick={() => setStatus('open')}
            >
              Open ({openCount})
            </button>
            <button
              className={`chip ${status === 'quoted' ? 'on' : ''}`}
              onClick={() => setStatus('quoted')}
            >
              Quoted ({quotedCount})
            </button>
            <span className="muted">Quoting closes when the buyer accepts an offer.</span>
          </div>
        )}

        {res.isLoading ? (
          <Spinner />
        ) : visible.length === 0 ? (
          <div className="empty">
            <b>{items.length === 0 ? 'No requests yet' : 'Nothing matches that filter'}</b>
            {items.length === 0
              ? isSupplier
                ? 'No open requirements on the exchange right now.'
                : 'Post your first requirement and verified factories will respond.'
              : 'Try a different status filter.'}
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Requirement</th>
                <th>Quantity</th>
                <th className="hidem">Deliver to</th>
                <th className="hidem">Quotes</th>
                <th className="hidem">Posted</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <RequestRow key={r.id} r={r} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {!isSupplier && (
        <div className="stripe" style={{ marginTop: 12 }}>
          <span>
            Posting is a buyer action. Suppliers can{' '}
            <Link href="/supplier/rfq-opportunities">quote open requirements</Link> instead.
          </span>
        </div>
      )}

      {showForm && (
        <div className="overlay" onClick={closeForm}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="mh">
              <h2>New request for quotation</h2>
              <button className="x" onClick={closeForm} aria-label="Close">✕</button>
            </div>
            <div className="mb">
              {err && <div className="errtext" style={{ marginBottom: 10 }}>{err}</div>}
              <div className="field">
                <label htmlFor="rfq-title">What do you need? <i>*</i></label>
                <input
                  id="rfq-title"
                  className="in"
                  placeholder="e.g. 100 MT copper cathode, grade A"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </div>
              <div className="f2">
                <div className="field">
                  <label htmlFor="rfq-category">Category</label>
                  <select
                    id="rfq-category"
                    className="in"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                  >
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="rfq-country">Deliver to</label>
                  <select
                    id="rfq-country"
                    className="in"
                    value={form.targetCountry}
                    onChange={(e) => setForm({ ...form, targetCountry: e.target.value })}
                  >
                    <option value="">Any country</option>
                    {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="f2">
                <div className="field">
                  <label htmlFor="rfq-qty">Quantity <i>*</i></label>
                  <input
                    id="rfq-qty"
                    className="in"
                    inputMode="decimal"
                    placeholder="100"
                    value={form.quantity}
                    onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="rfq-unit">Unit</label>
                  <input
                    id="rfq-unit"
                    className="in"
                    list="rfq-units"
                    placeholder="MT"
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  />
                  <datalist id="rfq-units">
                    {UNITS.map((u) => <option key={u} value={u} />)}
                  </datalist>
                </div>
              </div>
              <div className="field">
                <label htmlFor="rfq-desc">Specification</label>
                <textarea
                  id="rfq-desc"
                  className="in"
                  rows={3}
                  placeholder="Grade, purity, certifications, Incoterms, packing…"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
                <div className="hint">
                  The clearer the specification, the faster verified factories can quote.
                </div>
              </div>
            </div>
            <div className="mf">
              <button className="btn btn-grey" onClick={closeForm}>Cancel</button>
              <button
                className="btn btn-gold"
                disabled={create.isPending || !form.title.trim() || !form.quantity}
                onClick={submit}
              >
                {create.isPending ? 'Posting…' : 'Post request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </View>
  );
}

/**
 * Compact request card kept for embedding elsewhere in the app.
 * Kept exported so existing imports of this module keep resolving.
 */
export function RfqCardInline({ r }: { r: Rfq }) {
  return (
    <Link href={`/rfqs/${r.id}`} className="card">
      <div className="bd">
        <div className="between">
          <span className="muted">{r.category}</span>
          <StatusChip status={r.status} />
        </div>
        <b style={{ display: 'block', fontSize: 13, margin: '5px 0 3px' }}>{r.title}</b>
        <div className="muted">
          {r.quantity.toLocaleString()} {r.unit} · {r.quoteCount} quote{r.quoteCount === 1 ? '' : 's'}
        </div>
      </div>
    </Link>
  );
}
