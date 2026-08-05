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
