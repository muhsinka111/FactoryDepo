import { useRoute, useLocation, Link } from 'wouter';
import { useSupplier, useProducts, useMe } from '@workspace/api-client-react';
import { View, Empty, ProductCard, Verified, DemoTag, Stars, requireAuthGate } from '../components';
import { useI18n } from '../i18n';

/*
 * The two notes on this page and their translations (they live in i18n.tsx as
 * supplierDetail.importedRecord / demoMetricsNote):
 *
 *   'supplierDetail.importedRecord'
 *     EN: Supplier record origin: imported from a third-party B2B directory
 *         record. The company details are as published there; the source
 *         directory and its store URL are not published on this page.
 *     TR: Tedarikçi kaydının kaynağı: üçüncü taraf bir B2B dizin kaydından içe
 *         aktarıldı. Şirket bilgileri o dizindeki haliyle verilmiştir; kaynak
 *         dizin ve mağaza adresi bu sayfada yayımlanmaz.
 *
 *   'supplierDetail.demoMetricsNote'
 *     EN: This is seed data. No rating, inspection or fulfilment figure exists
 *         for it, so those rows read “—”.
 *     TR: Bu bir örnek veri satırıdır. Ona ait puan, denetim veya teslim
 *         performansı kaydı yoktur; ilgili satırlar “—” gösterir.
 */
/* The origin note is `supplierDetail.importedRecord` and the seed-row note is
   `supplierDetail.demoMetricsNote`; both live in i18n.tsx (en + tr). */

/**
 * Imported records are detectable by the note the importer wrote into
 * `description` (“Imported from <directory> — … Store: https://…”). The note is
 * NOT shown to buyers: it names a competitor directory and hands out its
 * storefront URL, and it is not the company's own words. Such a description is
 * replaced by one neutral origin line — the real source is neither renamed nor
 * replaced with an invented one, it is simply not published.
 */
const IMPORT_NOTE = /^\s*imported\s+from\b/i;
const DIRECTORY_HOST = /(?:made-in-china|alibaba|1688|globalsources|indiamart|aliexpress|tradekey|dhgate)\.(?:com|cn|net|co\.uk|de|ru|fr|it|es)/i;
const DIRECTORY_URL = /https?:\/\/[^\s]*?(?:made-in-china|alibaba|1688|globalsources|indiamart|aliexpress|tradekey|dhgate)\.[a-z.]+[^\s]*/gi;
const DIRECTORY_HOST_ANY = /\b[a-z0-9-]*(?:made-in-china|alibaba|1688|globalsources|indiamart|aliexpress|tradekey|dhgate)\.[a-z.]+\b/gi;

/** True when this description is an importer's note rather than the company's own text. */
function isImportedRecord(description: string): boolean {
  return IMPORT_NOTE.test(description) || DIRECTORY_HOST.test(description);
}

/**
 * Belt-and-braces for a description we DO show: no directory URL or host ever
 * reaches a buyer, whatever the note that happens to carry it says.
 */
function scrubSource(text: string): string {
  return text
    .replace(DIRECTORY_URL, '')
    .replace(DIRECTORY_HOST_ANY, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([.,;])/g, '$1')
    .trim();
}

/** Metrics we can only show when the API actually computes them. */
function metric(value: number | null | undefined): string {
  return value === null || value === undefined || value <= 0 ? '—' : String(value);
}

function rate(value: number | null | undefined): string {
  return value === null || value === undefined || value <= 0 ? '—' : `${value.toFixed(1)}%`;
}

/**
 * Supplier profile — verification tier, the honest trading record, the
 * capability tags the supplier declared, and their live lots.
 *
 * Trust figures (rating, inspections, fulfilment, trust score) are rendered only
 * for a row that is not seed data AND whose value is genuinely present: a seeded
 * rating is not a measurement, and an absent one is an em dash rather than a 0.0
 * that would read as a real score. Genuine platform rows render exactly as
 * before.
 */
export default function SupplierDetail({ params }: { params?: { id?: string } }) {
  const { t, locale } = useI18n();
  const [matched, routeParams] = useRoute<{ id: string }>('/suppliers/:id');
  const id = Number(params?.id ?? (matched ? routeParams.id : NaN));
  const { data: s, isLoading, error } = useSupplier(Number.isFinite(id) ? id : undefined);
  const products = useProducts({ limit: 100 }, { enabled: !!s });
  const { data: me } = useMe();
  const [, navigate] = useLocation();

  if (isLoading) {
    return (
      <View title={t('common.loading')} sub={t('product.fetching', { what: t('supplierDetail.loadingThis') })}>
        <div className="card">
          <div className="empty">{t('product.fetching', { what: t('supplierDetail.loadingThis') })}</div>
        </div>
      </View>
    );
  }

  if (error || !s) {
    return (
      <Empty title={t('supplierDetail.notFound')}>
        <Link href="/suppliers" className="btn btn-sm btn-grey" style={{ marginTop: 10 }}>{t('supplierDetail.backToDirectory')}</Link>
      </Empty>
    );
  }

  const mine = products.data?.items.filter((p) => p.supplierId === s.id) ?? [];
  const isDemo = s.dataSource === 'demo';
  const about = (s.description ?? '').trim();
  const imported = about !== '' && isImportedRecord(about);
  const rating = !isDemo && s.rating > 0 ? s.rating : 0;
  const inspections = isDemo ? 0 : s.inspectionsCount;
  const fulfilment = isDemo ? 0 : s.fulfillmentRate;
  const trust = isDemo ? 0 : s.trustScore;

  return (
    <View
      title={s.companyName}
      sub={
        <span>
          {s.country}{s.city ? ` · ${s.city}` : ''} · {t('supplierDetail.tradingSince', { year: s.since ?? '—' })} ·{' '}
          <Link href="/suppliers" style={{ fontSize: 12.5 }}>{t('supplierDetail.backShort')}</Link>
        </span>
      }
      actions={
        <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {s.verifiedLevel >= 2 && <Verified label={s.verifiedLevel >= 3 ? t('supplierDetail.verifiedL3') : undefined} />}
          {s.verifiedLevel === 1 && <span className="pill p-grey">{t('supplierDetail.registered')}</span>}
          {s.dataSource === 'demo' && <DemoTag />}
        </span>
      }
    >
      <div className="stats grid">
        <div className="card stat">
          <div>
            <div className="v">{rating > 0 ? <Stars rating={rating} /> : '—'}</div>
            <div className="l">
              {rating > 0
                ? `${t('supplierDetail.buyerRating')} ${rating.toFixed(1)} / 5`
                : `${t('supplierDetail.buyerRating')} — ${t('supplierDetail.notRated')}`}
            </div>
          </div>
        </div>
        <div className="card stat">
          <div>
            <div className="v">{metric(inspections)}</div>
            <div className="l">{t('supplierDetail.inspections')}</div>
          </div>
        </div>
        <div className="card stat">
          <div>
            <div className="v">{rate(fulfilment)}</div>
            <div className="l">{t('supplierDetail.fulfilment')}</div>
          </div>
        </div>
        <div className="card stat">
          <div>
            <div className="v">{s.productCount.toLocaleString(locale)}</div>
            <div className="l">{t('supplierDetail.activeListings')}</div>
          </div>
        </div>
        <div className="card stat">
          <div>
            <div className="v">{s.verifiedLevel > 0 ? t('product.levelN', { n: s.verifiedLevel }) : '—'}</div>
            <div className="l">{t('supplierDetail.tier')}</div>
          </div>
        </div>
        <div className="card stat">
          <div>
            <div className="v">{trust > 0 ? Math.round(trust) : '—'}</div>
            <div className="l">{t('supplierDetail.trustScore')}</div>
          </div>
        </div>
      </div>

      <div className="cols3">
        <div className="card">
          <div className="hd"><h2>{t('supplierDetail.about', { company: s.companyName })}</h2></div>
          <div className="bd">
            {/* An importer's note is replaced by one neutral origin line: it is not
                the company's own words and it carries a competitor directory's
                storefront URL, which a buyer-facing page must not publish. */}
            {imported ? (
              <p style={{ margin: 0 }}>{t('supplierDetail.importedRecord')}</p>
            ) : (
              <p style={{ margin: 0 }}>
                {about !== '' ? scrubSource(about) : t('supplierDetail.noDescription')}
              </p>
            )}
            {s.tags.length > 0 && (
              <>
                <div className="muted" style={{ margin: '12px 0 5px' }}>{t('supplierDetail.capabilities')}</div>
                <div className="row" style={{ gap: 5, flexWrap: 'wrap' }}>
                  {s.tags.map((tag) => <span key={tag} className="pill p-grey">{tag}</span>)}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="card">
          <div className="hd"><h2>{t('supplierDetail.record')}</h2></div>
          <table>
            <tbody>
              <tr>
                <td className="muted">{t('supplierDetail.tier')}</td>
                <td style={{ textAlign: 'right' }}>{s.verifiedLevel > 0 ? t('product.levelN', { n: s.verifiedLevel }) : '—'}</td>
              </tr>
              <tr>
                <td className="muted">{t('supplierDetail.ratingLabel')}</td>
                <td style={{ textAlign: 'right' }}>{rating > 0 ? `${rating.toFixed(1)} / 5` : '—'}</td>
              </tr>
              <tr>
                <td className="muted">{t('supplierDetail.inspectionsDone')}</td>
                <td style={{ textAlign: 'right' }}>{metric(inspections)}</td>
              </tr>
              <tr>
                <td className="muted">{t('supplierDetail.fulfilment')}</td>
                <td style={{ textAlign: 'right' }}>{rate(fulfilment)}</td>
              </tr>
              <tr>
                <td className="muted">{t('product.tradingSince')}</td>
                <td style={{ textAlign: 'right' }}>{s.since ?? '—'}</td>
              </tr>
              <tr>
                <td className="muted">{t('supplierDetail.activeListings')}</td>
                <td style={{ textAlign: 'right' }}>{s.productCount.toLocaleString(locale)}</td>
              </tr>
            </tbody>
          </table>
          {/* A seeded row has no measured figure to show. Saying why the cells are
              empty is the honest complement to the Demo tag in the header. */}
          {isDemo && (
            <div className="bd muted" style={{ borderTop: '1px solid var(--line-2)' }}>{t('supplierDetail.demoMetricsNote')}</div>
          )}
        </div>

        <div className="grid" style={{ gridTemplateColumns: '1fr' }}>
          <div className="card">
            <div className="hd"><h2>{t('supplierDetail.contact')}</h2></div>
            <div className="bd">
              <p className="muted" style={{ margin: '0 0 10px' }}>
                {t('supplierDetail.contactBody')}
              </p>
              <button
                className="btn btn-gold"
                style={{ width: '100%' }}
                onClick={() => {
                  if (!me) { requireAuthGate(); return; }
                  // Messaging between members is not built yet, so we send the
                  // buyer to the RFQ exchange instead of pretending to open a thread.
                  navigate('/rfqs');
                }}
              >
                {t('supplierDetail.contactSupplier')}
              </button>
              <p className="hint" style={{ textAlign: 'center' }}>
                {me ? t('supplierDetail.contactHintSignedIn') : t('supplierDetail.contactHintGuest')}
              </p>
            </div>
          </div>

          <div className="card">
            <div className="hd"><h2>{t('supplierDetail.services')}</h2></div>
            <div className="bd grid" style={{ gridTemplateColumns: '1fr', gap: 6 }}>
              {[
                t('supplierDetail.service1'),
                t('supplierDetail.service2'),
                t('supplierDetail.service3'),
                t('supplierDetail.service4'),
              ].map((line) => (
                <div key={line} className="row" style={{ gap: 7, alignItems: 'flex-start' }}>
                  <span className="pill p-green">✓</span>
                  <span style={{ fontSize: 12.5 }}>{line}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="hd">
          <h2>{t('supplierDetail.stockFrom', { company: s.companyName })}</h2>
          <span className="link muted">
            {products.isLoading ? t('common.loading') : t('supplierDetail.shown', { n: mine.length.toLocaleString(locale) })}
          </span>
        </div>
        {products.isLoading ? (
          <div className="empty">{t('supplierDetail.loadingLots')}</div>
        ) : mine.length === 0 ? (
          <div className="empty">
            <b>{t('supplierDetail.noneShown')}</b>
            {t('supplierDetail.noneShownBody', { n: s.productCount.toLocaleString(locale) })}
          </div>
        ) : (
          <div className="bd">
            <div className="feedgrid">
              {mine.map((p) => <ProductCard key={p.id} p={p} />)}
            </div>
          </div>
        )}
      </div>
    </View>
  );
}
