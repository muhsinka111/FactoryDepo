/**
 * Title generation for sourced listings (owner directive 2026-09-22).
 *
 * An operator imports a listing from a source page. The title we publish must be
 * OURS: not the source's marketing string, not a near-duplicate of a row already
 * in the catalogue, and never a claim the record cannot back (a certificate, a
 * price, a superlative). Two engines answer, both here:
 *
 *   - `ai`       : an OpenAI-compatible chat completion (DeepSeek by default;
 *                  key/base/model are env-configurable, 10s timeout).
 *   - `fallback` : a deterministic composer that only re-arranges the caller's
 *                  own facts (head noun + category + specs + origin).
 *
 * The rules are ENFORCED on the model's answer — a model is asked politely, not
 * trusted: brands, superlatives, unverifiable certificates, prices, invented
 * numbers, emoji, shouting and over-length are stripped, and whatever cannot be
 * repaired falls back to the composer. Every reply carries a `note` naming the
 * engine that answered and, in one clause, why.
 *
 * Nothing in here may throw its way out to the client: an unreachable provider,
 * a 500, a timeout, a missing key or a nonsense answer all still produce a usable
 * title plus an honest note. The endpoint costs money when a key exists, so auth
 * is enforced by the route, never here.
 */
import { ilike, sql } from 'drizzle-orm';
import type * as c from '@workspace/api-zod';
import { db, products } from '../db.js';
import { toNum } from '../http.js';

export type TitleInput = c.GeneratedTitleInput;
export type GeneratedTitle = c.GeneratedTitle;

/* ==========================================================================
 * configuration (read per call — an env change must not need a restart)
 * ========================================================================== */

const DEFAULT_BASE_URL = 'https://api.deepseek.com/v1';
const DEFAULT_MODEL = 'deepseek-chat';
const DEFAULT_TIMEOUT_MS = 10_000;

/** The first configured key wins; empty string means "no AI, use the composer". */
export function aiKey(): string {
  return (
    process.env.AI_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.DEEPSEEK_API_KEY ||
    ''
  ).trim();
}

export function aiBaseUrl(): string {
  return (process.env.AI_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
}

export function aiModel(): string {
  return (process.env.AI_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
}

export function aiTimeoutMs(): number {
  const n = Number(process.env.AI_TIMEOUT_MS);
  return Number.isFinite(n) && n >= 250 ? n : DEFAULT_TIMEOUT_MS;
}

/* ==========================================================================
 * lexicons
 * ========================================================================== */

/** Source marketplaces / sellers that must never appear in OUR title. */
const SOURCE_BRANDS = [
  'alibaba', 'aliexpress', 'made-in-china', 'made in china', 'madeinchina',
  'indiamart', 'dhgate', 'global sources', 'globalsources', 'tradeindia',
  'ec21', '1688', 'taobao', 'tmall', 'jd.com', 'pinduoduo', 'alibaba.com',
  'amazon', 'ebay', 'lazada', 'shopee', 'etsy', 'temu', 'wish', 'walmart',
  'rakuten', 'alibabacom',
];

/** Unverifiable claims — always removed. */
const CLAIMS = [
  'best', 'bestseller', 'best seller', 'best-selling', '#1', 'no.1', 'no. 1',
  'number one', 'cheapest', 'lowest price', 'lowest cost', 'low price',
  'competitive price', 'reasonable price', 'good price', 'top quality',
  'highest quality', 'high quality', 'world class', 'world-class',
  'first class', 'premium', 'leading', 'super', 'ultra', 'amazing', 'perfect',
  '100%', 'guarantee', 'guaranteed', 'money back', 'hot sale', 'new style',
  'free shipping', 'free sample', 'discount', 'bargain', 'factory direct',
  'factory price', 'wholesale price', 'cheap', 'reliable manufacturer',
  'professional manufacturer', 'large capacity', 'high efficiency', 'only',
  'limited time', 'hurry', 'order now', 'buy now', 'click here', 'whatsapp',
  'contact us', 'fast delivery', 'quick delivery', 'lowest shipping',
];

/**
 * Claims that are only unverifiable when the record cannot back them. The token
 * is allowed back into the title when the listing's own `spec` carries it.
 */
const CONDITIONAL_CLAIMS = ['certified', 'certification', 'certificate', 'iso', 'ce', 'fda', 'rohs', 'sgs', 'tuv', 'ul'];

/**
 * Currency words. A price is never part of OUR title, and a currency token left
 * behind after the number is stripped ("USD", "$2,500") is worse than useless.
 */
const MONEY_TOKENS = ['usd', 'eur', 'gbp', 'try', 'cny', 'rmb', 'inr', 'jpy', 'aed', 'dollar', 'dollars', 'yuan', 'euro', 'euros', 'lira', 'rupee'];

const CONDITIONAL_SPEC_RE: Record<string, RegExp> = {
  certified: /certif/i,
  certification: /certif/i,
  certificate: /certif/i,
  iso: /\biso\b/i,
  ce: /\bce\b|ce[- ]?mark/i,
  fda: /\bfda\b/i,
  rohs: /\brohs\b/i,
  sgs: /\bsgs\b/i,
  tuv: /\btuv\b/i,
  ul: /\bul\b/i,
};

/** Price / currency fragments. Money is never part of OUR title. */
const PRICE_RE =
  /(?:(?:usd|eur|try|gbp|cny|rmb|inr|jpy|aed|\$|€|£|₺|¥)\s?\d[\d.,]*|\d[\d.,]*\s?(?:usd|eur|try|gbp|cny|rmb|inr|jpy|aed|dollars?|yuan|euros?|lira)\b|\b(?:price|prices|cost|moq)\s*[:=]?\s*[\d.,]+)/gi;

const NUMBER_RE = /\d[\d.,]*/g;

/** Canonical spellings — used when the title's own case has to be rebuilt. */
const ACRONYMS = new Map<string, string>([
  ['cn', 'CN'], ['tr', 'TR'], ['us', 'US'], ['usa', 'USA'], ['uk', 'UK'], ['eu', 'EU'], ['uae', 'UAE'],
  ['iso', 'ISO'], ['ce', 'CE'], ['fda', 'FDA'], ['rohs', 'RoHS'], ['sgs', 'SGS'], ['tuv', 'TUV'], ['ul', 'UL'],
  ['pvc', 'PVC'], ['abs', 'ABS'], ['pp', 'PP'], ['pe', 'PE'], ['hdpe', 'HDPE'], ['ldpe', 'LDPE'], ['pet', 'PET'],
  ['pu', 'PU'], ['ss', 'SS'], ['led', 'LED'], ['lcd', 'LCD'], ['cnc', 'CNC'], ['plc', 'PLC'], ['hvac', 'HVAC'],
  ['ac', 'AC'], ['dc', 'DC'], ['kw', 'kW'], ['kva', 'kVA'], ['rpm', 'RPM'], ['tefc', 'TEFC'], ['vfd', 'VFD'],
  ['usb', 'USB'], ['oem', 'OEM'], ['odm', 'ODM'], ['moq', 'MOQ'], ['fob', 'FOB'], ['cif', 'CIF'], ['exw', 'EXW'],
  ['ddp', 'DDP'], ['astm', 'ASTM'], ['din', 'DIN'], ['jis', 'JIS'], ['ansi', 'ANSI'], ['sus', 'SUS'], ['tp', 'TP'],
  ['tpu', 'TPU'], ['epdm', 'EPDM'], ['nbr', 'NBR'], ['ptfe', 'PTFE'], ['uv', 'UV'], ['gb', 'GB'], ['tb', 'TB'],
]);

/** Words that carry no product identity — dropped when deriving the head noun. */
const NOISE_WORDS = new Set([
  'for', 'with', 'and', 'the', 'a', 'an', 'of', 'in', 'on', 'to', 'from', 'by', 'or',
  'hot', 'sale', 'sell', 'selling', 'wholesale', 'wholesaler', 'retail', 'cheap', 'cheapest',
  'price', 'prices', 'cost', 'moq', 'supplier', 'suppliers', 'manufacturer', 'manufacturers',
  'factory', 'factories', 'exporter', 'exporters', 'maker', 'seller', 'sellers', 'vendor',
  'product', 'products', 'item', 'items', 'goods', 'new', 'used', 'high', 'top', 'quality',
  'oem', 'odm', 'custom', 'customized', 'customised', 'sample', 'samples', 'free', 'promotion',
  'promotional', 'stock', 'stocklot', 'launch', 'etc', 'please', 'contact', 'inquiry', 'quote',
  'quotation', 'buy', 'buying', 'supply', 'supplies', 'distributor', 'trading', 'company', 'co',
  'ltd', 'limited', 'inc', 'corp', 'plc', 'best', 'premium', 'leading', 'manufacture',
  'manufacturing', 'processing',
]);

/** Single-word head nouns too vague to stand alone. */
const GENERIC_HEADS = new Set(['machine', 'machinery', 'equipment', 'product', 'material', 'materials', 'parts', 'part', 'system', 'unit', 'device', 'tool', 'goods', 'supply', 'supplies']);

/* ==========================================================================
 * text hygiene
 * ========================================================================== */

/** Fold typographic punctuation to ASCII and drop anything non-printable. */
export function toAscii(text: string): string {
  return text
    .replace(/[\u2018\u2019\u201B\u2032\u00B4]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
    .replace(/[×✕✖]/g, 'x')
    .replace(/°/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function phraseRegex(term: string): RegExp {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, 'gi');
}

/** Remove every `term` occurrence, recording which term was found (once). */
function stripTerms(text: string, terms: string[], removed: string[], allow?: (term: string) => boolean): string {
  let out = text;
  for (const term of terms) {
    if (allow && allow(term)) continue;
    const re = phraseRegex(term);
    if (!re.test(out)) continue;
    removed.push(term);
    out = out.replace(phraseRegex(term), ' ');
  }
  return out;
}

/** Every number token in `text`, digit-normalised ('1,000' → '1000'). */
function numberTokens(text: string): string[] {
  return (text.match(NUMBER_RE) ?? []).map((n) => n.replace(/[.,]/g, ''));
}

/** Facts the caller actually supplied — the only numbers a title may carry. */
export function factText(input: TitleInput): string {
  return [
    input.sourceTitle,
    input.category ?? '',
    input.originCountry ?? '',
    input.unit ?? '',
    ...(input.spec ?? []),
    ...(input.keywords ?? []),
    input.description ?? '',
  ].join(' | ');
}

function clamp(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim();
}

function tidy(title: string): string {
  return title
    .replace(/\s*[,;:]\s*(?=[,;:])/g, '') // ', ,' → ','
    .replace(/\s*-\s*-\s*/g, ' - ') // ' - - ' → ' - '
    .replace(/^[\s,;:.!?\-]+/, '')
    .replace(/[\s,;:\-]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const TITLE_MAX = 120;

/* ==========================================================================
 * rule enforcement on a model answer
 * ========================================================================== */

export type RepairResult =
  | { ok: true; title: string; removed: string[] }
  | { ok: false; reason: string };

/**
 * Enforce the title rules on whatever a model returned. Repair what can be
 * repaired (strip, re-case, truncate) and report what was removed; refuse what
 * cannot be (an echo of the source title, an empty or letterless answer).
 */
export function repairTitle(raw: string, input: TitleInput): RepairResult {
  if (!raw || !raw.trim()) return { ok: false, reason: 'the answer was empty' };

  const removed: string[] = [];
  let text = toAscii(raw);
  // Model framing: labels, markdown, list markers, quotes, sales punctuation.
  text = text
    .replace(/^\s*(?:title|answer|result)\s*[:\-]\s*/i, ' ')
    .replace(/^[\s>*-]+/, ' ')
    .replace(/[*_`"']/g, ' ')
    .replace(/[!?]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Source brands and marketplaces: never in our title.
  text = stripTerms(text, SOURCE_BRANDS, removed);
  // Prices, money and whatever currency token the price left behind.
  if (PRICE_RE.test(text)) {
    removed.push('price');
    text = text.replace(PRICE_RE, ' ');
  }
  text = stripTerms(text, MONEY_TOKENS, removed);
  // Superlatives / unverifiable claims that the record cannot back.
  text = stripTerms(text, CLAIMS, removed);
  const specText = (input.spec ?? []).join(' ');
  text = stripTerms(text, CONDITIONAL_CLAIMS, removed, (term) => {
    const allowRe = CONDITIONAL_SPEC_RE[term];
    return Boolean(allowRe && allowRe.test(specText));
  });
  // Numbers the record does not carry are invented by definition.
  const facts = new Set(numberTokens(factText(input)));
  text = text.replace(NUMBER_RE, (token) => {
    if (facts.has(token.replace(/[.,]/g, ''))) return token;
    removed.push(`invented number "${token}"`);
    return ' ';
  });
  // Shouting and emoji (emoji already went with the non-ASCII fold).
  const deshouted = deshout(text);
  if (deshouted !== text) removed.push('ALL-CAPS');
  text = deshouted;

  text = tidy(text.replace(/\s+/g, ' '));
  if (text.length > TITLE_MAX) {
    removed.push(`text longer than ${TITLE_MAX} characters`);
    text = tidy(clamp(text, TITLE_MAX));
  }
  if (text.replace(/[^A-Za-z]/g, '').length < 3) {
    return { ok: false, reason: 'no usable wording survived the title rules' };
  }
  // An echo of the source's own string is exactly what we must not publish.
  if (normalizeForCompare(text) === normalizeForCompare(input.sourceTitle)) {
    return { ok: false, reason: 'the answer repeated the source listing title' };
  }
  // Capitalise the first letter — a title, not a sentence fragment.
  text = text.charAt(0).toUpperCase() + text.slice(1);
  return { ok: true, title: text, removed };
}

function normalizeForCompare(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Rebuild a title whose case is shouting or mangled: every all-caps run of 4+
 * letters (outside the acronym allow-list) goes lowercase, and a title that is
 * mostly capitals overall is re-cased from scratch.
 */
export function deshout(text: string): string {
  const letters = text.replace(/[^A-Za-z]/g, '');
  const uppers = text.replace(/[^A-Z]/g, '');
  const mostlyCaps = letters.length > 6 && uppers.length / letters.length > 0.5;

  return text
    .split(' ')
    .map((token) => {
      const alpha = token.replace(/[^A-Za-z]/g, '');
      if (!alpha) return token;
      const canonical = ACRONYMS.get(alpha.toLowerCase());
      if (canonical && token.toUpperCase() === token) return token.replace(alpha, canonical);
      const shouting = alpha.length >= 4 && alpha === alpha.toUpperCase();
      const forced = mostlyCaps && alpha === alpha.toUpperCase() && alpha.length >= 3 && !canonical;
      if (!shouting && !forced) return token;
      return token.replace(/[A-Za-z]+/g, (run) => {
        const c1 = ACRONYMS.get(run.toLowerCase());
        return c1 ?? run.toLowerCase();
      });
    })
    .join(' ');
}

/* ==========================================================================
 * deterministic composer — facts in, title out, nothing invented
 * ========================================================================== */

function titleCaseWord(word: string): string {
  const canonical = ACRONYMS.get(word.toLowerCase());
  if (canonical) return canonical;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/** Capitalise every word of a fact phrase — acronyms keep their canonical form. */
function titleCasePhrase(text: string): string {
  return text.split(/\s+/).filter(Boolean).map(titleCaseWord).join(' ');
}

/** Clean a fact string down to ASCII words: no marketing, no prices, no numbers. */
function factWords(sourceTitle: string): string[] {
  const removed: string[] = [];
  let t = toAscii(sourceTitle);
  t = stripTerms(t, SOURCE_BRANDS, removed);
  t = t.replace(PRICE_RE, ' ');
  t = stripTerms(t, MONEY_TOKENS, removed);
  t = stripTerms(t, CLAIMS, removed);
  t = stripTerms(t, CONDITIONAL_CLAIMS, removed);
  return t
    .split(/\s+/)
    .map((w) => w.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, ''))
    .filter((w) => w.length >= 2 && !/\d/.test(w))
    .filter((w) => !NOISE_WORDS.has(w.toLowerCase()));
}

/**
 * The product type: the head of the source title's own wording (last up to three
 * significant words, e.g. "Industrial Ice Machine"), never a marketing phrase.
 */
export function headNoun(sourceTitle: string): string {
  let t = toAscii(sourceTitle);
  // Purpose/attribute clauses are carried by `spec`, not by the type.
  t = t.split(/\b(?:for|with|used for|suitable for|applicable to|which|that)\b/i)[0];
  const words = factWords(t);
  const tail = words.slice(-3);
  if (tail.length === 0) return '';
  const head = titleCasePhrase(tail.join(' '));
  return clamp(head, 60);
}

function cleanFact(value: string): string {
  const removed: string[] = [];
  let t = toAscii(value);
  t = stripTerms(t, SOURCE_BRANDS, removed);
  t = t.replace(PRICE_RE, ' ');
  t = stripTerms(t, MONEY_TOKENS, removed);
  t = stripTerms(t, CLAIMS, removed);
  // A spec value copied in SHOUTING case is not a reason to publish a shouting
  // title: acronyms keep their canonical spelling, everything else is re-cased.
  return tidy(deshout(t));
}

function isCovered(text: string, candidate: string): boolean {
  const have = normalizeForCompare(text);
  const want = normalizeForCompare(candidate);
  return want.length > 0 && have.includes(want);
}

/**
 * The composer's attributes: the most concrete spec entries first (a value with
 * a number or a material/standard reads as more concrete than a bare word), then
 * the operator's own keywords, then the couple of weaker facts at the end.
 */
export function composerAttrs(input: TitleInput): string[] {
  const head = composeHead(input);
  const specs = (input.spec ?? []).map(cleanFact).filter((s) => s.length >= 2);
  const scored = specs
    .map((value, index) => ({ value, index, score: (/\d/.test(value) ? 2 : 0) + (/\b(steel|stainless|aluminium|aluminum|copper|brass|pvc|hdpe|pp|abs|grade|finish|mm|kw|kg|ton|hp)\b/i.test(value) ? 1 : 0) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((s) => s.value);

  const keywords = (input.keywords ?? []).map(cleanFact).filter((k) => k.length >= 2);
  const category = input.category ? cleanFact(input.category) : '';
  const unit = input.unit ? cleanFact(input.unit) : '';

  const attrs: string[] = [];
  const consider = (value: string) => {
    if (!value || attrs.length >= 4) return;
    // Covered by the type or by an attribute already chosen — adding it again
    // would only repeat a fact the title already carries.
    if (isCovered([head, ...attrs].join(' '), value)) return;
    attrs.push(value);
  };
  // Two concrete specs, then the operator's terms. The category is the type of
  // last resort: it joins the title only when the record carries nothing more
  // specific, so a well-described import does not spend characters on a label
  // the listing already carries in its own `category` field.
  scored.slice(0, 2).forEach(consider);
  keywords.slice(0, 2).forEach(consider);
  if (attrs.length === 0) consider(category);
  if (attrs.length === 0) consider(unit);
  return attrs;
}

export interface ComposedTitle {
  title: string;
  head: string;
  attrs: string[];
  origin: string;
}

/**
 * The title's product type. The source title's own head noun when it names
 * something ("Industrial Ice Machine"); the record's category when the head is
 * empty or a bare generic word ("Machine"); a neutral, fact-free phrase when the
 * record carries neither. No fact is ever invented here.
 */
function composeHead(input: TitleInput): string {
  const category = input.category ? cleanFact(input.category) : '';
  let head = headNoun(input.sourceTitle);
  if (GENERIC_HEADS.has(head.toLowerCase()) && category) head = '';
  if (!head && category) head = clamp(titleCasePhrase(category), 60);
  return head || 'Industrial supply';
}

/** The deterministic title: head — attrs — origin supply, trimmed to fit. */
export function compose(input: TitleInput): ComposedTitle {
  const origin = input.originCountry ? cleanFact(input.originCountry) : '';
  const head = composeHead(input);
  const all = composerAttrs(input);
  const render = (attrs: string[]): string => {
    const parts = [head];
    if (attrs.length > 0) parts.push(attrs.join(', '));
    // ASCII separator only: the title rules are ASCII-safe (the em dash a human
    // would type here is not).
    const body = parts.join(' - ');
    return origin ? `${body} - ${origin} supply` : body;
  };

  let attrs = all;
  let title = tidy(render(attrs));
  while (title.length > TITLE_MAX && attrs.length > 0) {
    attrs = attrs.slice(0, -1);
    title = tidy(render(attrs));
  }
  if (title.length > TITLE_MAX) title = tidy(clamp(title, TITLE_MAX));
  return { title: deshout(title), head, attrs, origin };
}

/** Shorthand for the composer's title string (the fallback answer). */
export function composeTitle(input: TitleInput): string {
  return compose(input).title;
}

/**
 * What we probe the catalogue with: the head noun plus the first attribute
 * token. Long enough to be specific, short enough to match a row whose name has
 * been reworded — the same ILIKE '%term%' shape GET /api/products uses.
 */
export function catalogueProbe(input: TitleInput): string {
  // The head the composer actually used, so the probe always has something to
  // compare even when the source title is unusable on its own.
  const head = compose(input).head;
  const firstAttr = composerAttrs(input)[0] ?? '';
  const firstToken = firstAttr.split(/\s+/)[0] ?? '';
  const probe = [head, firstToken].filter(Boolean).join(' ').trim();
  return probe.length >= 3 ? clamp(probe, 60) : '';
}

/* ==========================================================================
 * catalogue uniqueness
 * ========================================================================== */

export interface CatalogueCandidate {
  id: number;
  name: string;
}

export interface CatalogueLookup {
  /** Existing names that look like `probe` (ILIKE %probe%). */
  byNameProbe(probe: string): Promise<CatalogueCandidate[]>;
  /** The listing whose name equals `name` (case-insensitive), if any. */
  byExactName(name: string): Promise<CatalogueCandidate | null>;
}

/** `%` and `_` are wildcards in LIKE — escape them out of a caller-side probe. */
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (m) => `\\${m}`);
}

export const dbCatalogue: CatalogueLookup = {
  async byNameProbe(probe: string): Promise<CatalogueCandidate[]> {
    if (probe.trim().length < 3) return [];
    const rows = await db
      .select({ id: products.id, name: products.name })
      .from(products)
      .where(ilike(products.name, `%${escapeLike(probe)}%`))
      .orderBy(sql`length(${products.name}) asc, ${products.id} asc`)
      .limit(8);
    return rows.map((r) => ({ id: toNum(r.id), name: String(r.name) }));
  },

  async byExactName(name: string): Promise<CatalogueCandidate | null> {
    if (name.trim().length < 2) return null;
    const rows = await db
      .select({ id: products.id, name: products.name })
      .from(products)
      .where(ilike(products.name, escapeLike(name)))
      .limit(1);
    const row = rows[0];
    return row ? { id: toNum(row.id), name: String(row.name) } : null;
  },
};

/** Share of our own significant words that the candidate name also carries. */
function tokenOverlap(a: string, b: string): number {
  const tokens = (text: string) =>
    new Set(normalizeForCompare(text).split(' ').filter((t) => t.length >= 2));
  const mine = tokens(a);
  const theirs = tokens(b);
  if (mine.size === 0) return 0;
  let hit = 0;
  for (const t of mine) if (theirs.has(t)) hit += 1;
  return hit / mine.size;
}

/** Pick the row that is genuinely near-identical, or null. */
function bestMatch(rows: CatalogueCandidate[], title: string, probe: string): CatalogueCandidate | null {
  const scored = rows
    .map((row) => {
      const overlap = tokenOverlap(title, row.name);
      const probeHit = normalizeForCompare(row.name).includes(normalizeForCompare(probe));
      return { row, overlap, probeHit };
    })
    .filter((s) => s.probeHit || s.overlap >= 0.5)
    .sort((a, b) => b.overlap - a.overlap || a.row.name.length - b.row.name.length);
  return scored[0]?.row ?? null;
}

/** Facts that can distinguish our title from a near-identical existing name. */
function distinguishingTokens(input: TitleInput, title: string): { label: string; token: string }[] {
  const out: { label: string; token: string }[] = [];
  const push = (label: string, token: string) => {
    const clean = cleanFact(token);
    if (clean.length >= 2 && !isCovered(title, clean)) out.push({ label, token: clean });
  };
  for (const spec of (input.spec ?? []).slice().sort((a, b) => (/\d/.test(b) ? 1 : 0) - (/\d/.test(a) ? 1 : 0))) push('spec', spec);
  for (const keyword of input.keywords ?? []) push('keyword', keyword);
  if (input.originCountry) push('origin', input.originCountry);
  if (input.unit) push('unit', input.unit);
  return out;
}

/** Insert a distinguishing token into (or after) a title, before the origin clause. */
function withDistinguishing(title: string, token: string): string {
  const tail = / - [^-]+ supply$/.exec(title);
  const merged = tail
    ? `${title.slice(0, tail.index)}, ${token}${tail[0]}`
    : `${title}, ${token}`;
  return tidy(clamp(merged, TITLE_MAX));
}

interface UniqueResult {
  title: string;
  unique: boolean;
  duplicateOf: number | null;
  note: string;
}

/**
 * Compare our title against the catalogue before answering. A collision is
 * reported either way; the title is only called `unique` once it really is.
 */
export async function ensureUnique(
  title: string,
  input: TitleInput,
  lookup: CatalogueLookup = dbCatalogue,
): Promise<UniqueResult> {
  const probe = catalogueProbe(input);
  let candidates: CatalogueCandidate[];
  try {
    candidates = probe ? await lookup.byNameProbe(probe) : [];
  } catch (err) {
    console.warn('[title] catalogue probe failed:', err instanceof Error ? err.message : String(err));
    return {
      title,
      unique: false,
      duplicateOf: null,
      note: 'The catalogue check could not run — uniqueness is unverified.',
    };
  }

  const match = bestMatch(candidates, title, probe);
  if (!match) return { title, unique: true, duplicateOf: null, note: '' };

  const tokens = distinguishingTokens(input, title);
  for (const { label, token } of tokens) {
    const candidate = withDistinguishing(title, token);
    if (candidate === title) continue;
    try {
      const clash = await lookup.byExactName(candidate);
      if (!clash) {
        return {
          title: candidate,
          unique: true,
          duplicateOf: match.id,
          note: `Catalogue listing #${match.id} has a near-identical name — added the ${label} "${token}" to stay distinct.`,
        };
      }
    } catch (err) {
      console.warn('[title] catalogue exact-name check failed:', err instanceof Error ? err.message : String(err));
    }
  }

  return {
    title,
    unique: false,
    duplicateOf: match.id,
    note: `Catalogue listing #${match.id} already uses a near-identical name and no unused fact could distinguish this title.`,
  };
}

/* ==========================================================================
 * AI engine
 * ========================================================================== */

const SYSTEM_PROMPT = [
  'You write product titles for FactoryDepo, a B2B industrial marketplace.',
  'You are given FACTS about one imported listing and you reply with ONE title.',
  'Hard rules:',
  '- 6 to 14 words, at most 120 characters, ONE line, plain ASCII, no emoji, no exclamation marks.',
  '- Write OUR OWN wording. Never copy or lightly reword the source page, and never name a marketplace or a brand (Alibaba, AliExpress, Made-in-China, IndiaMART, DHgate, Global Sources, 1688, Taobao, Amazon, eBay, ...).',
  '- Only what the FACTS say: no invented number, capacity, size, grade, certificate, standard or price.',
  '- No superlatives or unverifiable claims (best, #1, cheapest, top/high quality, premium, 100%, guarantee, certified, ISO, CE, FDA, RoHS) unless the FACTS block lists that exact standard.',
  '- No price, currency, MOQ or shipping terms.',
  '- Shape: "<product type> - <up to 3 distinguishing facts> - <origin> supply".',
  'Reply with the title text only: no quotes, no labels, no explanation.',
].join('\n');

/** What we hand the model: cleaned facts of the record, never marketing copy. */
function promptFacts(input: TitleInput): string[] {
  const lines: string[] = [];
  const cleanedSource = cleanFact(input.sourceTitle);
  lines.push(`- Product type words (marketing copy already stripped; use them to identify WHAT the product is, do not reuse the wording): ${cleanedSource || '(none)'}`);
  if (input.category) lines.push(`- Category: ${cleanFact(input.category)}`);
  if (input.originCountry) lines.push(`- Origin country: ${cleanFact(input.originCountry)}`);
  if (input.unit) lines.push(`- Unit of sale: ${cleanFact(input.unit)}`);
  const spec = (input.spec ?? []).map(cleanFact).filter(Boolean);
  if (spec.length) lines.push(`- Spec: ${spec.join(' | ')}`);
  const keywords = (input.keywords ?? []).map(cleanFact).filter(Boolean);
  if (keywords.length) lines.push(`- Terms the operator wants findable in our search: ${keywords.join(' | ')}`);
  return lines;
}

export interface ProviderAnswer {
  ok: boolean;
  raw?: string;
  reason?: string;
}

/** The OpenAI-compatible call. Never throws — a failure is a reason string. */
export async function callProvider(
  input: TitleInput,
  cfg: { key: string; baseUrl: string; model: string; timeoutMs: number },
  variant: number,
  fetchImpl: typeof fetch = fetch,
): Promise<ProviderAnswer> {
  const candidate = variant + 1;
  const ask =
    variant === 0
      ? 'Write candidate #1.'
      : `Write candidate #${candidate}: a noticeably different phrasing from candidate #1 (different word order, different attribute emphasis), for a title the operator wants to re-generate.`;
  const user = ['FACTS:', ...promptFacts(input), '', ask].join('\n');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const res = await fetchImpl(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` },
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: user },
        ],
        temperature: 0.4,
        max_tokens: 80,
        n: 1,
        stream: false,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, reason: `the AI provider answered HTTP ${res.status}` };
    const data = (await res.json()) as { choices?: { message?: { content?: unknown }; text?: unknown }[] };
    const first = data?.choices?.[0];
    const content = first?.message?.content ?? first?.text;
    if (typeof content !== 'string' || content.trim().length === 0) {
      return { ok: false, reason: 'the AI provider returned no usable title' };
    }
    return { ok: true, raw: content };
  } catch (err) {
    if (controller.signal.aborted) return { ok: false, reason: `the AI provider timed out after ${cfg.timeoutMs} ms` };
    const code = (err as { cause?: { code?: unknown }; code?: unknown })?.cause ?? err;
    const detail = typeof (code as { code?: unknown })?.code === 'string' ? String((code as { code?: string }).code) : 'fetch failed';
    return { ok: false, reason: `the AI provider is unreachable (${detail})` };
  } finally {
    clearTimeout(timer);
  }
}

export interface GenerateOptions {
  /** Injectable for tests: a fake catalogue, or a fake network. */
  lookup?: CatalogueLookup;
  fetchImpl?: typeof fetch;
}

/**
 * The one entry point the route uses. Always resolves with a contract-shaped
 * answer: AI when configured and usable, the deterministic composer otherwise,
 * with `note` naming the engine and the real reason in one clause.
 */
export async function generateTitle(input: TitleInput, opts: GenerateOptions = {}): Promise<GeneratedTitle> {
  const variant = input.variant ?? 0;
  const key = aiKey();
  const composed = compose(input);

  let title = composed.title;
  let engine: GeneratedTitle['engine'] = 'fallback';
  const clauses: string[] = [];

  if (!key) {
    clauses.push("No AI key is configured — the title was composed from the record's own fields.");
  } else {
    const cfg = { key, baseUrl: aiBaseUrl(), model: aiModel(), timeoutMs: aiTimeoutMs() };
    const answer = await callProvider(input, cfg, variant, opts.fetchImpl ?? fetch);
    if (!answer.ok) {
      clauses.push(`${capitalize(answer.reason ?? 'the AI provider failed')} — the title was composed from the record's own fields.`);
      console.warn(`[title] AI engine unavailable: ${answer.reason ?? 'unknown reason'}`);
    } else {
      const repaired = repairTitle(answer.raw ?? '', input);
      if (!repaired.ok) {
        clauses.push(`${capitalize(repaired.reason)} — the title was composed from the record's own fields.`);
      } else {
        title = repaired.title;
        engine = 'ai';
        clauses.push(`AI title (candidate #${variant + 1}).`);
        if (repaired.removed.length > 0) {
          clauses.push(`Removed wording the rules forbid: ${repaired.removed.join(', ')}.`);
        }
      }
    }
  }

  const unique = await ensureUnique(title, input, opts.lookup ?? dbCatalogue);
  title = unique.title;
  if (unique.note) clauses.push(unique.note);

  return {
    title,
    engine,
    unique: unique.unique,
    duplicateOf: unique.duplicateOf,
    note: clamp(clauses.join(' '), 300),
  };
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
