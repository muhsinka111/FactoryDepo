/**
 * FactoryDepo app chrome — ported from the owner-provided reference template
 * (factorydepo-v3). Three role dashboards (buyer / supplier / admin) share one
 * shell: a dense navy topbar, a category rail, a left sidebar of role nav and a
 * mobile bottom nav. Class names here map 1:1 onto styles.css.
 */
import { Link, useLocation } from 'wouter';
import { useEffect, useState, type ReactNode } from 'react';
import { useMe, useLogout, useUpdateMe, getToken } from '@workspace/api-client-react';
import { CATEGORIES } from '@workspace/api-spec';
import type { Product, Supplier, Rfq, Role } from '@workspace/api-zod';
import { LANGUAGES, useI18n, isLangCode, statusLabel, type DictKey, type LangCode } from './i18n';

/* ============================ navigation model ============================ */

export type NavKey =
  | 'feed' | 'explore' | 'offers-buyer' | 'rfqs' | 'orders' | 'shipments'
  | 'messages' | 'saved' | 'notifications' | 'help' | 'profile'
  | 'listings' | 'post' | 'offers-sup' | 'rfq-opps' | 'verification'
  | 'overview' | 'admin-suppliers' | 'admin-verify' | 'admin-listings'
  | 'admin-rfqs' | 'admin-payments' | 'sources' | 'growth' | 'features' | 'suppliers';

interface NavItem {
  key: NavKey;
  icon: string;
  /**
   * English source label AND the dictionary key. `navLabel()` translates it at
   * render time, so the nav changes language live without rebuilding the list.
   * Only `useI18n().t` may consume these values.
   */
  label: string;
  path: string;
}

export const NAV_BUYER: NavItem[] = [
  { key: 'feed', icon: '🏠', label: 'nav.feed', path: '/feed' },
  { key: 'explore', icon: '🧭', label: 'nav.explore', path: '/explore' },
  { key: 'offers-buyer', icon: '🏷️', label: 'nav.offersBuyer', path: '/offers' },
  { key: 'rfqs', icon: '📄', label: 'nav.rfqs', path: '/rfqs' },
  { key: 'orders', icon: '🧾', label: 'nav.orders', path: '/orders' },
  { key: 'shipments', icon: '🚚', label: 'nav.shipments', path: '/shipments' },
  { key: 'messages', icon: '💬', label: 'nav.messages', path: '/messages' },
  { key: 'saved', icon: '🔖', label: 'nav.saved', path: '/saved' },
  { key: 'notifications', icon: '🔔', label: 'nav.notifications', path: '/notifications' },
  { key: 'help', icon: '❓', label: 'nav.help', path: '/help' },
  { key: 'profile', icon: '👤', label: 'nav.profile', path: '/profile' },
];

export const NAV_SUPPLIER: NavItem[] = [
  { key: 'listings', icon: '📦', label: 'nav.listings', path: '/supplier/listings' },
  { key: 'post', icon: '➕', label: 'nav.post', path: '/supplier/post' },
  { key: 'offers-sup', icon: '🏷️', label: 'nav.offersSup', path: '/supplier/offers' },
  { key: 'rfq-opps', icon: '📄', label: 'nav.rfqOpps', path: '/supplier/rfq-opportunities' },
  { key: 'orders', icon: '🧾', label: 'nav.orders', path: '/orders' },
  { key: 'shipments', icon: '🚚', label: 'nav.shipments', path: '/shipments' },
  { key: 'verification', icon: '🛡️', label: 'nav.verification', path: '/supplier/verification' },
  { key: 'messages', icon: '💬', label: 'nav.messages', path: '/messages' },
  { key: 'notifications', icon: '🔔', label: 'nav.notifications', path: '/notifications' },
  { key: 'help', icon: '❓', label: 'nav.help', path: '/help' },
  { key: 'profile', icon: '👤', label: 'nav.profile', path: '/profile' },
];

export const NAV_ADMIN: NavItem[] = [
  { key: 'overview', icon: '🏠', label: 'nav.overview', path: '/admin' },
  { key: 'admin-suppliers', icon: '🚚', label: 'nav.adminSuppliers', path: '/admin/suppliers' },
  { key: 'admin-verify', icon: '🛡️', label: 'nav.adminVerify', path: '/admin/verification' },
  { key: 'admin-listings', icon: '📦', label: 'nav.adminListings', path: '/admin/listings' },
  { key: 'admin-rfqs', icon: '📄', label: 'nav.adminRfqs', path: '/admin/rfqs' },
  { key: 'admin-payments', icon: '💳', label: 'nav.adminPayments', path: '/admin/payments' },
  { key: 'sources', icon: '🔌', label: 'nav.sources', path: '/admin/sources' },
  { key: 'growth', icon: '📣', label: 'nav.growth', path: '/admin/growth' },
  { key: 'shipments', icon: '🚚', label: 'nav.shipments', path: '/shipments' },
  { key: 'features', icon: '⚙️', label: 'nav.features', path: '/admin/features' },
  { key: 'help', icon: '❓', label: 'nav.help', path: '/help' },
];

/** Logged-out visitors get the public slice of the marketplace. */
export const NAV_GUEST: NavItem[] = [
  { key: 'explore', icon: '🧭', label: 'nav.exploreStock', path: '/explore' },
  { key: 'suppliers', icon: '🏭', label: 'nav.suppliers', path: '/suppliers' },
  { key: 'help', icon: '❓', label: 'nav.howItWorks', path: '/help' },
];

/**
 * Translate a nav item's label. `NavItem.label` is a `DictKey` at runtime; the
 * cast is the one place where the nav model and the dictionary meet.
 */
export function navLabel(t: (key: DictKey, vars?: Record<string, string | number>) => string, item: NavItem): string {
  return t(item.label as DictKey);
}

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

/**
 * Categories come from lib/api-spec — ONE list, shared by the rail, the Explore
 * filter and the listing form. A second local list previously drifted from it,
 * which is why some rail categories matched nothing in the catalogue.
 */
export { CATEGORIES as RAIL_CATEGORIES } from '@workspace/api-spec';

export const MARKET_COUNTRIES: [string, string][] = [
  ['Turkey', '🇹🇷'], ['China', '🇨🇳'], ['USA', '🇺🇸'],
  ['Germany', '🇩🇪'], ['Netherlands', '🇳🇱'], ['India', '🇮🇳'],
];

/* ============================== chrome pieces ============================= */

/**
 * Logo mark — a warehouse/depot roofline over stacked cargo, in the brand's
 * navy + gold. Drawn as inline SVG rather than the previous CSS clip-path so it
 * stays crisp at small sizes and reads as industrial, not generic.
 */
export function LogoMark({ size = 24 }: { size?: number }) {
  return (
    <svg
      className="logomark"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="FactoryDepo"
      focusable="false"
    >
      <rect x="0" y="0" width="32" height="32" rx="7" fill="#f5a623" />
      {/* depot roof */}
      <path d="M5 12.2 16 5.6l11 6.6v1.9H5z" fill="#132238" />
      {/* stacked cargo bays */}
      <rect x="7.4" y="17.2" width="5.1" height="9.2" rx="1.1" fill="#132238" />
      <rect x="13.5" y="17.2" width="5.1" height="9.2" rx="1.1" fill="#132238" />
      <rect x="19.6" y="17.2" width="5.1" height="9.2" rx="1.1" fill="#132238" />
      {/* loading bay light */}
      <rect x="13.5" y="19.6" width="5.1" height="2.2" rx="0.8" fill="#f5a623" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link href="/" className="logo">
      <LogoMark />
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
  const updateMe = useUpdateMe();
  const { t, lang, setLang } = useI18n();
  const loggedIn = !!getToken();
  const [q, setQ] = useState('');

  /**
   * Switching language is always local and immediate. When an account is signed
   * in we also mirror the choice onto it, but the request is fire-and-forget:
   * a failed PATCH must never roll the interface back or block the switch.
   */
  const changeLang = (next: LangCode) => {
    setLang(next);
    if (loggedIn) void updateMe.mutateAsync({ lang: next }).catch(() => { /* non-blocking */ });
  };

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
          placeholder={t('topbar.searchPlaceholder')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label={t('topbar.searchAria')}
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

      {/* Language switcher — always visible, signed in or not. Native names only,
          so a speaker recognises their language without reading English. */}
      <div className="rolepick">
        <select
          value={lang}
          onChange={(e) => { if (isLangCode(e.target.value)) changeLang(e.target.value); }}
          aria-label={t('topbar.languageAria')}
          title={t('topbar.languageAria')}
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>{l.native}</option>
          ))}
        </select>
      </div>

      {loggedIn && (
        <Link href="/notifications" className="iconbtn" title={t('topbar.notifications')}>
          🔔{notificationCount > 0 && <span className="badge">{notificationCount}</span>}
        </Link>
      )}

      {loggedIn && role ? (
        <div className="rolepick">
          <span style={{ fontSize: 12, opacity: 0.8 }}>{user?.name ?? t('topbar.account')}</span>
          <span className="pill p-navy">{role}</span>
          <button className="iconbtn" onClick={logout} title={t('action.signOut')} aria-label={t('action.signOut')}>⎋</button>
        </div>
      ) : (
        <div className="rolepick">
          <Link href="/sign-in" className="btn btn-sm btn-grey">{t('action.signIn')}</Link>
          <Link href="/sign-up" className="btn btn-sm btn-gold">{t('action.joinFree')}</Link>
        </div>
      )}
    </div>
  );
}

export function CategoryRail({ active, onPick }: { active?: string; onPick?: (c: string) => void }) {
  const { t } = useI18n();
  return (
    <div className="rail">
      <button className={!active ? 'on' : ''} onClick={() => onPick?.('All')}>{t('rail.allIndustries')}</button>
      {CATEGORIES.map((c) => (
        <button key={c} className={active === c ? 'on' : ''} onClick={() => onPick?.(c)}>{c}</button>
      ))}
      <Link href="/help" style={{ marginLeft: 'auto', color: 'var(--blue)', alignSelf: 'center', padding: '8px 11px', fontSize: 12.5 }}>
        {t('rail.howItWorks')}
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
  const { t } = useI18n();
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
            {navLabel(t, it)}
            {n ? <span className="n">{n}</span> : null}
          </Link>
        );
      })}
      <div className="sidefoot">
        <b>{t('sidebar.moreIndustries')}</b>
        {t('sidebar.moreIndustriesSub')}
      </div>
    </nav>
  );
}

export function BottomNav({ items, activeKey }: { items: NavItem[]; activeKey?: NavKey }) {
  const { t } = useI18n();
  const tabs = items.slice(0, 5);
  return (
    <div className="bottomnav">
      {tabs.map((it) => (
        <Link key={it.key} href={it.path} className={activeKey === it.key ? 'on' : ''}>
          <span style={{ fontSize: 19 }} aria-hidden="true">{it.icon}</span>
          {navLabel(t, it)}
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

/**
 * `Verified` and `DemoTag` are reused by many pages. The default label is
 * translated here; a caller that passes an explicit `label` keeps full control
 * (those callers translate their own string).
 */
export function Verified({ label }: { label?: string }) {
  const { t } = useI18n();
  return <span className="pill p-green">✓ {label ?? t('common.verified')}</span>;
}

export function DemoTag() {
  const { t } = useI18n();
  return <span className="pill p-amber" title={t('cards.demoTitle')}>{t('cards.demo')}</span>;
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
  missing: 'p-grey', approved: 'p-green', countered: 'p-amber', withdrawn: 'p-grey',
};

/**
 * Raw API status values are mapped through the dictionary, so `sold_out`
 * renders as the translated phrase. An unknown status falls back to the raw
 * value with underscores replaced — never blank.
 */
export function StatusChip({ status }: { status: string }) {
  const { lang } = useI18n();
  return <span className={`pill ${STATUS_PILL[status] ?? 'p-grey'}`}>{statusLabel(lang, status)}</span>;
}

/* ================================ cards ================================== */

/** Currency symbol + amount exactly as the API supplied them; never recalculated. */
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
  const { t } = useI18n();
  return (
    <div className="lcard">
      <Link href={`/products/${p.id}`} className="media">
        {p.imageKey
          ? <img src={p.imageKey} alt={p.name} loading="lazy" />
          : (
            <div className="ph-empty">
              <span className="ph-cat">{p.category}</span>
              <span className="ph-note">{t('cards.noPhoto')}</span>
            </div>
          )}
        {p.verified && <span className="vtag"><Verified /></span>}
        {p.dataSource === 'demo' && <span className="ptag"><DemoTag /></span>}
      </Link>
      <div className="bd">
        <h3><Link href={`/products/${p.id}`}>{p.name}</Link></h3>
        <div className="meta"><b>{p.originCountry}</b></div>
        <div className="meta">{t('cards.moq')} {p.moq.toLocaleString()} {p.unit}</div>
        <div className="between" style={{ marginTop: 'auto', paddingTop: 5 }}>
          <Price p={p} />
          {onSave && (
            <button className="btn btn-sm btn-grey" onClick={() => onSave(p)} title={t('cards.saveLot')}>🔖</button>
          )}
        </div>
      </div>
    </div>
  );
}

export function SupplierCard({ s }: { s: Supplier }) {
  const { t } = useI18n();
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
            {s.country}{s.city ? ` · ${s.city}` : ''} · {s.productCount} {t('listings.col.lot')}
          </div>
          <div className="row" style={{ marginTop: 5, gap: 8 }}>
            <Stars rating={s.rating} />
            <span className="muted" style={{ fontSize: 11 }}>{s.inspectionsCount} {t('cards.inspections')}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export function RfqCard({ r }: { r: Rfq }) {
  const { t } = useI18n();
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
          {r.targetCountry ? ` · ${r.targetCountry}` : ''} · {t('rfq.quotesCount', { n: r.quoteCount })}
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
  const { t } = useI18n();

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
          <h2>{t('gate.title')}</h2>
          <button className="x" onClick={() => setOpen(false)} aria-label={t('action.close')}>✕</button>
        </div>
        <div className="mb">
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
            {t('gate.body')}
          </p>
          <Link href="/sign-up" className="btn btn-gold" style={{ width: '100%', marginBottom: 8 }}>{t('gate.createAccount')}</Link>
          <Link href="/sign-in" className="btn btn-ghost" style={{ width: '100%' }}>{t('gate.haveAccount')}</Link>
        </div>
      </div>
    </div>
  );
}
