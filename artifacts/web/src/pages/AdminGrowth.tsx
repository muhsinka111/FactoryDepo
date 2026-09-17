import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import {
  getToken,
  useMe,
  useBanners,
  useCreateBanner,
  useFaqs,
  useCreateFaq,
} from '@workspace/api-client-react';
import type { CreateBannerInput, CreateFaqInput } from '@workspace/api-client-react';
import { View, Empty, Spinner } from '../components';
import { useI18n } from '../i18n';

/**
 * AdminGrowth — the two growth surfaces the API actually exposes: banner
 * placements and help-centre FAQs.
 *
 * Both are create-only. There is no banner-update or FAQ-update endpoint in the
 * API, so this screen says so plainly instead of pretending an edit exists: a
 * banner's active flag has to be right when it is created, because nothing here
 * can flip it afterwards.
 */

function errText(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

function day(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(locale);
}

function AdminOnly({ signedIn, role }: { signedIn: boolean; role?: string }) {
  const { t } = useI18n();
  return (
    <View title={t('admin.common.adminsOnly')} sub={t('admin.growth.adminOnlySub')}>
      <Empty title={signedIn ? t('admin.common.notAdmin') : t('admin.common.notSignedIn')}>
        {signedIn
          ? t('admin.growth.signedInBody', { role: role ?? t('admin.common.nonAdminRole') })
          : t('admin.growth.signedOutBody')}
        <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
          {signedIn ? (
            <Link href="/explore" className="btn btn-sm btn-grey">{t('admin.common.backToMarketplace')}</Link>
          ) : (
            <Link href="/sign-in?next=%2Fadmin%2Fgrowth" className="btn btn-sm btn-primary">{t('action.signIn')}</Link>
          )}
        </div>
      </Empty>
    </View>
  );
}

interface BannerForm {
  title: string;
  body: string;
  placement: string;
  imageKey: string;
  href: string;
  active: boolean;
  startsAt: string;
  endsAt: string;
}

interface FaqForm {
  category: string;
  question: string;
  answer: string;
  position: string;
}

const EMPTY_BANNER: BannerForm = {
  title: '', body: '', placement: 'home', imageKey: '', href: '', active: false, startsAt: '', endsAt: '',
};

const EMPTY_FAQ: FaqForm = { category: '', question: '', answer: '', position: '0' };

export default function AdminGrowth() {
  const { t, locale } = useI18n();
  const me = useMe();
  const signedIn = !!getToken();
  const isAdmin = me.data?.role === 'admin';

  const banners = useBanners({ enabled: isAdmin });
  const createBanner = useCreateBanner();
  const faqs = useFaqs({ enabled: isAdmin });
  const createFaq = useCreateFaq();

  const [bForm, setBForm] = useState<BannerForm>(EMPTY_BANNER);
  const [bError, setBError] = useState<string | null>(null);
  const [bOk, setBOk] = useState<string | null>(null);
  const [fForm, setFForm] = useState<FaqForm>(EMPTY_FAQ);
  const [fError, setFError] = useState<string | null>(null);
  const [fOk, setFOk] = useState<string | null>(null);

  const bannerItems = useMemo(() => banners.data?.items ?? [], [banners.data]);
  const faqItems = useMemo(() => faqs.data?.items ?? [], [faqs.data]);

  if (!signedIn) return <AdminOnly signedIn={false} />;
  if (me.isLoading) {
    return (
      <View title={t('nav.growth')}>
        <Spinner />
      </View>
    );
  }
  if (!isAdmin) return <AdminOnly signedIn role={me.data?.role} />;

  const submitBanner = async () => {
    setBError(null);
    setBOk(null);

    const title = bForm.title.trim();
    const placement = bForm.placement.trim();
    if (title.length < 2) { setBError(t('admin.growth.errTitleShort')); return; }
    if (!placement) { setBError(t('admin.growth.errPlacement')); return; }

    const starts = bForm.startsAt ? new Date(bForm.startsAt) : null;
    const ends = bForm.endsAt ? new Date(bForm.endsAt) : null;
    if (starts && Number.isNaN(starts.getTime())) { setBError(t('admin.growth.errStartInvalid')); return; }
    if (ends && Number.isNaN(ends.getTime())) { setBError(t('admin.growth.errEndInvalid')); return; }
    if (starts && ends && ends.getTime() <= starts.getTime()) {
      setBError(t('admin.growth.errWindow'));
      return;
    }

    const input: CreateBannerInput = { title, placement, active: bForm.active };
    if (bForm.body.trim()) input.body = bForm.body.trim();
    if (bForm.imageKey.trim()) input.imageKey = bForm.imageKey.trim();
    if (bForm.href.trim()) input.href = bForm.href.trim();
    if (starts) input.startsAt = starts.toISOString();
    if (ends) input.endsAt = ends.toISOString();

    try {
      await createBanner.mutateAsync(input);
      setBOk(
        bForm.active
          ? t('admin.growth.okBannerActive')
          : t('admin.growth.okBannerInactive'),
      );
      setBForm(EMPTY_BANNER);
    } catch (e) {
      setBError(errText(e, t('admin.growth.errBannerFallback')));
    }
  };

  const submitFaq = async () => {
    setFError(null);
    setFOk(null);

    const question = fForm.question.trim();
    const answer = fForm.answer.trim();
    if (question.length < 3) { setFError(t('admin.growth.errQuestionShort')); return; }
    if (!answer) { setFError(t('admin.growth.errAnswer')); return; }
    const position = Number(fForm.position);

    const input: CreateFaqInput = { question, answer, position: Number.isFinite(position) && position >= 0 ? Math.trunc(position) : 0 };
    if (fForm.category.trim()) input.category = fForm.category.trim();

    try {
      await createFaq.mutateAsync(input);
      setFOk(t('admin.growth.okFaq'));
      setFForm(EMPTY_FAQ);
    } catch (e) {
      setFError(errText(e, t('admin.growth.errFaqFallback')));
    }
  };

  return (
    <View
      title={t('nav.growth')}
      sub={t('admin.growth.sub')}
    >
      {/* ------------------------------- banners ------------------------------- */}
      <div className="card">
        <div className="hd">
          <h2>{t('admin.growth.bannersTitle')}</h2>
          <span className="muted" style={{ marginLeft: 'auto' }}>
            {banners.data
              ? banners.data.total === 1
                ? t('admin.growth.bannerCountOne', { n: banners.data.total.toLocaleString(locale) })
                : t('admin.growth.bannerCount', { n: banners.data.total.toLocaleString(locale) })
              : '—'}
          </span>
        </div>
        <div className="bd">
          {bError && <div className="errtext" style={{ marginBottom: 10 }}>{bError}</div>}
          {bOk && <p className="muted" style={{ marginTop: 0, marginBottom: 10 }}>{bOk}</p>}

          <div className="f2">
            <div className="field">
              <label htmlFor="bn-title">{t('admin.growth.labelTitle')} <i>*</i></label>
              <input
                id="bn-title"
                className="in"
                maxLength={160}
                placeholder={t('admin.growth.placeholderTitle')}
                value={bForm.title}
                onChange={(e) => setBForm({ ...bForm, title: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="bn-placement">{t('admin.growth.labelPlacement')} <i>*</i></label>
              <input
                id="bn-placement"
                className="in"
                maxLength={40}
                list="bn-placements"
                value={bForm.placement}
                onChange={(e) => setBForm({ ...bForm, placement: e.target.value })}
              />
              <datalist id="bn-placements">
                <option value="home" />
              </datalist>
              <div className="hint">{t('admin.growth.hintPlacement')}</div>
            </div>
          </div>

          <div className="field">
            <label htmlFor="bn-body">{t('admin.growth.labelBody')}</label>
            <textarea
              id="bn-body"
              className="in"
              rows={2}
              maxLength={1000}
              placeholder={t('admin.growth.placeholderBody')}
              value={bForm.body}
              onChange={(e) => setBForm({ ...bForm, body: e.target.value })}
            />
          </div>

          <div className="f2">
            <div className="field">
              <label htmlFor="bn-image">{t('admin.growth.labelImage')}</label>
              <input
                id="bn-image"
                className="in"
                maxLength={300}
                placeholder="/products/hero-metals.jpg"
                value={bForm.imageKey}
                onChange={(e) => setBForm({ ...bForm, imageKey: e.target.value })}
              />
              <div className="hint">
                {t('admin.growth.hintImage')}
              </div>
            </div>
            <div className="field">
              <label htmlFor="bn-href">{t('admin.growth.labelLink')}</label>
              <input
                id="bn-href"
                className="in"
                maxLength={300}
                placeholder="/explore?category=Steel"
                value={bForm.href}
                onChange={(e) => setBForm({ ...bForm, href: e.target.value })}
              />
            </div>
          </div>

          <div className="f2">
            <div className="field">
              <label htmlFor="bn-starts">{t('admin.growth.labelStarts')}</label>
              <input
                id="bn-starts"
                className="in"
                type="datetime-local"
                value={bForm.startsAt}
                onChange={(e) => setBForm({ ...bForm, startsAt: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="bn-ends">{t('admin.growth.labelEnds')}</label>
              <input
                id="bn-ends"
                className="in"
                type="datetime-local"
                value={bForm.endsAt}
                onChange={(e) => setBForm({ ...bForm, endsAt: e.target.value })}
              />
            </div>
          </div>

          <div className="field">
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 400 }}>
              <input
                type="checkbox"
                checked={bForm.active}
                onChange={(e) => setBForm({ ...bForm, active: e.target.checked })}
              />
              <span>{t('admin.growth.labelActive')}</span>
            </label>
            <div className="hint">
              {t('admin.growth.hintActive')}
            </div>
          </div>

          <button className="btn btn-primary" onClick={() => void submitBanner()} disabled={createBanner.isPending}>
            {createBanner.isPending ? t('admin.growth.creating') : t('admin.growth.createBanner')}
          </button>
        </div>

        {banners.isLoading ? (
          <div className="empty">{t('admin.growth.loadingBanners')}</div>
        ) : banners.isError ? (
          <div className="empty">
            <b>{t('admin.growth.bannerLoadErrorTitle')}</b>
            {t('admin.growth.bannerLoadErrorBody')}
            <div className="row" style={{ justifyContent: 'center', marginTop: 10 }}>
              <button className="btn btn-sm btn-primary" onClick={() => void banners.refetch()}>{t('action.tryAgain')}</button>
            </div>
          </div>
        ) : bannerItems.length === 0 ? (
          <div className="empty">
            <b>{t('admin.growth.bannerEmptyTitle')}</b>
            {t('admin.growth.bannerEmptyBody')}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>{t('admin.growth.colBanner')}</th>
                  <th>{t('admin.growth.colPlacement')}</th>
                  <th>{t('admin.growth.colState')}</th>
                  <th className="hidem">{t('admin.growth.colWindow')}</th>
                  <th className="hidem">{t('admin.growth.colLink')}</th>
                  <th className="hidem">{t('admin.growth.colCreated')}</th>
                </tr>
              </thead>
              <tbody>
                {bannerItems.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <span className="strong">{b.title}</span>
                      <div className="muted">
                        #{b.id}
                        {b.body ? ` · ${b.body.length > 60 ? `${b.body.slice(0, 60)}…` : b.body}` : ''}
                      </div>
                    </td>
                    <td><span className="pill p-navy">{b.placement}</span></td>
                    <td>
                      {b.active ? (
                        <span className="pill p-green" title={t('admin.growth.activeTitle')}>{t('admin.growth.active')}</span>
                      ) : (
                        <span className="pill p-grey" title={t('admin.growth.inactiveTitle')}>{t('admin.growth.inactive')}</span>
                      )}
                    </td>
                    <td className="hidem muted">
                      {b.startsAt ? day(b.startsAt, locale) : '—'} → {b.endsAt ? day(b.endsAt, locale) : '—'}
                      <div className="muted">
                        {!b.startsAt && !b.endsAt ? t('admin.growth.noWindow') : ''}
                      </div>
                    </td>
                    <td className="hidem muted" title={b.href ?? t('admin.growth.noLinkTitle')}>{b.href ?? '—'}</td>
                    <td className="hidem muted" title={new Date(b.createdAt).toLocaleString(locale)}>{day(b.createdAt, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* -------------------------------- faqs -------------------------------- */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="hd">
          <h2>{t('admin.growth.faqTitle')}</h2>
          <span className="muted" style={{ marginLeft: 'auto' }}>
            {faqs.data
              ? faqs.data.total === 1
                ? t('admin.growth.faqCountOne', { n: faqs.data.total.toLocaleString(locale) })
                : t('admin.growth.faqCount', { n: faqs.data.total.toLocaleString(locale) })
              : '—'}
          </span>
          <Link href="/help" className="link">{t('nav.helpCentre')}</Link>
        </div>
        <div className="bd">
          {fError && <div className="errtext" style={{ marginBottom: 10 }}>{fError}</div>}
          {fOk && <p className="muted" style={{ marginTop: 0, marginBottom: 10 }}>{fOk}</p>}

          <div className="f3">
            <div className="field">
              <label htmlFor="faq-question">{t('admin.growth.labelQuestion')} <i>*</i></label>
              <input
                id="faq-question"
                className="in"
                maxLength={300}
                placeholder={t('admin.growth.placeholderQuestion')}
                value={fForm.question}
                onChange={(e) => setFForm({ ...fForm, question: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="faq-category">{t('admin.growth.labelCategory')}</label>
              <input
                id="faq-category"
                className="in"
                maxLength={60}
                placeholder={t('admin.growth.placeholderCategory')}
                value={fForm.category}
                onChange={(e) => setFForm({ ...fForm, category: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="faq-position">{t('admin.growth.labelPosition')}</label>
              <input
                id="faq-position"
                className="in"
                inputMode="numeric"
                value={fForm.position}
                onChange={(e) => setFForm({ ...fForm, position: e.target.value })}
              />
              <div className="hint">{t('admin.growth.hintPosition')}</div>
            </div>
          </div>

          <div className="field">
            <label htmlFor="faq-answer">{t('admin.growth.labelAnswer')} <i>*</i></label>
            <textarea
              id="faq-answer"
              className="in"
              rows={4}
              maxLength={4000}
              placeholder={t('admin.growth.placeholderAnswer')}
              value={fForm.answer}
              onChange={(e) => setFForm({ ...fForm, answer: e.target.value })}
            />
            <div className="hint">
              {t('admin.growth.hintAnswer')}
            </div>
          </div>

          <button className="btn btn-primary" onClick={() => void submitFaq()} disabled={createFaq.isPending}>
            {createFaq.isPending ? t('admin.growth.publishing') : t('admin.growth.publishFaq')}
          </button>
          <div className="hint">
            {t('admin.growth.faqNoUpdateHint')}
          </div>
        </div>

        {faqs.isLoading ? (
          <div className="empty">{t('admin.growth.loadingFaqs')}</div>
        ) : faqs.isError ? (
          <div className="empty">
            <b>{t('admin.growth.faqLoadErrorTitle')}</b>
            {t('admin.growth.faqLoadErrorBody')}
            <div className="row" style={{ justifyContent: 'center', marginTop: 10 }}>
              <button className="btn btn-sm btn-primary" onClick={() => void faqs.refetch()}>{t('action.tryAgain')}</button>
            </div>
          </div>
        ) : faqItems.length === 0 ? (
          <div className="empty">
            <b>{t('admin.growth.faqEmptyTitle')}</b>
            {t('admin.growth.faqEmptyBody')}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ textAlign: 'right' }}>{t('admin.growth.colPos')}</th>
                  <th>{t('admin.growth.colQuestion')}</th>
                  <th className="hidem">{t('admin.growth.colCategory')}</th>
                  <th>{t('admin.growth.colAnswer')}</th>
                </tr>
              </thead>
              <tbody>
                {faqItems.map((f) => (
                  <tr key={f.id}>
                    <td style={{ textAlign: 'right' }} className="muted">{f.position}</td>
                    <td><span className="strong">{f.question}</span></td>
                    <td className="hidem muted">{f.category ?? '—'}</td>
                    <td className="muted" title={f.answer}>
                      {f.answer.length > 120 ? `${f.answer.slice(0, 120)}…` : f.answer}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="stripe" style={{ marginTop: 12 }}>
        <span>
          {t('admin.growth.stripe')}
        </span>
      </div>
    </View>
  );
}
