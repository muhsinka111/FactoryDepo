import { useEffect, useState, type ChangeEvent } from 'react';
import { Link } from 'wouter';
import { useMe, useUpdateMe, getToken } from '@workspace/api-client-react';
import { View, Empty, Spinner, requireAuthGate } from '../components';

/**
 * Profile — the signed-in account.
 *
 * PATCH /api/me accepts name / company / country / lang and nothing else, so
 * email and role are shown read-only and labelled as such rather than being
 * rendered as fields the API would silently drop.
 *
 * The form is seeded from GET /api/me once per account id and is not clobbered
 * by background refetches, so unsaved edits survive a refetch.
 */

/** Locale codes the account can store. The API accepts any string ≤ 8 chars. */
const LANGS: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'tr', label: 'Türkçe' },
  { code: 'zh', label: '中文' },
  { code: 'ar', label: 'العربية' },
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
  { code: 'ru', label: 'Русский' },
];

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

interface ProfileForm {
  name: string;
  company: string;
  country: string;
  lang: string;
}

export default function Profile() {
  const me = useMe();
  const user = me.data;
  const update = useUpdateMe();

  const [form, setForm] = useState<ProfileForm>({ name: '', company: '', country: '', lang: 'en' });
  const [seededFor, setSeededFor] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);

  // Seed once per account, then leave the user's own edits alone.
  useEffect(() => {
    if (!user || seededFor === user.id) return;
    setForm({
      name: user.name,
      company: user.company ?? '',
      country: user.country ?? '',
      lang: user.lang || 'en',
    });
    setSeededFor(user.id);
    setSaved(false);
    setErr('');
  }, [user, seededFor]);

  const set = (key: keyof ProfileForm) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setSaved(false);
  };

  if (me.isLoading) {
    return (
      <View title="Profile">
        <Spinner />
      </View>
    );
  }

  if (!user) {
    return (
      <View title="Profile" sub="Sign in to manage your account">
        <Empty title="You are not signed in">
          Your profile is private to your account: sign in to view and edit it.
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Link href="/sign-in?next=%2Fprofile" className="btn btn-sm btn-primary">Sign in</Link>
            <Link href="/sign-up?next=%2Fprofile" className="btn btn-sm btn-ghost">Create an account</Link>
          </div>
        </Empty>
      </View>
    );
  }

  const dirty =
    form.name !== user.name ||
    form.company !== (user.company ?? '') ||
    form.country !== (user.country ?? '') ||
    form.lang !== (user.lang || 'en');

  const langKnown = LANGS.some((l) => l.code === form.lang);

  const submit = async () => {
    setErr('');
    setSaved(false);
    if (!getToken()) { requireAuthGate(); return; }
    if (!form.name.trim()) {
      setErr('Enter your name — the API rejects an empty name.');
      return;
    }
    try {
      await update.mutateAsync({
        name: form.name.trim(),
        company: form.company.trim() || null,
        country: form.country.trim() || null,
        lang: form.lang,
      });
      setSaved(true);
    } catch (e) {
      setErr(errMessage(e, 'Profile could not be saved — try again.'));
    }
  };

  return (
    <View
      title="Profile"
      sub="The details other parties see on your offers, orders and messages."
    >
      {err && <p className="errtext" style={{ marginTop: -4, marginBottom: 10 }}>{err}</p>}
      {saved && !dirty && (
        <div className="stripe">
          <span>
            <span className="pill p-green">Saved</span>&ensp;Your profile was updated.
          </span>
          <button className="x" onClick={() => setSaved(false)} aria-label="Dismiss">✕</button>
        </div>
      )}

      <div className="cols">
        <div className="card">
          <div className="hd">
            <h2>Account details</h2>
            {dirty && <span className="pill p-amber" style={{ marginLeft: 'auto' }}>Unsaved changes</span>}
          </div>
          <div className="bd">
            <div className="field">
              <label htmlFor="profile-name">Full name <i>*</i></label>
              <input id="profile-name" className="in" value={form.name} onChange={set('name')} autoComplete="name" />
            </div>
            <div className="f2">
              <div className="field">
                <label htmlFor="profile-company">Company</label>
                <input
                  id="profile-company"
                  className="in"
                  placeholder="Not set"
                  value={form.company}
                  onChange={set('company')}
                  autoComplete="organization"
                />
              </div>
              <div className="field">
                <label htmlFor="profile-country">Country</label>
                <input
                  id="profile-country"
                  className="in"
                  placeholder="Not set"
                  value={form.country}
                  onChange={set('country')}
                  autoComplete="country-name"
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="profile-lang">Language</label>
              <select id="profile-lang" className="in" value={form.lang} onChange={set('lang')}>
                {!langKnown && <option value={form.lang}>{form.lang}</option>}
                {LANGS.map((l) => (
                  <option key={l.code} value={l.code}>{l.label} ({l.code})</option>
                ))}
              </select>
              <div className="hint">The interface is English today; this is the language stored on your account.</div>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button
                className="btn btn-primary"
                disabled={update.isPending || !dirty || !form.name.trim()}
                onClick={() => void submit()}
              >
                {update.isPending ? 'Saving…' : 'Save changes'}
              </button>
              {dirty && (
                <button
                  className="btn btn-grey"
                  disabled={update.isPending}
                  onClick={() => {
                    setForm({
                      name: user.name,
                      company: user.company ?? '',
                      country: user.country ?? '',
                      lang: user.lang || 'en',
                    });
                    setErr('');
                  }}
                >
                  Discard
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="hd">
            <h2>Identity</h2>
          </div>
          <div className="bd">
            <div className="stripe" style={{ margin: '0 0 10px' }}>
              <span>
                <b>Email and role cannot be edited here.</b> They are fixed to the account when it is created
                and are not accepted by the profile API.
              </span>
            </div>
            <table>
              <tbody>
                <tr>
                  <td className="muted">Email</td>
                  <td>
                    <div className="row" style={{ gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      <span>{user.email}</span>
                      <span className="pill p-grey" title="Read-only — the profile API does not accept email">Read-only</span>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td className="muted">Role</td>
                  <td>
                    <div className="row" style={{ gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      <span className="pill p-navy">{user.role}</span>
                      <span className="pill p-grey" title="Read-only — the profile API does not accept role">Read-only</span>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td className="muted">Email status</td>
                  <td style={{ textAlign: 'right' }}>
                    <span className={user.emailVerified ? 'pill p-green' : 'pill p-amber'}>
                      {user.emailVerified ? 'Email verified' : 'Email not verified'}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className="muted">Member since</td>
                  <td style={{ textAlign: 'right' }} title={new Date(user.createdAt).toLocaleString()}>
                    {shortDate(user.createdAt)}
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="hint" style={{ marginTop: 10 }}>
              Account #{user.id} · signed in as {user.role}
            </p>
          </div>
        </div>
      </div>
    </View>
  );
}
