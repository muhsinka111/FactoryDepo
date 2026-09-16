import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useRfqs, useCreateRfq, useMe } from '@workspace/api-client-react';
import { View, Empty, StatusChip, Spinner, requireAuthGate } from '../components';
import { CATEGORIES, COUNTRIES } from '@workspace/api-spec';
import type { Rfq } from '@workspace/api-zod';
import type { ApiError } from '@workspace/api-client-react';
import { useI18n } from '../i18n';

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

/** One dense table row for a request. */
function RequestRow({ r }: { r: Rfq }) {
  const { t, locale } = useI18n();
  const [, navigate] = useLocation();
  return (
    <tr
      onClick={() => navigate(`/rfqs/${r.id}`)}
      style={{ cursor: 'pointer' }}
      title={t('rfq.openAria', { id: r.id })}
    >
      <td>
        <b>{r.title}</b>
        <div className="muted">{t('rfq.requestRef', { category: r.category, id: r.id })}</div>
      </td>
      <td className="strong">
        {r.quantity.toLocaleString(locale)} {r.unit}
      </td>
      <td className="hidem">{r.targetCountry ?? '—'}</td>
      <td className="hidem">
        {t('rfq.quotesCount', { n: r.quoteCount.toLocaleString(locale) })}
      </td>
      <td className="hidem">{new Date(r.createdAt).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })}</td>
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
          {t('action.open')}
        </button>
      </td>
    </tr>
  );
}

export default function RfqExchange() {
  const { t, locale } = useI18n();
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
      setErr(t('rfq.errTitle'));
      return;
    }
    const quantity = Number(form.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setErr(t('rfq.errQuantity'));
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
      setErr((e as ApiError).message ?? t('rfq.errPost'));
    }
  };

  const title = isSupplier ? t('rfq.titleSupplier') : t('rfq.titleBuyer');
  const sub = isSupplier ? t('rfq.subSupplier') : t('rfq.subBuyer');

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
            {res.isFetching ? t('action.refreshing') : t('action.refresh')}
          </button>
          <button
            className="btn btn-gold"
            onClick={() => {
              // POST /api/rfqs is buyer-only: logged-out visitors get the member
              // gate, and anyone with another role sees an honest notice instead
              // of a form the API would reject.
              if (isBuyer) setShowForm(true);
              else if (!user) requireAuthGate();
              else setNotice(t('rfq.buyerOnlyNotice'));
            }}
          >
            {t('rfq.postRequest')}
          </button>
        </div>
      }
    >
      {notice && (
        <div className="stripe">
          <span>{notice}</span>
          <button className="x" onClick={() => setNotice('')} aria-label={t('action.dismiss')}>✕</button>
        </div>
      )}

      {/* honest headline counts, straight off the list response */}
      <div className="stripe">
        <span>
          <b>{res.isLoading ? '—' : total.toLocaleString(locale)}</b> {t('rfq.total')}
        </span>
        <span>
          <b>{res.isLoading ? '—' : openCount.toLocaleString(locale)}</b> {t('rfq.open')}
        </span>
        <span>
          <b>{res.isLoading ? '—' : quotedCount.toLocaleString(locale)}</b> {t('rfq.quoted')}
        </span>
        <span>
          <b>{res.isLoading ? '—' : closedCount.toLocaleString(locale)}</b> {t('rfq.closed')}
        </span>
      </div>

      <div className="card">
        <div className="hd">
          <h2>{isSupplier ? t('rfq.quoteable') : t('rfq.allRequests')}</h2>
          <span className="muted" style={{ marginLeft: 'auto' }}>
            {res.isLoading ? '—' : t('rfq.shown', { n: visible.length.toLocaleString(locale) })}
          </span>
        </div>

        {isSupplier && (
          <div className="filters" style={{ padding: '9px 12px 0' }}>
            <button
              className={`chip ${status === 'all' ? 'on' : ''}`}
              onClick={() => setStatus('all')}
            >
              {t('rfq.statusAll')}
            </button>
            <button
              className={`chip ${status === 'open' ? 'on' : ''}`}
              onClick={() => setStatus('open')}
            >
              {t('rfq.statusOpenCount', { n: openCount.toLocaleString(locale) })}
            </button>
            <button
              className={`chip ${status === 'quoted' ? 'on' : ''}`}
              onClick={() => setStatus('quoted')}
            >
              {t('rfq.statusQuotedCount', { n: quotedCount.toLocaleString(locale) })}
            </button>
            <span className="muted">{t('rfq.quotingCloses')}</span>
          </div>
        )}

        {res.isLoading ? (
          <Spinner />
        ) : visible.length === 0 ? (
          <div className="empty">
            <b>{items.length === 0 ? t('rfq.emptyNone') : t('rfq.emptyNoMatch')}</b>
            {items.length === 0
              ? isSupplier
                ? t('rfq.emptyNoneSupplier')
                : t('rfq.emptyNoneBuyer')
              : t('rfq.emptyNoMatchHint')}
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t('rfq.col.requirement')}</th>
                <th>{t('rfq.col.quantity')}</th>
                <th className="hidem">{t('rfq.col.deliverTo')}</th>
                <th className="hidem">{t('rfq.col.quotes')}</th>
                <th className="hidem">{t('rfq.col.posted')}</th>
                <th>{t('rfq.col.status')}</th>
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
            {t('rfq.postingBuyerOnly')}{' '}
            <Link href="/supplier/rfq-opportunities">{t('rfq.quoteOpen')}</Link>.
          </span>
        </div>
      )}

      {showForm && (
        <div className="overlay" onClick={closeForm}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="mh">
              <h2>{t('rfq.newTitle')}</h2>
              <button className="x" onClick={closeForm} aria-label={t('action.close')}>✕</button>
            </div>
            <div className="mb">
              {err && <div className="errtext" style={{ marginBottom: 10 }}>{err}</div>}
              <div className="field">
                <label htmlFor="rfq-title">{t('rfq.whatNeed')} <i>*</i></label>
                <input
                  id="rfq-title"
                  className="in"
                  placeholder={t('rfq.titlePlaceholder')}
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </div>
              <div className="f2">
                <div className="field">
                  <label htmlFor="rfq-category">{t('rfq.category')}</label>
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
                  <label htmlFor="rfq-country">{t('rfq.deliverTo')}</label>
                  <select
                    id="rfq-country"
                    className="in"
                    value={form.targetCountry}
                    onChange={(e) => setForm({ ...form, targetCountry: e.target.value })}
                  >
                    <option value="">{t('common.anyCountry')}</option>
                    {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="f2">
                <div className="field">
                  <label htmlFor="rfq-qty">{t('rfq.quantity')} <i>*</i></label>
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
                  <label htmlFor="rfq-unit">{t('rfq.unit')}</label>
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
                <label htmlFor="rfq-desc">{t('rfq.specification')}</label>
                <textarea
                  id="rfq-desc"
                  className="in"
                  rows={3}
                  placeholder={t('rfq.specPlaceholder')}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
                <div className="hint">
                  {t('rfq.specHint')}
                </div>
              </div>
            </div>
            <div className="mf">
              <button className="btn btn-grey" onClick={closeForm}>{t('action.cancel')}</button>
              <button
                className="btn btn-gold"
                disabled={create.isPending || !form.title.trim() || !form.quantity}
                onClick={submit}
              >
                {create.isPending ? t('rfqModal.posting') : t('rfqModal.post')}
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
  const { t, locale } = useI18n();
  return (
    <Link href={`/rfqs/${r.id}`} className="card">
      <div className="bd">
        <div className="between">
          <span className="muted">{r.category}</span>
          <StatusChip status={r.status} />
        </div>
        <b style={{ display: 'block', fontSize: 13, margin: '5px 0 3px' }}>{r.title}</b>
        <div className="muted">
          {r.quantity.toLocaleString(locale)} {r.unit} · {t('rfq.quotesCount', { n: r.quoteCount.toLocaleString(locale) })}
        </div>
      </div>
    </Link>
  );
}
