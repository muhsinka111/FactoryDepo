# FactoryDepo enterprise-UI run — progress log

Run instance: `enterprise-ui` (ralph discipline, file-based state — the `omh_state`
plugin toolset is not loaded in this profile, so `.omh/state/enterprise-ui.json`
is the state of record and there is no lock file to release).

Worktree `C:/Users/Hp/FactoryDepo/.worktrees/design`, branch `design`.
Plan: `.omh/plans/ralplan-factorydepo-enterprise-ui.md`.

## Iteration arc

**Wave 1 — foundations (parallel, 3 executors, strike-zero)**
- T1 `01196f8` product Q&A API + migration 021 + 5 hooks + 5 tests (25/25 at the time)
- T2 `7657e1a` i18n en+tr dictionaries
- T3 `82f18a3` enterprise landing (live counts reconciled by parser: 0 mismatches)
- Orchestrator meanwhile authored the shared kit `dash.tsx` + `styles/enterprise.css`
  and committed `19b824c` (plan, CSS layer, env-overridable dev proxy).

**Wave 2 — the four surfaces (parallel, 4 executors, strike-zero)**
- T5 `87daf7a` product page (gallery, 9 key facts, sticky buy box, 4 CTAs, tabs, Q&A)
- T6 `3717a19`+`5144db4` buyer dashboard · T7 `15feb29` supplier dashboard · T8 `a0cc0ff` admin console
- Orchestrator fixes while they ran: `afe9baa` (public `?supplierId=` filter + kit),
  then after their reports: `8de2999` (phone-width topbar overflow, kit attention-button
  and timeline rows), `02b8aa4` (real per-market counts endpoint, honest origin filter,
  market scope narrowed to the allowed countries).

**Wave 3 — review-driven corrections (parallel, 4 executors)** — dispatched after the
final architect review, the adversarial honesty audit and the exploratory QA pass.

## Strikes

One category of strike dominates this run: **implementation bugs where a claim and its
evidence diverged** — a count that ignored the filter it links to, a trust row rendered
without backing data, a demo tag suppressed by a verification badge, and a policy
exclusion that code and seed data could still re-create. None were test-infra strikes;
all were found by review, not by the test suite, which is the real lesson of the run.

## Orchestrator evidence (real output, current tree)

| Gate | Result |
| --- | --- |
| `pnpm run typecheck` | clean, 8 workspace projects |
| `pnpm run build` | clean |
| `TEST_BASE_URL=http://localhost:9095 pnpm --filter @workspace/api-server run test` | 26 tests, 26 pass, 0 fail |
| `BASE=http://localhost:5190 API=http://localhost:9095 node scripts/ui_smoke.mjs` | OK — 340 checks, 33 links, 25 categories, 6 stock types |
| true-390px overflow probe | `/explore`, `/help`, `/products/5412`, signed-in `/feed` all exactly 390px, no culprits |
| market counts | `GET /api/products/countries` → CN 4565, Global 821, TR 21 (merged `TR`+`Türkiye`), DE 3 |

## Review verdicts

- **Architect:** APPROVE_WITH_PROVISO — `.omh/reviews/architect-final-review.md`
- **Honesty/trust audit:** 4 blockers, 7 majors — `.omh/reviews/honesty-and-i18n-audit.md`
- **Exploratory QA:** 0 blockers, 2 majors — `.omh/reviews/qa-dogfood-findings.md`

## Learnings worth carrying forward

1. Windows Chrome clamps `--window-size` to ~500px — a true phone layout needs
   `Emulation.setDeviceMetricsOverride` with `mobile:false`, or the probe hides real overflow.
2. `express.static`/`sendFile` refuses any path containing a dot-segment, so a worktree
   under `.worktrees/` cannot serve the SPA locally; preview via `vite preview`.
3. The catalogue stores mixed country spellings (`TR`/`Türkiye`, `CN`/`China`) — counts and
   filters must share one alias map, or a market splits in two and links under-report.
4. The integration suite cannot be run back-to-back: its ~22 anonymous registers and logins
   hit the 30/min write limiter and the 10/15min login limiter, and the resulting 429s look
   like regressions. Space gate runs; the seeded demo accounts get locked out too.
5. A metric in the header is a link in disguise: whatever a number counts must equal what
   clicking it returns, or the interface lies in a way no unit test catches.
