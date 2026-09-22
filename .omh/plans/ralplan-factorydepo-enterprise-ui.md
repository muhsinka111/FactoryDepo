# RALPLAN — FactoryDepo: enterprise-grade B2B UI (product page · landing · 3 dashboards)

**Created:** 2026-09-22
**Worktree:** `C:\Users\Hp\FactoryDepo\.worktrees\design` (branch `design`, == origin/main)
**Driver:** Hermes (omh-autopilot/omh-ralph discipline; the `omh_state` plugin tool is NOT loaded in this
profile, so state lives in `.omh/state/enterprise-ui.json` via plain file writes and evidence is gathered
with terminal commands instead of `omh_gather_evidence`.)

## Goal (owner's request, verbatim intent)

> Fix UI design — make it look like a real Alibaba-style B2B marketplace. Product listing page with ALL
> product detail: images, FAQ, ask seller a question, request quotation, contact seller. Same bar for the
> landing page and all three role dashboards (buyer / supplier / admin). Professional, enterprise level,
> previewed before deploy.

Current state (verified by screenshots on 2026-09-22): the app is *clean but thin* — the product page has
a single image, 4 spec rows, a buy box and a supplier card, with **no FAQ, no ask-a-question, no contact
seller, no company/trade detail**; the landing is a long marketing page; dashboards are card grids and
plain tables with lots of dead space.

## Hard constraints (must survive review)

1. `artifacts/web/src/styles.css` is the **design authority** (navy/gold, `--r:8px`, dense). New CSS goes in
   `artifacts/web/src/styles/enterprise.css`, which imports nothing and only adds classes; do not restyle
   existing classes or change tokens.
2. **Honesty rules** (AGENTS.md): never render a number the API did not supply — print `—`. Any row with
   `dataSource === 'demo'` keeps `<DemoTag />`. A nav destination without a feature stays `ComingSoon`.
3. **i18n**: `en` is the source of truth for `DictKey`; `tr` must be filled. `ar/ru/zh/es` may fall back to
   English. Only the driver edits `i18n.tsx` after T2 lands (single-writer rule).
4. **Gates before "done"**: `pnpm run typecheck`, `pnpm run build`, api tests with
   `TEST_BASE_URL=http://localhost:9095`, and a **CDP DOM probe in real Chrome** (a UI change is not done
   until clicked).
5. No model names / agent codenames in UI.

## Environment (already running, verified)

- API (this worktree, prod-like): `http://localhost:9095` — started from
  `artifacts/api-server` with `node dist/index.mjs`; serves `/api/*` + `web/dist`.
- Web dev server: `http://localhost:5180` (`npx vite --port 5180`, proxies `/api/` → `:9095`,
  `VITE_PROXY_TARGET`-overridable — already patched in `vite.config.ts`).
- Accounts (password `factorydepo`): `demo@factorydepo.com` (admin), `supplier@factorydepo.com`,
  `buyer@factorydepo.com`. Token in `localStorage.fd_token`.
- Screenshot/probe helper: `%LOCALAPPDATA%/Temp/fd-shot.mjs` (CDP, `--probe=`, `--token=`).
- Do NOT touch ports 8080/8081/5173/9091 — another app and the user's other projects own them.

## File ownership map (parallel safety)

| Area | Files | Owner |
|---|---|---|
| API/contracts | `lib/db/**`, `lib/api-zod/**`, `lib/api-spec/**`, `api-client-react/**`, `artifacts/api-server/**` | T1 |
| i18n | `artifacts/web/src/i18n.tsx` | T2 (then driver) |
| Landing | `artifacts/landing/**` | T3 |
| Shared UI foundation | `src/styles/enterprise.css`, `src/dash.tsx`, `src/main.tsx` | driver |
| Product page | `src/pages/ProductDetail.tsx`, `src/pages/ProductQa.tsx` | T5 |
| Buyer pages | `src/pages/Orders.tsx`, `Offers.tsx`, `Messages.tsx`, `Saved.tsx` | T6 |
| Supplier pages | `src/pages/SupplierListings.tsx`, `SupplierOffers.tsx`, `SupplierPost.tsx` | T7 |
| Admin pages | `src/pages/AdminOverview.tsx`, `AdminListings.tsx` | T8 |

---

## T1 — Product Q&A API ("ask seller a question") + contact-seller plumbing

**Deliverable** — a real, moderated Q&A feature so the product page can show an FAQ built from actual
buyer questions, plus the contract the contact-seller form reuses.

1. `lib/db/migrations/021_product_questions.sql` — idempotent (copy the `DO $mig$ … IF EXISTS (SELECT 1
   FROM "_migrations" WHERE filename=…) THEN RAISE NOTICE … RETURN; END IF; … END $mig$` guard from
   `016`/`017`). Table `product_questions`:
   `id serial pk, "productId" int not null references products(id) on delete cascade, "askerId" int not
   null references users(id), "askerName" text not null, question text not null, answer text,
   "answeredById" int references users(id), "answeredByName" text, "answeredAt" timestamptz,
   status text not null default 'pending' (pending|answered|hidden), "dataSource" text not null default
   'platform', "createdAt" timestamptz default now()`. Index on `("productId", status, "createdAt")`.
2. `lib/db/src/schema/index.ts` — drizzle table `productQuestions` matching it.
3. `lib/api-zod/src/index.ts` — `zProductQuestion`, `zProductQuestionList`, `zCreateProductQuestionInput`
   (`question` 10..1000 chars), `zAnswerProductQuestionInput` (`answer` 2..4000), `zModerateQuestionInput`
   (`status: 'answered' | 'hidden'`).
4. Routes in `artifacts/api-server/src/routes/products.ts`:
   - `GET /api/products/:id/questions` — **public**. Returns visible rows only: `status='answered'`, plus
     the caller's own `pending` rows when a valid token is present, plus everything pending/hidden when the
     caller is the owning supplier or an admin. Newest first, cap 100. Shape `{items, total}`.
   - `POST /api/products/:id/questions` — `requireAuth`. Snapshots `askerName` from the caller's user row.
     Always writes `dataSource='platform'`, `status='pending'`. 201 with the created row. 404 unknown
     product.
   - `POST /api/products/:id/questions/:qid/answer` — `requireAuth`; allowed for the product's owning
     supplier or an admin only → otherwise **403**. Sets answer/answeredById/answeredByName/answeredAt and
     `status='answered'`.
5. `artifacts/api-server/src/routes/admin.ts` — `GET /api/admin/questions` (list all, newest first, with
   product name) and `PATCH /api/admin/questions/:id` (moderation: answered|hidden).
6. `lib/api-spec/src/index.ts` — mirror the rows (method/path/input/output/auth).
7. `lib/api-client-react/src/index.ts` — `useProductQuestions(productId)`,
   `useAskProductQuestion(productId)`, `useAnswerProductQuestion(productId)`, `useAdminQuestions()`,
   `useModerateQuestion()`.
8. `artifacts/api-server/test/questions.test.ts` — node:test, same `call()`/`register()` shape as
   `test/api.test.ts`, skipped unless `TEST_BASE_URL` set.

**Acceptance (must be proven in the report)**
- `pnpm run typecheck` clean.
- `TEST_BASE_URL=http://localhost:9095 pnpm --filter @workspace/api-server run test` → all pass, new file
  included (report the test count).
- curl transcript proving: anonymous POST → 401; buyer question → 201 pending; public GET (anonymous) does
  NOT contain the pending row; owning supplier answers → 200; anonymous GET now contains it with the
  answer; a *different* supplier answering → 403.
- A buyer can never answer their own question (403).

## T2 — i18n keys for the new UI (single writer, runs before the UI tasks)

**Owns:** `artifacts/web/src/i18n.tsx` only. Add every key below to `en` (source of truth) **and** `tr`.
Leave `ar/ru/zh/es` untouched — `t()` already falls back to English.

**Product page (`pd.*`)** — breadcrumb/sections/gallery/build:

```
pd.home, pd.browse, pd.allCategories, pd.gallery, pd.photoCount, pd.zoomHint, pd.noPhotoYet,
pd.keyFacts, pd.listedOn, pd.daysOnSite, pd.refresh, pd.share, pd.copiedLink, pd.reportListing,
pd.buyBox, pd.unitPrice, pd.qty, pd.lineTotal, pd.inStock, pd.lowStock, pd.outOfStockNow,
pd.requestQuotation, pd.contactSeller, pd.askQuestion, pd.sampleRequest, pd.tradeTerms, pd.leadTime,
pd.packaging, pd.paymentTerms, pd.supplyAbilityT, pd.portOfLoading, pd.notProvided, pd.tabsOverview,
pd.tabsSpecs, pd.tabsFaq, pd.tabsSupplier, pd.descriptionH, pd.specsH, pd.faqH, pd.faqIntro,
pd.faqEmpty, pd.faqAskCta, pd.sellerAnswer, pd.awaitingAnswer, pd.yourQuestion, pd.questionPlaceholder,
pd.submitQuestion, pd.questionSent, pd.signInToAsk, pd.companyProfile, pd.businessType, pd.yearFounded,
pd.employees, pd.factoryArea, pd.mainMarkets, pd.certificates, pd.responseTime, pd.annualOutput,
pd.moreFromSupplier, pd.similarProducts, pd.viewStore, pd.allFromSupplier, pd.trustVerified,
pd.trustInspected, pd.trustEscrow, pd.trustLogistics, pd.statsTitle, pd.viewsCount, pd.offersCount,
pd.ordersCount, pd.savedCount, pd.contactTitle, pd.contactIntro, pd.contactTarget, pd.contactQty,
pd.contactMessage, pd.contactSend, pd.contactSent, pd.contactSentBody, pd.cancel, pd.close,
pd.specEmpty, pd.supplierNoStats, pd.buyNowHeading, pd.shipsFromNote, pd.mobileBuy, pd.mobileQuote
```

**Dashboards (`dash.*`)**:

```
dash.overview, dash.kpis, dash.toolbar, dash.searchPlaceholder, dash.sortBy, dash.sortNewest,
dash.sortOldest, dash.sortPriceHigh, dash.sortPriceLow, dash.page, dash.prev, dash.next, dash.showing,
dash.rowsTotal, dash.clearFilters, dash.filters, dash.noResults, dash.noResultsBody, dash.resetView,
dash.exportCsv, dash.selected, dash.bulkActions, dash.markDone, dash.lastUpdated, dash.quickActions,
dash.needsAttention, dash.allClear, dash.recentActivity, dash.noActivity, dash.completionPct,
dash.openDetail, dash.timeToRespond, dash.avgOrderValue, dash.viewAll, dash.counts, dash.perListing,
dash.stockValue, dash.daysLive, dash.answered, dash.pending, dash.hidden, dash.answer,
dash.answerPlaceholder, dash.submitAnswer
```

**Acceptance:** `pnpm run typecheck` clean (this proves every key exists and none collides); report the
exact number of keys added to `en` and `tr`; no key added twice inside a dictionary (grep check).

## T3 — Landing page: enterprise B2B upgrade

**Owns:** `artifacts/landing/variants/marketplace-light.html` (served at the site root) and
`artifacts/landing/index.html` if it needs the same head/link fixes. Self-contained: the file's own CSS
only, no webfonts, light theme, six languages already wired — keep them working.

**Deliverable**
- Above-the-fold: enterprise hero (headline + subhead + dual CTA `Explore ready stock` / `Post your
  surplus`), a live-stats strip fed by the API (falls back to `—`, never an invented number), and a
  trust row (verified suppliers / inspection / escrow / container logistics) with inline SVG icons.
- A `Browse by category` index (live counts from `/api/products/categories` where available).
- `Surplus & ready stock` grid from the live feed (`/api/products?hasItem…`) with the existing fallback
  chain; cards show price, MOQ, origin, supplier, `Demo` tag where `dataSource==='demo'`.
- An **RFQ / request-a-quotation** section that explains the flow in 3 steps and links to `/rfqs`.
- A **FAQ** accordion (5–7 questions) with honest answers.
- A footer with working links to every real route (`/explore`, `/categories`, `/suppliers`, `/rfqs`,
  `/feed`, `/help`, `/sign-in`) — no dead `#` links.
- Responsive: no horizontal scroll at 390px; sections stack.
- All prices/counts fetched, never hard-coded to a stale total.

**Acceptance:** Python `html.parser` balance check passes; served over a static server and captured at
1440×1100 and 390×900 with `--virtual-time-budget` so live sections render; the probe confirms zero
`href="#"` links and zero placeholder text like `Lorem`; screenshot shows populated cards.

## T4 — Shared UI foundation (driver-owned, before phase B)

`artifacts/web/src/styles/enterprise.css` (imported from `main.tsx` after `styles.css`) providing:
breadcrumbs (`.crumb`), compact KPI strip (`.kpirow`, `.kpi`, `.kpi .v/.l/.d`), pro table
(`.tblwrap`, `.tbl`, `.tbl thead th`, `.tbl td.num`, `.tbl tbody tr:hover`), toolbar (`.toolbar`),
pager (`.pager`), empty state (`.emptystate`), tab strip (`.tabs`, `.tab.on`), gallery (`.pdimg`,
`.pdthumbs`, zoom), price panel (`.pbox`, `.pbox .price`, `.qtyrow`, `.line-total`), supplier capability
rows (`.cap`), Q&A list (`.qa`, `.qa-item`, `.qa-q`, `.qa-a`, `.qa-meta`, `.qa-form`), trust rows
(`.trustrow`), section header (`.sechead`), mobile sticky bar (`.mobar`), timeline (`.tl`, `.tl-item`),
attention list (`.attn`), plus `@media (max-width: 900px)` stacking.
`artifacts/web/src/dash.tsx`: `Kpi`, `KpiRow`, `Toolbar`, `Pager`, `EmptyState`, `TabStrip`, `TableShell`,
`SectionCard` — typed, no data fetching, no invented numbers.

## T5 — Product detail page (Alibaba-style), the centrepiece

**Owns:** `src/pages/ProductDetail.tsx`, new `src/pages/ProductQa.tsx`.
**Consumes:** T1 hooks, T2 keys, T4 classes/components.

Layout, top to bottom:
1. Breadcrumb: `Home › {category} › {name}` (links to `/` and `/explore?category=`).
2. Two-column top: left = image gallery (large image, hover zoom, thumbnail rail; when the API returns a
   single image the rail states the real count and never repeats a fake second view), key-facts strip
   (price/unit, MOQ, available, listing type, origin, category, listed-on date from `createdAt`).
3. Right = sticky buy box: price, unit, MOQ, live quantity stepper with inline line total, `Buy Now`
   (existing checkout modal), `Request Quotation` (existing RFQ modal), `Contact Seller` (new modal →
   `POST /api/messages` thread with the listing as subject), `Ask a question` (scrolls to / opens the Q&A
   composer), trust rows (verified, inspection, escrow, logistics) — badges only where the API supplies
   the underlying fact.
4. Supplier panel: name, origin, verified level, `<DemoTag/>` when demo, real stats only (rating,
   inspections, on-time, years active render `—` when absent), `Visit store` + `All products`.
5. Tab strip: **Overview** (description + key specs), **Specifications** (full spec table incl. every
   field the API returns; `pd.notProvided` when empty), **FAQ** (product Q&A from T1 + platform FAQs when
   present), **Supplier** (company profile rows).
6. `Ask seller a question` block: composer (auth-gated via `requireAuthGate`), list of answered Q&A with
   asker name, relative date, seller answer; supplier-viewer sees an answer box for pending questions;
   empty state invites the first question.
7. Rails: `More from this supplier` (real, `products?supplierId=`) and `Similar products` (category).
8. Mobile (≤900px): sticky bottom action bar with price + `Buy now` / `Request quotation`.

**Acceptance**
- CDP probe (real Chrome, `fd-shot.mjs --probe=`) asserts: breadcrumb link count ≥ 2; gallery image
  exists; quantity stepper changes the rendered line total; `Contact Seller` opens a modal with a name
  field; `Ask a question` composer exists; tabs switch content (probe reads the active tab label and the
  panel's first 60 chars); `More from this supplier` renders ≥ 1 card for a supplier with several
  listings; the page contains none of the strings `NaN`, `undefined`, `$0.00` for a demo listing with
  missing data.
- Screenshots at 1440×1100 and 390×900.
- `pnpm run typecheck` + `pnpm run build` clean.
- As a signed-in supplier who owns the listing, the pending-question answer box appears (probe with that
  account's token).

## T6 / T7 / T8 — the three dashboards (one executor each, distinct files)

Shared bar: every page opens with `PageHeader` (title, one-line honest subtitle, primary action),
then a `KpiRow` of **real** metrics, then a `Toolbar` (search / filters / sort / export where the data
supports it), then a dense table or card list with status chips, then a `Pager` or honest empty state.

- **T6 buyer** (`Orders`, `Offers`, `Messages`, `Saved`): order table with status chips + totals, offer
  list with counterparty and counter actions, inbox with unread state and thread pane, saved-lots grid;
  empty states that link to `/explore`.
- **T7 supplier** (`SupplierListings`, `SupplierOffers`, `SupplierPost`): listings table gains stock value
  (price × quantity, real arithmetic), per-listing views when the API supplies `totalViews`, quick filters
  by status/type, bulk-ish row actions; offers page shows inbound offers with accept/counter/reject and
  the buyer's target; post page becomes a stepped form with validation feedback.
- **T8 admin** (`AdminOverview`, `AdminListings`): overview keeps the honest KPI groups but gains a
  needs-attention strip (pending payments/docs/reports — real counts only), a recent-activity timeline
  built from existing endpoints, and tighter tables; the listings page gains a moderation toolbar
  (filter by dataSource/status, sort, page size) and row actions.

**Acceptance (each)**: CDP probe with the matching account token proves the page renders its KPI values
(not `—` where the API has data), the primary action is present, and the table/first row exists;
screenshot; `pnpm run typecheck` clean; no invented metric (probe asserts the page text does not contain
`NaN`/`undefined`).

## Phase D — verification & preview (driver)

1. Full gates: `pnpm run typecheck`, `pnpm run build`,
   `TEST_BASE_URL=http://localhost:9095 pnpm --filter @workspace/api-server run test`,
   `curl /api/healthz`, `bash scripts/where-are-we.sh`.
2. `node scripts/ui_smoke.mjs` when it exists (asserts the brand marker per route).
3. Preview pack for the owner: product page (desktop + mobile), landing (desktop + mobile), buyer /
   supplier / admin dashboards — screenshots delivered in chat as `MEDIA:` paths, plus the live local URLs
   (`http://localhost:5180/...`) opened in the preview pane.
4. Architect review over the change set (delegate, read-only) before declaring complete; any
   REQUEST_CHANGES becomes a new task in this plan.

## Rollback / safety

- Nothing is pushed or deployed by this plan. The design worktree is clean at start; each task commits
  only its own files (explicit `git add`, no `-A`).
- Local DB gets migration 021 (idempotent, additive) — no destructive SQL anywhere.
