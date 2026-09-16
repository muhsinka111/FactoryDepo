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

## Honesty rules (enforced in review)
- Never render an invented number. If the API does not supply a value, render `—` or omit it.
  `totalViews` is always 0 because nothing tracks views — show `—`, not `0`.
- Any row with `dataSource === 'demo'` must render `<DemoTag />` so a buyer is never misled.
- A nav destination whose feature is not built must render an honest placeholder
  (`pages/ComingSoon.tsx`), never a fake working screen.

## Gates
1. `pnpm run typecheck` — clean
2. `pnpm run build` — clean
3. `curl -s http://localhost:9090/api/healthz` → `{"status":"ok",...}`
4. Frontend builds with no console errors

## Deploy
- Railway: `railway link --project "factorydepo"` first (CLI defaults to another project — always re-link).
- `git push origin main` triggers deploy. `railway.json` at root.
- Prod DB: Railway Postgres; `railway connect Postgres` with stdin-piped SQL for prod queries.
- Verify live: `/api/healthz`, then a signed-in flow.
