/**
 * Demo rows are a LOCAL-DEV convenience. Production must never receive a
 * catalogue nobody actually listed: the marketplace is real, or it is visibly
 * early. Both seeders — the API boot bootstrap and the dev seed script — ask
 * here before they insert a single row, and the boot log prints the decision so
 * a deploy log proves the gate fired instead of silently skipping.
 *
 *   SEED_DEMO=1         → seed (local development)
 *   NODE_ENV=production → never seed, whatever else is set
 *
 * It lives in the shared db package because the seed script and the API server
 * must agree on it — a second copy is exactly how a live database ends up with
 * a demo catalogue.
 */
export function demoSeedEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV === 'production') return env.SEED_DEMO === '1';
  return env.SEED_DEMO !== '0';
}

/** One line for the boot log; the same string shape in every environment. */
export function seedDecisionLine(enabled: boolean): string {
  return enabled
    ? '[seed] demo seeding ENABLED (SEED_DEMO=1 or NODE_ENV is not production) — this database is for development'
    : '[seed] demo seeding DISABLED — this database stays real: only rows created by real sellers are served';
}
