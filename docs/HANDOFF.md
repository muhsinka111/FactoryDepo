# FactoryDepo — session handoff

Status as of **2026-09-17**. Written for whoever picks this up next (human or agent).

---

## 1. Where things stand

| Thing | State |
| --- | --- |
| Production | **LIVE** — https://www.factorydepo.com |
| API health | `{"status":"ok","db":"up"}` |
| Catalogue | 5,402 products, 1,545 suppliers, 25 categories, all non-empty |
| Local repo | 11 commits on `security-and-integrity-fixes`, **not pushed** |
| GitHub | `origin/main` is ~11 commits behind; push is blocked (see §7) |
| Deploy source | Production was deployed by **CLI upload**, not from GitHub |

**The critical caveat:** production is not yet built from the repo. Anything pushed
to `main` will not rebuild what is live until the Railway service is connected to
GitHub (see §7).

---

## 2. Live accounts

| Role | Email | Notes |
| --- | --- | --- |
| Admin / owner | `muhsinka@hotmail.com` | password was set via `ADMIN_PASSWORD` on Railway; not stored in this repo |
| Supplier | `supplier@factorydepo.com` | demo account |
| Buyer | `buyer@factorydepo.com` | demo account |

`demo@factorydepo.com` was **removed from production**. Its password is published
in this repository, so it must never exist on a live site. `bootstrap-seed.ts`
also refuses to create it when `NODE_ENV=production`.

---

## 3. What this session changed

1. **Committed the pending security/provenance baseline** that an earlier agent
   had left uncommitted (transactional orders, two-tier CORS, rate limiting,
   fail-fast secrets) and finished the scraped-data removal: 1,801 files
   (1,788 alicdn images, 6 scraped datasets, 7 scraper scripts).
2. **Re-skinned the whole app** to the owner's reference template — dense
   navy/gold enterprise B2B, three role dashboards, 30 pages.
3. **Built the backend** for offers, messaging, shipments, notifications,
   verification, payments and the admin console — 14 new tables, 58 routes.
4. **Replaced every placeholder screen** with a real one wired to the API.
5. **Six languages** — English, Türkçe, العربية, Русский, 中文, Español — across
   the app *and* the marketing landing, with RTL for Arabic. 1,533 keys per
   language, zero missing.
6. **Tests + CI** — 18 tests including the oversell test, run in GitHub Actions.
7. **Deployed to Railway** and populated the production database.

---

## 4. Architecture

```
FactoryDepo/
├── artifacts/web/          React + Vite SPA (30 pages, wouter, React Query)
├── artifacts/landing/      standalone marketing HTML, served at /
├── artifacts/api-server/   Express 5 API (esbuild → dist/index.mjs)
├── lib/api-zod/            Zod contracts — SINGLE SOURCE OF TRUTH
├── lib/api-spec/           route table + CATEGORIES taxonomy (25)
├── lib/api-client-react/   React Query hooks
├── lib/db/                 Drizzle schema + idempotent boot migrations
└── .github/workflows/      CI: typecheck, build, tests, rate-limit smoke
```

**Contracts flow:** edit `lib/api-zod` → mirror in `lib/api-spec` → validate in
`api-server` → consume via `@workspace/api-client-react`. Never bypass it.

**Boot behaviour:** every `*.sql` in `lib/db/migrations/` runs on each API boot
and must be idempotent. A checksum ledger warns if an already-applied file is
edited — so **never edit an applied migration; add a new numbered one**.

---

## 5. Non-negotiables (enforced in review)

- **Honesty.** Never render an invented number. If the API supplies nothing,
  render `—` or omit it. Every `dataSource === 'demo'` row renders `<DemoTag />`.
- **No fabricated content.** The landing previously carried an invented commodity
  ticker, fake supplier ratings and urgency timers. All removed; do not
  reintroduce them.
- **No model names, agent codenames or internal tooling names in the UI.**
- **Ownership, not just role.** A supplier may only touch its own listings. The
  original code asked "is this caller a supplier", never "is this *the right*
  supplier".
- **Data provenance.** See `docs/DATA_PROVENANCE.md`. Scraped third-party
  catalogues must not come back.

---

## 6. Migrations (all applied locally and in production)

| # | Purpose |
| --- | --- |
| 001–008 | core schema, images, contacts, orders, stock, data provenance |
| 009 | 14 platform tables (offers, threads, messages, shipments, payments, …) |
| 010 | catalogue hygiene: HTML entities, category normalisation, quarantine |
| 011–013 | photo variety — 013 is the one that works (md5 hash, see below) |
| 014 | reclassify products into the empty categories; rewrite junk descriptions |
| 015 | populate Mining & Ore |
| 016 | fix sub-$1 prices rendering as "USD .58" |
| 017 | fix an "anchor" keyword that misfiled a bolt into Marine & Offshore |
| 018 | remove the last three product names that were scrape markup |

**Why 011 and 012 were not enough:** both used a *linear* map (`id % n`,
`id × K % n`), which is still a cycle. With seven photos and a seven-column grid,
every row repeated the row above. A non-linear hash (`md5(id || category)`) was
required. If you touch image assignment, keep it non-linear and deterministic.

---

## 7. Deploying

### Railway (currently the only working path)

```bash
railway link --project 6beb894b-2d8b-45a0-a5fe-046f80830936 \
              --environment be853a2f-7204-4c98-8934-72d2960c444d \
              --service 5635cc20-9476-4f41-b9f5-3118d7e4d61a
railway up --service api --detach
```

Required variables: `APP_SECRET` (32+ chars — the server **refuses to boot**
without it), `SITE_URL`, `DATABASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`.
`RESEND_API_KEY` + `EMAIL_FROM` enable outbound mail; without them mail queues in
`email_outbox` rather than being lost.

The `api` service had **no GitHub source attached**, which is why production was
down from 2026-08-11 until this session. Attaching the repo in the Railway
dashboard restores deploy-on-push and makes the repo the source of truth again.

### GitHub — currently blocked

Push fails with `403 Permission … denied` (and the token supplied during this
session has since been **revoked**, now returning `401 Bad credentials`), so the
11 commits exist only locally. To publish them, either:

- create a fine-grained PAT with **Contents: Read and write** on this repo and
  push, or
- push from a machine that already has credentials:

```bash
git push -u origin security-and-integrity-fixes
```

### Inspecting production data

There is **no public TCP proxy** on the Postgres service, so local `psql` cannot
reach it. Use either:

```bash
railway connect Postgres        # needs a TCP proxy enabled first
railway ssh --service api -- node /tmp/script.cjs   # runs inside the network
```

`railway ssh` needs an SSH key registered (`railway ssh keys add`). Files written
with `railway service files upload` live on the container and **do not survive a
redeploy**.

---

## 8. Gates

```bash
pnpm run typecheck      # 8 packages must be clean
pnpm run build          # api-server + web
pnpm test               # 18 tests; integration suite needs TEST_BASE_URL
```

```bash
TEST_BASE_URL=http://localhost:9090 pnpm --filter @workspace/api-server run test
```

The suite creates `*@factorydepo.test` rows; clean them up after a local run.
CI runs it before the login-ratelimit smoke step, which deliberately exhausts the
login bucket.

**Gotcha:** the login limiter is 10/15min keyed per **IP**. Repeated test runs
will return `429 rate_limited`. Writes are keyed per **authenticated user**
(deliberately — keying them on IP meant one office shared a single bucket).

---

## 9. Known gaps

- **227 listings have no photograph** — Safety & PPE 102, Hardware & Fasteners 78,
  Medical Supplies 47. We own no image that genuinely depicts those goods, so
  they render a designed category tile with an abstract glyph. Showing a photo of
  something the lot is not would be worse.
- **Bundle is ~1,017 kB / 262 kB gzipped** in one eager chunk, mostly the six
  language dictionaries. Lazy-loading non-English dictionaries would cut it a lot.
- `product_views` records real views and `totalViews` is a real count, but no
  per-listing view count is exposed by the product contract.
- **Every listing is `demo` data**, labelled with a chip, awaiting the owner's
  real company information.
- Eleven categories were empty before migration 014; the counts are now small but
  real (Furniture & Wood 5, Mining & Ore 2). They are honest, not padded.

---

## 10. Working with this repo

- **pnpm only**, Node ≥ 22.
- Local DB: `postgres://postgres:postgres@localhost:5432/factorydepo`.
  psql at `C:\Program Files\PostgreSQL\16\bin\psql.exe` — **pipe SQL via stdin**;
  PowerShell strips embedded double quotes from `-c`.
- Design authority is `artifacts/web/src/styles.css`. Do not reintroduce the old
  marketing theme, and do not add webfonts.
- `.pnpm-store/` lives inside the repo and is gitignored — keep it that way.
