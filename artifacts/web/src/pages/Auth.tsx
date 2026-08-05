import { useState } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { useLogin, useRegister } from '@workspace/api-client-react';
import { Page, BrandMark } from '../components';
import type { ApiError } from '@workspace/api-client-react';
import { zRole } from '@workspace/api-zod';

function AuthShell({ children, title, sub }: { children: React.ReactNode; title: string; sub: string }) {
  return (
    <Page>
      <div className="card" style={{ maxWidth: 440, margin: '20px auto 0', padding: 34 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24 }}>
          <Link href="/" className="brand" style={{ marginBottom: 18 }}><BrandMark size={44} /><span className="brand-name" style={{ fontSize: 19 }}>FACTORYDEPO</span></Link>
          <h1 style={{ fontSize: 24 }}>{title}</h1>
          <p className="muted" style={{ fontSize: 13.5, textAlign: 'center', marginTop: 6 }}>{sub}</p>
        </div>
        {children}
      </div>
    </Page>
  );
}

export function SignIn() {
  const [, navigate] = useLocation();
  const next = useSearch().match(/next=([^&]+)/)?.[1];
  const login = useLogin();
  const [err, setErr] = useState('');
  const [form, setForm] = useState({ email: '', password: '' });

  const submit = async () => {
    setErr('');
    try {
      await login.mutateAsync(form);
      navigate(next ? decodeURIComponent(next) : '/dashboard');
    } catch (e) {
      setErr((e as ApiError).message ?? 'Login failed');
    }
  };

  return (
    <AuthShell title="Welcome back" sub="Sign in to your FactoryDepo account">
      {err && <div className="form-error">{err}</div>}
      <div className="field">
        <label>Email</label>
        <input type="email" placeholder="you@company.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </div>
      <div className="field">
        <label>Password</label>
        <input type="password" placeholder="••••••••" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && submit()} />
      </div>
      <button className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={login.isPending || !form.email || !form.password} onClick={submit}>
        {login.isPending ? 'Signing in…' : 'Sign In'}
      </button>
      <p className="muted" style={{ fontSize: 13.5, textAlign: 'center', marginTop: 18 }}>
        New to FactoryDepo? <Link href="/sign-up" style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>Create a free account</Link>
      </p>
      <p className="mono" style={{ fontSize: 11, color: 'var(--faint)', textAlign: 'center', marginTop: 14 }}>
        Demo: demo@factorydepo.com / factorydepo
      </p>
    </AuthShell>
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
  const next = useSearch().match(/next=([^&]+)/)?.[1];
  const register = useRegister();
  const [err, setErr] = useState('');
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'buyer', company: '', country: '' });

  const submit = async () => {
    setErr('');
    try {
      await register.mutateAsync({ ...form, lang: 'en', role: zRole.parse(form.role) });
      navigate(next ? decodeURIComponent(next) : '/dashboard');
    } catch (e) {
      setErr((e as ApiError).message ?? 'Registration failed');
    }
  };

  return (
    <AuthShell title="Create your free account" sub="Join buyers and suppliers across 80+ countries. Free to join, no listing fees.">
      {err && <div className="form-error">{err}</div>}
      <div className="field">
        <label>Full Name *</label>
        <input placeholder="Jane Smith" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>
      <div className="field">
        <label>Work Email *</label>
        <input type="email" placeholder="you@company.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </div>
      <div className="field">
        <label>Password * (min 8 characters)</label>
        <input type="password" placeholder="••••••••" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
      </div>
      <div className="field">
        <label>I am a…</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {ROLE_META.map((r) => (
            <button
              key={r.role}
              type="button"
              onClick={() => setForm({ ...form, role: r.role })}
              style={{
                border: `1.5px solid ${form.role === r.role ? 'var(--accent)' : 'var(--border-strong)'}`,
                background: form.role === r.role ? 'rgba(46,124,246,.08)' : 'var(--surface)',
                borderRadius: 10, padding: '10px 8px', textAlign: 'center', cursor: 'pointer', transition: 'all .15s ease',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>{r.label}</div>
              <div style={{ fontSize: 10.5, color: 'var(--faint)' }}>{r.hint}</div>
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label>Company</label>
        <input placeholder="Your company (optional)" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
      </div>
      <div className="field">
        <label>Country</label>
        <input placeholder="Türkiye, China…" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
      </div>
      <button className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={register.isPending || !form.name || !form.email || form.password.length < 8} onClick={submit}>
        {register.isPending ? 'Creating account…' : 'Create Free Account'}
      </button>
      <p className="muted" style={{ fontSize: 13.5, textAlign: 'center', marginTop: 18 }}>
        Already registered? <Link href="/sign-in" style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>Sign in</Link>
      </p>
    </AuthShell>
  );
}
