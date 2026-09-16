import { useEffect, useState, type ChangeEvent } from 'react';
import { Link } from 'wouter';
import { useMe, useUpdateMe, getToken } from '@workspace/api-client-react';
import { View, Empty, Spinner, requireAuthGate } from '../components';
import { LANGUAGES, isLangCode, useI18n } from '../i18n';

/**
 * Profile — the signed-in account.
 *
 * PATCH /api/me accepts name / company / country / lang and nothing else, so
 * email and role are shown read-only and labelled as such rather than being
 * rendered as fields the API would silently drop.
 *
 * The form is seeded from GET /api/me once per account id and is not clobbered
 * by background refetches, so unsaved edits survive a refetch.
 *
 * Language: the select lists exactly the six interface languages the app ships
 * (see i18n.tsx). Choosing one switches the interface immediately through
 * `setLang`, and pressing Save changes also stores it on the account, which is
 * what the API's `lang` field is for.
 */

function shortDate(iso: string, locale: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
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
  const { t, setLang, locale } = useI18n();

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
      lang: isLangCode(user.lang) ? user.lang : 'en',
    });
    setSeededFor(user.id);
    setSaved(false);
    setErr('');
  }, [user, seededFor]);

  const set = (key: keyof ProfileForm) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const value = e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
    /**
     * Picking a language here changes the interface at once and mirrors the
     * choice onto the account immediately. The request is fire-and-forget: if
     * it fails the language still switched, and Save changes can retry it.
     */
    if (key === 'lang' && isLangCode(value)) {
      setLang(value);
      if (getToken()) void update.mutateAsync({ lang: value }).catch(() => { /* non-blocking */ });
    }
  };

  if (me.isLoading) {
    return (
      <View title={t('profile.title')}>
        <Spinner />
      </View>
    );
  }

  if (!user) {
    return (
      <View title={t('profile.title')} sub={t('profile.signInSub')}>
        <Empty title={t('profile.notSignedIn')}>
          {t('profile.notSignedInBody')}
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Link href="/sign-in?next=%2Fprofile" className="btn btn-sm btn-primary">{t('action.signIn')}</Link>
            <Link href="/sign-up?next=%2Fprofile" className="btn btn-sm btn-ghost">{t('action.createAccount')}</Link>
          </div>
        </Empty>
      </View>
    );
  }

  const dirty =
    form.name !== user.name ||
    form.company !== (user.company ?? '') ||
    form.country !== (user.country ?? '') ||
    form.lang !== (isLangCode(user.lang) ? user.lang : 'en');

  const langKnown = isLangCode(form.lang);

  const submit = async () => {
    setErr('');
    setSaved(false);
    if (!getToken()) { requireAuthGate(); return; }
    if (!form.name.trim()) {
      setErr(t('profile.errName'));
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
      setErr(errMessage(e, t('profile.errSave')));
    }
  };

  return (
    <View
      title={t('profile.title')}
      sub={t('profile.sub')}
    >
      {err && <p className="errtext" style={{ marginTop: -4, marginBottom: 10 }}>{err}</p>}
      {saved && !dirty && (
        <div className="stripe">
          <span>
            <span className="pill p-green">{t('profile.saved')}</span>&ensp;{t('profile.savedBody')}
          </span>
          <button className="x" onClick={() => setSaved(false)} aria-label={t('action.dismiss')}>✕</button>
        </div>
      )}

      <div className="cols">
        <div className="card">
          <div className="hd">
            <h2>{t('profile.accountDetails')}</h2>
            {dirty && <span className="pill p-amber" style={{ marginLeft: 'auto' }}>{t('profile.unsaved')}</span>}
          </div>
          <div className="bd">
            <div className="field">
              <label htmlFor="profile-name">{t('profile.fullName')} <i>*</i></label>
              <input id="profile-name" className="in" value={form.name} onChange={set('name')} autoComplete="name" />
            </div>
            <div className="f2">
              <div className="field">
                <label htmlFor="profile-company">{t('profile.company')}</label>
                <input
                  id="profile-company"
                  className="in"
                  placeholder={t('profile.notSet')}
                  value={form.company}
                  onChange={set('company')}
                  autoComplete="organization"
                />
              </div>
              <div className="field">
                <label htmlFor="profile-country">{t('profile.country')}</label>
                <input
                  id="profile-country"
                  className="in"
                  placeholder={t('profile.notSet')}
                  value={form.country}
                  onChange={set('country')}
                  autoComplete="country-name"
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="profile-lang">{t('profile.language')}</label>
              <select id="profile-lang" className="in" value={form.lang} onChange={set('lang')}>
                {/* A value stored before this list existed still shows honestly. */}
                {!langKnown && <option value={form.lang}>{form.lang}</option>}
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>{l.native} ({l.code})</option>
                ))}
              </select>
              <div className="hint">{t('profile.languageHint')}</div>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button
                className="btn btn-primary"
                disabled={update.isPending || !dirty || !form.name.trim()}
                onClick={() => void submit()}
              >
                {update.isPending ? t('profile.saving') : t('profile.save')}
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
                      lang: isLangCode(user.lang) ? user.lang : 'en',
                    });
                    setErr('');
                  }}
                >
                  {t('action.discard')}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="hd">
            <h2>{t('profile.identity')}</h2>
          </div>
          <div className="bd">
            <div className="stripe" style={{ margin: '0 0 10px' }}>
              <span>{t('profile.identityNote')}</span>
            </div>
            <table>
              <tbody>
                <tr>
                  <td className="muted">{t('profile.email')}</td>
                  <td>
                    <div className="row" style={{ gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      <span>{user.email}</span>
                      <span className="pill p-grey" title={t('profile.readOnlyEmail')}>{t('profile.readOnly')}</span>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td className="muted">{t('profile.role')}</td>
                  <td>
                    <div className="row" style={{ gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      <span className="pill p-navy">{user.role}</span>
                      <span className="pill p-grey" title={t('profile.readOnlyRole')}>{t('profile.readOnly')}</span>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td className="muted">{t('profile.emailStatus')}</td>
                  <td style={{ textAlign: 'right' }}>
                    <span className={user.emailVerified ? 'pill p-green' : 'pill p-amber'}>
                      {user.emailVerified ? t('profile.emailVerified') : t('profile.emailNotVerified')}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className="muted">{t('profile.memberSince')}</td>
                  <td style={{ textAlign: 'right' }} title={new Date(user.createdAt).toLocaleString(locale)}>
                    {shortDate(user.createdAt, locale)}
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="hint" style={{ marginTop: 10 }}>
              {t('profile.accountLine', { id: user.id, role: user.role })}
            </p>
          </div>
        </div>
      </div>
    </View>
  );
}
