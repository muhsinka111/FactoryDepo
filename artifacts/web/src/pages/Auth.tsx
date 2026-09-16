import { useState, type ReactNode } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { useLogin, useRegister } from '@workspace/api-client-react';
import type { ApiError } from '@workspace/api-client-react';
import { zRole } from '@workspace/api-zod';
import { dashboardRole, homeFor } from '../components';

/**
 * Auth — dense, centred sign-in / sign-up cards on the navy/gold design system.
 * After success the user lands on the landing route for their role
 * (admin → /admin, supplier → /supplier/listings, buyer → /feed), unless a
 * gated action asked for a specific `next` path.
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
      setErr((e as ApiError).message ?? 'Login failed');
    }
  };

  return (
    <AuthCard title="Sign in" sub="Access your orders, offers and RFQs.">
      {err && <div className="errtext" style={{ marginBottom: 9 }}>{err}</div>}
      <div className="field">
        <label htmlFor="signin-email">Email</label>
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
        <label htmlFor="signin-password">Password</label>
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
        {login.isPending ? 'Signing in…' : 'Sign in'}
      </button>
      <p className="muted" style={{ textAlign: 'center', margin: '11px 0 0' }}>
        New here? <Link href={next ? `/sign-up?next=${encodeURIComponent(next)}` : '/sign-up'}>Create an account</Link>
      </p>

      <div style={{ borderTop: '1px solid var(--line)', marginTop: 12, paddingTop: 9 }}>
        <div className="row" style={{ gap: 6 }}>
          <span className="pill p-amber">Demo notice</span>
          <span className="muted">Seeded review login</span>
          <button
            className="btn btn-sm btn-grey"
            style={{ marginLeft: 'auto' }}
            onClick={() => setForm({ email: DEMO_EMAIL, password: DEMO_PASSWORD })}
          >
            Fill in
          </button>
        </div>
        <p className="hint" style={{ margin: '6px 0 0' }}>
          <b>{DEMO_EMAIL}</b> / <b>{DEMO_PASSWORD}</b> is a seeded <b>demo admin</b> account for reviewing the
          admin console. It is not a real seller — do not enter real credentials.
        </p>
      </div>
    </AuthCard>
  );
}

const ROLE_META: { role: string; label: string; hint: string }[] = [
  { role: 'buyer', label: 'Buyer', hint: 'I source products' },
  { role: 'supplier', label: 'Supplier', hint: 'I sell / manufacture' },
  { role: 'inspector', label: 'Inspector', hint: 'I verify factories' },
  { role: 'lab', label: 'Laboratory', hint: 'I test materials' },
  { role: 'logistics', label: 'Logistics', hint: 'I move cargo' },
];

export function SignUp() {
  const [, navigate] = useLocation();
  const next = safeNext(useSearch().match(/next=([^&]+)/)?.[1]);
  const register = useRegister();
  const [err, setErr] = useState('');
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'buyer', company: '', country: '' });

  const submit = async () => {
    setErr('');
    try {
      const res = await register.mutateAsync({ ...form, lang: 'en', role: zRole.parse(form.role) });
      navigate(next || homeFor(dashboardRole(res.user.role, true)));
    } catch (e) {
      setErr((e as ApiError).message ?? 'Registration failed');
    }
  };

  const activeRole = ROLE_META.find((r) => r.role === form.role);

  return (
    <AuthCard title="Create an account" sub="One account to buy, sell, or provide inspection and logistics services.">
      {err && <div className="errtext" style={{ marginBottom: 9 }}>{err}</div>}
      <div className="field">
        <label htmlFor="signup-name">Full name <i>*</i></label>
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
        <label htmlFor="signup-email">Work email <i>*</i></label>
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
        <label htmlFor="signup-password">Password <i>*</i></label>
        <input
          id="signup-password"
          className="in"
          type="password"
          placeholder="Minimum 8 characters"
          autoComplete="new-password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <div className="hint">At least 8 characters.</div>
      </div>
      <div className="field">
        <label>I am a…</label>
        <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          {ROLE_META.map((r) => (
            <button
              key={r.role}
              type="button"
              className={`chip ${form.role === r.role ? 'on' : ''}`}
              onClick={() => setForm({ ...form, role: r.role })}
            >
              {r.label}
            </button>
          ))}
        </div>
        {activeRole && <div className="hint">{activeRole.hint}</div>}
      </div>
      <div className="f2">
        <div className="field">
          <label htmlFor="signup-company">Company</label>
          <input
            id="signup-company"
            className="in"
            placeholder="Optional"
            autoComplete="organization"
            value={form.company}
            onChange={(e) => setForm({ ...form, company: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="signup-country">Country</label>
          <input
            id="signup-country"
            className="in"
            placeholder="Türkiye, China…"
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
        {register.isPending ? 'Creating account…' : 'Create account'}
      </button>
      <p className="muted" style={{ textAlign: 'center', margin: '11px 0 0' }}>
        Already registered? <Link href={next ? `/sign-in?next=${encodeURIComponent(next)}` : '/sign-in'}>Sign in</Link>
      </p>
      <p className="hint" style={{ marginTop: 9 }}>
        Listing is free. Trust badges are earned through verification, inspections and delivery history.
      </p>
    </AuthCard>
  );
}
