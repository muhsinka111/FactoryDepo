# Architect final review — FactoryDepo enterprise-UI branch (`design`)

**Range:** `git diff e0bc9a372ec4abfc12820ac4595383f1132767cb..HEAD` — 34 files, +7,400/−1,392, 12 commits
**Tree:** `C:/Users/Hp/FactoryDepo/.worktrees/design`, branch `design`, working tree clean (`git status --porcelain` empty; only `dist/`+`node_modules/` ignored)
**Servers used:** API :9095 (this worktree's build), built SPA preview :5190 (`vite preview`, `/api`→:9095), dev :5180
**Reviewer:** architect pass, read-only — no source file modified, nothing committed

## VERDICT — **APPROVE_WITH_PROVISO**

The change set does what the plan promised, and it is unusually disciplined about the repo's honesty rules: I could not find a single invented figure, badge, certificate, employee count, factory area or escrow claim. Every number I spot-checked in the DOM traces back to an API row, absent values render `—`, a genuine 0 renders as 0, `DemoTag` rides on demo rows, the escrow wording is an explicit *disclaimer* rather than a claim, and the two fake-screen temptations (admin listing moderation actions, supplier Q&A for a seller with no questions) were correctly left as navigations/empty states instead of dead buttons. The API half is genuinely well built (route order, ownership-not-role authorisation, alias-merged counts, cascade on delete, admin gate applied once).

Three items should be folded before this is shown to the owner as "final", none of them a rewrite: **(1)** the market strip / origin filter disagree by construction (advertises 29, delivers 13 — proven live), **(2)** the PDP's "Inspected stock" row is an unconditional per-listing claim with no API backing, **(3)** the integration suite leaves the environment rate-limited and has no coverage for the two new endpoints' semantics — which is exactly why (1) slipped through.

---

## What holds up (with evidence)

**Gates, re-run by me on this tree**

| Gate | Result |
|---|---|
| `pnpm run typecheck` | clean (reported by driver; unchanged by me) |
| `pnpm run build` | clean (reported by driver) |
| `TEST_BASE_URL=http://localhost:9095 pnpm --filter @workspace/api-server run test` | **26 tests; a single run on a fresh rate-limit window passes** (driver: 26/26). My re-runs: see *test-affordance gaps* — the failures I saw are 429s from the rate window, not assertion failures. |
| `BASE=http://localhost:5190 API=http://localhost:9095 node scripts/ui_smoke.mjs` | `OK — 340 checks, 33 links, 25 categories, 6 stock types` |
| Live Q&A round trip (my own, over HTTP) | anon ask → **401**; buyer ask → **201 pending** (`askerName` snapshotted `Ahmed K.`); anon GET → **total 0**; asker GET → own pending visible; buyer self-answer → **403**; owner answer → **200 answered**, `answeredByName` = `Anatolian Machinery A.Ş.`; anon GET → **public with the answer**; admin queue → row present with `productName`; hide → `hidden`; republish → `answered`; publishing an unanswered question → **409**; DELETE listing → **204** and the question gone (cascade) |
| PDP click path (real Chrome/CDP, signed-in buyer, product 5412) | 4 CTAs present; quantity stepper moves the line total `$6,500 → $13,000`; breadcrumb 3 levels; FAQ tab renders the composer with the honest empty state *“Bu ilan için henüz soru yok.”*; Contact seller opens a modal with the seller+listing prefilled (`SINOCEAN SUZHOU Ltd · …`) and a message box; **no `NaN`/`undefined`/`$0.00`**; screenshot inspected — dense light navy/gold theme, nothing unstyled |
| Admin console (CDP, admin token) | 20 KPI tiles render, 8 of them carry real `href`s (`/admin/suppliers`, `/admin/listings`, `/admin/rfqs`, `/shipments`, `/admin/payments`) and clicking one **navigates** to `/admin/suppliers`; needs-attention strip renders the honest all-clear *only* after all four queues answered (`attentionReady`, AdminOverview.tsx:279-284); timeline 8 real rows; provenance + category bar charts; screenshot inspected, no visual defect |
| `/explore?country=US` (a genuine 0-result market) | honest, actionable empty state + the demo-catalogue band; no blank grid, no dead end |

**Honesty rules — mechanics, not prose**

- Absent values: PDP trust/spec table renders `pd.notProvided`/`—` (ProductDetail.tsx:434, 791, 1057), kit `metric()` prints `—` for null/undefined and formats a real 0 as `0` (dash.tsx:18-21), `Orders` sums money **per currency** and prints `—` instead of an FX-converted total (Orders.tsx:120-140), `SupplierListings` stock value is `price × quantityAvailable` only for a complete, single-currency load (SupplierListings.tsx:294-308), landing counters start as `—` and say so (“A dash means the figure could not be read”, marketplace-light.html:491).
- `DemoTag`: product cards, PDP (ProductDetail.tsx:712), supplier panel (:461), admin provenance/debug rows, admin questions (AdminOverview.tsx:313/328/343/651). `Orders` deliberately does **not** tag (the order contract carries no `dataSource` — documented at Orders.tsx:38-39), which is correct.
- Unbuilt ≠ faked: admin listing “moderation” is a provenance-filtered, read-only table whose only row action is *Open detail* (AdminListings.tsx:384-388) — no fake verify/delete; nav destinations untouched; `ComingSoon` still the fallback for anything unbuilt.
- Escrow: `pd.trustEscrow` exists in the dictionary but is **never rendered** (comment at ProductDetail.tsx:899-902); the landing's payment tile states outright “FactoryDepo does not hold them in escrow” (marketplace-light.html:535).
- Field-level honesty: the supplier panel shows only contract fields; employees / factory area / certificates are not shown at all (ProductDetail.tsx:410-415), and `pd.certificates` is a dead dictionary key with no render site.
- Country policy: no India/Vietnam anywhere in the landing, the strip (`MARKET_COUNTRIES`, components.tsx:141-144) or the narrowed `COUNTRIES` (api-spec:146-150); “Global” is kept and rendered without a flag, as the policy requires.
- i18n: `en` and `tr` both have 1690 keys, `en − tr = ∅`; one writer touched `i18n.tsx` (commit 7657e1a). No model/agent/AI wording anywhere in the UI (`grep -i` over the dictionary: zero hits).

**Architecture & seams**

- `lib/api-spec` → `lib/api-zod` → route → `api-client-react` is followed for all three new contracts (`zCountryCountList`, `zProductQuestion*`, `zAdminProductQuestion*`), and the route table rows match the routes (incl. the `answered|hidden` moderation enum and the 409 rule).
- Route order is right: literal `/categories` (products.ts:160) and `/countries` (products.ts:198) are declared **before** `/:id` (products.ts:295), so neither is ever parsed as an id; `/:id/questions` and `/:id/questions/:qid/answer` sit after and are unambiguous.
- Authorisation is ownership-based, not merely role-based: answering requires the supplier who owns *that* listing or an admin (products.ts:463-469); the asker answering themselves, a rival supplier, and an anonymous caller all get 401/403; `PATCH`/`DELETE /api/products/:id` are double-scoped by `supplierId` (products.ts:542, 580).
- Additive CSS layer: **every** `var(--token)` used in `enterprise.css` resolves against `styles.css` (26 tokens defined, 0 missing), and all 15 class names shared with `styles.css` are descendant-scoped (`.kpi .v`, `.tl .dot`, …) — no global restyle of an authority class, no second design language.
- Kit adoption is broad and consistent: all 11 pages in this change import `dash.tsx`; the untouched admin pages (AdminSuppliers/AdminGrowth/…) correctly still don't.
- Migration 021 is the house guard shape (`DO $mig$ … _migrations … RETURN`), `CREATE TABLE/INDEX IF NOT EXISTS`, ASCII-only, with a status CHECK; drizzle table + boot wiring match the SQL, and the cascade on `products` delete is proven live.

## Findings / provisos (ordered by severity)

### 1. MEDIUM-HIGH — the market strip and the origin filter advertise counts the link cannot deliver (alias merging without an alias-aware filter)

`COUNTRY_ALIASES` merges stored spellings when **counting** (`Türkiye`→TR, `China`→CN) — products.ts:179-215 — but the **filter** stayed an exact match: `if (country) conds.push(eq(products.originCountry, country))` (products.ts:117). Live on this tree, from the page itself:

```
topbar strip  : /explore?country=TR  →  "🇹🇷 29"   (also CN 4565 · US 0 · DE 3 · NL 0 · IT 0)
GET /api/products/countries → [CN 4565, Global 821, TR 29, DE 3]
GET /api/products?country=TR      → total 13
GET /api/products?country=Türkiye → total 16      (13 + 16 = the 29 the strip shows)
```

So the strip's own number is unreachable by the link it renders, and Explore's origin select (`countryOptions` from the same endpoint, Explore.tsx:70,168-175 → `TR (29)`) has the same gap. Two aggravating details:

- The code comment asserts the opposite of the truth: components.tsx:134-140 — *“Codes are the values the catalogue actually stores (`originCountry`), so the link filters the same rows the count was taken from”*. The catalogue stores **both** spellings (13 × `TR`, 16 × `Türkiye` at probe time).
- The publishing path **writes** the long form: `COUNTRIES` is still `'Türkiye','China','USA',…` (api-spec:146-150) and is the source for the supplier's origin picker (SupplierPost.tsx:12, 385) and the admin origin filter (AdminListings.tsx:206-214). A supplier posting a Turkish lot today creates a row that no origin filter in the product can reach — the class of bug gets worse with every real listing.

*Fold:* build the `country` condition from the same alias table (`originCountry IN ('TR','Türkiye','Turkey')`, one small helper + the `IN` in products.ts:117), or normalise the pickers to the codes and run a one-off `UPDATE products SET "originCountry"='TR' WHERE lower("originCountry")='türkiye'`. Either way, add the assertion that would have caught it: `Σ /countries items == Σ ?country=<each item>`.

### 2. MEDIUM — “Inspected stock” is rendered on every listing, with no inspection behind it

ProductDetail.tsx:912-918 renders the inspection trust row unconditionally:

```tsx
<div className="trustrow"><span className="ic">🔍</span>
  <div><b>{t('pd.trustInspected')}</b>{t('supplierDetail.service1')}</div></div>
```

`pd.trustInspected` = **“Inspected stock”** (i18n:3623) with body *“Factory inspection before payment”*. The `verified` row directly above it is correctly gated on API facts (`p.verified || s?.verifiedLevel >= 2`, ProductDetail.tsx:903-911) and escrow was deliberately dropped — but this one is a per-listing *claim* on a catalogue whose `inspectionsCount` is 0 for every supplier, so it will read as “this stock was inspected”. The landing got the same idea right by writing it as a platform capability (“In-country factory inspection — An inspector visits the site … before a higher verification level is recorded”, marketplace-light.html:531); the plan's own wording was “badges only where the API supplies the underlying fact” (ralplan T5 §3).

*Fold:* gate the row the way the verified row is gated, or reword the heading to a service statement (“Inspection available before payment”) so it can never be read as a fact about this lot.

### 3. LOW-MEDIUM — one duplicated primitive survives, and `<Kpi href>` is a hard navigation

- `metric()` exists in the kit (dash.tsx:18), in `ProductDetail.tsx:24` and in two pre-existing pages — with **different semantics** (`<= 0 → '—'` vs null-only). The PDP's copy pre-dates this branch, but the branch rewrote that file and introduced the kit in the same change, so the collision of two rules under one name is now the branch's to fix. (Its current usages — `inspectionsCount`, `trustScore` — are exactly the documented “unrated” fields, so no number is misrendered *today*.)
- `Kpi` renders a plain `<a href>` (dash.tsx:79-85): the admin KPIs therefore do a full page reload instead of a wouter push (verified: clicking the products tile loads `/admin/suppliers` as a document request). Works in prod (api-server SPA fallback) and in `vite preview`, but it loses SPA state; `Link` would be one line.
- `Messages.tsx:440-462` hand-rolls a compact prev/next pager beside the thread list instead of using `Pager` (the kit's “showing x–y of N” label does not fit a 230px column) — same `.pager` class, so no visual drift; worth a one-sentence comment saying why, since the repo's rule is “hand-rolling a second pager is the regression to avoid”.
- `styles.css` gained 20 lines (251-269) that *do* override existing chrome classes (`.topbar`, `.logo`, `.rail`, `.shell`) inside a new `@media(max-width:640px)`. That is a deviation from the plan's “additive only, in enterprise.css” wording — it is a bug fix for the 390px overflow, in the authority file, commented and breakpoint-scoped, so I am recording it rather than objecting. `enterprise.css` itself stays clean (no token redefinition, no global restyle).
- Pre-existing process artefact, now newly *visible*: 10 listings owned by `*@factorydepo.test` suppliers (and 82 test users) sit in the dev catalogue as `dataSource='platform'` rows. They show up in the new admin activity feed (“IT surplus coil lot”, “IT oversell probe …”) and inflate the real-listing/market counts. Documented behaviour of the suite (AGENTS.md:71), not a branch defect — but run `scripts/cleanup-test-rows.sql` before the owner preview, and consider making `api.test.ts` self-cleaning the way `questions.test.ts` already is (it deletes its probe listing and lets the cascade take the questions).
- The plan points at `.omh/state/enterprise-ui.json` for run state; that file does not exist in the tree (only `.omh/plans/ralplan-factorydepo-enterprise-ui.md` is tracked). Harmless, but the promised state trail is missing if anyone wants to replay the run.

## Test-affordance gaps

1. **The suite is not re-runnable inside the rate-limit windows — and it takes the dev app's login down with it.** Counted from the test sources: ~22 `POST /api/auth/register` (anonymous ⇒ shared per-IP write bucket) + 2 anonymous Q&A POSTs + 1 login per run, against `writeLimiter = 30/min per IP` and `authLoginLimiter = 10/15min per IP` (index.ts:270-272). Evidence: my run at 19:40:53 → 25 pass / **1 fail** (`{"error":"rate_limited"} 429 !== 201` on the first integration test, i.e. the tail of the previous window); run 4 minutes later → **11 fail, all `rate_limited`**; a direct probe showed the anonymous write bucket saturated and recovering ~80 s later; `POST /api/auth/login` returned `429` with `Retry-After: 447` for the demo accounts. Practical consequence: a reviewer or the owner who re-runs the documented gate twice concludes “11 failures”, and cannot sign into the local app for up to 15 minutes afterwards. The branch made this worse by growing the suite 18 → 26 tests (AGENTS.md:63-70). *Fold:* reuse one registered account per file (tokens instead of registers), or exempt the test IP/`NODE_ENV=test`, or document the 60 s cooldown next to the gate command.
2. **`GET /api/products/countries` has no test at all** — no contract/shape assertion, no alias-merge assertion (the thing it exists for), no ordering assertion, and, critically, **no consistency assertion between the merged count and `?country=<code>`** — the exact invariant proviso 1 breaks.
3. **`?country=` semantics are untested** (aliases vs codes; a non-aliased spelling silently returns a smaller set instead of 400).
4. **`PATCH /api/admin/questions/:id` semantics are untested.** `questions.test.ts:259-269` covers only authz (buyer 403, anon 401). The `hidden` transition, republish-restores-the-answer, and the **409 on publishing an unanswered question** were verified only by my manual run — that is a moderation safety rule left to chance.
5. Minor uncovered edges worth a case each: the 100-row `QUESTION_CAP` (products.ts:329,378) and its `total`-vs-`items` split; `zProductListQuery.mine` behaviour (the schema comment still says *“ignored for anonymous callers”* while the route now throws 401 — api-zod/src/index.ts:100-101 vs products.ts:86-96, a comment/behaviour drift the next reader will trip on).
6. `ui_smoke.mjs` (pre-existing) proves brand/route reachability/no-`NaN`; it does not assert that a stripped figure matches the API behind its link, nor that the Q&A panel/status chips render — so nothing automated would have caught proviso 1 or 2.

## Commit hygiene — verdict: **clean, mergeable history**

- 12 commits, each scoped to its own writer's files, and the coupled contract work correctly batched in one commit (`api-zod` + `api-spec` + `api-client-react` + route + test + migration in 01196f8); page commits touch *only* their own page files (87daf7a, a0cc0ff, 15feb29, 3717a19). No sibling-file sweeps; no `-A`-style dumps.
- Single-writer discipline held for `i18n.tsx` (7657e1a only) — which is what made the fan-out safe.
- No source file missing from a commit, no leftover debug/probe/screenshot/script file in the tree: `git status --porcelain --ignored` shows only `dist/`+`node_modules/`; `scripts/*` (incl. `ui_smoke.mjs`) all pre-date the range; the probe tooling I used lives in `%LOCALAPPDATA%` scratch, not in the repo.
- Two cosmetic notes only: the AGENTS.md test-count/coverage update (26 tests, `?supplierId=`, Q&A) rode inside the unrelated phone-width fix 8de2999 rather than with 01196f8; and `.omh/plans/ralplan-factorydepo-enterprise-ui.md` is committed (matches the repo's existing convention — it is the only tracked file under `.omh/`), so the plan travels with the branch on purpose.
- Nothing was pushed or deployed by this branch; the worktree is left clean.

## Closing note on readiness

Rendered surfaces are ready to look at: PDP (desktop + the ≤900px sticky action bar driven by measured `getComputedStyle` geometry, ProductDetail.tsx:534-564), the landing (hero/trust band/live stats/category index/FAQ/real footer links, HTTP-200 self-contained), and all three dashboards with `PageHeader → KpiRow → Toolbar → dense table → Pager/EmptyState`. The three provisos above are foldable in one pass (≈2 files + tests/docs); with the market-strip arithmetic corrected, I would call this surface-level-ready rather than preview-ready.
