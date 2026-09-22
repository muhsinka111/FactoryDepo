# FactoryDepo — Agent Instructions

## Project Overview
Global industrial B2B marketplace (Türkiye + China first). Trust + verification is the product.
Monorepo root: `C:\Users\Hp\FactoryDepo` — pnpm workspaces (`artifacts/*`, `lib/*`).

## Repo Layout
```
FactoryDepo/
├── artifacts/web/           ← Vite + React app (:8080 dev)
├── artifacts/landing/       ← standalone marketing HTML (light theme, self-contained)
├── artifacts/api-server/    ← Express 5 API (:9090, esbuild → dist/index.mjs)
├── lib/api-zod/             ← Zod schemas — SINGLE SOURCE OF TRUTH for API contracts
├── lib/api-spec/            ← route table (method/path/input/output/auth)
├── lib/api-client-react/    ← React Query hooks + fetch client
├── lib/db/                  ← Drizzle schema + boot-time idempotent migrations + seed
├── scripts/                 ← gates/hooks
└── assets/                  ← shared images (hero photos from user's references)
```

## Key Conventions
- **pnpm only** (preinstall enforces). Node >= 22.
- API server builds with esbuild (`node build.mjs`) — NO tsc at build; `pnpm run typecheck` per-package for gates.
- Local DB: `postgres://postgres:postgres@localhost:5432/factorydepo` (psql: `/c/Program Files/PostgreSQL/16/bin/psql.exe`).
- Auth: `Authorization: Bearer <hmac-token>` (node:crypto HMAC, `APP_SECRET`). No sessions/cookies.
- Boot migrations: `lib/db/migrations/00X_*.sql` idempotent SQL, executed in order on every API boot. New table → new SQL file + register in the array.
- Seed: `pnpm run seed` (idempotent, demo users: `demo@factorydepo.com` / `factorydepo`).
- Contracts flow: edit `lib/api-zod` → api-spec mirrors → api-server validates with zod → web consumes via `@workspace/api-client-react`.
- SPA fallback + `/api/*` + static `../web/dist` all served by api-server in prod. Vite dev proxies `/api/` → :9090.
- UI rules (user-mandated): never show model names/agent codenames in UI; light theme default; metrics must be honest (no invented counts).

## Design System (authoritative)
- `artifacts/web/src/styles.css` is the **design authority** — a dense navy/gold enterprise
  B2B system ported from the owner's reference template (`factorydepo-v3`). Do not reintroduce
  the previous airy marketing theme (blue `#2E7CF6`, 18px radii, `.hero-light`, `.pcard`).
- No webfonts. The system UI stack is deliberate; Google Fonts links were removed on purpose.
- Shared chrome and cards live in `artifacts/web/src/components.tsx`: `Topbar`, `CategoryRail`,
  `Sidebar`, `BottomNav`, `View`, `Empty`, `StatusChip`, `ProductCard`, `SupplierCard`,
  `RfqCard`, `Verified`, `DemoTag`, `Stars`, `Spinner`, `AuthGateModal`, `requireAuthGate`.

## Three role dashboards
`buyer` / `supplier` / `admin` — all other roles (`inspector`, `lab`, `logistics`) collapse to
`buyer`. Nav is declared once in `components.tsx` (`NAV_BUYER`, `NAV_SUPPLIER`, `NAV_ADMIN`,
`NAV_GUEST`); `dashboardRole(role, loggedIn)`, `navFor(dash)` and `homeFor(dash)` derive the
shell. Landing routes: admin → `/admin`, supplier → `/supplier/listings`, buyer → `/feed`,
logged out → `/explore`. Public browse is `/explore`, `/products/:id`, `/suppliers/:id`, `/help`.
The marketing landing is served as static HTML at `/`; the SPA owns every other path. Legacy
paths `/products`, `/rfq`, `/rfq/:id`, `/dashboard`, `/landing` must keep redirecting for the
landing page's inbound links.

## Roles & the control plane (owner directive — design every feature against this)
Three powers, deliberately unequal:

**Seller — owns and runs their own shop.** A supplier creates listings AND keeps every
field editable afterwards: price, currency, MOQ, available quantity, unit, stock type,
origin/location, description, specs, images and files. Creation is not the end of the
flow — an edit path (`PATCH /api/products/:id`, ownership-scoped) is part of the feature,
and so is the seller's own storefront (their company profile, their listings, their
incoming orders/offers/questions). A seller can never touch another supplier's rows; the
integration suite asserts this.

**Admin — controls and checks everything.** Admin is the oversight plane: see any listing
or shop, edit/pull/remove it, approve or reject suppliers and their documents, moderate
questions, offers and RFQs, and look at the money. Admin routes live under
`/api/admin/*` and a non-admin must get 403 (asserted by the suite). Any admin state
change should be auditable rather than silent.

**The platform is itself a supplier.** Catalogue rows that enter by import/scrape are
published under FactoryDepo's OWN supplier account, carrying our real company
information — we are the seller of record for them, not a proxy for someone else. An
importer must therefore resolve to that account; never create unattributed rows. Buyer
visibility of anything upstream (source company, source price, rights) stays admin-only.

## Honesty rules (enforced in review)
- Never render an invented number. If the API does not supply a value, render `—` or omit it.
  `totalViews` IS real: it is a `COUNT` over `product_views` (recorded on
  `GET /api/products/:id`) scoped to the caller — a supplier sees views on their own
  listings, a buyer those on their saved ones. A genuine 0 is shown as `0`.
- Any row with `dataSource === 'demo'` must render `<DemoTag />` so a buyer is never misled.
- A nav destination whose feature is not built must render an honest placeholder
  (`pages/ComingSoon.tsx`), never a fake working screen.

## Marketplace scope (owner policy, hard rule)
The marketplace covers **Türkiye, China, USA and Europe — nothing else**. India and
Vietnam are excluded from buyers AND sellers (they were purged from the catalogue
once and came back through seed data, so treat this as a standing rule, not a
one-off cleanup). Concretely:
- `COUNTRIES` in `lib/api-spec` is the only source for the country pickers used by
  listings, RFQs and filters; never re-add an excluded market to it.
- The header market strip (`MARKET_COUNTRIES` in `artifacts/web/src/components.tsx`)
  lists only allowed markets with real counts from `GET /api/products/countries`.
- The seeders (`lib/db/scripts/seed.ts`, `artifacts/api-server/src/bootstrap-seed.ts`)
  and every served landing file must produce zero India/Vietnam rows: grep the
  landing candidates and check a fresh-DB seed run.

## Gates
1. `pnpm run typecheck` — clean
2. `pnpm run build` — clean
3. `pnpm test` — 30 tests. Unit tests (email rendering, HTML escaping) run anywhere;
   the integration suite boots against a server and **skips unless `TEST_BASE_URL`
   is set**:
   `TEST_BASE_URL=http://localhost:9090 pnpm --filter @workspace/api-server run test`
   Do not run it back-to-back: each run spends the 10/15min per-IP login budget and
   the 30/min per-IP write budget, so an immediate second run returns 429s that look
   like regressions — wait ~60s between gate runs.
   It covers anonymous 401s, forged tokens, authz (a buyer must get 403 from
   `/api/admin/*`), supplier-ownership enforcement (supplier B must not edit A's
   listing), the `?supplierId=` public scope, the product Q&A rules (only the owning
   supplier or an admin may answer) and the **oversell test** (8 concurrent 25-unit
   orders against 100 in stock must yield exactly 4 successes, 4×409, final stock 0,
   status `sold_out`).
   It creates throwaway `*@factorydepo.test` rows — clean them up after a local run
   if you care about the dev catalogue.
4. `curl -s http://localhost:9090/api/healthz` → `{"status":"ok",...}`
5. CI (`.github/workflows/ci.yml`) runs typecheck, build, the suite against a real
   Postgres 16 service, then the rate-limit smoke test. The login-ratelimit step
   deliberately exhausts the login bucket, so it must stay AFTER the suite.

## Rate limiting
Two tiers, in-memory (single instance — would need Redis behind a load balancer):
- `/api` overall 300/min and `/api/auth/login` 10/15min are keyed per **IP**.
- Writes (POST/PUT/PATCH/DELETE) are 30/min keyed per **authenticated user**,
  falling back to IP when anonymous. Keying writes on IP alone meant every account
  behind one office/NAT address shared a single bucket — do not regress that.

## Deploy
- Railway: `railway link --project "factorydepo"` first (CLI defaults to another project — always re-link).
- **`railway up` from a git worktree deploys the WRONG TREE.** The CLI resolves the
  project directory through git's common dir, so running it inside
  `.worktrees/<branch>` uploads the **primary checkout** (whatever branch that tree
  happens to be on), not the worktree you are standing in. Symptom: the build
  succeeds, the deployment is `SUCCESS`/`RUNNING`, and production still serves the
  old code — check the container's boot log for the migration list (a missing new
  migration is the fingerprint) or hit an endpoint the new build adds.
  Correct path: export the commit and deploy from outside any git repo —
  `git archive --format=tar HEAD | tar -x -C $LOCALAPPDATA/Temp/fd-deploy`, then
  `cd $LOCALAPPDATA/Temp/fd-deploy && railway up --project <id> --service api --environment production -c -y`.
- **Status (last verified 2026-09-22):** prod is UP at https://www.factorydepo.com.
  Deploys come from the local CLI (`railway up`), *not* from GitHub: `origin/main` and
  `origin/design` carry the app work, but a GitHub-sourced deploy is still not wired
  up, so **pushing alone does not ship anything**. Re-check with
  `bash scripts/where-are-we.sh` and by reading the running deployment's boot log
  instead of trusting this note.
- `railway.json` at root pins
  `NODE_ENV=production`, which is required for the APP_SECRET/SITE_URL fail-fast checks.
- Required env on Railway: `APP_SECRET` (32+ chars — the server refuses to boot without it),
  `SITE_URL`, `DATABASE_URL`, and `ADMIN_EMAIL` + `ADMIN_PASSWORD` to create the owner
  admin (the seeded demo admin is deliberately NOT created in production).
  `RESEND_API_KEY` + `EMAIL_FROM` enable outbound mail; without them mail queues in
  `email_outbox` rather than failing.
- Prod DB: Railway Postgres; `railway connect Postgres` with stdin-piped SQL for prod queries.
- Verify live: `/api/healthz`, then a signed-in flow.
