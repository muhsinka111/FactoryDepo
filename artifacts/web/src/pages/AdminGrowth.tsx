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

function day(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

function AdminOnly({ signedIn, role }: { signedIn: boolean; role?: string }) {
  return (
    <View title="Admins only" sub="Banner and help-centre content is administrator-only">
      <Empty title={signedIn ? 'Your account is not an administrator' : 'You are not signed in'}>
        {signedIn
          ? `You are signed in as ${role ?? 'a non-admin role'}. Publishing banners and FAQs is restricted to administrator accounts.`
          : 'Sign in with an administrator account to manage banners and FAQs.'}
        <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
          {signedIn ? (
            <Link href="/explore" className="btn btn-sm btn-grey">Back to the marketplace</Link>
          ) : (
            <Link href="/sign-in?next=%2Fadmin%2Fgrowth" className="btn btn-sm btn-primary">Sign in</Link>
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
      <View title="Banners and promos">
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
    if (title.length < 2) { setBError('A banner needs a title of at least 2 characters.'); return; }
    if (!placement) { setBError('A placement key is required — “home” is the default the app reads.'); return; }

    const starts = bForm.startsAt ? new Date(bForm.startsAt) : null;
    const ends = bForm.endsAt ? new Date(bForm.endsAt) : null;
    if (starts && Number.isNaN(starts.getTime())) { setBError('The start date and time is not valid.'); return; }
    if (ends && Number.isNaN(ends.getTime())) { setBError('The end date and time is not valid.'); return; }
    if (starts && ends && ends.getTime() <= starts.getTime()) {
      setBError('The end of the window must be after its start.');
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
          ? 'Banner created and marked active.'
          : 'Banner created inactive. There is no banner-update endpoint, so it cannot be switched on from this console.',
      );
      setBForm(EMPTY_BANNER);
    } catch (e) {
      setBError(errText(e, 'The banner could not be created — try again.'));
    }
  };

  const submitFaq = async () => {
    setFError(null);
    setFOk(null);

    const question = fForm.question.trim();
    const answer = fForm.answer.trim();
    if (question.length < 3) { setFError('A FAQ needs a question of at least 3 characters.'); return; }
    if (!answer) { setFError('A FAQ needs an answer.'); return; }
    const position = Number(fForm.position);

    const input: CreateFaqInput = { question, answer, position: Number.isFinite(position) && position >= 0 ? Math.trunc(position) : 0 };
    if (fForm.category.trim()) input.category = fForm.category.trim();

    try {
      await createFaq.mutateAsync(input);
      setFOk('FAQ published to the help centre.');
      setFForm(EMPTY_FAQ);
    } catch (e) {
      setFError(errText(e, 'The FAQ could not be created — try again.'));
    }
  };

  return (
    <View
      title="Banners and promos"
      sub="Banner placements and help-centre FAQs, created straight through the API. Both are write-once here: the API has no update endpoint for either."
    >
      {/* ------------------------------- banners ------------------------------- */}
      <div className="card">
        <div className="hd">
          <h2>Banners</h2>
          <span className="muted" style={{ marginLeft: 'auto' }}>
            {banners.data ? `${banners.data.total.toLocaleString()} banner${banners.data.total === 1 ? '' : 's'}` : '—'}
          </span>
        </div>
        <div className="bd">
          {bError && <div className="errtext" style={{ marginBottom: 10 }}>{bError}</div>}
          {bOk && <p className="muted" style={{ marginTop: 0, marginBottom: 10 }}>{bOk}</p>}

          <div className="f2">
            <div className="field">
              <label htmlFor="bn-title">Title <i>*</i></label>
              <input
                id="bn-title"
                className="in"
                maxLength={160}
                placeholder="Verified stock, ready to ship"
                value={bForm.title}
                onChange={(e) => setBForm({ ...bForm, title: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="bn-placement">Placement key <i>*</i></label>
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
              <div className="hint">The key the app reads to place the banner. “home” is the API's default.</div>
            </div>
          </div>

          <div className="field">
            <label htmlFor="bn-body">Body</label>
            <textarea
              id="bn-body"
              className="in"
              rows={2}
              maxLength={1000}
              placeholder="One or two lines shown with the banner image."
              value={bForm.body}
              onChange={(e) => setBForm({ ...bForm, body: e.target.value })}
            />
          </div>

          <div className="f2">
            <div className="field">
              <label htmlFor="bn-image">Image path</label>
              <input
                id="bn-image"
                className="in"
                maxLength={300}
                placeholder="/products/hero-metals.jpg"
                value={bForm.imageKey}
                onChange={(e) => setBForm({ ...bForm, imageKey: e.target.value })}
              />
              <div className="hint">
                A path to imagery FactoryDepo owns or has permission to use. Do not paste a
                third-party or scraped image URL.
              </div>
            </div>
            <div className="field">
              <label htmlFor="bn-href">Link</label>
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
              <label htmlFor="bn-starts">Starts</label>
              <input
                id="bn-starts"
                className="in"
                type="datetime-local"
                value={bForm.startsAt}
                onChange={(e) => setBForm({ ...bForm, startsAt: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="bn-ends">Ends</label>
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
              <span>Active — show this banner to visitors</span>
            </label>
            <div className="hint">
              New banners default to inactive. There is no banner-update endpoint, so a banner saved
              inactive cannot be switched on from this console — set it correctly now.
            </div>
          </div>

          <button className="btn btn-primary" onClick={() => void submitBanner()} disabled={createBanner.isPending}>
            {createBanner.isPending ? 'Creating…' : 'Create banner'}
          </button>
        </div>

        {banners.isLoading ? (
          <div className="empty">Loading banners…</div>
        ) : banners.isError ? (
          <div className="empty">
            <b>Could not load banners — try again</b>
            The banner list did not answer. Creating is unaffected.
            <div className="row" style={{ justifyContent: 'center', marginTop: 10 }}>
              <button className="btn btn-sm btn-primary" onClick={() => void banners.refetch()}>Try again</button>
            </div>
          </div>
        ) : bannerItems.length === 0 ? (
          <div className="empty">
            <b>No banners yet</b>
            Nothing is scheduled to appear on the storefront. Create the first placement above.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Banner</th>
                  <th>Placement</th>
                  <th>State</th>
                  <th className="hidem">Window</th>
                  <th className="hidem">Link</th>
                  <th className="hidem">Created</th>
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
                        <span className="pill p-green" title="Shown to visitors">Active</span>
                      ) : (
                        <span className="pill p-grey" title="Saved but not shown">Inactive</span>
                      )}
                    </td>
                    <td className="hidem muted">
                      {b.startsAt ? day(b.startsAt) : '—'} → {b.endsAt ? day(b.endsAt) : '—'}
                      <div className="muted">
                        {!b.startsAt && !b.endsAt ? 'no window set' : ''}
                      </div>
                    </td>
                    <td className="hidem muted" title={b.href ?? 'No link on this banner'}>{b.href ?? '—'}</td>
                    <td className="hidem muted" title={new Date(b.createdAt).toLocaleString()}>{day(b.createdAt)}</td>
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
          <h2>Help-centre FAQs</h2>
          <span className="muted" style={{ marginLeft: 'auto' }}>
            {faqs.data ? `${faqs.data.total.toLocaleString()} FAQ${faqs.data.total === 1 ? '' : 's'}` : '—'}
          </span>
          <Link href="/help" className="link">View help centre</Link>
        </div>
        <div className="bd">
          {fError && <div className="errtext" style={{ marginBottom: 10 }}>{fError}</div>}
          {fOk && <p className="muted" style={{ marginTop: 0, marginBottom: 10 }}>{fOk}</p>}

          <div className="f3">
            <div className="field">
              <label htmlFor="faq-question">Question <i>*</i></label>
              <input
                id="faq-question"
                className="in"
                maxLength={300}
                placeholder="How is a supplier verified?"
                value={fForm.question}
                onChange={(e) => setFForm({ ...fForm, question: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="faq-category">Category</label>
              <input
                id="faq-category"
                className="in"
                maxLength={60}
                placeholder="Verification"
                value={fForm.category}
                onChange={(e) => setFForm({ ...fForm, category: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="faq-position">Position</label>
              <input
                id="faq-position"
                className="in"
                inputMode="numeric"
                value={fForm.position}
                onChange={(e) => setFForm({ ...fForm, position: e.target.value })}
              />
              <div className="hint">Ordering value the API stores. Lower first.</div>
            </div>
          </div>

          <div className="field">
            <label htmlFor="faq-answer">Answer <i>*</i></label>
            <textarea
              id="faq-answer"
              className="in"
              rows={4}
              maxLength={4000}
              placeholder="Plain language, and only what the platform actually does today."
              value={fForm.answer}
              onChange={(e) => setFForm({ ...fForm, answer: e.target.value })}
            />
            <div className="hint">
              Describe the platform as it is. An FAQ that promises an unbuilt feature is a lie on the
              help page.
            </div>
          </div>

          <button className="btn btn-primary" onClick={() => void submitFaq()} disabled={createFaq.isPending}>
            {createFaq.isPending ? 'Publishing…' : 'Publish FAQ'}
          </button>
          <div className="hint">
            The API has no FAQ-update endpoint: a published answer cannot be edited here.
          </div>
        </div>

        {faqs.isLoading ? (
          <div className="empty">Loading FAQs…</div>
        ) : faqs.isError ? (
          <div className="empty">
            <b>Could not load FAQs — try again</b>
            The FAQ list did not answer. Publishing is unaffected.
            <div className="row" style={{ justifyContent: 'center', marginTop: 10 }}>
              <button className="btn btn-sm btn-primary" onClick={() => void faqs.refetch()}>Try again</button>
            </div>
          </div>
        ) : faqItems.length === 0 ? (
          <div className="empty">
            <b>No FAQs yet</b>
            The help centre has no answered questions. Publish the first one above.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ textAlign: 'right' }}>Pos</th>
                  <th>Question</th>
                  <th className="hidem">Category</th>
                  <th>Answer</th>
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
          Banners and FAQs are marketing copy, not trade data — nothing on this screen counts or
          estimates marketplace activity.
        </span>
      </div>
    </View>
  );
}
