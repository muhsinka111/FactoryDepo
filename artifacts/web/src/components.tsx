/**
 * FactoryDepo app chrome — ported from the owner-provided reference template
 * (factorydepo-v3). Three role dashboards (buyer / supplier / admin) share one
 * shell: a dense navy topbar, a category rail, a left sidebar of role nav and a
 * mobile bottom nav. Class names here map 1:1 onto styles.css.
 */
import { Link, useLocation, useSearch } from 'wouter';
import { useEffect, useState, type ReactNode } from 'react';
import { useMe, useLogout, useUpdateMe, getToken, useCategoryCounts, useProductCountryCounts } from '@workspace/api-client-react';
import { CATEGORIES } from '@workspace/api-spec';
import { coverFor } from './categoryImages';
import type { Product, Supplier, Rfq, Role } from '@workspace/api-zod';
import { LANGUAGES, useI18n, isLangCode, statusLabel, type DictKey, type LangCode } from './i18n';

/* ============================ navigation model ============================ */

export type NavKey =
  | 'feed' | 'explore' | 'categories' | 'sell' | 'offers-buyer' | 'rfqs' | 'orders' | 'shipments'
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
  { key: 'categories', icon: '🗂️', label: 'nav.categories', path: '/categories' },
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
  { key: 'categories', icon: '🗂️', label: 'nav.categories', path: '/categories' },
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
  { key: 'categories', icon: '🗂️', label: 'nav.categories', path: '/categories' },
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

/**
 * Logged-out visitors get the public slice of the marketplace — including the
 * sell path, because "anyone with stock can list it" is the pitch and a
 * signed-out seller must be able to find the door. /supplier/post gates on auth.
 */
export const NAV_GUEST: NavItem[] = [
  { key: 'explore', icon: '🧭', label: 'nav.exploreStock', path: '/explore' },
  { key: 'categories', icon: '🗂️', label: 'nav.categories', path: '/categories' },
  { key: 'suppliers', icon: '🏭', label: 'nav.suppliers', path: '/suppliers' },
  { key: 'sell', icon: '➕', label: 'nav.sellStock', path: '/supplier/post' },
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

/**
 * Markets shown in the topbar strip. Each entry's code is the filter value the
 * link sends, and the catalogue's `country` filter is alias-aware
 * (routes/products.ts), so a code matches every stored spelling of that market
 * ('TR' and 'Türkiye' are one market) and the figure the strip shows is the
 * figure the filtered list returns. The strip is limited to the marketplace's
 * declared scope (Türkiye, China, USA + Europe) — India and Vietnam are excluded
 * by owner policy and must never be offered here.
 */
export const MARKET_COUNTRIES: [string, string, string][] = [
  ['TR', '🇹🇷', 'Türkiye'], ['CN', '🇨🇳', 'China'], ['US', '🇺🇸', 'USA'],
  ['DE', '🇩🇪', 'Germany'], ['NL', '🇳🇱', 'Netherlands'], ['IT', '🇮🇹', 'Italy'],
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
      {/*
        One mark for the whole brand: a navy tile carrying a gold depot roofline
        over a stack of gold lots. It reads as "depot + surplus stock" at 16px,
        which is the product's actual pitch. Geometry is duplicated only in the
        favicon data URI (index.html) and the static landing, which cannot import
        this file; keep the three in step.
      */}
      <rect width="32" height="32" rx="8" fill="#132238" />
      <path d="M5 11.6 16 5.8l11 5.8v1.7H5z" fill="#f5a623" />
      <rect x="7.5" y="15.7" width="17" height="3.1" rx="1.55" fill="#f5a623" />
      <rect x="7.5" y="20.5" width="12.6" height="3.1" rx="1.55" fill="#f5a623" opacity=".72" />
      <rect x="7.5" y="25.3" width="8.2" height="3.1" rx="1.55" fill="#f5a623" opacity=".45" />
    </svg>
  );
}

export function Logo() {
  const { t } = useI18n();
  return (
    <Link href="/" className="logo" title={`factorydepo — ${t('brand.tagline')}`}>
      <LogoMark />
      factory<b>depo</b>
      {/* The positioning, in the topbar itself: what the marketplace is for.
          Hidden under 1100px so the search field keeps its width. */}
      <span className="tag hidem-s">{t('brand.tagline')}</span>
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
   * Live market counts for the strip. The `marketCounts` prop stays as an
   * override for a caller that already holds the figures; otherwise the figures
   * come from GET /api/products/countries. `undefined` means "not known yet"
   * and renders an em dash — never a zero we did not measure.
   */
  const countryCounts = useProductCountryCounts({ enabled: !marketCounts });
  const liveCounts: Record<string, number> | undefined =
    marketCounts ??
    (countryCounts.data
      ? Object.fromEntries(countryCounts.data.items.map((i) => [i.country, i.count]))
      : undefined);

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

      {/* Each market figure is a link into the catalogue filtered to that origin.
          Counts come from GET /api/products/countries (real COUNTs, alias-merged
          so TR/Türkiye and CN/China are one market). While the request is in
          flight the figure is an em dash; a market that answered with no rows is
          a genuine 0. */}
      <div className="markets">
        {MARKET_COUNTRIES.map(([code, flag, name]) => (
          <Link
            key={code}
            href={`/explore?country=${encodeURIComponent(code)}`}
            title={`${name} · ${t('categories.listingCount', { n: liveCounts ? String(liveCounts[code] ?? 0) : '—' })}`}
            style={{ color: 'inherit' }}
          >
            {flag} <b>{liveCounts ? (liveCounts[code] ?? 0) : '—'}</b>
          </Link>
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

/**
 * Category rail.
 *
 * Two things this has to get right, both of which were broken:
 *  1. Clicking a category must actually go somewhere. It previously called an
 *     optional `onPick` that App.tsx never passed, so every button was inert.
 *     It now navigates to /explore?category=… by default.
 *  2. It only offers categories that genuinely contain stock, using live counts
 *     from the API — so a click can never land on an empty results page.
 */
export function CategoryRail({ active, onPick }: { active?: string; onPick?: (c: string) => void }) {
  const { t } = useI18n();
  const [, navigate] = useLocation();
  const search = useSearch();
  const { data } = useCategoryCounts();
  const cats = data?.items ?? [];

  // The active category comes from the QUERY STRING, which is a different
  // channel from the path in wouter: `useLocation()` in wouter 3.x returns the
  // pathname only (its `usePathname`), so a `?category=…` navigation never
  // appears there — and reading `window.location.search` at render time is not
  // reactive either, which is why the highlight stuck on "All industries".
  // `useSearch()` is the hook that subscribes to push/replace/popstate.
  const current = active ?? new URLSearchParams(search).get('category') ?? '';

  const pick = (c: string) => {
    if (onPick) { onPick(c); return; }
    navigate(c === 'All' ? '/explore' : `/explore?category=${encodeURIComponent(c)}`);
  };

  return (
    <div className="rail">
      <button className={current ? '' : 'on'} onClick={() => pick('All')}>{t('rail.allIndustries')}</button>
      {cats.map((c) => (
        <button key={c.category} className={current === c.category ? 'on' : ''} onClick={() => pick(c.category)}>
          {c.category}
          <span className="muted" style={{ marginLeft: 5, fontSize: 10.5 }}>{c.count.toLocaleString()}</span>
        </button>
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
        <Link href="/categories" style={{ display: 'block', marginTop: 5 }}>
          {t('nav.categories')} →
        </Link>
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

/**
 * The catalogue is entirely bootstrap seed data right now. Saying so once, at
 * the top of the browse views, is the honest complement to the per-card Demo
 * tag — a buyer must not have to infer it from badges.
 */
export function DemoNotice() {
  const { t } = useI18n();
  return (
    <div className="demoNotice" role="note">
      <b>{t('demo.title')}</b>
      <span>{t('demo.body')}</span>
    </div>
  );
}

/* ========================= notification copy ============================= */

/**
 * Notification rows arrive from the API with a server-written English `text` and
 * a raw enum `type`. Neither is interface copy, so neither may be rendered
 * verbatim in a translated UI:
 *
 *  • the type chip goes through a dictionary key — the same noun the navigation
 *    already translates for that entity — so `message` reads as “Mesajlar” in
 *    Turkish instead of the internal enum value; an unknown type falls back to
 *    the existing `statusLabel()` convention (readable words, never blank);
 *  • the body is re-composed in the interface language when the row matches a
 *    template the API actually writes (see `notifParts` below). When the type or
 *    the wording is not recognised, or the dictionary has no sentence for it
 *    yet, the server text is shown exactly as received — never a raw key, never
 *    a half-translated sentence.
 *
 * The sentence keys live in the `notes.body.*` namespace. `t()` returns the key
 * itself while a key is missing from `en` (i18n.tsx documents that), and that is
 * exactly what the fallback detects — so adding the key to the dictionary is all
 * that is needed to light its sentence up; no code change follows.
 */
export type TranslateFn = (key: DictKey, vars?: Record<string, string | number>) => string;

/** `DictKey` cast for keys this file needs before the dictionary carries them. */
const dictKey = (key: string): DictKey => key as DictKey;

/** Notification `type` → the noun the interface already uses for that entity. */
const NOTIF_TYPE_KEY: Record<string, DictKey> = {
  message: 'nav.messages',
  thread: 'nav.messages',
  shipment: 'nav.shipments',
  payment: 'nav.adminPayments',
  offer: 'nav.offersSup',
  order: 'nav.orders',
};

/** The localised chip label for a notification type, or null when there is none. */
export function notifTypeLabel(t: TranslateFn, lang: LangCode, type: string | null | undefined): string | null {
  if (!type) return null;
  const key = NOTIF_TYPE_KEY[type];
  return key ? t(key) : statusLabel(lang, type);
}

/** A notification shape, structurally — only these two fields are ever read. */
export interface NotifLike {
  type: string | null;
  text: string;
}

interface NotifParts {
  key: DictKey;
  vars: Record<string, string | number>;
}

/**
 * The API writes a fixed set of English notification bodies (see the notify()
 * call sites in the server routes). Each template is matched exactly and
 * anchored, so a reworded server string falls through to the body-as-received
 * rather than being mis-parsed.
 */
function notifParts(n: NotifLike, lang: LangCode): NotifParts | null {
  const text = n.text ?? '';
  let m: RegExpMatchArray | null;
  switch (n.type) {
    case 'message':
      m = text.match(/^New message from (.+)\.$/);
      return m ? { key: dictKey('notes.body.newMessage'), vars: { name: m[1] } } : null;
    case 'thread':
      m = text.match(/^New enquiry from (.+)\.$/);
      return m ? { key: dictKey('notes.body.newEnquiry'), vars: { name: m[1] } } : null;
    case 'shipment':
      m = text.match(/^Order #(\d+) was delivered\.$/);
      if (m) return { key: dictKey('notes.body.shipmentDelivered'), vars: { id: m[1] } };
      m = text.match(/^Shipment for order #(\d+) advanced\.$/);
      return m ? { key: dictKey('notes.body.shipmentAdvanced'), vars: { id: m[1] } } : null;
    case 'payment':
      m = text.match(/^Payment of (\S+) ([\d.,]+) recorded for order #(\d+) — awaiting confirmation\.$/);
      if (m) return { key: dictKey('notes.body.paymentRecorded'), vars: { currency: m[1], amount: m[2], id: m[3] } };
      m = text.match(/^Payment for order #(\d+) was confirmed\.$/);
      if (m) return { key: dictKey('notes.body.paymentConfirmed'), vars: { id: m[1] } };
      m = text.match(/^Payment for order #(\d+) was rejected\.$/);
      return m ? { key: dictKey('notes.body.paymentRejected'), vars: { id: m[1] } } : null;
    case 'offer':
      m = text.match(/^Offer #(\d+) was (\w+)\.$/);
      if (m) {
        return {
          key: dictKey('notes.body.offerState'),
          vars: { id: m[1], state: statusLabel(lang, m[2]) },
        };
      }
      m = text.match(/^New offer #(\d+) on your listing "(.+)"\.$/);
      return m ? { key: dictKey('notes.body.newOffer'), vars: { id: m[1], product: m[2] } } : null;
    case 'order':
      m = text.match(/^New order #(\d+) for (.+)$/);
      return m ? { key: dictKey('notes.body.newOrder'), vars: { id: m[1], product: m[2] } } : null;
    default:
      return null;
  }
}

/**
 * A notification body in the interface language, falling back to the server text
 * whenever we cannot honestly translate the row.
 */
export function notifSentence(t: TranslateFn, lang: LangCode, n: NotifLike): string {
  const parts = notifParts(n, lang);
  if (!parts) return n.text;
  const composed = t(parts.key, parts.vars);
  return composed === parts.key ? n.text : composed;
}

/** The six stock types, in the order a buyer thinks about them. */
export const STOCK_TYPES = ['stock', 'surplus', 'overstock', 'liquidation', 'seconds', 'container'] as const;

/**
 * The surplus-first filter, rendered identically in all three dashboards. The
 * owner's constraint is that a change lands for buyer, supplier and admin at
 * once, so this lives here and nowhere else.
 */
export function StockTypeFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useI18n();
  return (
    <div className="chipbar">
      <button className={`ct ${value ? '' : 'on'}`} onClick={() => onChange('')}>{t('type.all')}</button>
      {STOCK_TYPES.map((ty) => (
        <button key={ty} className={`ct ${value === ty ? 'on' : ''}`} onClick={() => onChange(ty)}>
          {t(`type.${ty}` as DictKey)}
        </button>
      ))}
    </div>
  );
}

/**
 * Stock-type badge. The dictionary supplies the phrase; an unknown value falls
 * back to the raw API string, and the CSS class simply has no colour for it —
 * never a blank chip.
 */
export function StockTypeBadge({ type }: { type: string }) {
  const { t } = useI18n();
  return <span className={`tbadge t-${type}`}>{t(`type.${type}` as DictKey)}</span>;
}

/**
 * A category tile: owned cover art, live listing count, whole tile is a link.
 * `count` is whatever the API returned — when the API has no figure the count
 * line is omitted rather than printing a zero we did not measure.
 */
export function CategoryTile({ category, count }: { category: string; count?: number }) {
  const { t } = useI18n();
  const cover = coverFor(category);
  return (
    <Link href={`/explore?category=${encodeURIComponent(category)}`} className="cattile">
      <div className="cmedia">
        {cover?.image
          ? <img src={cover.image} alt="" loading="lazy" />
          : (
            <div className="ph-empty">
              <span className="ph-glyph"><CategoryGlyph category={category} size={30} /></span>
              <span className="ph-cat">{category}</span>
            </div>
          )}
      </div>
      <div className="cbd">
        <b>{category}</b>
        <span>{cover?.blurb ?? t('categories.stockHere')}</span>
        {typeof count === 'number' && (
          <span>{t('categories.listingCount', { n: count.toLocaleString() })}</span>
        )}
      </div>
    </Link>
  );
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

/**
 * Abstract line-art glyph for a category, used only where a listing has no
 * photograph — Medical Supplies, Safety & PPE and Hardware & Fasteners have no
 * owned photo that genuinely depicts them. Drawing something that looks like the
 * actual goods would be worse than a neutral mark, so these are deliberately
 * generic shapes, not product illustrations.
 */
function CategoryGlyph({ category, size = 26 }: { category: string; size?: number }) {
  const p = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (category) {
    case 'Medical Supplies':
      return <svg {...p}><path d="M12 5v14M5 12h14" /></svg>;
    case 'Safety & PPE':
      return <svg {...p}><path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z" /></svg>;
    case 'Hardware & Fasteners':
      return <svg {...p}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></svg>;
    case 'Mining & Ore':
      return <svg {...p}><path d="M3 20h18M6 20l3-7h6l3 7M9 13l3-6 3 6" /></svg>;
    case 'Agriculture':
      return <svg {...p}><path d="M12 21V9M12 9c0-3 2-5 5-5 0 3-2 5-5 5zM12 13c0-3-2-5-5-5 0 3 2 5 5 5z" /></svg>;
    case 'Food Processing':
      return <svg {...p}><path d="M6 3v8a3 3 0 006 0V3M9 11v10M18 3c-2 0-3 2-3 5s1 4 3 4v9" /></svg>;
    case 'Paper & Pulp':
      return <svg {...p}><path d="M6 3h9l4 4v14H6zM15 3v4h4" /></svg>;
    case 'Rubber':
      return <svg {...p}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></svg>;
    default:
      return <svg {...p}><path d="M4 8l8-4 8 4v8l-8 4-8-4z" /><path d="M4 8l8 4 8-4M12 12v8" /></svg>;
  }
}

/**
 * One listing card, used by Explore, Feed, SupplierDetail, Saved and the admin
 * previews. Everything a buyer might press is a real link or a real action:
 *   • the media, the title and the price area all open the listing
 *   • the origin and the category open the catalogue filtered to that value
 *   • Save is always rendered — signed out it opens the auth gate instead of
 *     doing nothing (it previously appeared only when a caller passed `onSave`,
 *     so the public browse view had no save affordance at all)
 */
export function ProductCard({ p, onSave }: { p: Product; onSave?: (p: Product) => void }) {
  const { t } = useI18n();
  const [saved, setSaved] = useState(false);
  const save = () => {
    if (onSave) { onSave(p); return; }
    if (!getToken()) { requireAuthGate(); return; }
    setSaved((s) => !s);
  };
  return (
    <div className="lcard">
      <Link href={`/products/${p.id}`} className="media" aria-label={p.name}>
        {p.imageKey
          ? <img src={p.imageKey} alt={p.name} loading="lazy" />
          : (
            <div className="ph-empty">
              <span className="ph-glyph"><CategoryGlyph category={p.category} /></span>
              <span className="ph-cat">{p.category}</span>
              <span className="ph-note">{t('cards.noPhoto')}</span>
            </div>
          )}
        {/* The tick claims a verification, so it may only appear where one can be
            stood behind. `products.verified` alone is not that: the seeder sets it
            on demo rows whose supplier never reached the level-2 bar the product
            page enforces (ProductDetail.tsx, SupplierPanel). A demo row therefore
            shows its provenance tag instead of a verification it cannot prove; a
            real row keeps the tick. If the API ever puts the supplier's level on
            list rows, derive this from the same level-2 rule as the detail page. */}
        {p.verified && p.dataSource !== 'demo' && <span className="vtag"><Verified /></span>}
        {p.dataSource === 'demo' && <span className="ptag"><DemoTag /></span>}
        {p.listingType && p.listingType !== 'stock' && (
          <span className="atag"><StockTypeBadge type={p.listingType} /></span>
        )}
      </Link>
      <div className="bd">
        <h3><Link href={`/products/${p.id}`}>{p.name}</Link></h3>
        <div className="meta">
          <Link href={`/explore?country=${encodeURIComponent(p.originCountry)}`}><b>{p.originCountry}</b></Link>
        </div>
        <div className="meta">
          <Link href={`/explore?category=${encodeURIComponent(p.category)}`}><b>{p.category}</b></Link>
        </div>
        <div className="meta">{t('cards.moq')} {p.moq.toLocaleString()} {p.unit}</div>
        <div className="between" style={{ marginTop: 'auto', paddingTop: 5 }}>
          <Link href={`/products/${p.id}`}><Price p={p} /></Link>
          <button
            className={`btn btn-sm ${saved ? 'btn-gold' : 'btn-grey'}`}
            onClick={save}
            aria-label={t('cards.saveLot')}
            title={t('cards.saveLot')}
          >
            {saved ? '★' : '🔖'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * One supplier card for the public directory.
 *
 * Provenance rules this card exists to honour:
 *  • a `demo` row ALWAYS carries the Demo tag, whatever its verification level —
 *    the tag and the Verified badge may appear together, because a seeded row can
 *    also carry a seeded level. Showing Verified alone made seed rows
 *    indistinguishable from real, attested suppliers;
 *  • the numeric trust line renders only for a row the platform actually
 *    measured: not a demo row, and a value that is genuinely present. A row with
 *    no recorded measure shows an em dash rather than a zero that reads as a
 *    real score, and a demo row shows no numeric trust claim at all.
 * Genuine platform rows (dataSource 'platform') render exactly as they always
 * have — stars and inspection count as soon as those figures exist.
 */
export function SupplierCard({ s }: { s: Supplier }) {
  const { t } = useI18n();
  const isDemo = s.dataSource === 'demo';
  const rated = !isDemo && s.rating > 0;
  const inspected = !isDemo && s.inspectionsCount > 0;
  return (
    <Link href={`/suppliers/${s.id}`} className="card">
      <div className="bd row" style={{ alignItems: 'flex-start', gap: 10 }}>
        <span className="av" style={{ width: 34, height: 34, fontSize: 13 }}>
          {s.companyName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="between">
            <b style={{ fontSize: 13 }}>{s.companyName}</b>
            <span className="row" style={{ gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {s.verifiedLevel >= 2 && <Verified />}
              {isDemo && <DemoTag />}
            </span>
          </div>
          <div className="muted" style={{ fontSize: 11.5 }}>
            {s.country}{s.city ? ` · ${s.city}` : ''} · {s.productCount} {t('listings.col.lot')}
          </div>
          {!isDemo && (
            <div className="row" style={{ marginTop: 5, gap: 8 }}>
              {rated && (
                <>
                  <Stars rating={s.rating} />
                  <span className="muted" style={{ fontSize: 11 }}>{s.rating.toFixed(1)}</span>
                </>
              )}
              {inspected && (
                <span className="muted" style={{ fontSize: 11 }}>{s.inspectionsCount} {t('cards.inspections')}</span>
              )}
              {!rated && !inspected && (
                <span className="muted" style={{ fontSize: 11 }} title={t('supplierDetail.notRated')}>—</span>
              )}
            </div>
          )}
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
          <span className="row" style={{ gap: 5 }}>
            {/* A seeded request must never read as real demand. */}
            {r.dataSource === 'demo' && <DemoTag />}
            <StatusChip status={r.status} />
          </span>
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
