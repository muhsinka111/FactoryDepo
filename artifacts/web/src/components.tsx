import { Link, useLocation } from 'wouter';
import { useEffect, useState, type ReactNode } from 'react';
import { useMe, useLogout, getToken } from '@workspace/api-client-react';
import type { Product, Supplier, Rfq } from '@workspace/api-zod';

/* ---------- brand ---------- */
export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size }}>
      <svg viewBox="0 0 24 24" fill="none" width={size * 0.53} height={size * 0.53}>
        <path d="M4 6h5.5c2.2 0 3.6 1.1 3.6 2.9 0 1.3-.8 2.3-2 2.6 1.5.4 2.5 1.4 2.5 2.9 0 1.9-1.5 3.1-3.9 3.1H4V6zm4.2 4.7h1.1c.9 0 1.4-.4 1.4-1.2s-.5-1.2-1.4-1.2H8.2v2.4zm0 6h1.3c1 0 1.5-.5 1.5-1.3 0-.8-.5-1.3-1.5-1.3H8.2v2.6zM17.2 6h1.3v10.3h2V18h-3.3V6z" fill="currentColor" />
      </svg>
    </span>
  );
}

/* ---------- nav ---------- */
export function Nav() {
  const [loc] = useLocation();
  const { data: user } = useMe();
  const logout = useLogout();
  const loggedIn = !!getToken();

  const links: [string, string][] = [
    ['/products', 'Products'],
    ['/suppliers', 'Suppliers'],
    ['/rfq', 'RFQ Market'],
    ['/dashboard', 'Dashboard'],
  ];

  return (
    <>
      <header className="nav">
        <div className="nav-inner">
          <Link href="/" className="brand">
            <BrandMark />
            <span>
              <span className="brand-name">FACTORYDEPO</span>
              <span className="brand-tag">Global Industrial Marketplace</span>
            </span>
          </Link>
          <ul className="nav-links">
            {links.map(([href, label]) => (
              <li key={href}>
                <Link href={href} className={loc.startsWith(href) ? 'active' : ''}>{label}</Link>
              </li>
            ))}
          </ul>
          <div className="nav-actions">
            {loggedIn && user ? (
              <div className="nav-user">
                <span className="u">
                  <b>{user.name}</b>
                  <span>{user.role}</span>
                </span>
                <button className="btn btn-outline btn-sm" onClick={logout} title="Sign out">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" /></svg>
                </button>
              </div>
            ) : (
              <>
                <Link href="/sign-in" className="btn btn-outline btn-sm">Login</Link>
                <Link href="/sign-up" className="btn btn-primary btn-sm">Join Free</Link>
              </>
            )}
            <button className="burger" id="burger" onClick={() => document.getElementById('mobileMenu')?.classList.toggle('open')} aria-label="Menu">
              <span /><span /><span />
            </button>
          </div>
        </div>
      </header>
      <div className="mobile-menu" id="mobileMenu">
        {links.map(([href, label]) => (
          <Link key={href} href={href} onClick={() => document.getElementById('mobileMenu')?.classList.remove('open')}>{label}</Link>
        ))}
        {loggedIn ? (
          <button className="btn btn-outline" onClick={() => { logout(); }}>Sign Out</button>
        ) : (
          <>
            <Link href="/sign-in" className="btn btn-outline" onClick={() => document.getElementById('mobileMenu')?.classList.remove('open')}>Login</Link>
            <Link href="/sign-up" className="btn btn-primary" onClick={() => document.getElementById('mobileMenu')?.classList.remove('open')}>Join Free</Link>
          </>
        )}
      </div>
    </>
  );
}

/* ---------- footer ---------- */
export function Footer() {
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="foot-grid">
          <div className="foot-brand">
            <Link href="/" className="brand"><BrandMark /><span className="brand-name">FACTORYDEPO</span></Link>
            <p>The operating system for global industrial trade. Verified supply, inspections, laboratories, logistics and intelligence — in one trusted ecosystem.</p>
          </div>
          <div className="foot-col">
            <h4>Marketplace</h4>
            <ul>
              <li><Link href="/products">Products</Link></li>
              <li><Link href="/suppliers">Suppliers</Link></li>
              <li><Link href="/rfq">RFQ Market</Link></li>
              <li><a href="/landing">Marketing Page</a></li>
            </ul>
          </div>
          <div className="foot-col">
            <h4>Services</h4>
            <ul>
              <li><span className="muted">Inspection</span></li>
              <li><span className="muted">Laboratories</span></li>
              <li><span className="muted">Logistics</span></li>
              <li><span className="muted">Business Consulting</span></li>
            </ul>
          </div>
          <div className="foot-col">
            <h4>Company</h4>
            <ul>
              <li><span className="muted">About Us</span></li>
              <li><span className="muted">Contact</span></li>
              <li><Link href="/sign-in">Login</Link></li>
              <li><Link href="/sign-up">Join Free</Link></li>
            </ul>
          </div>
        </div>
        <div className="foot-bottom">
          <span>© 2024 FactoryDepo.com All rights reserved.</span>
          <span>Türkiye · China · Germany · USA · Vietnam · India</span>
        </div>
      </div>
    </footer>
  );
}

/* ---------- small pieces ---------- */
export function Spinner() { return <div className="spinner" />; }

export function Verified({ label = 'On-site Verified' }: { label?: string }) {
  return (
    <span className="verified">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>
      {label}
    </span>
  );
}

export function Stars({ rating }: { rating: number }) {
  return (
    <span className="stars" title={`${rating} / 5`}>
      {'★'.repeat(Math.round(rating))}
      {'☆'.repeat(5 - Math.round(rating))}
      <span className="mono" style={{ color: 'var(--muted)', fontSize: 11 }}> {rating.toFixed(1)}</span>
    </span>
  );
}

export function TrustRing({ score, size = 54 }: { score: number; size?: number }) {
  const r = 25;
  const circ = 2 * Math.PI * r;
  const off = circ * (1 - Math.min(score, 100) / 100);
  return (
    <span className="trust-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 56 56">
        <circle className="tb" cx="28" cy="28" r={r} />
        <circle className="tv" cx="28" cy="28" r={r} strokeDasharray={circ} strokeDashoffset={off} />
      </svg>
      <span className="val" style={{ fontSize: size * 0.24 }}>{Math.round(score)}</span>
    </span>
  );
}

export function StatusChip({ status }: { status: string }) {
  const map: Record<string, string> = {
    open: 'chip-green', quoted: 'chip-blue', closed: 'chip-gray',
    submitted: 'chip-blue', accepted: 'chip-green', rejected: 'chip-red',
    active: 'chip-green', scheduled: 'chip-amber', passed: 'chip-green', failed: 'chip-red',
  };
  return <span className={`chip ${map[status] ?? 'chip-gray'}`}>{status}</span>;
}

export function ProductArt({ kind, color }: { kind: string; color?: string }) {
  const c = color ?? '#8FA3BF';
  switch (kind) {
    case 'copper':
      return (
        <svg viewBox="0 0 84 84" fill="none">
          <rect x="14" y="16" width="56" height="10" rx="2" fill="#C87B4A" />
          <rect x="14" y="30" width="56" height="10" rx="2" fill="#E8A15C" />
          <rect x="14" y="44" width="56" height="10" rx="2" fill="#D58B52" />
          <rect x="14" y="58" width="56" height="10" rx="2" fill="#C87B4A" />
        </svg>
      );
    case 'coil':
      return (
        <svg viewBox="0 0 84 84" fill="none">
          <circle cx="42" cy="42" r="26" fill="none" stroke="#9FB4CC" strokeWidth="7" />
          <circle cx="42" cy="42" r="17" fill="none" stroke="#C9D8EA" strokeWidth="7" />
          <circle cx="42" cy="42" r="8" fill="none" stroke="#7E93AD" strokeWidth="6" />
        </svg>
      );
    case 'bag':
      return (
        <svg viewBox="0 0 84 84" fill="none">
          <rect x="12" y="38" width="60" height="30" rx="4" fill="#E8EDF4" />
          <path d="M12 44h60M12 52h60M12 60h60" stroke="#B9C8DA" strokeWidth="1.4" />
          <path d="M30 38V28h24v10" fill="none" stroke={c} strokeWidth="4" strokeLinecap="round" />
          <rect x="33" y="30" width="18" height="7" rx="2" fill="#F6F9FC" />
        </svg>
      );
    case 'pump':
      return (
        <svg viewBox="0 0 84 84" fill="none">
          <rect x="16" y="22" width="34" height="26" rx="5" fill="#2E5FA3" />
          <circle cx="58" cy="35" r="8" fill="none" stroke="#8FB4E8" strokeWidth="4" />
          <path d="M24 48v12M42 48v12" stroke="#7E93AD" strokeWidth="5" strokeLinecap="round" />
          <rect x="20" y="58" width="30" height="8" rx="3" fill="#5A6B85" />
        </svg>
      );
    case 'solar':
      return (
        <svg viewBox="0 0 84 84" fill="none">
          <rect x="18" y="26" width="48" height="36" rx="4" fill="#3B82F6" />
          <rect x="24" y="32" width="36" height="24" rx="2" fill="#1D4ED8" />
          <path d="M24 38h36M24 44h36M24 50h36" stroke="#60A5FA" strokeWidth="1.2" />
          <path d="M40 26v-6M32 20h16" stroke={c} strokeWidth="3.4" strokeLinecap="round" />
        </svg>
      );
    case 'ingot':
      return (
        <svg viewBox="0 0 84 84" fill="none">
          <path d="M24 62L30 30h24l6 32H24z" fill="#C9D8EA" />
          <path d="M30 42h24M32 52h20" stroke="#8FA3BF" strokeWidth="2" />
          <path d="M36 30v-8h12v8" fill="none" stroke="#7E93AD" strokeWidth="4" strokeLinecap="round" />
        </svg>
      );
    case 'cnc':
      return (
        <svg viewBox="0 0 84 84" fill="none">
          <circle cx="42" cy="42" r="28" fill="none" stroke="#9FB4CC" strokeWidth="6" />
          <path d="M42 14v56M14 42h56" stroke="#B9C8DA" strokeWidth="1.4" strokeOpacity=".6" />
          <rect x="30" y="30" width="24" height="24" rx="4" fill="#E8EDF4" />
          <circle cx="42" cy="42" r="7" fill="none" stroke="#5A6B85" strokeWidth="4" />
        </svg>
      );
    case 'ore':
      return (
        <svg viewBox="0 0 84 84" fill="none">
          <circle cx="42" cy="42" r="26" fill="none" stroke="#C9D8EA" strokeWidth="8" />
          <circle cx="42" cy="42" r="16" fill="none" stroke="#E8EDF4" strokeWidth="8" />
          <circle cx="42" cy="42" r="7" fill="#F6F9FC" />
          <path d="M42 12v14M42 58v14M12 42h14M58 42h14" stroke={c} strokeWidth="3" strokeLinecap="round" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 84 84" fill="none">
          <rect x="20" y="26" width="44" height="34" rx="4" fill="#E8EDF4" stroke={c} strokeWidth="2" />
          <path d="M20 38h44M20 50h44" stroke="#B9C8DA" strokeWidth="1.4" />
        </svg>
      );
  }
}

export function productKind(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('copper') || n.includes('cathode')) return 'copper';
  if (n.includes('coil') || n.includes('steel')) return 'coil';
  if (n.includes('lithium') || n.includes('chemical') || n.includes('carbonate')) return 'bag';
  if (n.includes('pump')) return 'pump';
  if (n.includes('solar')) return 'solar';
  if (n.includes('aluminum') || n.includes('ingot') || n.includes('aluminium')) return 'ingot';
  if (n.includes('cnc') || n.includes('machine')) return 'cnc';
  if (n.includes('ore') || n.includes('antimony') || n.includes('mineral')) return 'ore';
  return 'box';
}

/* ---------- cards ---------- */
export function ProductCard({ p }: { p: Product }) {
  return (
    <Link href={`/products/${p.id}`} className="card pcard">
      <div className="pcard-art">
        {p.verified && <Verified />}
        {p.imageKey ? <img src={p.imageKey} alt={p.name} loading="lazy" /> : <div style={{ marginTop: p.verified ? 22 : 0 }}><ProductArt kind={productKind(p.name)} /></div>}
      </div>
      <div className="pcard-body">
        <h3>{p.name}</h3>
        <div className="pcard-specs">
          {p.spec.slice(0, 3).map((s) => <span key={s} className="tag">{s}</span>)}
          <span className="tag">MOQ {p.moq.toLocaleString()} {p.unit}</span>
        </div>
        <div className="pcard-foot">
          <span className="price">
            <b>{p.currency === 'USD' ? '$' : p.currency} {p.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}</b>
            <span>/ {p.unit} · {p.originCountry}</span>
          </span>
          <button className="btn btn-primary btn-sm" onClick={(e) => e.preventDefault()}>Request RFQ</button>
        </div>
      </div>
    </Link>
  );
}

export function SupplierCard({ s }: { s: Supplier }) {
  return (
    <Link href={`/suppliers/${s.id}`} className="card scard">
      <div className="scard-top">
        <span className="avatar">{s.companyName.split(' ').map((w) => w[0]).join('').slice(0, 2)}</span>
        <TrustRing score={s.trustScore} />
      </div>
      <h3>{s.companyName}</h3>
      <div className="scard-meta">
        <span>{s.country}{s.city ? ` · ${s.city}` : ''}</span>
        <Stars rating={s.rating} />
        {s.verifiedLevel >= 2 && <Verified />}
      </div>
      <div className="scard-tags">{s.tags.slice(0, 3).map((t) => <span key={t} className="tag">{t}</span>)}</div>
      <div className="scard-stats">
        <div className="sstat"><b>{s.rating.toFixed(1)}</b><span>RATING</span></div>
        <div className="sstat"><b>{s.inspectionsCount}</b><span>INSPECTIONS</span></div>
        <div className="sstat"><b>%{s.fulfillmentRate.toFixed(1)}</b><span>FULFILLMENT</span></div>
      </div>
    </Link>
  );
}

export function RfqCard({ r }: { r: Rfq }) {
  return (
    <Link href={`/rfq/${r.id}`} className="card rfqcard">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="eyebrow">{r.category}</span>
        <StatusChip status={r.status} />
      </div>
      <h3>{r.title}</h3>
      <div className="meta">
        {r.quantity.toLocaleString()} {r.unit}
        {r.targetCountry ? ` · ${r.targetCountry}` : ''} · {r.quoteCount} quotes
      </div>
      <div className="foot">
        <span className="mono" style={{ fontSize: 12, color: 'var(--faint)' }}>{new Date(r.createdAt).toLocaleDateString()}</span>
        <span className="btn btn-outline btn-sm">View &amp; Quote</span>
      </div>
    </Link>
  );
}

export function Page({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return <main className="page"><div className={wide ? 'wrap' : 'wrap'}>{children}</div></main>;
}

/* ---------- auth gate modal ----------
 * Fired with window.dispatchEvent(new CustomEvent('fd:require-auth')) when a
 * logged-out user tries to contact a supplier, post an RFQ, or reply to one.
 * Products/suppliers stay fully viewable without an account. */
export function requireAuthGate() {
  window.dispatchEvent(new CustomEvent('fd:require-auth'));
}

export function AuthGateModal() {
  const [open, setOpen] = useState(false);
  const { data: user } = useMe();

  useEffect(() => {
    const handler = () => {
      if (!getToken()) setOpen(true);
    };
    window.addEventListener('fd:require-auth', handler);
    return () => window.removeEventListener('fd:require-auth', handler);
  }, []);

  useEffect(() => {
    if (user) setOpen(false);
  }, [user]);

  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={() => setOpen(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <button className="modal-close" onClick={() => setOpen(false)} aria-label="Close">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
          <span className="eyebrow" style={{ color: '#5CA1FF' }}>Member Access</span>
          <h3>Create a free account to continue</h3>
          <p>Contacting suppliers, posting RFQs and replying with quotations are member actions. Browsing the marketplace stays free and open.</p>
        </div>
        <div className="modal-body">
          <Link href="/sign-up" className="btn btn-primary btn-lg">Create Free Account</Link>
          <Link href="/sign-in" className="btn btn-outline btn-lg">I already have an account</Link>
          <p className="modal-link">or <a href="#plans" onClick={(e) => e.preventDefault()}>compare membership plans</a></p>
          <div className="plans-row">
            <div className="plan-mini">
              <b>Free</b>
              <div className="p">$0</div>
              <span>Browse &amp; view</span>
            </div>
            <div className="plan-mini hot">
              <b>Professional</b>
              <div className="p">$49<span style={{ fontSize: 10 }}>/mo</span></div>
              <span>Contact &amp; quote</span>
            </div>
            <div className="plan-mini">
              <b>Enterprise</b>
              <div className="p">Custom</div>
              <span>Dedicated team</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SectionHead({ eyebrow, title, sub }: { eyebrow?: string; title: ReactNode; sub?: ReactNode }) {
  return (
    <div className="section-head">
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <h1>{title}</h1>
      {sub && <p className="muted">{sub}</p>}
    </div>
  );
}
