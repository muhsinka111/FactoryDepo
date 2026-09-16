import { Fragment, useState } from 'react';
import { Link } from 'wouter';
import { useShipments, useAdvanceShipment, useMe, getToken } from '@workspace/api-client-react';
import type { Shipment } from '@workspace/api-zod';
import { View, Empty, Spinner, DemoTag, requireAuthGate, dashboardRole } from '../components';

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

function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

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
  const me = useMe();
  const user = me.data;
  const loggedIn = !!getToken();
  const dash = dashboardRole(user?.role, loggedIn);
  const canAdvance = dash === 'supplier' || dash === 'admin';

  const shipments = useShipments({ enabled: !!user });
  const advance = useAdvanceShipment();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionErr, setActionErr] = useState('');

  const sub =
    dash === 'supplier'
      ? 'Milestones on orders placed against your stock. You move each shipment forward.'
      : dash === 'admin'
        ? 'Milestones on every order. Admins can advance a shipment on the supplier’s behalf.'
        : 'Milestone tracking for the orders you placed. Your supplier advances each step.';

  if (me.isLoading) {
    return (
      <View title="Shipments">
        <Spinner />
      </View>
    );
  }

  if (!user) {
    return (
      <View title="Shipments" sub="Sign in to track your shipments">
        <Empty title="You are not signed in">
          Shipment tracking is private to the buyer and supplier on an order.
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Link href="/sign-in?next=%2Fshipments" className="btn btn-sm btn-primary">Sign in</Link>
            <Link href="/sign-up?next=%2Fshipments" className="btn btn-sm btn-ghost">Create an account</Link>
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
      setActionErr(errMessage(e, `Shipment #${s.id} could not be advanced — try again.`));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View
      title="Shipments"
      sub={sub}
      actions={
        <button className="btn btn-sm btn-grey" onClick={() => void shipments.refetch()} disabled={shipments.isFetching}>
          {shipments.isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      }
    >
      {actionErr && <p className="errtext" style={{ marginTop: -4, marginBottom: 10 }}>{actionErr}</p>}

      {shipments.isLoading ? (
        <Spinner />
      ) : shipments.isError ? (
        <Empty title="Shipments could not be loaded">
          The API did not return your shipments — try again.
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <button className="btn btn-sm btn-primary" onClick={() => void shipments.refetch()} disabled={shipments.isFetching}>
              {shipments.isFetching ? 'Trying…' : 'Try again'}
            </button>
          </div>
        </Empty>
      ) : items.length === 0 ? (
        <Empty title="No shipments yet">
          {dash === 'supplier'
            ? 'A shipment is created automatically when a buyer orders from your stock.'
            : 'A shipment is created automatically for each order you place, and its milestones appear here.'}
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            {dash === 'supplier' ? (
              <Link href="/supplier/listings" className="btn btn-sm btn-primary">My listings</Link>
            ) : (
              <Link href="/orders" className="btn btn-sm btn-primary">View my orders</Link>
            )}
          </div>
        </Empty>
      ) : (
        <>
          <div className="stripe">
            <span>
              <b>{count.toLocaleString()}</b> shipment{count === 1 ? '' : 's'} visible to your account
            </span>
            <span>
              <b>{delivered.toLocaleString()}</b> delivered
            </span>
            <span>
              {canAdvance
                ? 'Advancing a milestone is recorded with a timestamp and shared with the buyer.'
                : 'Milestones are advanced by the supplier on each order.'}
            </span>
          </div>

          <div className="card">
            <div className="hd">
              <b>Shipment tracking</b>
              <span className="muted" style={{ marginLeft: 'auto' }}>Newest first</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Shipment</th>
                    <th>Product</th>
                    <th>Carrier</th>
                    <th>Tracking no.</th>
                    <th className="hidem">Documents</th>
                    <th className="hidem">Last update</th>
                    <th>Milestone</th>
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
                            <div className="muted">Order #{s.orderId}</div>
                          </td>
                          <td>{s.productName.trim() || '—'}</td>
                          <td>{s.carrier?.trim() || '—'}</td>
                          <td>{s.trackingNo?.trim() || '—'}</td>
                          <td className="muted hidem" title="No document is attached to a shipment yet">
                            —
                          </td>
                          <td className="muted hidem" title={new Date(s.updatedAt).toLocaleString()}>
                            {shortDate(s.updatedAt)}
                          </td>
                          <td>
                            {canAdvance ? (
                              <button
                                className="btn btn-sm btn-ghost"
                                disabled={busyId === s.id || complete}
                                title={complete ? 'Every milestone is reached' : 'Move this shipment one step forward'}
                                onClick={() => void doAdvance(s)}
                              >
                                {busyId === s.id ? 'Advancing…' : complete ? 'Delivered' : 'Advance milestone'}
                              </button>
                            ) : (
                              <span className="muted">
                                {complete ? 'Delivered' : 'Advanced by the supplier'}
                              </span>
                            )}
                          </td>
                        </tr>
                        <tr>
                          <td colSpan={7} style={{ background: '#fcfcfd' }}>
                            {s.milestones.length === 0 ? (
                              <span className="muted">
                                No milestones are recorded on this shipment yet.
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
                                      <div>{m.label}</div>
                                      <div className="muted" title={m.at ? new Date(m.at).toLocaleString() : undefined}>
                                        {m.at ? shortDate(m.at) : '—'}
                                      </div>
                                      {m.note && <div className="muted">{m.note}</div>}
                                    </div>
                                  ))}
                                </div>
                                <div className="muted" style={{ marginTop: 8 }}>
                                  {s.step} of {s.milestones.length} milestones reached
                                  {complete
                                    ? ' · delivered'
                                    : next
                                      ? ` · next: ${next}`
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
              Milestone history is shared by both parties on the order. Orders and their totals live under{' '}
              <Link href="/orders">Orders</Link>.
            </span>
          </div>
        </>
      )}
    </View>
  );
}
