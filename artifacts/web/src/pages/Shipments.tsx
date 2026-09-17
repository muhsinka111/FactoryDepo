import { Fragment, useState } from 'react';
import { Link } from 'wouter';
import { useShipments, useAdvanceShipment, useMe, getToken } from '@workspace/api-client-react';
import type { Shipment } from '@workspace/api-zod';
import { View, Empty, Spinner, DemoTag, requireAuthGate, dashboardRole } from '../components';
import { useI18n } from '../i18n';

/**
 * Shipments — milestone-tracked fulfilment, role-aware.
 *
 * GET /api/shipments is scoped server-side: a buyer sees the shipments of the
 * orders they placed, a supplier the shipments of orders against their own
 * supplier row, an admin everything. That scoping is why this page needs no
 * client-side filter and shows a role-specific subtitle instead.
 *
 * Advancing a milestone is a supplier/admin action, so the button is only
 * rendered for those roles; a buyer sees who moves it. `zShipment` carries no
 * attachment of any kind, so the documents column is an honest '—', and
 * unreached milestones have `at: null` and show '—' rather than a guessed date.
 */

function errMessage(e: unknown, fallback: string): string {
  const m = e instanceof Error ? e.message : '';
  return m && !/^Request failed \(\d+\)$/.test(m) ? m : fallback;
}

function isComplete(s: Shipment): boolean {
  return s.milestones.length > 0 && s.step >= s.milestones.length;
}

/** The milestone the shipment is heading for, or null once delivered. */
function nextMilestone(s: Shipment): string | null {
  if (s.milestones.length === 0) return null;
  return s.milestones[Math.min(s.step, s.milestones.length - 1)]?.label ?? null;
}

export default function Shipments() {
  const { t, locale } = useI18n();
  const me = useMe();
  const user = me.data;
  const loggedIn = !!getToken();
  const dash = dashboardRole(user?.role, loggedIn);
  const canAdvance = dash === 'supplier' || dash === 'admin';

  const shipments = useShipments({ enabled: !!user });
  const advance = useAdvanceShipment();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionErr, setActionErr] = useState('');

  const shortDate = (iso: string): string => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? '—'
      : d.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const sub =
    dash === 'supplier'
      ? t('ship.subSupplier')
      : dash === 'admin'
        ? t('ship.subAdmin')
        : t('ship.subBuyer');

  if (me.isLoading) {
    return (
      <View title={t('ship.title')}>
        <Spinner />
      </View>
    );
  }

  if (!user) {
    return (
      <View title={t('ship.title')} sub={t('ship.signInSub')}>
        <Empty title={t('ship.notSignedIn')}>
          {t('ship.notSignedInBody')}
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Link href="/sign-in?next=%2Fshipments" className="btn btn-sm btn-primary">{t('action.signIn')}</Link>
            <Link href="/sign-up?next=%2Fshipments" className="btn btn-sm btn-ghost">{t('action.createAccount')}</Link>
          </div>
        </Empty>
      </View>
    );
  }

  const items = shipments.data?.items ?? [];
  const count = shipments.data?.total ?? items.length;
  const delivered = items.filter(isComplete).length;

  const doAdvance = async (s: Shipment) => {
    setActionErr('');
    if (!getToken()) { requireAuthGate(); return; }
    setBusyId(s.id);
    try {
      await advance.mutateAsync({ id: s.id });
    } catch (e) {
      setActionErr(errMessage(e, t('ship.errAdvance', { id: s.id })));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View
      title={t('ship.title')}
      sub={sub}
      actions={
        <button className="btn btn-sm btn-grey" onClick={() => void shipments.refetch()} disabled={shipments.isFetching}>
          {shipments.isFetching ? t('action.refreshing') : t('action.refresh')}
        </button>
      }
    >
      {actionErr && <p className="errtext" style={{ marginTop: -4, marginBottom: 10 }}>{actionErr}</p>}

      {shipments.isLoading ? (
        <Spinner />
      ) : shipments.isError ? (
        <Empty title={t('ship.loadErrorTitle')}>
          {t('ship.loadErrorBody')}
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <button className="btn btn-sm btn-primary" onClick={() => void shipments.refetch()} disabled={shipments.isFetching}>
              {shipments.isFetching ? t('ship.trying') : t('action.tryAgain')}
            </button>
          </div>
        </Empty>
      ) : items.length === 0 ? (
        <Empty title={t('ship.emptyTitle')}>
          {dash === 'supplier' ? t('ship.emptySupplier') : t('ship.emptyBuyer')}
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            {dash === 'supplier' ? (
              <Link href="/supplier/listings" className="btn btn-sm btn-primary">{t('ship.myListings')}</Link>
            ) : (
              <Link href="/orders" className="btn btn-sm btn-primary">{t('ship.viewOrders')}</Link>
            )}
          </div>
        </Empty>
      ) : (
        <>
          <div className="stripe">
            <span>
              <b>{count.toLocaleString(locale)}</b> {t('ship.count')}
            </span>
            <span>
              <b>{delivered.toLocaleString(locale)}</b> {t('ship.delivered')}
            </span>
            <span>
              {canAdvance ? t('ship.advanceRecorded') : t('ship.advanceBySupplier')}
            </span>
          </div>

          <div className="card">
            <div className="hd">
              <b>{t('ship.trackingTitle')}</b>
              <span className="muted" style={{ marginLeft: 'auto' }}>{t('common.newestFirst')}</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>{t('ship.col.shipment')}</th>
                    <th>{t('ship.col.product')}</th>
                    <th>{t('ship.col.carrier')}</th>
                    <th>{t('ship.col.trackingNo')}</th>
                    <th className="hidem">{t('ship.col.documents')}</th>
                    <th className="hidem">{t('ship.col.updated')}</th>
                    <th>{t('ship.col.milestone')}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((s) => {
                    const complete = isComplete(s);
                    const next = nextMilestone(s);
                    return (
                      <Fragment key={s.id}>
                        <tr>
                          <td>
                            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                              <b>#{s.id}</b>
                              {s.dataSource === 'demo' && <DemoTag />}
                            </div>
                            <div className="muted">#{s.orderId}</div>
                          </td>
                          <td>{s.productName.trim() || '—'}</td>
                          <td>{s.carrier?.trim() || '—'}</td>
                          <td>{s.trackingNo?.trim() || '—'}</td>
                          <td className="muted hidem" title={t('ship.noDocumentTitle')}>
                            —
                          </td>
                          <td className="muted hidem" title={new Date(s.updatedAt).toLocaleString(locale)}>
                            {shortDate(s.updatedAt)}
                          </td>
                          <td>
                            {canAdvance ? (
                              <button
                                className="btn btn-sm btn-ghost"
                                disabled={busyId === s.id || complete}
                                title={complete ? t('ship.completeTitle') : t('ship.advanceTitle')}
                                onClick={() => void doAdvance(s)}
                              >
                                {busyId === s.id ? t('ship.advancing') : complete ? t('ship.deliveredLabel') : t('ship.advance')}
                              </button>
                            ) : (
                              <span className="muted">
                                {complete ? t('ship.deliveredLabel') : t('ship.advancedBySupplier')}
                              </span>
                            )}
                          </td>
                        </tr>
                        <tr>
                          <td colSpan={7} style={{ background: '#fcfcfd' }}>
                            {s.milestones.length === 0 ? (
                              <span className="muted">
                                {t('ship.noMilestones')}
                              </span>
                            ) : (
                              <>
                                <div className="track">
                                  {s.milestones.map((m, i) => (
                                    <div
                                      key={`${m.label}-${i}`}
                                      className={`tstep ${i < s.step ? 'done' : ''}`}
                                    >
                                      <div className="tdot" aria-hidden="true">{i < s.step ? '✓' : ''}</div>
                                      {/* Milestone labels are API data, not interface copy. */}
                                      <div>{m.label}</div>
                                      <div className="muted" title={m.at ? new Date(m.at).toLocaleString(locale) : undefined}>
                                        {m.at ? shortDate(m.at) : '—'}
                                      </div>
                                      {m.note && <div className="muted">{m.note}</div>}
                                    </div>
                                  ))}
                                </div>
                                <div className="muted" style={{ marginTop: 8 }}>
                                  {t('ship.reached', {
                                    step: s.step.toLocaleString(locale),
                                    total: s.milestones.length.toLocaleString(locale),
                                  })}
                                  {complete
                                    ? ` · ${t('ship.reachedDelivered')}`
                                    : next
                                      ? ` · ${t('ship.reachedNext', { next })}`
                                      : ''}
                                </div>
                              </>
                            )}
                          </td>
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="stripe" style={{ marginTop: 12 }}>
            <span>
              {t('ship.footLead')}{' '}
              <Link href="/orders">{t('ship.footLink')}</Link>{t('ship.footTail')}
            </span>
          </div>
        </>
      )}
    </View>
  );
}
