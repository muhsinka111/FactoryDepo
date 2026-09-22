/**
 * dash.tsx — the shared dashboard kit (enterprise pass).
 *
 * These pieces give the buyer / supplier / admin dashboards one consistent
 * shape: a page header, a strip of honest KPIs, a toolbar, dense tables with a
 * pager, and empty states that offer a way forward.
 *
 * Honesty rule (AGENTS.md): a KPI never invents a number. `metric()` prints an
 * em dash for null/undefined, so a tile whose value the API does not supply
 * reads "—" instead of a plausible-looking 0.
 *
 * This module holds no data fetching. Pages own their queries and hand values in.
 */
import type { ReactNode } from 'react';
import { useI18n } from './i18n';

/** Render a number the API actually returned, or an em dash when it did not. */
export function metric(value: number | null | undefined, format?: (n: number) => string): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return format ? format(value) : value.toLocaleString();
}

/* ------------------------------- page header ---------------------------- */

export interface PageHeaderProps {
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  /** Small breadcrumb-ish line above the title (already formatted by the caller). */
  crumb?: ReactNode;
}

/**
 * The one header every dashboard page opens with: title, one-line honest
 * subtitle, primary actions on the right.
 */
export function PageHeader({ title, sub, actions, crumb }: PageHeaderProps) {
  return (
    <div className="between" style={{ marginBottom: 12, alignItems: 'flex-start' }}>
      <div style={{ minWidth: 0 }}>
        {crumb ? <div className="crumb">{crumb}</div> : null}
        <h1>{title}</h1>
        {sub ? <p className="sub" style={{ margin: 0 }}>{sub}</p> : null}
      </div>
      {actions ? <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>{actions}</div> : null}
    </div>
  );
}

/* ---------------------------------- KPI --------------------------------- */

export interface KpiProps {
  /** Small glyph shown in the tile's square (emoji or a one-letter mark). */
  ic?: ReactNode;
  label: ReactNode;
  /** The value. Numbers arrive already formatted by the caller. */
  value: ReactNode;
  /** Optional second line — only real API deltas, never a guess. */
  hint?: ReactNode;
  tone?: 'up' | 'down' | 'flat';
  href?: string;
  onClick?: () => void;
  selected?: boolean;
}

/** A single KPI tile. Clickable when href/onClick is given. */
export function Kpi({ ic, label, value, hint, tone, href, onClick, selected }: KpiProps) {
  const cls = ['kpi', onClick || href ? 'on' : '', selected ? 'sel' : ''].filter(Boolean).join(' ');
  const body = (
    <>
      {ic ? <div className="ic">{ic}</div> : null}
      <div style={{ minWidth: 0 }}>
        <div className="v">{value}</div>
        <div className="l">{label}</div>
        {hint ? <div className={`d ${tone ?? 'flat'}`}>{hint}</div> : null}
      </div>
    </>
  );
  if (href) {
    return (
      <a className={cls} href={href}>
        {body}
      </a>
    );
  }
  if (onClick) {
    return (
      <button className={cls} onClick={onClick} type="button">
        {body}
      </button>
    );
  }
  return <div className={cls}>{body}</div>;
}

/** Grid wrapper for a row of Kpi tiles. */
export function KpiRow({ children }: { children: ReactNode }) {
  return <div className="kpirow">{children}</div>;
}

/* -------------------------------- toolbar ------------------------------ */

/** A filter/search/action bar sitting directly above a table or list. */
export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="toolbar">{children}</div>;
}

/** Compact labelled select used inside a Toolbar. */
export function ToolSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: ReactNode;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="row" style={{ gap: 6, fontSize: 11.5, color: 'var(--mute)' }}>
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/* --------------------------------- pager ------------------------------- */

export interface PagerProps {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  /** Extra content on the left (e.g. an export button). */
  left?: ReactNode;
}

/** Client- or server-side pagination control with an honest range label. */
export function Pager({ page, pageSize, total, onPage, left }: PagerProps) {
  const { t } = useI18n();
  const pages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="pager">
      {left}
      {total > 0 ? (
        <span className="tnum">{t('dash.showing', { from, to, total })}</span>
      ) : null}
      <span className="grow" />
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        ‹ {t('dash.prev')}
      </button>
      <span className="tnum">
        {page} / {pages}
      </span>
      <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        {t('dash.next')} ›
      </button>
    </div>
  );
}

/* ------------------------------ empty state ---------------------------- */

export interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
}

/** Empty state with a short explanation and (when possible) a next step. */
export function EmptyState({ icon, title, body, action }: EmptyStateProps) {
  return (
    <div className="emptystate">
      {icon ? <div className="ic">{icon}</div> : null}
      <b>{title}</b>
      {body ? <div className="sb">{body}</div> : null}
      {action}
    </div>
  );
}

/* --------------------------------- tabs -------------------------------- */

export interface TabDef {
  key: string;
  label: ReactNode;
  count?: number;
}

/** Underlined tab strip (product page + dashboards share it). */
export function TabStrip({
  tabs,
  active,
  onChange,
}: {
  tabs: TabDef[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tb) => (
        <button
          key={tb.key}
          type="button"
          role="tab"
          aria-selected={tb.key === active}
          className={`tab${tb.key === active ? ' on' : ''}`}
          onClick={() => onChange(tb.key)}
        >
          {tb.label}
          {typeof tb.count === 'number' ? <span className="n">{tb.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------ section card --------------------------- */

export interface SectionCardProps {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  /** Set false when the child renders its own padding (e.g. a table). */
  padded?: boolean;
  className?: string;
}

/** The standard titled card used across the dashboards. */
export function SectionCard({ title, action, children, padded = true, className }: SectionCardProps) {
  return (
    <div className={`card${className ? ` ${className}` : ''}`}>
      {title ? (
        <div className="hd">
          <h2>{title}</h2>
          {action ? <span className="link">{action}</span> : null}
        </div>
      ) : null}
      {padded ? <div className="bd">{children}</div> : children}
    </div>
  );
}

/** Border/rounding wrapper for a bare <table>. */
export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="tblwrap">{children}</div>;
}

/* ------------------------------ attention ------------------------------ */

export interface AttnItem {
  icon?: ReactNode;
  label: ReactNode;
  count: number;
  href?: string;
  onClick?: () => void;
  /** true renders the muted "nothing waiting" styling. */
  ok?: boolean;
}

/**
 * "Needs attention" list: each row is a real count from the API. When every
 * count is zero the list collapses to a single reassuring row.
 */
export function Attention({ items }: { items: AttnItem[] }) {
  const waiting = items.filter((i) => i.count > 0);
  if (waiting.length === 0) {
    return (
      <div className="attn">
        <div className="row" style={{ gap: 9, padding: '8px 10px', fontSize: 12.5 }}>
          <span className="pill p-green">✓</span>
          <AllClearNote />
        </div>
      </div>
    );
  }
  return (
    <div className="attn">
      {waiting.map((i, idx) => {
        const inner = (
          <>
            <span className="ic">{i.icon}</span>
            <span>{i.label}</span>
            <span className="n tnum">{i.count}</span>
          </>
        );
        return i.href ? (
          <a key={idx} href={i.href} className={i.ok ? 'ok' : undefined}>
            {inner}
          </a>
        ) : (
          <button key={idx} type="button" className={i.ok ? 'ok' : undefined} onClick={i.onClick}>
            {inner}
          </button>
        );
      })}
    </div>
  );
}

/** Tiny local component so the "nothing waiting" copy stays translatable. */
function AllClearNote() {
  const { t } = useI18n();
  return <span className="muted">{t('dash.allClear')}</span>;
}

/* ------------------------------- timeline ------------------------------ */

export interface TlItem {
  tone?: 'blue' | 'gold' | 'green' | 'red';
  text: ReactNode;
  meta?: ReactNode;
}

/** Compact activity feed. Items come from real endpoints, newest first. */
export function Timeline({ items, empty }: { items: TlItem[]; empty?: ReactNode }) {
  if (items.length === 0) return <>{empty ?? null}</>;
  return (
    <div className="tl">
      {items.map((it, idx) => (
        <div className="tl-item" key={idx}>
          <span className={`dot ${it.tone && it.tone !== 'blue' ? it.tone : ''}`} />
          <span className="bd">
            <span className="tx">{it.text}</span>
            {it.meta ? <span className="mt">{it.meta}</span> : null}
          </span>
        </div>
      ))}
    </div>
  );
}

/* -------------------------- horizontal bar chart ----------------------- */

export interface BarItem {
  label: ReactNode;
  value: number;
  tone?: 'navy' | 'gold';
  suffix?: string;
}

/**
 * Dependency-free horizontal bar chart. Widths are relative to the largest
 * value in the set, so a chart is only ever as wide as the real data.
 */
export function BarChart({ items }: { items: BarItem[] }) {
  const max = items.reduce((m, i) => Math.max(m, i.value), 0);
  if (items.length === 0 || max === 0) {
    return <div className="muted">—</div>;
  }
  return (
    <div className="barcard">
      {items.map((i, idx) => (
        <div className="brow" key={idx}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.label}</span>
          <span className="track">
            <span
              className={`fill${i.tone === 'gold' ? ' gold' : ''}`}
              style={{ width: `${Math.max(2, Math.round((i.value / max) * 100))}%` }}
            />
          </span>
          <span className="n">
            {i.value.toLocaleString()}
            {i.suffix ? ` ${i.suffix}` : ''}
          </span>
        </div>
      ))}
    </div>
  );
}
