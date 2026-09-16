import { useState } from 'react';
import { Link, useParams } from 'wouter';
import { useRfqDetail, useCreateQuote, useMe } from '@workspace/api-client-react';
import { View, Spinner, StatusChip, Verified, requireAuthGate } from '../components';
import type { ApiError } from '@workspace/api-client-react';
import type { Quote } from '@workspace/api-zod';
import { useI18n } from '../i18n';

/**
 * RFQ detail + its quotations.
 *
 * Route: /rfqs/:id. The id is read from the route (wouter passes no props into
 * the page component). Buyers read the quotations that arrived; suppliers with
 * a member account can submit one.
 */

function readId(): number {
  // Fallback for environments where the page is mounted outside a wouter route.
  const fromPath = window.location.pathname.split('/').filter(Boolean).pop();
  const n = Number(fromPath);
  return Number.isFinite(n) && n > 0 ? n : NaN;
}

function money(price: number, currency: string): string {
  const amount = price.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return currency === 'USD' ? `$${amount}` : `${currency} ${amount}`;
}

function QuoteRow({ q }: { q: Quote }) {
  const { t, locale } = useI18n();
  return (
    <tr>
      <td>
        <div className="row" style={{ gap: 7 }}>
          <span className="av">
            {q.supplierName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
          </span>
          <div style={{ minWidth: 0 }}>
            <b>{q.supplierName}</b>
            <div className="muted">{t('rfqDetail.trustScore', { n: Math.round(q.trustScore) })}</div>
          </div>
        </div>
      </td>
      <td className="strong" style={{ whiteSpace: 'nowrap' }}>{money(q.price, q.currency)}</td>
      <td style={{ whiteSpace: 'nowrap' }}>{t('rfqDetail.days', { n: q.leadTimeDays.toLocaleString(locale) })}</td>
      <td className="hidem">
        {q.notes ? <span className="muted">{q.notes}</span> : '—'}
      </td>
      <td className="hidem" style={{ whiteSpace: 'nowrap' }}>
        {new Date(q.createdAt).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })}
      </td>
      <td><StatusChip status={q.status} /></td>
    </tr>
  );
}

export default function RfqDetail() {
  const { t, locale } = useI18n();
  const params = useParams();
  const id = Number(params.id ?? readId());
  const { data, isLoading, error } = useRfqDetail(Number.isFinite(id) ? id : undefined);
  const { data: user } = useMe();
  const submitQuote = useCreateQuote(Number.isFinite(id) ? id : 0);

  const [err, setErr] = useState('');
  const [form, setForm] = useState({ price: '', leadTimeDays: '', notes: '' });

  const rfq = data?.rfq;
  const quotes = data?.quotes ?? [];
  const isSupplier = user?.role === 'supplier';
  const canQuote = isSupplier && rfq?.status !== 'closed';

  const submit = async () => {
    setErr('');
    const price = Number(form.price);
    const leadTimeDays = Number(form.leadTimeDays);
    if (!Number.isFinite(price) || price <= 0) {
      setErr(t('rfqDetail.errPrice'));
      return;
    }
    if (!Number.isInteger(leadTimeDays) || leadTimeDays <= 0 || leadTimeDays > 365) {
      setErr(t('rfqDetail.errLead'));
      return;
    }
    try {
      await submitQuote.mutateAsync({
        price,
        currency: 'USD',
        leadTimeDays,
        notes: form.notes.trim() || undefined,
      });
      setForm({ price: '', leadTimeDays: '', notes: '' });
    } catch (e) {
      setErr((e as ApiError).message ?? t('rfqDetail.errSubmit'));
    }
  };

  if (isLoading) {
    return (
      <View title={t('rfqDetail.loadingTitle')} sub={t('rfqDetail.loadingSub')}>
        <div className="card"><Spinner /></div>
      </View>
    );
  }

  if (error || !rfq) {
    return (
      <View title={t('rfqDetail.title')}>
        <div className="card">
          <div className="empty">
            <b>{t('rfqDetail.notFound')}</b>
            {t('rfqDetail.notFoundBody')}
            <div style={{ marginTop: 12 }}>
              <Link href="/rfqs" className="btn btn-sm btn-grey">{t('rfqDetail.backToRequests')}</Link>
            </div>
          </div>
        </div>
      </View>
    );
  }

  const postedOn = new Date(rfq.createdAt).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <View
      title={rfq.title}
      sub={
        <>
          <Link href="/rfqs">{t('rfqDetail.allRequests')}</Link> · {t('rfqDetail.postedOn', { date: postedOn })}
        </>
      }
      actions={<StatusChip status={rfq.status} />}
    >
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="hd">
          <span className="pill p-grey">{rfq.category}</span>
          <span className="muted">{t('rfqDetail.requestRef', { id: rfq.id })}</span>
          <span className="muted" style={{ marginLeft: 'auto' }}>
            {rfq.status === 'open' ? t('rfqDetail.accepting') : t('rfqDetail.notAccepting')}
          </span>
        </div>
        <div className="bd">
          {rfq.description
            ? <p style={{ margin: '0 0 12px', maxWidth: '80ch' }}>{rfq.description}</p>
            : <p className="muted" style={{ margin: '0 0 12px' }}>{t('rfqDetail.noSpec')}</p>}

          <div className="f3">
            <div className="card">
              <div className="bd">
                <div className="muted">{t('rfqDetail.quantity')}</div>
                <div className="strong" style={{ fontSize: 16 }}>
                  {rfq.quantity.toLocaleString(locale)} {rfq.unit}
                </div>
              </div>
            </div>
            <div className="card">
              <div className="bd">
                <div className="muted">{t('rfqDetail.deliverTo')}</div>
                <div className="strong" style={{ fontSize: 16 }}>{rfq.targetCountry ?? '—'}</div>
              </div>
            </div>
            <div className="card">
              <div className="bd">
                <div className="muted">{t('rfqDetail.quotations')}</div>
                <div className="strong" style={{ fontSize: 16 }}>{quotes.length.toLocaleString(locale)}</div>
              </div>
            </div>
          </div>

          <div className="stripe" style={{ margin: '12px 0 0' }}>
            <span>
              {t('rfqDetail.deadline')}{' '}
              <b>{rfq.deadline
                ? new Date(rfq.deadline).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })
                : '—'}</b>
            </span>
            <span>{t('rfqDetail.requestedBy')} <b>—</b></span>
          </div>
        </div>
      </div>

      <div className="cols">
        <div className="card">
          <div className="hd">
            <h2>{t('rfqDetail.quotations')}</h2>
            <span className="muted" style={{ marginLeft: 'auto' }}>
              {t('rfqDetail.received', { n: quotes.length.toLocaleString(locale) })}
            </span>
          </div>
          {quotes.length === 0 ? (
            <div className="empty">
              <b>{t('rfqDetail.noneTitle')}</b>
              {t('rfqDetail.noneBody')}
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>{t('rfqDetail.col.supplier')}</th>
                  <th>{t('rfqDetail.col.price')}</th>
                  <th>{t('rfqDetail.col.leadTime')}</th>
                  <th className="hidem">{t('rfqDetail.col.notes')}</th>
                  <th className="hidem">{t('rfqDetail.col.sent')}</th>
                  <th>{t('rfqDetail.col.status')}</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => <QuoteRow key={q.id} q={q} />)}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <div className="hd">
            <h2>{t('rfqDetail.submitTitle')}</h2>
            {isSupplier && <span style={{ marginLeft: 'auto' }}><Verified label={t('rfqDetail.supplierAccount')} /></span>}
          </div>
          <div className="bd">
            {!isSupplier ? (
              <>
                <p className="muted" style={{ marginTop: 0 }}>
                  {user ? t('rfqDetail.fromSupplier') : t('rfqDetail.signInSupplierBody')}
                </p>
                <button
                  className="btn btn-grey"
                  style={{ width: '100%' }}
                  disabled={!!user}
                  onClick={() => requireAuthGate()}
                >
                  {user ? t('rfqDetail.supplierOnly') : t('rfqDetail.signInAsSupplier')}
                </button>
              </>
            ) : !canQuote ? (
              <>
                <p className="muted" style={{ marginTop: 0 }}>
                  {t('rfqDetail.closedBody', { status: rfq.status })}
                </p>
                <Link href="/supplier/rfq-opportunities" className="btn btn-grey" style={{ width: '100%' }}>
                  {t('rfqDetail.seeOpen')}
                </Link>
              </>
            ) : (
              <>
                <p className="muted" style={{ marginTop: 0 }}>
                  {t('rfqDetail.respondBody')}
                </p>
                {err && <div className="errtext" style={{ marginBottom: 10 }}>{err}</div>}
                <div className="field">
                  <label htmlFor="q-price">{t('rfqDetail.unitPrice')} <i>*</i></label>
                  <input
                    id="q-price"
                    className="in"
                    inputMode="decimal"
                    placeholder="e.g. 8400"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="q-lead">{t('rfqDetail.leadTime')} <i>*</i></label>
                  <input
                    id="q-lead"
                    className="in"
                    inputMode="numeric"
                    placeholder="e.g. 30"
                    value={form.leadTimeDays}
                    onChange={(e) => setForm({ ...form, leadTimeDays: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="q-notes">{t('rfqDetail.termsNotes')}</label>
                  <textarea
                    id="q-notes"
                    className="in"
                    rows={3}
                    placeholder={t('rfqDetail.termsPlaceholder')}
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                  <div className="hint">
                    {t('rfqDetail.compareHint')}
                  </div>
                </div>
                <button
                  className="btn btn-gold"
                  style={{ width: '100%' }}
                  disabled={!form.price || !form.leadTimeDays || submitQuote.isPending}
                  onClick={submit}
                >
                  {submitQuote.isPending ? t('rfqDetail.submitting') : t('rfqDetail.submitQuote')}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </View>
  );
}
