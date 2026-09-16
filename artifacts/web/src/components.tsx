/**
 * FactoryDepo app chrome — ported from the owner-provided reference template
 * (factorydepo-v3). Three role dashboards (buyer / supplier / admin) share one
 * shell: a dense navy topbar, a category rail, a left sidebar of role nav and a
 * mobile bottom nav. Class names here map 1:1 onto styles.css.
 */
import { Link, useLocation } from 'wouter';
import { useEffect, useState, type ReactNode } from 'react';
import { useMe, useLogout, getToken } from '@workspace/api-client-react';
import type { Product, Supplier, Rfq, Role } from '@workspace/api-zod';

/* ============================ navigation model ============================ */

export type NavKey =
  | 'feed' | 'explore' | 'offers-buyer' | 'rfqs' | 'orders' | 'shipments'
  | 'messages' | 'saved' | 'notifications' | 'help' | 'profile'
  | 'listings' | 'post' | 'offers-sup' | 'rfq-opps' | 'verification'
  | 'overview' | 'admin-suppliers' | 'admin-verify' | 'admin-listings'
  | 'admin-rfqs' | 'sources' | 'growth' | 'features' | 'suppliers';

interface NavItem {
  key: NavKey;
  icon: string;
  label: string;
  path: string;
}

export const NAV_BUYER: NavItem[] = [
  { key: 'feed', icon: '🏠', label: 'Feed', path: '/feed' },
  { key: 'explore', icon: '🧭', label: 'Explore', path: '/explore' },
  { key: 'offers-buyer', icon: '🏷️', label: 'My offers', path: '/offers' },
  { key: 'rfqs', icon: '📄', label: 'My RFQs', path: '/rfqs' },
  { key: 'orders', icon: '🧾', label: 'Orders', path: '/orders' },
  { key: 'shipments', icon: '🚚', label: 'Shipments', path: '/shipments' },
  { key: 'messages', icon: '💬', label: 'Messages', path: '/messages' },
  { key: 'saved', icon: '🔖', label: 'Saved', path: '/saved' },
  { key: 'notifications', icon: '🔔', label: 'Notifications', path: '/notifications' },
  { key: 'help', icon: '❓', label: 'Help centre', path: '/help' },
  { key: 'profile', icon: '👤', label: 'Profile', path: '/profile' },
];

export const NAV_SUPPLIER: NavItem[] = [
  { key: 'listings', icon: '📦', label: 'My listings', path: '/supplier/listings' },
  { key: 'post', icon: '➕', label: 'Post stock', path: '/supplier/post' },
  { key: 'offers-sup', icon: '🏷️', label: 'Offers', path: '/supplier/offers' },
  { key: 'rfq-opps', icon: '📄', label: 'RFQ opportunities', path: '/supplier/rfq-opportunities' },
  { key: 'orders', icon: '🧾', label: 'Orders', path: '/orders' },
  { key: 'shipments', icon: '🚚', label: 'Shipments', path: '/shipments' },
  { key: 'verification', icon: '🛡️', label: 'Verification', path: '/supplier/verification' },
  { key: 'messages', icon: '💬', label: 'Messages', path: '/messages' },
  { key: 'notifications', icon: '🔔', label: 'Notifications', path: '/notifications' },
  { key: 'help', icon: '❓', label: 'Help centre', path: '/help' },
  { key: 'profile', icon: '👤', label: 'Profile', path: '/profile' },
];

export const NAV_ADMIN: NavItem[] = [
  { key: 'overview', icon: '🏠', label: 'Overview', path: '/admin' },
  { key: 'admin-suppliers', icon: '🚚', label: 'Suppliers', path: '/admin/suppliers' },
  { key: 'admin-verify', icon: '🛡️', label: 'Verification desk', path: '/admin/verification' },
  { key: 'admin-listings', icon: '📦', label: 'Listings', path: '/admin/listings' },
  { key: 'admin-rfqs', icon: '📄', label: 'RFQs', path: '/admin/rfqs' },
  { key: 'sources', icon: '🔌', label: 'Supply sources', path: '/admin/sources' },
  { key: 'growth', icon: '📣', label: 'Banners and promos', path: '/admin/growth' },
  { key: 'shipments', icon: '🚚', label: 'Shipments', path: '/shipments' },
  { key: 'features', icon: '⚙️', label: 'Features', path: '/admin/features' },
  { key: 'help', icon: '❓', label: 'Help centre', path: '/help' },
];

/** Logged-out visitors get the public slice of the marketplace. */
export const NAV_GUEST: NavItem[] = [
  { key: 'explore', icon: '🧭', label: 'Explore stock', path: '/explore' },
  { key: 'suppliers', icon: '🏭', label: 'Suppliers', path: '/suppliers' },
  { key: 'help', icon: '❓', label: 'How it works', path: '/help' },
];

/** Roles collapse to one of the three template dashboards. */
export type DashboardRole = 'buyer' | 'supplier' | 'admin';

export function dashboardRole(role: Role | undefined, loggedIn: boolean): DashboardRole | null {
  if (!loggedIn || !role) return null;
  if (role === 'admin') return 'admin';
  if (role === 'supplier') return 'supplier';
  return 'buyer';
}

export function navFor(dash: DashboardRole | null): NavItem[] {
  if (dash === 'admin') return NAV_ADMIN;
  if (dash === 'supplier') return NAV_SUPPLIER;
  if (dash === 'buyer') return NAV_BUYER;
  return NAV_GUEST;
}

/** Where each role lands after signing in. */
export function homeFor(dash: DashboardRole | null): string {
  if (dash === 'admin') return '/admin';
  if (dash === 'supplier') return '/supplier/listings';
  if (dash === 'buyer') return '/feed';
  return '/explore';
}

/** Categories from lib/api-spec, kept in sync with the rail. */
export const RAIL_CATEGORIES = [
  'Metals & Steel', 'Plastics', 'Textiles & Fabrics', 'Electronics',
  'Machinery & Equipment', 'Packaging', 'Building Materials', 'Hardware & Fasteners',
  'Chemicals', 'Automotive', 'Energy', 'Agriculture',
] as const;

export const MARKET_COUNTRIES: [string, string][] = [
  ['Turkey', '🇹🇷'], ['China', '🇨🇳'], ['USA', '🇺🇸'],
  ['Germany', '🇩🇪'], ['Netherlands', '🇳🇱'], ['India', '🇮🇳'],
];

/* ============================== chrome pieces ============================= */

export function Logo() {
  return (
    <Link href="/" className="logo">
      <span className="mark" />
      factory<b>depo</b>
    </Link>
  );
}

interface TopbarProps {
  /** Live per-country listing counts, or undefined while unknown — never invented. */
  marketCounts?: Record<string, number>;
  notificationCount?: number;
  onRoleSwitch?: (role: DashboardRole) => void;
  role?: DashboardRole;
}

export function Topbar({ marketCounts, notificationCount = 0, role }: TopbarProps) {
  const [, navigate] = useLocation();
  const { data: user } = useMe();
  const logout = useLogout();
  const loggedIn = !!getToken();
  const [q, setQ] = useState('');

  return (
    <div className="topbar">
      <Logo />
      <form
        className="searchwrap"
        onSubmit={(e) => {
          e.preventDefault();
          navigate(`/explore?q=${encodeURIComponent(q)}`);
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
        </svg>
        <input
          placeholder="Search products, suppliers, categories…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search the marketplace"
        />
      </form>

      <div className="markets">
        {MARKET_COUNTRIES.map(([country, flag]) => (
          <span key={country} title={country}>
            {flag} <b>{marketCounts ? (marketCounts[country] ?? 0) : '—'}</b>
          </span>
        ))}
      </div>
      <div className="spacer" />

      {loggedIn && (
        <Link href="/notifications" className="iconbtn" title="Notifications">
          🔔{notificationCount > 0 && <span className="badge">{notificationCount}</span>}
        </Link>
      )}

      {loggedIn && role ? (
        <div className="rolepick">
          <span style={{ fontSize: 12, opacity: 0.8 }}>{user?.name ?? 'Account'}</span>
          <span className="pill p-navy">{role}</span>
          <button className="iconbtn" onClick={logout} title="Sign out" aria-label="Sign out">⎋</button>
        </div>
      ) : (
        <div className="rolepick">
          <Link href="/sign-in" className="btn btn-sm btn-grey">Sign in</Link>
          <Link href="/sign-up" className="btn btn-sm btn-gold">Join free</Link>
        </div>
      )}
    </div>
  );
}

export function CategoryRail({ active, onPick }: { active?: string; onPick?: (c: string) => void }) {
  return (
    <div className="rail">
      <button className={!active ? 'on' : ''} onClick={() => onPick?.('All')}>All industries</button>
      {RAIL_CATEGORIES.map((c) => (
        <button key={c} className={active === c ? 'on' : ''} onClick={() => onPick?.(c)}>{c}</button>
      ))}
      <Link href="/help" style={{ marginLeft: 'auto', color: 'var(--blue)', alignSelf: 'center', padding: '8px 11px', fontSize: 12.5 }}>
        How it works
      </Link>
    </div>
  );
}

interface SidebarProps {
  items: NavItem[];
  activeKey?: NavKey;
  who: { name: string; meta: string };
  counts?: Partial<Record<NavKey, number>>;
}

export function Sidebar({ items, activeKey, who, counts }: SidebarProps) {
  return (
    <nav className="side">
      <div className="who">
        <b>{who.name}</b>
        <span>{who.meta}</span>
      </div>
      {items.map((it) => {
        const n = counts?.[it.key];
        return (
          <Link key={it.key} href={it.path} className={`navitem ${activeKey === it.key ? 'on' : ''}`}>
            <span aria-hidden="true">{it.icon}</span>
            {it.label}
            {n ? <span className="n">{n}</span> : null}
          </Link>
        );
      })}
      <div className="sidefoot">
        <b>More industries. More countries.</b>
        One marketplace for ready stock.
      </div>
    </nav>
  );
}

export function BottomNav({ items, activeKey }: { items: NavItem[]; activeKey?: NavKey }) {
  const tabs = items.slice(0, 5);
  return (
    <div className="bottomnav">
      {tabs.map((it) => (
        <Link key={it.key} href={it.path} className={activeKey === it.key ? 'on' : ''}>
          <span style={{ fontSize: 19 }} aria-hidden="true">{it.icon}</span>
          {it.label}
        </Link>
      ))}
    </div>
  );
}

/** Resolve which nav key a location corresponds to. */
export function activeKeyFor(items: NavItem[], location: string): NavKey | undefined {
  const exact = items.find((i) => i.path === location);
  if (exact) return exact.key;
  const prefixed = items
    .filter((i) => i.path !== '/' && location.startsWith(i.path + '/'))
    .sort((a, b) => b.path.length - a.path.length)[0];
  return prefixed?.key;
}

/* ============================== small pieces ============================== */

export function Spinner() { return <div className="spinner" />; }

export function Verified({ label = 'Verified' }: { label?: string }) {
  return <span className="pill p-green">✓ {label}</span>;
}

export function DemoTag() {
  return <span className="pill p-amber" title="Seed data — not a real offer">Demo</span>;
}

export function Stars({ rating }: { rating: number }) {
  return (
    <span title={`${rating} / 5`} style={{ color: 'var(--amber)' }}>
      {'★'.repeat(Math.round(rating))}{'☆'.repeat(5 - Math.round(rating))}
    </span>
  );
}

const STATUS_PILL: Record<string, string> = {
  open: 'p-green', quoted: 'p-blue', closed: 'p-grey',
  submitted: 'p-blue', accepted: 'p-green', rejected: 'p-red',
  active: 'p-green', sold_out: 'p-grey',
  scheduled: 'p-amber', in_progress: 'p-blue', passed: 'p-green', failed: 'p-red',
  pending: 'p-amber', paid: 'p-green', shipped: 'p-blue', delivered: 'p-green', cancelled: 'p-red',
};

export function StatusChip({ status }: { status: string }) {
  return <span className={`pill ${STATUS_PILL[status] ?? 'p-grey'}`}>{status.replace(/_/g, ' ')}</span>;
}

/* ================================ cards ================================== */

function Price({ p }: { p: Product }) {
  return (
    <span className="price">
      {p.currency === 'USD' ? '$' : `${p.currency} `}
      {p.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}
      <span> / {p.unit}</span>
    </span>
  );
}

export function ProductCard({ p, onSave }: { p: Product; onSave?: (p: Product) => void }) {
  return (
    <div className="lcard">
      <Link href={`/products/${p.id}`} className="media">
        {p.imageKey
          ? <img src={p.imageKey} alt={p.name} loading="lazy" />
          : <div className="ph" style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: 'var(--faint)', fontSize: 11 }}>no photo</div>}
        {p.verified && <span className="vtag"><Verified /></span>}
        {p.dataSource === 'demo' && <span className="ptag"><DemoTag /></span>}
      </Link>
      <div className="bd">
        <h3><Link href={`/products/${p.id}`}>{p.name}</Link></h3>
        <div className="meta"><b>{p.originCountry}</b></div>
        <div className="meta">MOQ {p.moq.toLocaleString()} {p.unit}</div>
        <div className="between" style={{ marginTop: 'auto', paddingTop: 5 }}>
          <Price p={p} />
          {onSave && (
            <button className="btn btn-sm btn-grey" onClick={() => onSave(p)} title="Save this lot">🔖</button>
          )}
        </div>
      </div>
    </div>
  );
}

export function SupplierCard({ s }: { s: Supplier }) {
  return (
    <Link href={`/suppliers/${s.id}`} className="card">
      <div className="bd row" style={{ alignItems: 'flex-start', gap: 10 }}>
        <span className="av" style={{ width: 34, height: 34, fontSize: 13 }}>
          {s.companyName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="between">
            <b style={{ fontSize: 13 }}>{s.companyName}</b>
            {s.verifiedLevel >= 2 ? <Verified /> : (s.dataSource === 'demo' ? <DemoTag /> : null)}
          </div>
          <div className="muted" style={{ fontSize: 11.5 }}>
            {s.country}{s.city ? ` · ${s.city}` : ''} · {s.productCount} listing{s.productCount === 1 ? '' : 's'}
          </div>
          <div className="row" style={{ marginTop: 5, gap: 8 }}>
            <Stars rating={s.rating} />
            <span className="muted" style={{ fontSize: 11 }}>{s.inspectionsCount} inspections</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export function RfqCard({ r }: { r: Rfq }) {
  return (
    <Link href={`/rfqs/${r.id}`} className="card">
      <div className="bd">
        <div className="between">
          <span className="muted" style={{ fontSize: 11 }}>{r.category}</span>
          <StatusChip status={r.status} />
        </div>
        <b style={{ display: 'block', fontSize: 13, margin: '5px 0 3px' }}>{r.title}</b>
        <div className="muted" style={{ fontSize: 11.5 }}>
          {r.quantity.toLocaleString()} {r.unit}
          {r.targetCountry ? ` · ${r.targetCountry}` : ''} · {r.quoteCount} quote{r.quoteCount === 1 ? '' : 's'}
        </div>
      </div>
    </Link>
  );
}

/** Standard page body wrapper inside the shell. */
export function View({ title, sub, actions, children }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <>
      <div className="between" style={{ marginBottom: 12 }}>
        <div>
          <h1>{title}</h1>
          {sub ? <p className="sub" style={{ margin: 0 }}>{sub}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="card"><div className="empty"><b>{title}</b>{children}</div></div>;
}

/* ============================== auth gate ================================ */

export function requireAuthGate() {
  window.dispatchEvent(new CustomEvent('fd:require-auth'));
}

export function AuthGateModal() {
  const [open, setOpen] = useState(false);
  const { data: user } = useMe();

  useEffect(() => {
    const handler = () => { if (!getToken()) setOpen(true); };
    window.addEventListener('fd:require-auth', handler);
    return () => window.removeEventListener('fd:require-auth', handler);
  }, []);

  useEffect(() => { if (user) setOpen(false); }, [user]);

  if (!open) return null;
  return (
    <div className="overlay" onClick={() => setOpen(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <h2>Member access</h2>
          <button className="x" onClick={() => setOpen(false)} aria-label="Close">✕</button>
        </div>
        <div className="mb">
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
            Contacting suppliers, posting requests and quoting are member actions.
            Browsing the marketplace stays free and open.
          </p>
          <Link href="/sign-up" className="btn btn-gold" style={{ width: '100%', marginBottom: 8 }}>Create free account</Link>
          <Link href="/sign-in" className="btn btn-ghost" style={{ width: '100%' }}>I already have an account</Link>
        </div>
      </div>
    </div>
  );
}
