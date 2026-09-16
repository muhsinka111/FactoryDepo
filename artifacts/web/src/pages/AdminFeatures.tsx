import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { getToken, useMe, useFeatureFlags, useUpdateFeatureFlag } from '@workspace/api-client-react';
import type { FeatureFlag } from '@workspace/api-zod';
import { View, Empty, Spinner } from '../components';

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

function day(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

function AdminOnly({ signedIn, role }: { signedIn: boolean; role?: string }) {
  return (
    <View title="Admins only" sub="Feature flags are administrator-only">
      <Empty title={signedIn ? 'Your account is not an administrator' : 'You are not signed in'}>
        {signedIn
          ? `You are signed in as ${role ?? 'a non-admin role'}. Turning a feature on or off for the whole platform is restricted to administrator accounts.`
          : 'Sign in with an administrator account to manage feature flags.'}
        <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
          {signedIn ? (
            <Link href="/explore" className="btn btn-sm btn-grey">Back to the marketplace</Link>
          ) : (
            <Link href="/sign-in?next=%2Fadmin%2Ffeatures" className="btn btn-sm btn-primary">Sign in</Link>
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
  const { flag, next } = toggle;
  const turningOn = next;

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <h2>{turningOn ? 'Turn this feature on' : 'Turn this feature off'}</h2>
          <button className="x" onClick={onCancel} aria-label="Close">✕</button>
        </div>
        <div className="mb">
          <p className="strong" style={{ marginTop: 0 }}>{flag.label}</p>
          <p className="muted" style={{ fontSize: 12 }}>
            key {flag.key} · currently {flag.enabled ? 'on' : 'off'}
          </p>
          {flag.description && (
            <p className="muted" style={{ fontSize: 12.5 }}>{flag.description}</p>
          )}

          <p style={{ fontSize: 12.5, lineHeight: 1.7, margin: '10px 0' }}>
            {turningOn ? (
              <>
                <b>Turning this flag on makes the feature available to every user immediately.</b> The
                API stores the new state against the flag key and the app reads it on the next
                request.
              </>
            ) : (
              <>
                <b>Turning this flag off withdraws the feature from every user immediately.</b> The
                API stops offering it and the app stops showing it. The flag is a switch, not a
                delete: turning it back on restores the feature.
              </>
            )}
          </p>

          <div className="card">
            <div className="bd muted" style={{ fontSize: 12 }}>
              This changes the flag for the whole platform, not just your account.
            </div>
          </div>

          {error && <div className="errtext" style={{ marginTop: 10 }}>{error}</div>}
        </div>
        <div className="mf">
          <button className="btn btn-grey" onClick={onCancel} disabled={pending}>Cancel</button>
          <button
            className={turningOn ? 'btn btn-primary' : 'btn btn-red'}
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? 'Working…' : turningOn ? 'Turn the feature on' : 'Turn the feature off'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminFeatures() {
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
      <View title="Features">
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
      setModalError(errText(e, 'The flag could not be changed — try again.'));
    }
  };

  return (
    <View
      title="Feature flags"
      sub="Switches the API exposes for the whole platform. Turning one off withdraws the feature from every user; the flag never deletes data."
      actions={<Link href="/admin" className="btn btn-sm btn-ghost">Overview</Link>}
    >
      {res.isLoading ? (
        <Spinner />
      ) : res.isError || !res.data ? (
        <Empty title="Could not load feature flags — try again">
          The feature-flag endpoint did not answer, so no switches are shown and none can be changed
          from here.
          <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
            <button className="btn btn-sm btn-primary" onClick={() => void res.refetch()}>Try again</button>
          </div>
        </Empty>
      ) : items.length === 0 ? (
        <Empty title="No feature flags are configured">
          This API exposes no flags yet, so there is nothing to switch on or off.
        </Empty>
      ) : (
        <>
          <div className="grid stats">
            <div className="card stat">
              <span className="ic" aria-hidden="true">⚙️</span>
              <div>
                <div className="v">{res.data.total.toLocaleString()}</div>
                <div className="l">Flags exposed by the API</div>
              </div>
            </div>
            <div className="card stat" title="Flags whose stored state is enabled">
              <span className="ic" aria-hidden="true">🟢</span>
              <div>
                <div className="v">{onCount.toLocaleString()}</div>
                <div className="l">On</div>
              </div>
            </div>
            <div className="card stat" title="Flags whose stored state is disabled">
              <span className="ic" aria-hidden="true">⚪</span>
              <div>
                <div className="v">{(items.length - onCount).toLocaleString()}</div>
                <div className="l">Off</div>
              </div>
            </div>
          </div>

          <div className="filters">
            <input
              className="in"
              style={{ width: 260 }}
              placeholder="Label, key or description…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search feature flags"
            />
            <span className="muted" style={{ marginLeft: 'auto' }}>
              Showing {filtered.length.toLocaleString()} of {items.length.toLocaleString()}
            </span>
          </div>

          {filtered.length === 0 ? (
            <Empty title="No flags match that search">
              Try a shorter label or clear the search box.
            </Empty>
          ) : (
            <div className="card">
              <div className="hd">
                <b>Platform switches</b>
                <span className="muted" style={{ marginLeft: 'auto' }}>
                  On = available to every user · Off = withdrawn
                </span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Feature</th>
                      <th className="hidem">Key</th>
                      <th>State</th>
                      <th className="hidem">Last changed</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((f) => (
                      <tr key={f.key}>
                        <td>
                          <span className="strong">{f.label}</span>
                          <div className="muted">{f.description ?? 'No description on this flag'}</div>
                        </td>
                        <td className="hidem muted" title={f.key}>{f.key}</td>
                        <td>
                          {f.enabled ? (
                            <span className="pill p-green" title="The API reports this flag as enabled">On</span>
                          ) : (
                            <span className="pill p-grey" title="The API reports this flag as disabled">Off</span>
                          )}
                        </td>
                        <td className="hidem muted" title={new Date(f.updatedAt).toLocaleString()}>
                          {day(f.updatedAt)}
                        </td>
                        <td>
                          <span className="row" style={{ justifyContent: 'flex-end' }}>
                            <button
                              className={`btn btn-sm ${f.enabled ? 'btn-red' : 'btn-primary'}`}
                              onClick={() => { setModalError(null); setToggle({ flag: f, next: !f.enabled }); }}
                              disabled={update.isPending}
                              title={
                                f.enabled
                                  ? 'Withdraw this feature from every user'
                                  : 'Make this feature available to every user'
                              }
                            >
                              {f.enabled ? 'Turn off' : 'Turn on'}
                            </button>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="bd muted" style={{ borderTop: '1px solid var(--line-2)' }}>
                Labels, keys and descriptions come from the API and are not editable here. A flag the
                API does not expose cannot be switched on from this console.
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
