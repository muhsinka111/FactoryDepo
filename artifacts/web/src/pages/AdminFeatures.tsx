import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { getToken, useMe, useFeatureFlags, useUpdateFeatureFlag } from '@workspace/api-client-react';
import type { FeatureFlag } from '@workspace/api-zod';
import { View, Empty, Spinner } from '../components';
import { useI18n } from '../i18n';

/**
 * AdminFeatures — feature flags.
 *
 * Every flag the API exposes, with a clear on/off state and a toggle wired to
 * PATCH /admin/features/:key. Flipping a flag changes what every user can do, so
 * the change is confirmed in a modal that names the flag and the direction.
 * Flags are read-only here otherwise: label and description come from the API
 * and are never edited on this screen.
 */

interface Toggle {
  flag: FeatureFlag;
  next: boolean;
}

function errText(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

function day(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(locale);
}

function AdminOnly({ signedIn, role }: { signedIn: boolean; role?: string }) {
  const { t } = useI18n();
  return (
    <View title={t('admin.common.adminsOnly')} sub={t('admin.features.adminOnlySub')}>
      <Empty title={signedIn ? t('admin.common.notAdmin') : t('admin.common.notSignedIn')}>
        {signedIn
          ? t('admin.features.signedInBody', { role: role ?? t('admin.common.nonAdminRole') })
          : t('admin.features.signedOutBody')}
        <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
          {signedIn ? (
            <Link href="/explore" className="btn btn-sm btn-grey">{t('admin.common.backToMarketplace')}</Link>
          ) : (
            <Link href="/sign-in?next=%2Fadmin%2Ffeatures" className="btn btn-sm btn-primary">{t('action.signIn')}</Link>
          )}
        </div>
      </Empty>
    </View>
  );
}

function ToggleModal({
  toggle,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  toggle: Toggle;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();
  const { flag, next } = toggle;
  const turningOn = next;

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <h2>{turningOn ? t('admin.features.modalOnTitle') : t('admin.features.modalOffTitle')}</h2>
          <button className="x" onClick={onCancel} aria-label={t('action.close')}>✕</button>
        </div>
        <div className="mb">
          <p className="strong" style={{ marginTop: 0 }}>{flag.label}</p>
          <p className="muted" style={{ fontSize: 12 }}>
            {t('admin.features.flagMeta', {
              key: flag.key,
              state: flag.enabled ? t('admin.features.stateOn') : t('admin.features.stateOff'),
            })}
          </p>
          {flag.description && (
            <p className="muted" style={{ fontSize: 12.5 }}>{flag.description}</p>
          )}

          <p style={{ fontSize: 12.5, lineHeight: 1.7, margin: '10px 0' }}>
            {turningOn ? (
              <>
                <b>{t('admin.features.onLead')}</b> {t('admin.features.onBody')}
              </>
            ) : (
              <>
                <b>{t('admin.features.offLead')}</b> {t('admin.features.offBody')}
              </>
            )}
          </p>

          <div className="card">
            <div className="bd muted" style={{ fontSize: 12 }}>
              {t('admin.features.modalNote')}
            </div>
          </div>

          {error && <div className="errtext" style={{ marginTop: 10 }}>{error}</div>}
        </div>
        <div className="mf">
          <button className="btn btn-grey" onClick={onCancel} disabled={pending}>{t('action.cancel')}</button>
          <button
            className={turningOn ? 'btn btn-primary' : 'btn btn-red'}
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? t('admin.common.working') : turningOn ? t('admin.features.modalConfirmOn') : t('admin.features.modalConfirmOff')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminFeatures() {
  const { t, locale } = useI18n();
  const me = useMe();
  const signedIn = !!getToken();
  const isAdmin = me.data?.role === 'admin';

  const res = useFeatureFlags({ enabled: isAdmin });
  const update = useUpdateFeatureFlag();

  const [toggle, setToggle] = useState<Toggle | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const items = useMemo(() => res.data?.items ?? [], [res.data]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(
      (f) =>
        f.label.toLowerCase().includes(needle) ||
        f.key.toLowerCase().includes(needle) ||
        (f.description ?? '').toLowerCase().includes(needle),
    );
  }, [items, q]);

  const onCount = items.filter((f) => f.enabled).length;

  if (!signedIn) return <AdminOnly signedIn={false} />;
  if (me.isLoading) {
    return (
      <View title={t('nav.features')}>
        <Spinner />
      </View>
    );
  }
  if (!isAdmin) return <AdminOnly signedIn role={me.data?.role} />;

  const run = async () => {
    if (!toggle) return;
    setModalError(null);
    try {
      await update.mutateAsync({ key: toggle.flag.key, enabled: toggle.next });
      setToggle(null);
    } catch (e) {
      setModalError(errText(e, t('admin.features.errFallback')));
    }
  };

  return (
    <View
      title={t('admin.features.title')}
      sub={t('admin.features.sub')}
      actions={<Link href="/admin" className="btn btn-sm btn-ghost">{t('nav.overview')}</Link>}
    >
      {res.isLoading ? (
        <Spinner />
      ) : res.isError || !res.data ? (
        <Empty title={t('admin.features.loadErrorTitle')}>
          {t('admin.features.loadErrorBody')}
          <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
            <button className="btn btn-sm btn-primary" onClick={() => void res.refetch()}>{t('action.tryAgain')}</button>
          </div>
        </Empty>
      ) : items.length === 0 ? (
        <Empty title={t('admin.features.emptyTitle')}>
          {t('admin.features.emptyBody')}
        </Empty>
      ) : (
        <>
          <div className="grid stats">
            <div className="card stat">
              <span className="ic" aria-hidden="true">⚙️</span>
              <div>
                <div className="v">{res.data.total.toLocaleString(locale)}</div>
                <div className="l">{t('admin.features.statFlags')}</div>
              </div>
            </div>
            <div className="card stat" title={t('admin.features.statOnTitle')}>
              <span className="ic" aria-hidden="true">🟢</span>
              <div>
                <div className="v">{onCount.toLocaleString(locale)}</div>
                <div className="l">{t('admin.features.statOn')}</div>
              </div>
            </div>
            <div className="card stat" title={t('admin.features.statOffTitle')}>
              <span className="ic" aria-hidden="true">⚪</span>
              <div>
                <div className="v">{(items.length - onCount).toLocaleString(locale)}</div>
                <div className="l">{t('admin.features.statOff')}</div>
              </div>
            </div>
          </div>

          <div className="filters">
            <input
              className="in"
              style={{ width: 260 }}
              placeholder={t('admin.features.searchPlaceholder')}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label={t('admin.features.searchAria')}
            />
            <span className="muted" style={{ marginLeft: 'auto' }}>
              {t('admin.common.showingOf', {
                shown: filtered.length.toLocaleString(locale),
                total: items.length.toLocaleString(locale),
              })}
            </span>
          </div>

          {filtered.length === 0 ? (
            <Empty title={t('admin.features.noMatchTitle')}>
              {t('admin.features.noMatchBody')}
            </Empty>
          ) : (
            <div className="card">
              <div className="hd">
                <b>{t('admin.features.switchesTitle')}</b>
                <span className="muted" style={{ marginLeft: 'auto' }}>
                  {t('admin.features.switchesNote')}
                </span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>{t('admin.features.colFeature')}</th>
                      <th className="hidem">{t('admin.features.colKey')}</th>
                      <th>{t('admin.features.colState')}</th>
                      <th className="hidem">{t('admin.features.colLastChanged')}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((f) => (
                      <tr key={f.key}>
                        <td>
                          <span className="strong">{f.label}</span>
                          <div className="muted">{f.description ?? t('admin.features.noDescription')}</div>
                        </td>
                        <td className="hidem muted" title={f.key}>{f.key}</td>
                        <td>
                          {f.enabled ? (
                            <span className="pill p-green" title={t('admin.features.onTitle')}>{t('admin.features.stateOn')}</span>
                          ) : (
                            <span className="pill p-grey" title={t('admin.features.offTitle')}>{t('admin.features.stateOff')}</span>
                          )}
                        </td>
                        <td className="hidem muted" title={new Date(f.updatedAt).toLocaleString(locale)}>
                          {day(f.updatedAt, locale)}
                        </td>
                        <td>
                          <span className="row" style={{ justifyContent: 'flex-end' }}>
                            <button
                              className={`btn btn-sm ${f.enabled ? 'btn-red' : 'btn-primary'}`}
                              onClick={() => { setModalError(null); setToggle({ flag: f, next: !f.enabled }); }}
                              disabled={update.isPending}
                              title={
                                f.enabled
                                  ? t('admin.features.turnOffTitle')
                                  : t('admin.features.turnOnTitle')
                              }
                            >
                              {f.enabled ? t('admin.features.turnOff') : t('admin.features.turnOn')}
                            </button>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="bd muted" style={{ borderTop: '1px solid var(--line-2)' }}>
                {t('admin.features.footnote')}
              </div>
            </div>
          )}
        </>
      )}

      {toggle && (
        <ToggleModal
          toggle={toggle}
          pending={update.isPending}
          error={modalError}
          onCancel={() => { if (!update.isPending) { setToggle(null); setModalError(null); } }}
          onConfirm={() => void run()}
        />
      )}
    </View>
  );
}
