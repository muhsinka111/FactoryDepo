import { useState } from 'react';
import { Link } from 'wouter';
import { useSavedLots, useUnsaveLot, useMe, getToken } from '@workspace/api-client-react';
import { View, Empty, Spinner, ProductCard, requireAuthGate } from '../components';

/**
 * Saved — the buyer's shortlist.
 *
 * GET /api/saved returns each saved lot as the full listing, so the same
 * ProductCard as the feed is used here and keeps its verification and demo
 * provenance tags. DELETE /api/saved/:productId removes one.
 *
 * The list response has no note or folder, so a card shows only what the API
 * supplies: the saved date from the row itself. An unparseable date renders '—'.
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

export default function Saved() {
  const me = useMe();
  const user = me.data;

  const saved = useSavedLots({ enabled: !!user });
  const unsave = useUnsaveLot();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionErr, setActionErr] = useState('');

  if (me.isLoading) {
    return (
      <View title="Saved lots">
        <Spinner />
      </View>
    );
  }

  if (!user) {
    return (
      <View title="Saved lots" sub="Sign in to keep a shortlist of lots">
        <Empty title="You are not signed in">
          Your shortlist is private to your account: sign in to save and remove lots.
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Link href="/sign-in?next=%2Fsaved" className="btn btn-sm btn-primary">Sign in</Link>
            <Link href="/sign-up?next=%2Fsaved" className="btn btn-sm btn-ghost">Create an account</Link>
          </div>
        </Empty>
      </View>
    );
  }

  const items = saved.data?.items ?? [];
  const count = saved.data?.total ?? items.length;

  const remove = async (productId: number) => {
    setActionErr('');
    if (!getToken()) { requireAuthGate(); return; }
    setBusyId(productId);
    try {
      await unsave.mutateAsync({ productId });
    } catch (e) {
      setActionErr(errMessage(e, 'That lot could not be removed from your shortlist — try again.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View
      title="Saved lots"
      sub="Lots you shortlisted. Prices and stock are the supplier's current figures, not a reservation."
      actions={
        <button className="btn btn-sm btn-grey" onClick={() => void saved.refetch()} disabled={saved.isFetching}>
          {saved.isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      }
    >
      {actionErr && <p className="errtext" style={{ marginTop: -4, marginBottom: 10 }}>{actionErr}</p>}

      {saved.isLoading ? (
        <Spinner />
      ) : saved.isError ? (
        <Empty title="Saved lots could not be loaded">
          The API did not return your shortlist — try again.
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <button className="btn btn-sm btn-primary" onClick={() => void saved.refetch()} disabled={saved.isFetching}>
              {saved.isFetching ? 'Trying…' : 'Try again'}
            </button>
          </div>
        </Empty>
      ) : items.length === 0 ? (
        <Empty title="Nothing saved yet">
          Save a lot from the marketplace and it appears here for a quick comparison later.
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Link href="/explore" className="btn btn-sm btn-primary">Browse ready stock</Link>
            <Link href="/feed" className="btn btn-sm btn-ghost">Go to my feed</Link>
          </div>
        </Empty>
      ) : (
        <div className="card">
          <div className="hd">
            <b>{count.toLocaleString()} saved lot{count === 1 ? '' : 's'}</b>
            <span className="muted" style={{ marginLeft: 'auto' }}>Most recently saved first</span>
          </div>
          <div className="bd">
            <div className="feedgrid">
              {items.map((lot) => (
                <div key={lot.productId} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <ProductCard p={lot.product} />
                  <div className="between" style={{ gap: 6 }}>
                    <span className="muted" style={{ fontSize: 11 }} title={new Date(lot.createdAt).toLocaleString()}>
                      Saved {shortDate(lot.createdAt)}
                    </span>
                    <button
                      className="btn btn-sm btn-grey"
                      disabled={busyId === lot.productId}
                      onClick={() => void remove(lot.productId)}
                      title="Remove this lot from your shortlist"
                    >
                      {busyId === lot.productId ? 'Removing…' : 'Remove'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </View>
  );
}
