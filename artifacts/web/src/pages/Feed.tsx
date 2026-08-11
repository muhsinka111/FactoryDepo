import { useState } from 'react';
import { Link } from 'wouter';
import { useProducts, useMe } from '@workspace/api-client-react';
import { ProductArt, productKind, Verified, Spinner, requireAuthGate } from '../components';

/**
 * Mobil feed (Tasarım 3 — "My Feed"): navy üst bar + kart feed + alt nav.
 * Feed/Explore/Sell/Messages/Profile sekmeleri tek sayfada, gerçek DB verisi.
 */

const BADGE_HINT: Record<string, string> = {
  Machinery: 'Ready Stock',
  Electronics: 'New Arrival',
  Textiles: 'Overstock',
  Chemicals: 'Container Lot',
  Steel: 'Mill Surplus',
};

function FeedCard({ p }: { p: { id: number; name: string; category: string; price: number; currency: string; unit: string; moq: number; originCountry: string; supplierName: string; verified: boolean; imageKey: string | null } }) {
  const badge = BADGE_HINT[p.category] ?? 'Surplus';
  const badgeColor = p.category === 'Textiles' ? 'var(--green)' : p.category === 'Electronics' ? 'var(--accent)' : '#d97706';
  return (
    <Link href={`/products/${p.id}`} className="feed-card card" style={{ display: 'block', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px' }}>
        <span className="avatar" style={{ width: 32, height: 32, fontSize: 12 }}>{p.supplierName.split(' ').map((w) => w[0]).join('').slice(0, 2)}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.supplierName}</div>
          <div style={{ fontSize: 11.5, color: 'var(--faint)' }}>{p.originCountry} · {p.verified && <Verified />}</div>
        </div>
        <span style={{ fontSize: 11.5, color: 'var(--faint)' }}>now</span>
      </div>
      <div style={{ position: 'relative', height: 190, background: 'linear-gradient(150deg,var(--surface-2),var(--bg))', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
        {p.imageKey ? <img src={p.imageKey} alt={p.name} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" /> : <div style={{ transform: 'scale(1.5)' }}><ProductArt kind={productKind(p.name)} /></div>}
        <span style={{ position: 'absolute', top: 10, left: 10, background: badgeColor, color: '#fff', fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', padding: '4px 10px', borderRadius: 999 }}>{badge}</span>
      </div>
      <div style={{ padding: '14px 16px 16px' }}>
        <div style={{ fontWeight: 800, fontSize: 17 }}>{p.name.length > 60 ? p.name.slice(0, 57) + '…' : p.name}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, margin: '6px 0 12px' }}>
          <b style={{ fontSize: 20 }}>{p.currency === 'USD' ? '$' : p.currency} {p.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}</b>
          <span style={{ fontSize: 12, color: 'var(--faint)' }}>/ {p.unit} · MOQ {p.moq.toLocaleString()}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline btn-sm" style={{ flex: 1 }} onClick={(e) => { e.preventDefault(); requireAuthGate(); }}>Make Offer</button>
          <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={(e) => { e.preventDefault(); window.location.href = `/products/${p.id}`; }}>Buy Now</button>
          <button className="btn btn-outline btn-sm" style={{ width: 40, padding: 0 }} onClick={(e) => e.preventDefault()} aria-label="Favorite">♥</button>
        </div>
      </div>
    </Link>
  );
}

function ExploreTab() {
  const cats = ['Machinery', 'Steel', 'Electronics', 'Textiles', 'Chemicals', 'Packaging', 'Metals & Minerals', 'Industrial Equipment'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 16px 90px' }}>
      <h2 style={{ fontSize: 22, margin: '6px 0 4px' }}>Explore</h2>
      <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>Browse by category — surplus, overstock & ready stock from verified factories.</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {cats.map((c) => (
          <Link key={c} href={`/products?category=${encodeURIComponent(c)}`} className="card" style={{ padding: '16px 14px' }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{c}</div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--faint)', marginTop: 4 }}>Surplus lots →</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function SellTab() {
  return (
    <div style={{ padding: '20px 16px 90px', textAlign: 'center' }}>
      <div style={{ fontSize: 40, margin: '30px 0 12px' }}>🏭</div>
      <h2 style={{ fontSize: 22 }}>Sell your surplus stock</h2>
      <p className="muted" style={{ fontSize: 13.5, maxWidth: 320, margin: '10px auto 20px' }}>
        Snap a photo, add details, post it. Buyers make offers or buy instantly — you get paid.
      </p>
      <Link href="/sign-up" className="btn btn-primary btn-lg" style={{ width: '100%', maxWidth: 320 }}>Post Stock Now</Link>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 18, flexWrap: 'wrap' }}>
        {['No listing fees', 'Global exposure', 'Instant offers'].map((t) => <span key={t} className="tag">{t}</span>)}
      </div>
    </div>
  );
}

function MessagesTab() {
  return (
    <div style={{ padding: '20px 16px 90px', textAlign: 'center' }}>
      <div style={{ fontSize: 40, margin: '30px 0 12px' }}>💬</div>
      <h2 style={{ fontSize: 22 }}>Messages</h2>
      <p className="muted" style={{ fontSize: 13.5, maxWidth: 320, margin: '10px auto 20px' }}>
        Negotiations with buyers & suppliers will appear here. Messages open after your first offer or RFQ.
      </p>
      <Link href="/products" className="btn btn-outline" style={{ width: '100%', maxWidth: 320 }}>Start Browsing</Link>
    </div>
  );
}

function ProfileTab() {
  const { data: me, isLoading } = useMe();
  return (
    <div style={{ padding: '20px 16px 90px' }}>
      <h2 style={{ fontSize: 22, margin: '6px 0 16px' }}>Profile</h2>
      {isLoading ? <Spinner /> : me ? (
        <div className="card" style={{ padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span className="avatar" style={{ width: 52, height: 52 }}>{me.name.split(' ').map((w) => w[0]).join('').slice(0, 2)}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{me.name}</div>
              <div style={{ fontSize: 12.5, color: 'var(--faint)' }}>{me.role} · {me.country ?? '—'}</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
            <Link href="/dashboard" className="btn btn-outline btn-sm">Dashboard</Link>
            <Link href="/rfq" className="btn btn-outline btn-sm">My RFQs</Link>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 26, textAlign: 'center' }}>
          <p className="muted" style={{ marginBottom: 16 }}>Sign in to see your profile, orders and offers.</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <Link href="/sign-in" className="btn btn-outline" style={{ flex: 1 }}>Sign In</Link>
            <Link href="/sign-up" className="btn btn-primary" style={{ flex: 1 }}>Join Free</Link>
          </div>
        </div>
      )}
    </div>
  );
}

type Tab = 'feed' | 'explore' | 'sell' | 'messages' | 'profile';

export default function Feed() {
  const [tab, setTab] = useState<Tab>('feed');
  const products = useProducts({ limit: 12, hasImage: 1 });

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', maxWidth: 480, margin: '0 auto', position: 'relative', borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)' }}>
      {/* navy üst bar */}
      <div style={{ background: '#0F1B2D', color: '#fff', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, position: 'sticky', top: 0, zIndex: 10 }}>
        <span style={{ fontWeight: 800, fontSize: 17, flex: 1 }}>factorydepo<span style={{ color: '#FFB800' }}>.</span></span>
        <Link href="/products" style={{ color: 'rgba(255,255,255,.85)', fontSize: 13 }} aria-label="Search">🔍</Link>
        <Link href="/sign-in" style={{ color: 'rgba(255,255,255,.85)', fontSize: 13 }} aria-label="Notifications">🔔</Link>
      </div>

      {tab === 'feed' && (
        <div style={{ padding: '14px 16px 90px' }}>
          <h2 style={{ fontSize: 22, margin: '4px 0 2px' }}>My Feed</h2>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>Fresh surplus from verified factories.</p>
          {products.isLoading ? <Spinner /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {products.data?.items.map((p) => <FeedCard key={p.id} p={p} />)}
            </div>
          )}
        </div>
      )}
      {tab === 'explore' && <ExploreTab />}
      {tab === 'sell' && <SellTab />}
      {tab === 'messages' && <MessagesTab />}
      {tab === 'profile' && <ProfileTab />}

      {/* alt nav */}
      <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 480, background: '#fff', borderTop: '1px solid var(--border)', display: 'flex', zIndex: 20, boxShadow: '0 -6px 20px rgba(15,27,45,.08)' }}>
        {([
          ['feed', '🏠', 'Feed'],
          ['explore', '🧭', 'Explore'],
          ['sell', '➕', 'Sell'],
          ['messages', '💬', 'Messages'],
          ['profile', '👤', 'Profile'],
        ] as [Tab, string, string][]).map(([key, icon, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{ flex: 1, padding: '10px 0 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, background: 'transparent', color: tab === key ? '#2563EB' : 'var(--faint)', fontWeight: tab === key ? 700 : 500, fontSize: 10.5 }}>
            <span style={{ fontSize: 18, lineHeight: 1 }}>{icon}</span>{label}
          </button>
        ))}
      </div>
    </div>
  );
}
