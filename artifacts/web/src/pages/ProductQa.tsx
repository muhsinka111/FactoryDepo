/**
 * ProductQa — "Ask the seller a question" for one listing.
 *
 * The list is the API's own visibility model, never a client-side filter: an
 * anonymous visitor sees answered questions only, a signed-in buyer also sees
 * their own pending rows, and the listing's owning supplier (or an admin) sees
 * everything so they can answer it. No question, answer, name or date on this
 * panel is fabricated — every row is a row the endpoint returned.
 *
 * Asking is open to any signed-in account; answering is the owning supplier's
 * (or an admin's) act, and the API returns 403 to everyone else, so the answer
 * box is only mounted for a viewer we can prove may use it.
 */
import { useEffect, useRef, useState } from 'react';
import {
  useAnswerProductQuestion,
  useAskProductQuestion,
  useMe,
  useProductQuestions,
} from '@workspace/api-client-react';
import type { ApiError } from '@workspace/api-client-react';
import { SectionCard } from '../dash';
import { requireAuthGate } from '../components';
import { useI18n } from '../i18n';

type Question = NonNullable<ReturnType<typeof useProductQuestions>['data']>['items'][number];

/** Minimum question length the API enforces (zCreateProductQuestionInput). */
const MIN_Q = 10;

/** Compact relative label in the interface language; exact time stays in `title`. */
function useTimeAgo() {
  const { t } = useI18n();
  return (iso: string | null): string => {
    if (!iso) return '—';
    const ts = new Date(iso).getTime();
    if (Number.isNaN(ts)) return '—';
    const secs = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (secs < 60) return t('notes.justNow');
    const mins = Math.floor(secs / 60);
    if (mins < 60) return t('notes.minutesAgo', { n: mins });
    const hours = Math.floor(mins / 60);
    if (hours < 24) return t('notes.hoursAgo', { n: hours });
    return t('notes.daysAgo', { n: Math.floor(hours / 24) });
  };
}

/** The supplier's / admin's inline answer box for one pending question. */
function AnswerBox({ productId, qid }: { productId: number; qid: number }) {
  const { t } = useI18n();
  const answer = useAnswerProductQuestion(productId);
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    try {
      await answer.mutateAsync({ qid, answer: text.trim() });
      setText('');
    } catch (e2) {
      // The API's own message ("forbidden", validation text) — never a guess.
      setErr((e2 as ApiError).message || '—');
    }
  };

  return (
    <form className="qa-form mt10" onSubmit={submit}>
      <textarea
        rows={3}
        value={text}
        aria-label={t('dash.answerPlaceholder')}
        placeholder={t('dash.answerPlaceholder')}
        onChange={(e) => setText(e.target.value)}
      />
      {err ? <p className="errtext">{err}</p> : null}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button
          type="submit"
          className="btn btn-sm btn-gold"
          disabled={answer.isPending || text.trim().length < 2}
        >
          {t('dash.submitAnswer')}
        </button>
      </div>
    </form>
  );
}

export default function ProductQa({
  productId,
  canAnswer,
  focusKey = 0,
}: {
  productId: number;
  /** The viewer is this listing's owning supplier, or an administrator. */
  canAnswer: boolean;
  /** Bumped by the page's "Ask a question" CTA to move focus into the composer. */
  focusKey?: number;
}) {
  const { t, locale } = useI18n();
  const { data: me } = useMe();
  const timeAgo = useTimeAgo();
  const list = useProductQuestions(productId);
  const ask = useAskProductQuestion(productId);
  const [question, setQuestion] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  /** id of the row this visitor just created, so we can label it as theirs. */
  const [mineId, setMineId] = useState<number | null>(null);
  const box = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (focusKey > 0) box.current?.focus();
  }, [focusKey]);

  const items = list.data?.items ?? [];

  /**
   * A non-owner viewer only ever receives their OWN pending rows, so any pending
   * row is theirs; an owner/admin viewer receives everyone's, and we can only
   * vouch for the one this session created.
   */
  const isMine = (q: Question) =>
    q.status !== 'answered' && (!canAnswer || (mineId != null && q.id === mineId));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!me) {
      requireAuthGate();
      return;
    }
    setErr(null);
    try {
      const row = await ask.mutateAsync({ question: question.trim() });
      setMineId(row.id);
      setQuestion('');
      setSent(true);
    } catch (e2) {
      setErr((e2 as ApiError).message || '—');
    }
  };

  return (
    <SectionCard title={t('pd.faqH')}>
      <p className="muted" style={{ marginTop: 0 }}>{t('pd.faqIntro')}</p>

      {/* ---------------- composer ---------------- */}
      <form className="qa-form" onSubmit={submit}>
        <textarea
          ref={box}
          rows={3}
          value={question}
          aria-label={t('pd.yourQuestion')}
          placeholder={t('pd.questionPlaceholder')}
          onChange={(e) => { setQuestion(e.target.value); setSent(false); }}
        />
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <span className="hint" style={{ margin: 0 }}>
            {me ? t('pd.yourQuestion') : t('pd.signInToAsk')}
          </span>
          <span style={{ flex: 1 }} />
          {sent ? <span className="pill p-green">{t('pd.questionSent')}</span> : null}
          <button
            type="submit"
            className="btn btn-sm btn-gold"
            disabled={ask.isPending || question.trim().length < MIN_Q}
          >
            {t('pd.submitQuestion')}
          </button>
        </div>
        {err ? <p className="errtext">{err}</p> : null}
      </form>

      {/* ---------------- list ---------------- */}
      {list.isLoading ? (
        <p className="muted mt14">…</p>
      ) : list.isError ? (
        // The API did not answer: show nothing rather than a guessed list.
        <p className="muted mt14">—</p>
      ) : items.length === 0 ? (
        <div className="empty mt14">
          <b>{t('pd.faqEmpty')}</b>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            style={{ marginTop: 10 }}
            onClick={() => {
              if (!me) requireAuthGate();
              else box.current?.focus();
            }}
          >
            {t('pd.faqAskCta')}
          </button>
        </div>
      ) : (
        <div className="qa mt14">
          {items.map((q) => {
            const answered = q.status === 'answered' && !!q.answer;
            return (
              <div key={q.id} className={`qa-item${q.status !== 'answered' ? ' qa-pend' : ''}`}>
                <div className="qa-q">
                  <span className="mk">Q</span>
                  <span>{q.question}</span>
                </div>
                <div className="qa-meta">
                  <span>{q.askerName}</span>
                  <span title={new Date(q.askedAt).toLocaleString(locale)}>{timeAgo(q.askedAt)}</span>
                  {!answered && isMine(q) ? <span>{t('pd.yourQuestion')}</span> : null}
                  {!answered && isMine(q) ? <span>{t('pd.awaitingAnswer')}</span> : null}
                  {!answered && canAnswer ? <span>{t('dash.pending')}</span> : null}
                </div>

                {answered ? (
                  <div className="qa-a">
                    <span className="mk">A</span>
                    <div>
                      <div style={{ whiteSpace: 'pre-line' }}>{q.answer}</div>
                      <div className="qa-meta">
                        <span>{t('pd.sellerAnswer')}</span>
                        {q.answeredByName ? <span>{q.answeredByName}</span> : null}
                        {q.answeredAt ? (
                          <span title={new Date(q.answeredAt).toLocaleString(locale)}>
                            {timeAgo(q.answeredAt)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : null}

                {!answered && canAnswer ? <AnswerBox productId={productId} qid={q.id} /> : null}
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
