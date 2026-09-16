import { useState, type ReactNode } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { useLogin, useRegister } from '@workspace/api-client-react';
import type { ApiError } from '@workspace/api-client-react';
import { zRole } from '@workspace/api-zod';
import { dashboardRole, homeFor } from '../components';
import { useI18n, type DictKey } from '../i18n';

/**
 * Auth — dense, centred sign-in / sign-up cards on the navy/gold design system.
 * After success the user lands on the landing route for their role
 * (admin → /admin, supplier → /supplier/listings, buyer → /feed), unless a
 * gated action asked for a specific `next` path.
 *
 * Registration stores the language currently selected in the interface, so a
 * new account starts in the language it was created in.
 */

const DEMO_EMAIL = 'demo@factorydepo.com';
const DEMO_PASSWORD = 'factorydepo';

/** Only same-site paths are honoured, so `next` can never point off-site. */
function safeNext(raw: string | undefined): string {
  if (!raw) return '';
  let path = raw;
  try {
    path = decodeURIComponent(raw);
  } catch {
    return '';
  }
  return path.startsWith('/') && !path.startsWith('//') ? path : '';
}

function AuthCard({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <div style={{ maxWidth: 396, margin: '22px auto 40px' }}>
      <div className="card">
        <div className="hd">
          <h2>{title}</h2>
        </div>
        <div className="bd">
          <p className="muted" style={{ margin: '0 0 12px' }}>{sub}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

export function SignIn() {
  const { t } = useI18n();
  const [, navigate] = useLocation();
  const next = safeNext(useSearch().match(/next=([^&]+)/)?.[1]);
  const login = useLogin();
  const [err, setErr] = useState('');
  const [form, setForm] = useState({ email: '', password: '' });

  const submit = async () => {
    setErr('');
    try {
      const res = await login.mutateAsync(form);
      navigate(next || homeFor(dashboardRole(res.user.role, true)));
    } catch (e) {
      setErr((e as ApiError).message ?? t('auth.signInFailed'));
    }
  };

  return (
    <AuthCard title={t('action.signIn')} sub={t('auth.signIn.sub')}>
      {err && <div className="errtext" style={{ marginBottom: 9 }}>{err}</div>}
      <div className="field">
        <label htmlFor="signin-email">{t('auth.email')}</label>
        <input
          id="signin-email"
          className="in"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor="signin-password">{t('auth.password')}</label>
        <input
          id="signin-password"
          className="in"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
        />
      </div>
      <button
        className="btn btn-primary"
        style={{ width: '100%', marginTop: 2 }}
        disabled={login.isPending || !form.email || !form.password}
        onClick={() => void submit()}
      >
        {login.isPending ? t('action.signingIn') : t('action.signIn')}
      </button>
      <p className="muted" style={{ textAlign: 'center', margin: '11px 0 0' }}>
        {t('auth.newHere')} <Link href={next ? `/sign-up?next=${encodeURIComponent(next)}` : '/sign-up'}>{t('action.createAccount')}</Link>
      </p>

      <div style={{ borderTop: '1px solid var(--line)', marginTop: 12, paddingTop: 9 }}>
        <div className="row" style={{ gap: 6 }}>
          <span className="pill p-amber">{t('auth.demoNotice')}</span>
          <span className="muted">{t('auth.seededLogin')}</span>
          <button
            className="btn btn-sm btn-grey"
            style={{ marginLeft: 'auto' }}
            onClick={() => setForm({ email: DEMO_EMAIL, password: DEMO_PASSWORD })}
          >
            {t('auth.fillIn')}
          </button>
        </div>
        <p className="hint" style={{ margin: '6px 0 0' }}>
          <b>{DEMO_EMAIL}</b> / <b>{DEMO_PASSWORD}</b> {t('auth.demoHintLead')} <b>{t('auth.demoHintLead2')}</b>{' '}
          <b>{t('auth.demoHintProduct')}</b> {t('auth.demoHintTail')}
        </p>
      </div>
    </AuthCard>
  );
}

const ROLE_META: { role: string; label: DictKey; hint: DictKey }[] = [
  { role: 'buyer', label: 'auth.role.buyer', hint: 'auth.role.buyerHint' },
  { role: 'supplier', label: 'auth.role.supplier', hint: 'auth.role.supplierHint' },
  { role: 'inspector', label: 'auth.role.inspector', hint: 'auth.role.inspectorHint' },
  { role: 'lab', label: 'auth.role.lab', hint: 'auth.role.labHint' },
  { role: 'logistics', label: 'auth.role.logistics', hint: 'auth.role.logisticsHint' },
];

export function SignUp() {
  const { t, lang } = useI18n();
  const [, navigate] = useLocation();
  const next = safeNext(useSearch().match(/next=([^&]+)/)?.[1]);
  const register = useRegister();
  const [err, setErr] = useState('');
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'buyer', company: '', country: '' });

  const submit = async () => {
    setErr('');
    try {
      // The account stores the language the interface is in right now.
      const res = await register.mutateAsync({ ...form, lang, role: zRole.parse(form.role) });
      navigate(next || homeFor(dashboardRole(res.user.role, true)));
    } catch (e) {
      setErr((e as ApiError).message ?? t('auth.registerFailed'));
    }
  };

  const activeRole = ROLE_META.find((r) => r.role === form.role);

  return (
    <AuthCard title={t('auth.signUp.title')} sub={t('auth.signUp.sub')}>
      {err && <div className="errtext" style={{ marginBottom: 9 }}>{err}</div>}
      <div className="field">
        <label htmlFor="signup-name">{t('auth.fullName')} <i>*</i></label>
        <input
          id="signup-name"
          className="in"
          placeholder="Jane Smith"
          autoComplete="name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor="signup-email">{t('auth.workEmail')} <i>*</i></label>
        <input
          id="signup-email"
          className="in"
          type="email"
          placeholder="you@company.com"
          autoComplete="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor="signup-password">{t('auth.password')} <i>*</i></label>
        <input
          id="signup-password"
          className="in"
          type="password"
          placeholder={t('auth.minChars')}
          autoComplete="new-password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <div className="hint">{t('auth.atLeast8')}</div>
      </div>
      <div className="field">
        <label>{t('auth.iAmA')}</label>
        <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          {ROLE_META.map((r) => (
            <button
              key={r.role}
              type="button"
              className={`chip ${form.role === r.role ? 'on' : ''}`}
              onClick={() => setForm({ ...form, role: r.role })}
            >
              {t(r.label)}
            </button>
          ))}
        </div>
        {activeRole && <div className="hint">{t(activeRole.hint)}</div>}
      </div>
      <div className="f2">
        <div className="field">
          <label htmlFor="signup-company">{t('auth.company')}</label>
          <input
            id="signup-company"
            className="in"
            placeholder={t('common.optional')}
            autoComplete="organization"
            value={form.company}
            onChange={(e) => setForm({ ...form, company: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="signup-country">{t('auth.country')}</label>
          <input
            id="signup-country"
            className="in"
            placeholder={t('auth.countryHint')}
            autoComplete="country-name"
            value={form.country}
            onChange={(e) => setForm({ ...form, country: e.target.value })}
          />
        </div>
      </div>
      <button
        className="btn btn-primary"
        style={{ width: '100%', marginTop: 2 }}
        disabled={register.isPending || !form.name || !form.email || form.password.length < 8}
        onClick={() => void submit()}
      >
        {register.isPending ? t('action.creatingAccount') : t('auth.createCta')}
      </button>
      <p className="muted" style={{ textAlign: 'center', margin: '11px 0 0' }}>
        {t('auth.alreadyRegistered')} <Link href={next ? `/sign-in?next=${encodeURIComponent(next)}` : '/sign-in'}>{t('action.signIn')}</Link>
      </p>
      <p className="hint" style={{ marginTop: 9 }}>
        {t('auth.signUpHint')}
      </p>
    </AuthCard>
  );
}
