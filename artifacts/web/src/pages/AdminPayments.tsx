import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { getToken, useMe, usePayments, useConfirmPayment, useRejectPayment } from '@workspace/api-client-react';
import type { Payment } from '@workspace/api-zod';
import { View, Empty, StatusChip, Spinner } from '../components';

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

function day(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

/** Amount as the API returned it: the currency is a separate column, never assumed. */
function amount(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function AdminOnly({ signedIn, role }: { signedIn: boolean; role?: string }) {
  return (
    <View title="Admins only" sub="Recognising a payment is an administrator action">
      <Empty title={signedIn ? 'Your account is not an administrator' : 'You are not signed in'}>
        {signedIn
          ? `You are signed in as ${role ?? 'a non-admin role'}. Only administrator accounts can confirm or reject a bank transfer.`
          : 'Sign in with an administrator account to reconcile bank transfers.'}
        <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
          {signedIn ? (
            <Link href="/orders" className="btn btn-sm btn-grey">My orders</Link>
          ) : (
            <Link href="/sign-in?next=%2Fadmin%2Fpayments" className="btn btn-sm btn-primary">Sign in</Link>
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
  const p = decision.payment;
  const confirming = decision.action === 'confirm';

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <h2>{confirming ? 'Confirm bank transfer' : 'Reject bank transfer'}</h2>
          <button className="x" onClick={onCancel} aria-label="Close">✕</button>
        </div>
        <div className="mb">
          <p className="strong" style={{ marginTop: 0 }}>
            {p.currency} {amount(p.amount)} against order #{p.orderId}
          </p>
          <p className="muted" style={{ fontSize: 12 }}>
            Payment #{p.id} · {p.method.replace(/_/g, ' ')} · reference {p.reference ?? '—'} ·{' '}
            {p.proofKey ? 'proof attached' : 'no proof attached'}
          </p>

          <p style={{ fontSize: 12.5, lineHeight: 1.7, margin: '10px 0' }}>
            {confirming ? (
              <>
                <b>Confirming this transfer marks order #{p.orderId} as paid.</b> Only confirm once
                the funds have actually cleared in the account: the API records the payment as
                confirmed against you, sets the order to paid with today's payment date, and notifies
                the buyer in the same transaction. A settled payment cannot be changed afterwards —
                the API refuses to re-open it.
              </>
            ) : (
              <>
                <b>Rejecting refuses this transfer.</b> The payment is marked rejected and order #
                {p.orderId} is returned to unpaid, so the buyer can record the correct transfer. The
                buyer is notified. A settled payment cannot be changed afterwards.
              </>
            )}
          </p>

          <div className="card">
            <div className="bd muted" style={{ fontSize: 12, lineHeight: 1.7 }}>
              Match the reference <b>{p.reference ?? '—'}</b> against the bank statement and the
              proforma invoice for order #{p.orderId} before you act. Recorded{' '}
              {new Date(p.createdAt).toLocaleString()}.
            </div>
          </div>

          {error && <div className="errtext" style={{ marginTop: 10 }}>{error}</div>}
        </div>
        <div className="mf">
          <button className="btn btn-grey" onClick={onCancel} disabled={pending}>Cancel</button>
          <button
            className={confirming ? 'btn btn-gold' : 'btn btn-red'}
            onClick={onConfirm}
            disabled={pending}
          >
            {pending
              ? 'Working…'
              : confirming
                ? `Confirm — mark order #${p.orderId} paid`
                : 'Reject this payment'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminPayments() {
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
      <View title="Payments">
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
      setModalError(errText(e, 'The payment could not be settled — try again.'));
    }
  };

  const pending = confirm.isPending || reject.isPending;

  return (
    <View
      title="Payment reconciliation"
      sub="Bank transfer only — FactoryDepo does not process cards. Confirming a transfer marks the order paid; nothing is marked paid automatically."
      actions={<Link href="/admin" className="btn btn-sm btn-ghost">Overview</Link>}
    >
      {res.isLoading ? (
        <Spinner />
      ) : res.isError || !res.data ? (
        <Empty title="Could not load payments — try again">
          The payments endpoint did not answer, so no transfers are shown and none can be settled.
          <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
            <button className="btn btn-sm btn-primary" onClick={() => void res.refetch()}>Try again</button>
          </div>
        </Empty>
      ) : items.length === 0 ? (
        <Empty title="No payments recorded yet">
          A buyer records a bank transfer against an order from the order screen; it then appears
          here awaiting confirmation.
        </Empty>
      ) : (
        <>
          <div className="grid stats">
            <div className="card stat" title="Transfers recorded by buyers and not yet settled">
              <span className="ic" aria-hidden="true">⏳</span>
              <div>
                <div className="v">{counts.awaiting.toLocaleString()}</div>
                <div className="l">Awaiting confirmation</div>
              </div>
            </div>
            <div className="card stat" title="Sum of the awaiting rows on this screen. The API returns one currency per row and this platform does not convert, so a mixed-currency sum is only indicative.">
              <span className="ic" aria-hidden="true">💱</span>
              <div>
                <div className="v">{amount(awaitingValue)}</div>
                <div className="l">Awaiting total · all currencies</div>
              </div>
            </div>
            <div className="card stat">
              <span className="ic" aria-hidden="true">✅</span>
              <div>
                <div className="v">{counts.confirmed.toLocaleString()}</div>
                <div className="l">Confirmed</div>
              </div>
            </div>
            <div className="card stat">
              <span className="ic" aria-hidden="true">⛔</span>
              <div>
                <div className="v">{counts.rejected.toLocaleString()}</div>
                <div className="l">Rejected</div>
              </div>
            </div>
            <div className="card stat">
              <span className="ic" aria-hidden="true">↩️</span>
              <div>
                <div className="v">{counts.refunded.toLocaleString()}</div>
                <div className="l">Refunded</div>
              </div>
            </div>
          </div>

          <div className="stripe">
            <span>
              <b>Confirming a payment marks its order paid</b> — one transaction, and it cannot be
              undone from this screen.
            </span>
            <span>
              The buyer is notified by the API when a payment is confirmed or rejected.
            </span>
          </div>

          <div className="filters">
            {([
              ['all', `All (${items.length})`],
              ['awaiting', `Awaiting (${counts.awaiting})`],
              ['confirmed', `Confirmed (${counts.confirmed})`],
              ['rejected', `Rejected (${counts.rejected})`],
              ['refunded', `Refunded (${counts.refunded})`],
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
              Showing {filtered.length.toLocaleString()} of {items.length.toLocaleString()}
            </span>
          </div>

          {filtered.length === 0 ? (
            <Empty title="No payments with that status">
              Try another status filter.
            </Empty>
          ) : (
            <div className="card">
              <div className="hd">
                <b>{filtered.length.toLocaleString()} payment{filtered.length === 1 ? '' : 's'}</b>
                <span className="muted" style={{ marginLeft: 'auto' }}>In the order the API returned them</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Payment</th>
                      <th>Order</th>
                      <th title="The payments endpoint returns the order id only — the buyer is not part of this response.">
                        Buyer
                      </th>
                      <th style={{ textAlign: 'right' }}>Amount</th>
                      <th>Currency</th>
                      <th>Reference</th>
                      <th className="hidem">Proof</th>
                      <th>Status</th>
                      <th className="hidem">Recorded</th>
                      <th className="hidem">Settled</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => {
                      const settled = p.status === 'confirmed' || p.status === 'rejected' || p.status === 'refunded';
                      return (
                        <tr key={p.id}>
                          <td className="muted">#{p.id}</td>
                          <td>
                            <span className="strong">#{p.orderId}</span>
                            <div className="muted">{p.method.replace(/_/g, ' ')}</div>
                          </td>
                          <td className="muted" title="The payments endpoint returns the order id only — the buyer is not part of this response.">
                            —
                          </td>
                          <td style={{ textAlign: 'right' }} className="strong">{amount(p.amount)}</td>
                          <td>{p.currency}</td>
                          <td className="muted" title={p.reference ?? 'No reference recorded — matching this transfer depends on the proof and the statement'}>
                            {p.reference ?? '—'}
                          </td>
                          <td className="hidem">
                            {p.proofKey ? (
                              <span className="pill p-blue" title={p.proofKey}>Attached</span>
                            ) : (
                              <span className="muted" title="No proof file key on this payment">—</span>
                            )}
                          </td>
                          <td><StatusChip status={p.status} /></td>
                          <td className="hidem muted" title={new Date(p.createdAt).toLocaleString()}>
                            {day(p.createdAt)}
                          </td>
                          <td className="hidem muted">
                            {p.confirmedAt ? (
                              <>
                                {day(p.confirmedAt)}
                                <div className="muted">
                                  {p.confirmedBy === null ? 'administrator not recorded' : `by admin #${p.confirmedBy}`}
                                </div>
                              </>
                            ) : (
                              <span title="Not settled yet">—</span>
                            )}
                          </td>
                          <td>
                            {settled ? (
                              <span className="muted" title="The API refuses to change a settled payment">
                                Final
                              </span>
                            ) : (
                              <span className="row" style={{ gap: 5, justifyContent: 'flex-end' }}>
                                <button
                                  className="btn btn-sm btn-gold"
                                  onClick={() => { setModalError(null); setDecision({ payment: p, action: 'confirm' }); }}
                                >
                                  Confirm
                                </button>
                                <button
                                  className="btn btn-sm btn-red"
                                  onClick={() => { setModalError(null); setDecision({ payment: p, action: 'reject' }); }}
                                >
                                  Reject
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
                Amounts are shown exactly as the API returns them; the platform does not convert
                between currencies, so a total across rows is only meaningful within one currency.
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
