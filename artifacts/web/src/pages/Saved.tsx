import { useState } from 'react';
import { Link } from 'wouter';
import { useSavedLots, useUnsaveLot, useMe, getToken } from '@workspace/api-client-react';
import { View, Empty, Spinner, ProductCard, requireAuthGate } from '../components';
import { useI18n } from '../i18n';

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

function errMessage(e: unknown, fallback: string): string {
  const m = e instanceof Error ? e.message : '';
  return m && !/^Request failed \(\d+\)$/.test(m) ? m : fallback;
}

export default function Saved() {
  const { t, locale } = useI18n();
  const me = useMe();
  const user = me.data;

  const saved = useSavedLots({ enabled: !!user });
  const unsave = useUnsaveLot();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionErr, setActionErr] = useState('');

  const shortDate = (iso: string): string => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? '—'
      : d.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
  };

  if (me.isLoading) {
    return (
      <View title={t('saved.title')}>
        <Spinner />
      </View>
    );
  }

  if (!user) {
    return (
      <View title={t('saved.title')} sub={t('saved.signInSub')}>
        <Empty title={t('saved.notSignedIn')}>
          {t('saved.notSignedInBody')}
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Link href="/sign-in?next=%2Fsaved" className="btn btn-sm btn-primary">{t('action.signIn')}</Link>
            <Link href="/sign-up?next=%2Fsaved" className="btn btn-sm btn-ghost">{t('action.createAccount')}</Link>
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
      setActionErr(errMessage(e, t('saved.errRemove')));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View
      title={t('saved.title')}
      sub={t('saved.sub')}
      actions={
        <button className="btn btn-sm btn-grey" onClick={() => void saved.refetch()} disabled={saved.isFetching}>
          {saved.isFetching ? t('action.refreshing') : t('action.refresh')}
        </button>
      }
    >
      {actionErr && <p className="errtext" style={{ marginTop: -4, marginBottom: 10 }}>{actionErr}</p>}

      {saved.isLoading ? (
        <Spinner />
      ) : saved.isError ? (
        <Empty title={t('saved.loadErrorTitle')}>
          {t('saved.loadErrorBody')}
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <button className="btn btn-sm btn-primary" onClick={() => void saved.refetch()} disabled={saved.isFetching}>
              {saved.isFetching ? t('saved.trying') : t('action.tryAgain')}
            </button>
          </div>
        </Empty>
      ) : items.length === 0 ? (
        <Empty title={t('saved.emptyTitle')}>
          {t('saved.emptyBody')}
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Link href="/explore" className="btn btn-sm btn-primary">{t('saved.browse')}</Link>
            <Link href="/feed" className="btn btn-sm btn-ghost">{t('saved.goToFeed')}</Link>
          </div>
        </Empty>
      ) : (
        <div className="card">
          <div className="hd">
            <b>{t('saved.count', { n: count.toLocaleString(locale) })}</b>
            <span className="muted" style={{ marginLeft: 'auto' }}>{t('saved.mostRecent')}</span>
          </div>
          <div className="bd">
            <div className="feedgrid">
              {items.map((lot) => (
                <div key={lot.productId} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <ProductCard p={lot.product} />
                  <div className="between" style={{ gap: 6 }}>
                    <span className="muted" style={{ fontSize: 11 }} title={new Date(lot.createdAt).toLocaleString(locale)}>
                      {t('saved.savedOn', { date: shortDate(lot.createdAt) })}
                    </span>
                    <button
                      className="btn btn-sm btn-grey"
                      disabled={busyId === lot.productId}
                      onClick={() => void remove(lot.productId)}
                      title={t('saved.removeTitle')}
                    >
                      {busyId === lot.productId ? t('saved.removing') : t('saved.remove')}
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
