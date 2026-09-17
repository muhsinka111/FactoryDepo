import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { getToken, useMe, usePayments, useConfirmPayment, useRejectPayment } from '@workspace/api-client-react';
import type { Payment } from '@workspace/api-zod';
import { View, Empty, StatusChip, Spinner } from '../components';
import { useI18n } from '../i18n';

/**
 * AdminPayments — bank-transfer reconciliation.
 *
 * This is where money is actually recognised. Confirming is the deliberate,
 * irreversible-feeling step: the API settles the payment and the order together
 * in one transaction, so the modal spells that out before it happens. Nothing
 * here is auto-confirmed.
 */

interface Decision {
  payment: Payment;
  action: 'confirm' | 'reject';
}

function errText(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

function day(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(locale);
}

/** Amount as the API returned it: the currency is a separate column, never assumed. */
function amount(value: number, locale: string): string {
  return value.toLocaleString(locale, { maximumFractionDigits: 2 });
}

function AdminOnly({ signedIn, role }: { signedIn: boolean; role?: string }) {
  const { t } = useI18n();
  return (
    <View title={t('admin.common.adminsOnly')} sub={t('admin.payments.adminOnlySub')}>
      <Empty title={signedIn ? t('admin.common.notAdmin') : t('admin.common.notSignedIn')}>
        {signedIn
          ? t('admin.payments.signedInBody', { role: role ?? t('admin.common.nonAdminRole') })
          : t('admin.payments.signedOutBody')}
        <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
          {signedIn ? (
            <Link href="/orders" className="btn btn-sm btn-grey">{t('admin.payments.myOrders')}</Link>
          ) : (
            <Link href="/sign-in?next=%2Fadmin%2Fpayments" className="btn btn-sm btn-primary">{t('action.signIn')}</Link>
          )}
        </div>
      </Empty>
    </View>
  );
}

function DecisionModal({
  decision,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  decision: Decision;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t, locale } = useI18n();
  const p = decision.payment;
  const confirming = decision.action === 'confirm';
  /** The API stores the method as free text; only its documented default is translated. */
  const method = p.method === 'bank_transfer' ? t('admin.payments.methodBankTransfer') : p.method.replace(/_/g, ' ');

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <h2>{confirming ? t('admin.payments.modalConfirmTitle') : t('admin.payments.modalRejectTitle')}</h2>
          <button className="x" onClick={onCancel} aria-label={t('action.close')}>✕</button>
        </div>
        <div className="mb">
          <p className="strong" style={{ marginTop: 0 }}>
            {t('admin.payments.againstOrder', { currency: p.currency, amount: amount(p.amount, locale), id: p.orderId })}
          </p>
          <p className="muted" style={{ fontSize: 12 }}>
            {t('admin.payments.paymentRef', { id: p.id })} · {method} · {t('admin.payments.referenceRef', { reference: p.reference ?? '—' })} ·{' '}
            {p.proofKey ? t('admin.payments.proofAttached') : t('admin.payments.noProofAttached')}
          </p>

          <p style={{ fontSize: 12.5, lineHeight: 1.7, margin: '10px 0' }}>
            {confirming ? (
              <>
                <b>{t('admin.payments.confirmLead', { id: p.orderId })}</b> {t('admin.payments.confirmBody')}
              </>
            ) : (
              <>
                <b>{t('admin.payments.rejectLead')}</b> {t('admin.payments.rejectBody', { id: p.orderId })}
              </>
            )}
          </p>

          <div className="card">
            <div className="bd muted" style={{ fontSize: 12, lineHeight: 1.7 }}>
              {t('admin.payments.matchLead')} <b>{p.reference ?? '—'}</b>{' '}
              {t('admin.payments.matchTail', { id: p.orderId, when: new Date(p.createdAt).toLocaleString(locale) })}
            </div>
          </div>

          {error && <div className="errtext" style={{ marginTop: 10 }}>{error}</div>}
        </div>
        <div className="mf">
          <button className="btn btn-grey" onClick={onCancel} disabled={pending}>{t('action.cancel')}</button>
          <button
            className={confirming ? 'btn btn-gold' : 'btn btn-red'}
            onClick={onConfirm}
            disabled={pending}
          >
            {pending
              ? t('admin.common.working')
              : confirming
                ? t('admin.payments.confirmButton', { id: p.orderId })
                : t('admin.payments.rejectButton')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminPayments() {
  const { t, locale } = useI18n();
  const me = useMe();
  const signedIn = !!getToken();
  const isAdmin = me.data?.role === 'admin';

  const res = usePayments({ enabled: isAdmin });
  const confirm = useConfirmPayment();
  const reject = useRejectPayment();

  const [decision, setDecision] = useState<Decision | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [status, setStatus] = useState<'all' | Payment['status']>('all');

  const items = useMemo(() => res.data?.items ?? [], [res.data]);

  const counts = useMemo(() => {
    const c = { awaiting: 0, confirmed: 0, rejected: 0, refunded: 0 };
    for (const p of items) c[p.status] += 1;
    return c;
  }, [items]);

  const awaitingValue = useMemo(
    () => items.filter((p) => p.status === 'awaiting').reduce((sum, p) => sum + p.amount, 0),
    [items],
  );

  const filtered = useMemo(
    () => (status === 'all' ? items : items.filter((p) => p.status === status)),
    [items, status],
  );

  if (!signedIn) return <AdminOnly signedIn={false} />;
  if (me.isLoading) {
    return (
      <View title={t('nav.adminPayments')}>
        <Spinner />
      </View>
    );
  }
  if (!isAdmin) return <AdminOnly signedIn role={me.data?.role} />;

  const run = async () => {
    if (!decision) return;
    setModalError(null);
    try {
      if (decision.action === 'confirm') await confirm.mutateAsync({ id: decision.payment.id });
      else await reject.mutateAsync({ id: decision.payment.id });
      setDecision(null);
    } catch (e) {
      setModalError(errText(e, t('admin.payments.errFallback')));
    }
  };

  const pending = confirm.isPending || reject.isPending;
  const buyerColumnTitle = t('admin.payments.colBuyerTitle');

  return (
    <View
      title={t('admin.payments.title')}
      sub={t('admin.payments.sub')}
      actions={<Link href="/admin" className="btn btn-sm btn-ghost">{t('nav.overview')}</Link>}
    >
      {res.isLoading ? (
        <Spinner />
      ) : res.isError || !res.data ? (
        <Empty title={t('admin.payments.loadErrorTitle')}>
          {t('admin.payments.loadErrorBody')}
          <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
            <button className="btn btn-sm btn-primary" onClick={() => void res.refetch()}>{t('action.tryAgain')}</button>
          </div>
        </Empty>
      ) : items.length === 0 ? (
        <Empty title={t('admin.payments.emptyTitle')}>
          {t('admin.payments.emptyBody')}
        </Empty>
      ) : (
        <>
          <div className="grid stats">
            <div className="card stat" title={t('admin.payments.statAwaitingTitle')}>
              <span className="ic" aria-hidden="true">⏳</span>
              <div>
                <div className="v">{counts.awaiting.toLocaleString(locale)}</div>
                <div className="l">{t('admin.payments.statAwaiting')}</div>
              </div>
            </div>
            <div className="card stat" title={t('admin.payments.statAwaitingTotalTitle')}>
              <span className="ic" aria-hidden="true">💱</span>
              <div>
                <div className="v">{amount(awaitingValue, locale)}</div>
                <div className="l">{t('admin.payments.statAwaitingTotal')}</div>
              </div>
            </div>
            <div className="card stat">
              <span className="ic" aria-hidden="true">✅</span>
              <div>
                <div className="v">{counts.confirmed.toLocaleString(locale)}</div>
                <div className="l">{t('admin.payments.statConfirmed')}</div>
              </div>
            </div>
            <div className="card stat">
              <span className="ic" aria-hidden="true">⛔</span>
              <div>
                <div className="v">{counts.rejected.toLocaleString(locale)}</div>
                <div className="l">{t('admin.payments.statRejected')}</div>
              </div>
            </div>
            <div className="card stat">
              <span className="ic" aria-hidden="true">↩️</span>
              <div>
                <div className="v">{counts.refunded.toLocaleString(locale)}</div>
                <div className="l">{t('admin.payments.statRefunded')}</div>
              </div>
            </div>
          </div>

          <div className="stripe">
            <span>
              <b>{t('admin.payments.stripeConfirmLead')}</b> {t('admin.payments.stripeConfirmTail')}
            </span>
            <span>
              {t('admin.payments.stripeNotified')}
            </span>
          </div>

          <div className="filters">
            {([
              ['all', t('admin.payments.filterAll', { n: items.length.toLocaleString(locale) })],
              ['awaiting', t('admin.payments.filterAwaiting', { n: counts.awaiting.toLocaleString(locale) })],
              ['confirmed', t('admin.payments.filterConfirmed', { n: counts.confirmed.toLocaleString(locale) })],
              ['rejected', t('admin.payments.filterRejected', { n: counts.rejected.toLocaleString(locale) })],
              ['refunded', t('admin.payments.filterRefunded', { n: counts.refunded.toLocaleString(locale) })],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                className={`chip ${status === key ? 'on' : ''}`}
                onClick={() => setStatus(key)}
                aria-pressed={status === key}
              >
                {label}
              </button>
            ))}
            <span className="muted" style={{ marginLeft: 'auto' }}>
              {t('admin.common.showingOf', {
                shown: filtered.length.toLocaleString(locale),
                total: items.length.toLocaleString(locale),
              })}
            </span>
          </div>

          {filtered.length === 0 ? (
            <Empty title={t('admin.payments.noStatusTitle')}>
              {t('admin.payments.noStatusBody')}
            </Empty>
          ) : (
            <div className="card">
              <div className="hd">
                <b>
                  {filtered.length === 1
                    ? t('admin.payments.paymentCountOne', { n: filtered.length.toLocaleString(locale) })
                    : t('admin.payments.paymentCount', { n: filtered.length.toLocaleString(locale) })}
                </b>
                <span className="muted" style={{ marginLeft: 'auto' }}>{t('admin.common.inApiOrder')}</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>{t('admin.payments.colPayment')}</th>
                      <th>{t('admin.payments.colOrder')}</th>
                      <th title={buyerColumnTitle}>
                        {t('admin.payments.colBuyer')}
                      </th>
                      <th style={{ textAlign: 'right' }}>{t('admin.payments.colAmount')}</th>
                      <th>{t('admin.payments.colCurrency')}</th>
                      <th>{t('admin.payments.colReference')}</th>
                      <th className="hidem">{t('admin.payments.colProof')}</th>
                      <th>{t('admin.payments.colStatus')}</th>
                      <th className="hidem">{t('admin.payments.colRecorded')}</th>
                      <th className="hidem">{t('admin.payments.colSettled')}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => {
                      const settled = p.status === 'confirmed' || p.status === 'rejected' || p.status === 'refunded';
                      const method = p.method === 'bank_transfer' ? t('admin.payments.methodBankTransfer') : p.method.replace(/_/g, ' ');
                      return (
                        <tr key={p.id}>
                          <td className="muted">#{p.id}</td>
                          <td>
                            <span className="strong">#{p.orderId}</span>
                            <div className="muted">{method}</div>
                          </td>
                          <td className="muted" title={buyerColumnTitle}>
                            —
                          </td>
                          <td style={{ textAlign: 'right' }} className="strong">{amount(p.amount, locale)}</td>
                          <td>{p.currency}</td>
                          <td className="muted" title={p.reference ?? t('admin.payments.noReferenceTitle')}>
                            {p.reference ?? '—'}
                          </td>
                          <td className="hidem">
                            {p.proofKey ? (
                              <span className="pill p-blue" title={p.proofKey}>{t('admin.common.attached')}</span>
                            ) : (
                              <span className="muted" title={t('admin.payments.noProofTitle')}>—</span>
                            )}
                          </td>
                          <td><StatusChip status={p.status} /></td>
                          <td className="hidem muted" title={new Date(p.createdAt).toLocaleString(locale)}>
                            {day(p.createdAt, locale)}
                          </td>
                          <td className="hidem muted">
                            {p.confirmedAt ? (
                              <>
                                {day(p.confirmedAt, locale)}
                                <div className="muted">
                                  {p.confirmedBy === null ? t('admin.payments.adminNotRecorded') : t('admin.common.byAdmin', { id: p.confirmedBy })}
                                </div>
                              </>
                            ) : (
                              <span title={t('admin.payments.notSettled')}>—</span>
                            )}
                          </td>
                          <td>
                            {settled ? (
                              <span className="muted" title={t('admin.payments.finalTitle')}>
                                {t('admin.payments.final')}
                              </span>
                            ) : (
                              <span className="row" style={{ gap: 5, justifyContent: 'flex-end' }}>
                                <button
                                  className="btn btn-sm btn-gold"
                                  onClick={() => { setModalError(null); setDecision({ payment: p, action: 'confirm' }); }}
                                >
                                  {t('admin.payments.confirm')}
                                </button>
                                <button
                                  className="btn btn-sm btn-red"
                                  onClick={() => { setModalError(null); setDecision({ payment: p, action: 'reject' }); }}
                                >
                                  {t('admin.common.reject')}
                                </button>
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="bd muted" style={{ borderTop: '1px solid var(--line-2)' }}>
                {t('admin.payments.footnote')}
              </div>
            </div>
          )}
        </>
      )}

      {decision && (
        <DecisionModal
          decision={decision}
          pending={pending}
          error={modalError}
          onCancel={() => { if (!pending) { setDecision(null); setModalError(null); } }}
          onConfirm={() => void run()}
        />
      )}
    </View>
  );
}
