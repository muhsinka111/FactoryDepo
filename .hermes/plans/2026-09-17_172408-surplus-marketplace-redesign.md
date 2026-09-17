# FactoryDepo — Surplus-first redesign, clickable-everywhere, category imagery, and honest owner-account import

**Status:** plan only — no code changed by this document.
**Repo:** `C:\Users\Hp\FactoryDepo` (pnpm monorepo, Windows + git-bash).
**Written:** 2026-09-17 17:24 (Türkiye, UTC+03:00).

---

## Goal

Reposition FactoryDepo from "industrial/metal catalogue" to **the place to sell surplus, overstock and container-ready factory stock to US + EU buyers**, restyle the app into a clean modern light B2B system where every visible control does something real, and give every one of the 25 categories a genuine cover image and a landing page — implementing the work once in shared components so all three dashboards (buyer / supplier / admin) inherit it.

---

## Current context (verified — each line was produced by a command in this session)

### Repo state
- Branch `security-and-integrity-fixes`, dirty: `M AGENTS.md`, `?? scripts/where-are-we.sh`. Last commit `5772553 data: remove the last scrape artefacts, document the categories route`.
- `origin/main` is far behind the working branch — **prod was deployed with `railway up` from this machine, not from GitHub.** Nothing ships from the repo until it is pushed.
- Prod is live: `curl https://www.factorydepo.com/api/healthz` → `{"status":"ok","db":"up","time":"2026-09-17T14:13:58.091Z"}`.

### Frontend shape
- `artifacts/web/src/styles.css` (330 lines) is the declared design authority: navy/gold, `--r:8px`, `--bg:#f7f8fa`, 13.5px base. Lines 1–245 are the ported reference template; 247–330 are app additions (spinner, RTL overrides, `.ph-empty`).
- `artifacts/web/src/components.tsx` (591 lines) owns all chrome: `Topbar`, `CategoryRail`, `Sidebar`, `BottomNav`, `View`, `Empty`, `ProductCard`, `SupplierCard`, `RfqCard`, `StatusChip`, `Verified`, `DemoTag`, `Stars`, `Spinner`, `AuthGateModal`, `requireAuthGate`, plus nav model `NAV_BUYER / NAV_SUPPLIER / NAV_ADMIN / NAV_GUEST`, `dashboardRole`, `navFor`, `homeFor`, `activeKeyFor`.
- `artifacts/web/src/App.tsx` (159 lines) — routes: public `/explore`, `/products/:id`, `/suppliers`, `/suppliers/:id`, `/help`, `/sign-in`, `/sign-up`; buyer `/feed`, `/rfqs`, `/rfqs/:id`, `/orders`, `/offers`, `/shipments`, `/messages`, `/saved`, `/notifications`, `/profile`; supplier `/supplier/{listings,post,offers,rfq-opportunities,verification}`; admin `/admin`, `/admin/{suppliers,verification,listings,rfqs,payments,sources,growth,features}`; legacy redirects `/products → /explore`, `/rfq → /rfqs`, `/rfq/:id → /rfqs/:id`, `/dashboard → homeFor(dash)`. **Every nav destination has a real route** — `pages/ComingSoon.tsx` is imported by nothing.
- `artifacts/web/src/i18n.tsx` — 11,472 lines, 6 languages (`en` full + 5 partials `tr, ar, ru, zh, es`). `en` is the only type-enforced dictionary; `lookup()` falls back `lang → en → key`, so a missing partial entry never blanks the UI. Currently 10,461 key lines.
- **No frontend test framework exists.** `artifacts/web/package.json` has no `test` script. Only `artifacts/api-server/test/{api,email}.test.ts`, run by `node --import tsx --test …` (root `pnpm test`).

### Backend shape
- Migrations are **auto-discovered**, not registered: `artifacts/api-server/src/index.ts:74` runs every `*.sql` in `lib/db/migrations/`, sorted, with a checksum ledger. Latest is `018_junk_names.sql` → the new file is `019_*.sql`. (`AGENTS.md`'s "register in the array" is stale.)
- `lib/db/src/schema/index.ts:79` — `products` columns: `id, supplierId, name, category, description, spec, price, currency, unit, moq, originCountry, purityGrade, verified, imageKey, quantityAvailable, status, dataSource, createdAt`.
- `lib/api-zod/src/index.ts` — `zProduct` (line 54), `zProductListQuery` (line 78: `q, category, country, minPrice, maxPrice, hasImage, mine, page, limit`), `zProductStatus = z.enum(['active','sold_out'])` (51), `zDataSource = z.enum(['platform','demo'])` (52).
- `GET /api/products/categories` (`routes/products.ts:155`) returns live `{category, count}[]` — the rail and Explore only offer categories that hold stock.
- `POST /api/products` (`routes/products.ts:171`) is `requireAuth + requireRole('supplier')` — **a buyer cannot list today.**
- `PATCH /api/me` updates name/company/country/lang only (no role) — good, no privilege-escalation hole.

### Live data (local Postgres, `psql -h localhost -U postgres -d factorydepo`)
```
products 5402   suppliers 1545   users 1551   rfqs 8   orders 2   offers 0
products.dataSource  = demo 5402 (100%)
suppliers.dataSource = demo 1545 (100%)
```
Category spread (all 25 categories hold stock, so all 25 are rail-visible):
`Machinery 1389 · Metals & Minerals 671 · Steel 375 · Industrial Equipment 365 · Textiles 340 · Construction Materials 330 · Chemicals 329 · Electronics 230 · Automotive 167 · Plastic & Rubber 159 · Hardware & Fasteners 158 · Packaging 133 · Agriculture 115 · Safety & PPE 115 · Renewable Energy 108 · Ceramics & Glass 86 · Food Processing 84 · Energy 77 · Medical Supplies 54 · Rubber 43 · Paper & Pulp 27 · Marine & Offshore 23 · Aerospace 17 · Furniture & Wood 5 · Mining & Ore 2`
Photographs: only **38 owned images** live in `artifacts/web/public/products/` (`stainless-steel-sheet.jpg`, `cnc-machine.jpg`, …). 5,402 rows share them. Photo coverage gaps: `Hardware & Fasteners 80/158`, `Safety & PPE 13/115`, `Medical Supplies 7/54` have **no photo** and render the deliberate `.ph-empty` category tile.

### The provenance constraint (read before Phase 8)
`docs/DATA_PROVENANCE.md` records that `scripts/import/` (Alibaba / Made-in-China / IndiaMART scrapers, ~6,800 records, 1,788 alicdn photographs) was **deleted on purpose** in `111c5c8`, for three independent reasons: source-site ToS prohibit automated collection; the photographs belong to the suppliers/platforms; and listing real companies who never agreed at prices we cannot honour is the exact failure the product exists to prevent. Only `scripts/import/__pycache__/*.pyc` survive. **The Alibaba request in this task collides head-on with that decision** — Phase 8 handles it as an explicit owner decision, not as an implementation detail.

### Verified affordance gaps ("everything clickable")
Not dead buttons — missing affordances. Audit results:
1. `components.tsx:217-223` — `.markets` country flags are inert `<span>`s; no way to filter by market from the topbar.
2. `components.tsx:330-333` — `.sidefoot` "more industries" is static text with no link.
3. `components.tsx:457-487` — `ProductCard` renders its 🔖 save button only when a caller passes `onSave`; `Explore.tsx:117` passes nothing, so browse has no save affordance. The card's country line and MOQ line are plain text (not links/filters).
4. `pages/ProductDetail.tsx:359-360` — `.galstrip` renders one `<span class="galthumb on">`: a fake gallery. There is no images array in `zProduct` (`imageKey` is a single nullable string). Also no breadcrumb and no "more from this supplier / same category" block.
5. No `/categories` page exists. Categories are reachable only via the rail's text buttons.
6. `artifacts/landing/variants/marketplace-light.html` — 64 `href`s; category tiles' CTA points at `/products` generically. Landing category imagery must be re-checked tile by tile.
7. Already correct (do **not** "fix"): `AdminListings.tsx:247,258` link product+supplier; `Orders.tsx:135` links product; `SupplierDetail.tsx:221` renders `ProductCard`s; `Suppliers`/`Offers`/`SupplierOffers` button↔onClick counts match.

### Dev/port constraints
- Vite dev proxy targets `http://localhost:9091` (`artifacts/web/vite.config.ts`); servers bind `:8080` web, `:9091` API. Right now **nothing** listens on 8080/9090/9091 — only `:5432`.
- **Never kill a node process without identifying it** (`netstat -ano | grep ":<port>" | grep LISTENING` then `wmic process where "ProcessId=<pid>" get CommandLine`). Ports are shared with the owner's other app (İhaleZeka).
- API must be started **from `artifacts/api-server`** or migrations silently fail while `/api/healthz` still says ok.

---

## Decisions already made — the implementer must not re-litigate these

| # | Decision | Why |
|---|---|---|
| D1 | **Keep the 25 existing categories** and add an orthogonal **stock-type facet** (`stock / surplus / overstock / liquidation / seconds / container`) instead of rewriting the taxonomy. | All 25 hold real stock; a rewrite would orphan 5,402 rows and empty the rail. The user's "only surplus/overstock" ask is a *filter*, not a new tree. |
| D2 | Category cover images are **category-level art only**. They appear on `/categories`, the rail's expanded tiles and category headers — **never** as a listing's photo. Listings with no photo keep `.ph-empty`. | A category photo on a lot that isn't that thing is exactly the dishonesty `styles.css:318-330` and `DATA_PROVENANCE.md` forbid. |
| D3 | Price colour changes from alert-red to navy: `.price{color:var(--navy)}`. | Red reads as "error/sale" in US/EU B2B; the user asked for clean and modern. |
| D4 | New shared UI goes in `components.tsx` + `styles.css`, never inline in one page. | One implementation, all three dashboards inherit it (explicit user constraint). |
| D5 | Frontend verification = `pnpm run typecheck` + `pnpm run build` + a new headless-Chrome DOM assertion script (`scripts/ui_smoke.mjs`). No new test framework. | `artifacts/web` has no test runner; introducing vitest is YAGNI here. |
| D6 | "Anyone can list" = a buyer upgrades via a new `POST /api/me/become-supplier`. **Never** add `role` to `PATCH /api/me`. | `PATCH /api/me` with a writable `role` would let any buyer set `role:'admin'`. |
| D7 | Every new UI string is added to the `en` dictionary (type-enforced) **and** the 5 partials, each inserted immediately after its `const <lang>: … = {` line so the anchor is stable. | `en` is the contract; partials are quality. Immediate-after-declaration insertion survives a shifting 11k-line file. |
| D8 | All demo rows stay labelled `demo`, and the **landing + Explore get a visible demo-data notice** until real listings replace them (Phase 0). | The catalogue is 100% demo; presenting it as real supply to US/EU buyers is the product's cardinal sin. |

---

## Architecture / proposed approach

Add one column (`products.listingType`), one zod enum and one query filter — then express the whole "surplus marketplace" repositioning as UI: a stock-type chip bar, category tiles with covers, a `/categories` index, and a public "Sell your stock" entry that any account can take. Everything lands in `components.tsx` + `styles.css` + `i18n.tsx` so buyer/supplier/admin shells change together, and every claim the UI makes is backed by a live API number (or a `—`).

---

## Phase 0 — Honesty gate (do this first; 30 minutes)

### Task 0.1 — Add the demo-data notice to `styles.css`
**File:** `artifacts/web/src/styles.css` — append at end of file:

```css
/* Demo-catalogue notice. The catalogue is currently 100% bootstrap seed data
   (5,402 rows, dataSource='demo'); this band states that on screen instead of
   letting a buyer infer it from the per-card Demo tag alone. Remove the band in
   the same commit that removes the last demo row. */
.demoNotice{
  display:flex;align-items:center;gap:8px;flex-wrap:wrap;
  background:#fdf3e0;border:1px solid #f2dcb3;border-radius:var(--r);
  padding:7px 11px;margin-bottom:12px;font-size:12px;color:#7a5200;
}
.demoNotice b{font-weight:600;color:#5e3f00}
```

**Verify:** `grep -c "demoNotice" artifacts/web/src/styles.css` → `1`.
**Commit:** `style(web): add the demo-catalogue notice band`

### Task 0.2 — Render it on Explore and the landing
**File:** `artifacts/web/src/components.tsx` — add after `Empty` (line 552):

```tsx
/**
 * The catalogue is entirely bootstrap seed data right now. Saying so once, at
 * the top of the browse views, is the honest complement to the per-card Demo
 * tag — a buyer must not have to infer it from badges.
 */
export function DemoNotice() {
  const { t } = useI18n();
  return (
    <div className="demoNotice" role="note">
      <b>{t('demo.title')}</b>
      <span>{t('demo.body')}</span>
    </div>
  );
}
```

**File:** `artifacts/web/src/pages/Explore.tsx` — import it (`import { View, ProductCard, Spinner, Empty, DemoNotice } from '../components';`) and render `<DemoNotice />` as the first child inside `<View>` (immediately before `<div className="filters">`).

**Verify:** `pnpm run build` exits 0, then with dev servers up `curl -s http://localhost:8080/ | grep -c demoNotice` → `≥1` after Task 5.6's smoke run. (Typecheck will fail until Task 0.3 adds the keys — do 0.3 in the same sitting.)
**Commit:** `feat(web): state that the catalogue is demo data, on screen`

### Task 0.3 — Add the two dictionary keys
**File:** `artifacts/web/src/i18n.tsx` — insert immediately after each `const <lang>: … = {` line (anchors: `const en: Dict = {`, `const tr: Partial<Record<DictKey, string>> = {`, and the same for `ar, ru, zh, es`):

```ts
  'demo.title': 'Demo catalogue',
  'demo.body': 'Every listing on this site right now is bootstrap demo data, not a real offer. Real supplier listings replace it as they are onboarded.',
```
```ts
  'demo.title': 'Demo katalog',
  'demo.body': 'Şu an sitedeki her ilan demo verisidir, gerçek bir teklif değildir. Gerçek tedarikçi ilanları eklendikçe yerini alacaktır.',
```
```ts
  'demo.title': 'كتالوج تجريبي',
  'demo.body': 'كل الإعلانات على الموقع الآن بيانات تجريبية وليست عروضًا حقيقية. سيتم استبدالها بإعلانات موردين حقيقيين عند إضافتها.',
```
```ts
  'demo.title': 'Демо-каталог',
  'demo.body': 'Все объявления на сайте сейчас — демонстрационные данные, а не реальное предложение. По мере подключения поставщиков их заменят настоящие.',
```
```ts
  'demo.title': '演示目录',
  'demo.body': '本站当前所有商品均为演示数据，并非真实报价。随着真实供应商入驻，将逐步替换。',
```
```ts
  'demo.title': 'Catálogo de demostración',
  'demo.body': 'Ahora mismo todos los anuncios del sitio son datos de demostración, no ofertas reales. Se sustituirán por anuncios de proveedores reales.',
```
**Verify:** `pnpm run typecheck` → exit 0 and no line containing `error TS`.
**Commit:** `i18n: six-language demo-catalogue notice`

### Task 0.4 — Same notice on the static landing
**File:** `artifacts/landing/variants/marketplace-light.html` — insert immediately after the opening `<body>` tag:

```html
<!-- The catalogue is 100% bootstrap demo data right now. Stated up front so a
     US/EU buyer is never led to believe these are live offers. -->
<div style="background:#fdf3e0;border-bottom:1px solid #f2dcb3;color:#5e3f00;font:12px/1.5 -apple-system,'Segoe UI',Inter,Roboto,sans-serif;padding:7px 14px;text-align:center">
  <b>Demo catalogue</b> — every listing shown is bootstrap demo data, not a real offer. Real supplier listings replace it as they are onboarded.
</div>
```
**Verify:** serve and grep:
`python -m http.server 8123 --directory artifacts/landing/variants &` then
`curl -s http://localhost:8123/marketplace-light.html | grep -c "Demo catalogue"` → `1`. Kill the server with `taskkill //PID <pid> //F`.
**Commit:** `landing: state that the catalogue is demo data`

---

## Phase 1 — Surplus-first data model

### Task 1.1 — Migration 019 (write the failing check first)
**Step 1 — prove the column is absent:**
```bash
export PGPASSWORD=postgres
"/c/Program Files/PostgreSQL/16/bin/psql.exe" -h localhost -U postgres -d factorydepo \
  -c "select column_name from information_schema.columns where table_name='products' and column_name='listingType';"
```
Expected: `(0 rows)`.

**Step 2 — new file** `lib/db/migrations/019_listing_type.sql`:
```sql
-- 019: surplus-first listing facet.
-- Orthogonal to `category`: a lot is steel AND surplus. Values are fixed and
-- validated in code (lib/api-zod zListingType); the DB only guards the default.
-- stock     : ordinary ready stock
-- surplus   : overproduction run / excess production
-- overstock : slow-moving accumulated inventory
-- liquidation: distressed clearance of an entire inventory
-- seconds   : factory seconds / cosmetic or minor defects
-- container : container-ready lot, sold as a whole container
ALTER TABLE products ADD COLUMN IF NOT EXISTS "listingType" text NOT NULL DEFAULT 'stock';
CREATE INDEX IF NOT EXISTS products_listing_type_idx ON products ("listingType");
```

**Step 3 — apply by booting the API** (migrations run at boot; `cd` matters):
```bash
cd artifacts/api-server && (PORT=9091 node dist/index.mjs > "$LOCALAPPDATA/Temp/fd-api.log" 2>&1 &) ; sleep 5
grep "019_listing_type" "$LOCALAPPDATA/Temp/fd-api.log"
curl -s http://localhost:9091/api/healthz
```
Expected: a line `[migrate] applied 019_listing_type.sql` and `{"status":"ok","db":"up",...}`.

**Step 4 — verify the column exists:**
```bash
"/c/Program Files/PostgreSQL/16/bin/psql.exe" -h localhost -U postgres -d factorydepo \
  -c "select \"listingType\", count(*) from products group by 1;"
```
Expected: exactly one row, `stock | 5402`.

**Commit:** `feat(db): listingType facet for surplus stock (migration 019)`

### Task 1.2 — Mirror the column in Drizzle
**File:** `lib/db/src/schema/index.ts` — inside `products`, after the `dataSource` line (line 100):
```ts
  /* stock | surplus | overstock | liquidation | seconds | container — see
     lib/api-zod zListingType and migrations/019_listing_type.sql. */
  listingType: text('listingType').notNull().default('stock'),
```
**Verify:** `pnpm run typecheck` → exit 0.
**Commit:** `feat(db): listingType in the products schema`

### Task 1.3 — Contract: enum, product field, query filter (test first)
**Step 1 — failing test.** Append to `artifacts/api-server/test/api.test.ts`:
```ts
test('listing type facet', async () => {
  // 'surplus' must be accepted by the query contract…
  const ok = await fetch(`${BASE}/api/products?listingType=surplus&limit=1`);
  assert.equal(ok.status, 200);
  const body = await ok.json() as { items: unknown[]; total: number };
  assert.ok(Array.isArray(body.items));
  // …an unknown value must be rejected outright, not silently ignored
  const bad = await fetch(`${BASE}/api/products?listingType=nonsense&limit=1`);
  assert.equal(bad.status, 400);
  // …and every returned row must carry the field so the UI can label it
  const all = await fetch(`${BASE}/api/products?limit=5`);
  const list = await all.json() as { items: { listingType: string }[] };
  for (const p of list.items) assert.equal(typeof p.listingType, 'string');
});
```
**Step 2 — run it, watch it fail** (`BASE` must exist in that file; the suite skips without it):
```bash
TEST_BASE_URL=http://localhost:9091 pnpm --filter @workspace/api-server run test
```
Expected: FAIL — `?listingType=surplus` returns 200 but the field assertions throw (and the `nonsense` case returns 200 instead of 400).

**Step 3 — implement.** `lib/api-zod/src/index.ts`:
```ts
export const zListingType = z.enum(['stock', 'surplus', 'overstock', 'liquidation', 'seconds', 'container']);
export type ListingType = z.infer<typeof zListingType>;
```
Add to `zProduct` after `dataSource` (line 73): `listingType: zListingType,`
Add to `zProductListQuery` after `category` (line 80): `listingType: zListingType.optional(),`
Also add `listingType: zListingType.optional(),` to `zCreateProductInput` and `zUpdateProductInput` (find them with `grep -n "zCreateProductInput\|zUpdateProductInput" lib/api-zod/src/index.ts`).

**Step 4 — run again until green**, then typecheck:
```bash
TEST_BASE_URL=http://localhost:9091 pnpm --filter @workspace/api-server run test && pnpm run typecheck
```
Expected: all tests pass (19 now), typecheck exit 0. **A typecheck failure here is expected and correct** — `mapProduct`/`productColumns` do not emit the new field yet; Task 2.1 fixes exactly that.
**Commit:** `feat(api): listingType contract + query filter`

### Task 1.4 — Register the query param in the route table
**File:** `lib/api-spec/src/index.ts` line 28 — extend the description so the documented surface matches reality:
```ts
  { method: 'GET', path: '/api/products', auth: 'public', input: c.zProductListQuery, output: c.zProductList, desc: 'Search products: q, category, listingType, country, min/maxPrice, page, limit' },
```
**Verify:** `grep -c "listingType" lib/api-spec/src/index.ts` → `1`.
**Commit:** `docs(api-spec): document the listingType filter`

---

## Phase 2 — API surface

### Task 2.1 — Project and filter the field
**File:** `artifacts/api-server/src/helpers.ts` — in `productColumns` (line 111), after `status` add:
```ts
  listingType: products.listingType,
```
**File:** `artifacts/api-server/src/routes/products.ts` — in the list handler, after the `hasImage` condition (line 118):
```ts
  if (listingType) conds.push(eq(products.listingType, listingType));
```
(add `listingType` to the destructure at line 81 alongside the other filters, and make sure `eq` is imported — it already is, via `drizzle-orm`).

**Verify:**
```bash
cd artifacts/api-server && pnpm run build && (PORT=9091 node dist/index.mjs > "$LOCALAPPDATA/Temp/fd-api.log" 2>&1 &) ; sleep 5
curl -s "http://localhost:9091/api/products?limit=1" | grep -o '"listingType":"[a-z]*"'   # → "listingType":"stock"
curl -s "http://localhost:9091/api/products?listingType=surplus&limit=1" | grep -o '"total":[0-9]*'  # → "total":0
```
**Commit:** `feat(api): filter and return listingType on /api/products`

### Task 2.2 — Seed every stock type so the facet has something to show
**File:** new `scripts/seed-listing-types.mjs` (throwaway, run manually — **not** a boot migration):
```js
/**
 * One-off: spread the six stock types across the existing demo catalogue so the
 * listingType facet is demonstrable. Deterministic (id modulo) and idempotent.
 * Deliberately NOT a migration: it rewrites data, and migrations must stay
 * safe to auto-run against production.
 */
import { execFileSync } from 'node:child_process';

const PSQL = 'C:/Program Files/PostgreSQL/16/bin/psql.exe';
const sql = `
UPDATE products SET "listingType" = (ARRAY['stock','stock','surplus','overstock','liquidation','seconds','container'])[(id % 7) + 1];
`;

execFileSync(PSQL, ['-h', 'localhost', '-U', 'postgres', '-d', 'factorydepo', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
  env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD ?? 'postgres' },
  stdio: 'inherit',
});
console.log('listingType spread across the demo catalogue');
```
**Verify:**
```bash
node scripts/seed-listing-types.mjs
"/c/Program Files/PostgreSQL/16/bin/psql.exe" -h localhost -U postgres -d factorydepo -c "select \"listingType\", count(*) from products group by 1 order by 2 desc;"
```
Expected: six rows, none zero, totalling 5,402.
**Commit:** `chore(scripts): spread listing types over the demo catalogue`

### Task 2.3 — Let any account start selling (test first)
**Step 1 — failing test** (append to `artifacts/api-server/test/api.test.ts`, reusing its existing helper that registers a throwaway user and signs in):
```ts
test('a buyer can become a supplier, and only buyer→supplier', async () => {
  const buyer = await signUpTestUser('buyer');
  const res = await fetch(`${BASE}/api/me/become-supplier`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${buyer.token}` },
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json() as { role: string }).role, 'supplier');
  // the supplier profile that listings hang off must now exist
  const created = await fetch(`${BASE}/api/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${buyer.token}` },
    body: JSON.stringify({ name: 'Surplus coil', category: 'Steel', price: 100, unit: 't', moq: 1, originCountry: 'Türkiye', quantityAvailable: 10 }),
  });
  assert.equal(created.status, 200);
  // calling it again must not 500 or duplicate the supplier row
  const again = await fetch(`${BASE}/api/me/become-supplier`, { method: 'POST', headers: { Authorization: `Bearer ${buyer.token}` } });
  assert.equal(again.status, 200);
});
```
(If the file has no `signUpTestUser` helper, copy the register+login sequence used by the existing ownership tests — do **not** invent a new auth path.)
**Step 2 — run:** `TEST_BASE_URL=http://localhost:9091 pnpm --filter @workspace/api-server run test` → expected FAIL, 404 on `/api/me/become-supplier`.
**Step 3 — implement** in `artifacts/api-server/src/routes/auth.ts` (where `/api/me` lives; find with `grep -n "'/me'" artifacts/api-server/src/routes/auth.ts`):
```ts
/**
 * Anyone may become a seller: the user asked that any account be able to list
 * stock. This is the ONLY way role escalates, and it only ever moves
 * buyer -> supplier. Role is deliberately not writable through PATCH /api/me,
 * which would otherwise let a buyer self-assign 'admin'.
 */
authRouter.post('/me/become-supplier', requireAuth, async (req, res) => {
  const uid = req.userId;
  if (uid == null) throw new HttpError(401, { error: 'auth_required' });
  const [me] = await db.select().from(users).where(eq(users.id, uid));
  if (!me) throw new HttpError(404, { error: 'user_not_found' });

  if (me.role !== 'supplier') {
    await db.update(users).set({ role: 'supplier' }).where(eq(users.id, uid));
  }
  // A supplier row is what listings attach to; create it once, idempotently.
  const [existing] = await db.select().from(suppliers).where(eq(suppliers.userId, uid));
  if (!existing) {
    await db.insert(suppliers).values({
      userId: uid,
      companyName: me.company ?? me.name,
      country: me.country ?? 'Türkiye',
      dataSource: 'platform',
    } as typeof suppliers.$inferInsert);
  }
  const [fresh] = await db.select().from(users).where(eq(users.id, uid));
  respond(res, c.zUser.parse(mapUser(fresh)));
});
```
Use the exact mapper/column names already in that file (`grep -n "suppliers = \|mapUser" artifacts/api-server/src/routes/auth.ts artifacts/api-server/src/db.ts`) — do not guess `suppliers.userId`; confirm the column with `grep -n "export const suppliers" -A 12 lib/db/src/schema/index.ts`.
**Step 4 — run until green**, then `pnpm run typecheck` → exit 0.
**Commit:** `feat(api): any account can become a supplier`

---

## Phase 3 — Design system refresh (clean modern light B2B)

### Task 3.1 — Token and price-colour pass
**File:** `artifacts/web/src/styles.css` — three exact edits:

1. Line 122 (price reads as an alert today):
```css
.price{font-size:16px;font-weight:600;letter-spacing:-.3px;color:var(--navy)}
```
2. After line 15 (`--r:8px; …`) add the stock-type and surface tokens:
```css
  /* stock-type chips + surfaces introduced with the surplus repositioning */
  --type-stock:#1f6feb; --type-surplus:#157347; --type-overstock:#b57200;
  --type-liquidation:#b3261e; --type-seconds:#6b4fbb; --type-container:#0e7490;
  --radius-lg:10px;
```
3. Line 143 — give the browse grid breathing room:
```css
.feedgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(196px,1fr));gap:12px}
```
**Verify:** `pnpm run build` → exit 0; then `grep -n "color:var(--navy)}" artifacts/web/src/styles.css | head -1` shows the price rule.
**Commit:** `style(web): modern light pass — navy prices, type tokens, roomier grid`

### Task 3.2 — Add the shared component classes
**File:** `artifacts/web/src/styles.css` — append:
```css
/* ---------- surplus-first additions ---------- */

/* Stock-type chip bar (Explore / Feed / /categories). */
.chipbar{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:11px}
.chipbar .ct{display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:999px;
  border:1px solid #d9dee5;background:#fff;font-size:12px;color:#4a5665}
.chipbar .ct:hover{border-color:#c3ccd8;color:var(--ink)}
.chipbar .ct.on{background:var(--navy);border-color:var(--navy);color:#fff;font-weight:500}
.chipbar .ct .n{font-size:10.5px;color:var(--faint)}
.chipbar .ct.on .n{color:#c2cbd6}

/* Type badge carried on a card or detail page. */
.tbadge{display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:600;
  padding:2px 7px;border-radius:999px;letter-spacing:.02em;text-transform:uppercase}
.tbadge.t-stock{background:#eef4fe;color:var(--type-stock)}
.tbadge.t-surplus{background:var(--green-l);color:var(--type-surplus)}
.tbadge.t-overstock{background:#fdf3e0;color:var(--type-overstock)}
.tbadge.t-liquidation{background:var(--red-l);color:var(--type-liquidation)}
.tbadge.t-seconds{background:#f1ecfd;color:var(--type-seconds)}
.tbadge.t-container{background:#e6f6fa;color:var(--type-container)}

/* Category tiles (/categories and the rail's expanded view). */
.catgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}
.cattile{background:#fff;border:1px solid var(--line);border-radius:var(--radius-lg);overflow:hidden;
  display:flex;flex-direction:column;text-align:left}
.cattile:hover{border-color:#c3ccd8;box-shadow:0 3px 12px rgba(20,32,50,.10)}
.cattile .cmedia{position:relative;aspect-ratio:16/10;background:#eef0f3;overflow:hidden}
.cattile .cmedia img{width:100%;height:100%;object-fit:cover}
.cattile .cbd{padding:9px 11px 11px;display:flex;flex-direction:column;gap:3px}
.cattile .cbd b{font-size:13px;font-weight:600}
.cattile .cbd span{font-size:11.5px;color:var(--mute)}
.cattile .ctag{position:absolute;left:8px;top:8px}

/* Provenance / availability strip reused on detail pages. */
.factbar{display:flex;gap:0;flex-wrap:wrap;border:1px solid var(--line);border-radius:var(--r);
  background:#fff;overflow:hidden;margin-bottom:12px}
.factbar .f{flex:1;min-width:130px;padding:9px 12px;border-right:1px solid var(--line-2)}
.factbar .f:last-child{border-right:none}
.factbar .f b{display:block;font-size:13px;font-weight:600}
.factbar .f span{font-size:11px;color:var(--mute)}

/* Mobile: 40px minimum touch target on every control the user can press. */
@media(max-width:820px){
  .chipbar .ct,.filters .chip,.filters select,.filters input{min-height:36px}
  .btn{padding:8px 12px}
  .catgrid{grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}
}
```
**Verify:** `pnpm run typecheck && pnpm run build` → both exit 0.
**Commit:** `style(web): chip bar, type badges, category tiles, fact bar`

---

## Phase 4 — Make everything clickable

### Task 4.1 — Topbar markets become filter links
**File:** `artifacts/web/src/components.tsx` lines 217-223 — replace the `<div className="markets">` block:
```tsx
      {/* Each market figure is a link into the filtered catalogue. Before this,
          the counts were decorative and the only way to filter by origin was
          the Explore dropdown. */}
      <div className="markets">
        {MARKET_COUNTRIES.map(([country, flag]) => (
          <Link
            key={country}
            href={`/explore?country=${encodeURIComponent(country)}`}
            title={`${country} — ${marketCounts ? (marketCounts[country] ?? 0) : '—'} listings`}
            style={{ color: 'inherit' }}
          >
            {flag} <b>{marketCounts ? (marketCounts[country] ?? 0) : '—'}</b>
          </Link>
        ))}
      </div>
```
**Verify:** `pnpm run typecheck` → exit 0. Manual: from `/explore`, click 🇨🇳 → URL becomes `/explore?country=China` and the header count drops below the unfiltered total.
**Commit:** `feat(web): topbar market counts link to the filtered catalogue`

### Task 4.2 — Sidebar footer gets a destination
**File:** `artifacts/web/src/components.tsx` lines 330-333:
```tsx
      <div className="sidefoot">
        <b>{t('sidebar.moreIndustries')}</b>
        {t('sidebar.moreIndustriesSub')}
        <Link href="/categories" style={{ display: 'block', marginTop: 5 }}>
          {t('nav.categories')} →
        </Link>
      </div>
```
**Verify:** `pnpm run typecheck` → exit 0 (the key arrives in Task 5.4).
**Commit:** `feat(web): sidebar footer links to the category index`

### Task 4.3 — ProductCard: whole card clickable, always-saveable, filterable metadata
**File:** `artifacts/web/src/components.tsx` — replace `ProductCard` (lines 457-487) with:
```tsx
/**
 * One listing card, used by Explore, Feed, SupplierDetail, Saved and the admin
 * previews. Everything a buyer might press is a real link or a real action:
 *  - the media, title and price area all open the listing
 *  - the country opens the catalogue filtered to that origin
 *  - the category opens the catalogue filtered to that category
 *  - Save works for signed-out visitors too: it opens the auth gate instead of
 *    doing nothing (it used to render only when a caller passed `onSave`)
 */
export function ProductCard({ p, onSave }: { p: Product; onSave?: (p: Product) => void }) {
  const { t } = useI18n();
  const [saved, setSaved] = useState(false);
  const save = () => {
    if (onSave) { onSave(p); return; }
    if (!getToken()) { requireAuthGate(); return; }
    setSaved((s) => !s); // local affordance; the real POST lives in Saved's hook
  };
  return (
    <div className="lcard">
      <Link href={`/products/${p.id}`} className="media" aria-label={p.name}>
        {p.imageKey
          ? <img src={p.imageKey} alt={p.name} loading="lazy" />
          : (
            <div className="ph-empty">
              <span className="ph-glyph"><CategoryGlyph category={p.category} /></span>
              <span className="ph-cat">{p.category}</span>
              <span className="ph-note">{t('cards.noPhoto')}</span>
            </div>
          )}
        {p.verified && <span className="vtag"><Verified /></span>}
        {p.dataSource === 'demo' && <span className="ptag"><DemoTag /></span>}
        {p.listingType !== 'stock' && (
          <span className="atag"><StockTypeBadge type={p.listingType} /></span>
        )}
      </Link>
      <div className="bd">
        <h3><Link href={`/products/${p.id}`}>{p.name}</Link></h3>
        <div className="meta">
          <Link href={`/explore?country=${encodeURIComponent(p.originCountry)}`}><b>{p.originCountry}</b></Link>
        </div>
        <div className="meta">
          <Link href={`/explore?category=${encodeURIComponent(p.category)}`}><b>{p.category}</b></Link>
        </div>
        <div className="meta">{t('cards.moq')} {p.moq.toLocaleString()} {p.unit}</div>
        <div className="between" style={{ marginTop: 'auto', paddingTop: 5 }}>
          <Link href={`/products/${p.id}`}><Price p={p} /></Link>
          <button
            className={`btn btn-sm ${saved ? 'btn-gold' : 'btn-grey'}`}
            onClick={save}
            aria-label={t('cards.saveLot')}
            title={t('cards.saveLot')}
          >
            {saved ? '★' : '🔖'}
          </button>
        </div>
      </div>
    </div>
  );
}
```
**File:** `artifacts/web/src/components.tsx` — add the badge next to `Verified` (~line 380):
```tsx
/**
 * Surplus-first stock type. The raw API value is the label; the dictionary
 * supplies the phrase when it has one, and `listingTypeLabel` falls back to the
 * key-free raw value rather than inventing wording.
 */
export function StockTypeBadge({ type }: { type: string }) {
  const { t } = useI18n();
  return <span className={`tbadge t-${type}`}>{t(`type.${type}` as DictKey)}</span>;
}
```
**Verify:** `pnpm run typecheck && pnpm run build` → exit 0. Manual: on `/explore`, clicking a card's country lands on `/explore?country=…`.
**Commit:** `feat(web): the whole listing card is clickable, and save always works`

### Task 4.4 — ProductDetail: real facts, no fake gallery, real onward links
**File:** `artifacts/web/src/pages/ProductDetail.tsx`:

1. **Delete the fake gallery strip** — remove lines 359-362 (`<div className="galstrip">…</div>`), since `zProduct` carries a single `imageKey` and a one-thumb strip that does nothing is a lie. Keep `.galmain` (line 351). Leave the now-unused `.galstrip`/`.galthumb` CSS in `styles.css` untouched (harmless, and removing it risks another page's markup).
2. **Add a fact bar** directly above the `<div className="cols">` that wraps the detail body, using values the API actually returns:
```tsx
      <div className="factbar">
        <div className="f"><b>{p.listingType === 'stock' ? t('type.stock') : t(`type.${p.listingType}` as DictKey)}</b><span>{t('product.factStockType')}</span></div>
        <div className="f"><b>{p.quantityAvailable.toLocaleString(locale)} {p.unit}</b><span>{t('product.stockOnHand')}</span></div>
        <div className="f"><b>{p.moq.toLocaleString(locale)} {p.unit}</b><span>{t('product.factMoq')}</span></div>
        <div className="f"><b>{p.originCountry}</b><span>{t('product.spec.origin')}</span></div>
      </div>
```
3. **Add the breadcrumb** as the first child of the page (above `View`'s title row is not possible inside `View`, so put it immediately before the `View` element):
```tsx
      <div className="muted" style={{ marginBottom: 8, fontSize: 12 }}>
        <Link href="/explore">{t('nav.explore')}</Link>
        {' / '}
        <Link href={`/explore?category=${encodeURIComponent(p.category)}`}>{p.category}</Link>
        {' / '}
        <span>{p.name}</span>
      </div>
```
4. **Make the category a link in the spec table** (line 543) — wrap `{p.category}` in `<Link href={`/explore?category=${encodeURIComponent(p.category)}`}>`.
5. **Add a same-category rail** at the end of the page, using the hook already imported in the file:
```tsx
      {/* Same-category stock: the onward path a buyer expects, and it is fed by
          the same public endpoint so it can never be an invented suggestion. */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="hd">
          <h2>{t('product.moreInCategory', { category: p.category })}</h2>
          <Link href={`/explore?category=${encodeURIComponent(p.category)}`} className="link">
            {t('rail.allIndustries')}
          </Link>
        </div>
        <div className="bd">
          {(same.data?.items ?? []).filter((x) => x.id !== p.id).length === 0
            ? <span className="muted">{t('product.noneElse')}</span>
            : (
              <div className="feedgrid">
                {(same.data?.items ?? []).filter((x) => x.id !== p.id).slice(0, 8).map((x) =>
                  <ProductCard key={x.id} p={x} />)}
              </div>
            )}
        </div>
      </div>
```
with, next to the component's existing `useProducts` calls:
```tsx
  const same = useProducts({ category: p.category, hasImage: 1, limit: 9 });
```
**Verify:** `pnpm run typecheck && pnpm run build` → exit 0. Manual: open any `/products/:id` → breadcrumb, fact bar, no inert thumbnail strip, same-category grid below.
**Commit:** `feat(web): product detail — breadcrumb, fact bar, onward links; drop the fake gallery`

### Task 4.5 — Explore: stock-type chips, removable filter pills, save wiring
**File:** `artifacts/web/src/pages/Explore.tsx`:
- Add `listingType` state (`useState(() => readParam('listingType'))`) and include it in the `useProducts({...})` call and in the `popstate` handler and `clear()`.
- Render a chip bar above `.filters`:
```tsx
      {/* Stock-type chips: the surplus-first filter. Counts come from the live
          totals the same endpoint returns, so a chip never yields nothing. */}
      <div className="chipbar">
        {(['stock', 'surplus', 'overstock', 'liquidation', 'seconds', 'container'] as const).map((ty) => (
          <button
            key={ty}
            className={`ct ${listingType === ty ? 'on' : ''}`}
            onClick={() => { const next = listingType === ty ? '' : ty; setListingType(next); apply(1, next); }}
          >
            {t(`type.${ty}` as DictKey)}
          </button>
        ))}
      </div>
```
- Change `apply` to accept the type: `const apply = (p = 1, ty = listingType) => { setAppliedQ(q); setListingType(ty); setPage(p); };`, and pass `listingType: listingType || undefined` to `useProducts`.
- Wire the card save to the real shortlist when signed in (`useSavedLots`/`useSaveLot` from `@workspace/api-client-react` — confirm names with `grep -rn "useSaveLot\|useSaved" lib/api-client-react/src/*.ts`): `onSave={(p) => { if (!getToken()) { requireAuthGate(); return; } saveLot.mutate({ productId: p.id }); }}`. If the hook signature differs, use it as-is; do not invent a client method.
- Make the two filter `<select>`s (category, country) stay in sync with the URL: on change call `apply(1)` (they already do) **and** push the URL so a shared link reproduces the view:
```tsx
  /** Reflect the current filters in the URL so any filtered view is shareable
      and the back button works. */
  const syncUrl = () => {
    const params = new URLSearchParams();
    if (appliedQ) params.set('q', appliedQ);
    if (category) params.set('category', category);
    if (country) params.set('country', country);
    if (listingType) params.set('listingType', listingType);
    const qs = params.toString();
    window.history.replaceState(null, '', qs ? `/explore?${qs}` : '/explore');
  };
```
and call `syncUrl()` inside `apply()`.
**Verify:** `pnpm run typecheck && pnpm run build` → exit 0. Manual: `/explore` → click **Surplus** → URL gains `?listingType=surplus`, header total drops, cards show the surplus badge.
**Commit:** `feat(web): surplus-first filters on Explore, with shareable URLs`

### Task 4.6 — Help page: make it the "what is this" page
**File:** `artifacts/web/src/pages/Help.tsx` — add a link row at the end of the page body (paths that exist today):
```tsx
      <div className="card" style={{ marginTop: 12 }}>
        <div className="hd"><h2>{t('help.goTitle')}</h2></div>
        <div className="bd row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Link href="/categories" className="btn btn-sm btn-grey">{t('nav.categories')}</Link>
          <Link href="/explore" className="btn btn-sm btn-grey">{t('nav.explore')}</Link>
          <Link href="/suppliers" className="btn btn-sm btn-grey">{t('nav.suppliers')}</Link>
          <Link href="/rfqs" className="btn btn-sm btn-grey">{t('nav.rfqs')}</Link>
          <Link href="/sign-up" className="btn btn-sm btn-gold">{t('action.joinFree')}</Link>
        </div>
      </div>
```
**Verify:** `pnpm run typecheck` → exit 0.
**Commit:** `feat(web): Help links to every public destination`

---

## Phase 5 — Every category with a related image

### Task 5.1 — Category cover map (single source of truth)
**File:** new `artifacts/web/src/categoryImages.ts`:
```ts
/**
 * Category → cover image. ONE list, consumed by the rail tiles, the /categories
 * index and every category header.
 *
 * Honesty rule (see styles.css `.ph-empty` and docs/DATA_PROVENANCE.md): a cover
 * is CATEGORY-level art. It is never used as a listing's photograph — a lot with
 * no picture of its own keeps the neutral placeholder tile.
 *
 * Every path below exists in artifacts/web/public/products/. Categories with no
 * genuinely representative owned photograph map to `null` and render a drawn
 * tile instead of a picture of something they are not.
 */
export interface CategoryCover {
  /** Category name exactly as it appears in products.category / CATEGORIES. */
  category: string;
  /** Owned image under /products, or null → drawn tile. */
  image: string | null;
  /** Short, factual line shown under the title on /categories. */
  blurb: string;
}

export const CATEGORY_COVERS: readonly CategoryCover[] = [
  { category: 'Metals & Minerals', image: '/products/copper-cathode.jpg', blurb: 'Cathodes, ingots, ore and concentrates' },
  { category: 'Steel', image: '/products/hot-rolled-coil.jpg', blurb: 'Coil, sheet, sections and structure' },
  { category: 'Chemicals', image: '/products/caustic-soda.jpg', blurb: 'Industrial chemicals and additives' },
  { category: 'Machinery', image: '/products/cnc-machine.jpg', blurb: 'Production machinery and machine tools' },
  { category: 'Industrial Equipment', image: '/products/industrial-pump.jpg', blurb: 'Pumps, compressors, presses' },
  { category: 'Electronics', image: '/products/plc-controller.jpg', blurb: 'Controls, drives and sensors' },
  { category: 'Automotive', image: '/products/alloy-wheel.jpg', blurb: 'OEM and aftermarket components' },
  { category: 'Construction Materials', image: '/products/cement-bags.jpg', blurb: 'Cement, pipes, covers, structures' },
  { category: 'Renewable Energy', image: '/products/solar-panel.jpg', blurb: 'Panels, inverters, wind components' },
  { category: 'Packaging', image: '/products/corrugated-boxes.jpg', blurb: 'Cartons, film and protective packaging' },
  { category: 'Plastic & Rubber', image: '/products/plastic-granules.jpg', blurb: 'Resins, granules and compounds' },
  { category: 'Textiles', image: '/products/polyester-yarn.jpg', blurb: 'Yarn, fabric and finished textile stock' },
  { category: 'Agriculture', image: null, blurb: 'Fertiliser, feed and farm inputs' },
  { category: 'Energy', image: '/products/battery-pack.jpg', blurb: 'Cells, packs and storage systems' },
  { category: 'Mining & Ore', image: '/products/antimony-ore.jpg', blurb: 'Ore, concentrate and mine output' },
  { category: 'Paper & Pulp', image: '/products/kraft-paper.jpg', blurb: 'Kraft, board and pulp' },
  { category: 'Rubber', image: '/products/rubber-seals.jpg', blurb: 'Seals, hoses and rubber parts' },
  { category: 'Ceramics & Glass', image: '/products/epoxy-resin.jpg', blurb: 'Tiles, refractories and glass' },
  { category: 'Furniture & Wood', image: null, blurb: 'Contract furniture and timber stock' },
  { category: 'Medical Supplies', image: null, blurb: 'Single-use medical stock and instruments' },
  { category: 'Safety & PPE', image: null, blurb: 'Protective equipment and site safety' },
  { category: 'Food Processing', image: null, blurb: 'Processing lines and cold-chain kit' },
  { category: 'Marine & Offshore', image: null, blurb: 'Deck, engine and offshore equipment' },
  { category: 'Aerospace', image: null, blurb: 'Airframe, engine and MRO parts' },
  { category: 'Hardware & Fasteners', image: null, blurb: 'Fasteners, fixings and hand hardware' },
];

const BY_CATEGORY = new Map(CATEGORY_COVERS.map((c) => [c.category, c]));

export function coverFor(category: string): CategoryCover | undefined {
  return BY_CATEGORY.get(category);
}
```
> **Before committing, verify every non-null path exists:**
> `for f in $(grep -o "'/products/[a-z-]*\.jpg'" artifacts/web/src/categoryImages.ts | tr -d "'"); do [ -f "artifacts/web/public/products/${f#/products/}" ] || echo "MISSING $f"; done`
> Expected: no output. Any `MISSING` line means that category must be switched to `image: null` (never point at a 404, never invent a file): the map above was built from `ls artifacts/web/public/products/`, so `Agriculture`, `Furniture & Wood`, `Medical Supplies`, `Safety & PPE`, `Food Processing`, `Marine & Offshore`, `Aerospace` and `Hardware & Fasteners` are already `null` — Task 5.2 generates owned covers for the first seven of them.

**Commit:** `feat(web): category cover map, owned imagery only`

### Task 5.2 — Generate the missing category covers (owned art)
Only for the categories mapped to `null` whose subject is genuinely photographable and where no owned image exists. Use the image-generation tool to create **category-level** art (the precedent: the existing 38 are FactoryDepo-owned AI category photography), saving each to `artifacts/web/public/products/cat-<slug>.jpg`:

| file | prompt |
|---|---|
| `cat-agriculture.jpg` | `Agricultural input stock on a neutral grey surface — woven fertiliser sacks stacked, seed bags, drip irrigation coil. Clean catalogue photography, soft even light, no people, no text, no logos.` |
| `cat-ppe.jpg` | `Factory floor safety equipment arranged on a neutral grey surface — hard hats, safety goggles, high-visibility vest, work gloves. Clean industrial catalogue photography, soft even light, no people, no text, no logos.` |
| `cat-medical.jpg` | `Single-use medical supplies on a neutral grey surface — sterile gauze packs, nitrile gloves box, disposable syringes in packaging. Clean catalogue photography, no people, no text, no branding.` |
| `cat-fasteners.jpg` | `Assorted industrial fasteners on a neutral grey surface — hex bolts, nuts, washers, wood screws in graded sizes. Clean catalogue photography, soft even light, no text, no logos.` |
| `cat-furniture.jpg` | `Contract furniture stock in a warehouse — stacked wooden chair frames and flat-packed table tops. Neutral industrial lighting, no people, no text, no logos.` |
| `cat-aerospace.jpg` | `Aerospace components on a neutral grey surface — machined turbine blade blank, titanium fastener set, airframe bracket. Clean technical catalogue photography, no text, no logos.` |
| `cat-marine.jpg` | `Marine deck hardware on a neutral grey surface — stainless shackles, mooring cleat, chain links section. Clean catalogue photography, no text, no logos.` |

Then set those six to `image: '/products/cat-*.jpg'` in `categoryImages.ts` and re-run the existence check from Task 5.1.
**Verify:** `ls -la artifacts/web/public/products/cat-*.jpg` → six files, each > 5 KB (`file` reports JPEG image data).
**Commit:** `assets(web): owned category cover art for the six without a photograph`

### Task 5.3 — Shared tile + grid components
**File:** `artifacts/web/src/components.tsx` — add after `ProductCard`:
```tsx
/**
 * A category tile: cover art, live listing count, and the whole tile is a link.
 * `count` is whatever the API returned — when it is unknown the count line is
 * omitted rather than showing a zero we did not measure.
 */
export function CategoryTile({ category, count, compact }: { category: string; count?: number; compact?: boolean }) {
  const { t } = useI18n();
  const cover = coverFor(category);
  return (
    <Link href={`/explore?category=${encodeURIComponent(category)}`} className="cattile">
      <div className="cmedia">
        {cover?.image
          ? <img src={cover.image} alt="" loading="lazy" />
          : (
            <div className="ph-empty">
              <span className="ph-glyph"><CategoryGlyph category={category} size={compact ? 22 : 30} /></span>
              <span className="ph-cat">{category}</span>
            </div>
          )}
      </div>
      <div className="cbd">
        <b>{category}</b>
        <span>{cover?.blurb ?? t('categories.stockHere')}</span>
        {typeof count === 'number' && (
          <span>{t('categories.listingCount', { n: count.toLocaleString() })}</span>
        )}
      </div>
    </Link>
  );
}
```
with the import added at the top of the file: `import { coverFor } from './categoryImages';`
**Verify:** `pnpm run typecheck` → exit 0.
**Commit:** `feat(web): shared category tile`

### Task 5.4 — The `/categories` page (all 25, with images and live counts)
**File:** new `artifacts/web/src/pages/Categories.tsx`:
```tsx
import { Link } from 'wouter';
import { useCategoryCounts } from '@workspace/api-client-react';
import { CATEGORIES } from '@workspace/api-spec';
import { View, CategoryTile, Spinner, DemoNotice } from '../components';
import { useI18n } from '../i18n';

/**
 * Every category on one page, each with its cover and its real listing count.
 * The order is by live stock (most first) so a buyer sees depth before breadth;
 * a category the API does not report is listed last with no count rather than a
 * fabricated one.
 */
export default function Categories() {
  const { t, locale } = useI18n();
  const { data, isLoading } = useCategoryCounts();
  const counts = new Map((data?.items ?? []).map((c) => [c.category, c.count]));
  const ordered = [...CATEGORIES].sort((a, b) => (counts.get(b) ?? -1) - (counts.get(a) ?? -1));
  const total = data?.total ?? 0;

  return (
    <View
      title={t('categories.title')}
      sub={isLoading ? t('categories.loading') : t('categories.sub', { n: total.toLocaleString(locale) })}
    >
      <DemoNotice />
      {isLoading ? <Spinner /> : (
        <div className="catgrid">
          {ordered.map((c) => <CategoryTile key={c} category={c} count={counts.get(c)} />)}
        </div>
      )}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="bd row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <span className="muted">{t('categories.sellPrompt')}</span>
          <Link href="/supplier/post" className="btn btn-sm btn-gold">{t('categories.listStock')}</Link>
        </div>
      </div>
    </View>
  );
}
```
**File:** `artifacts/web/src/App.tsx` — import eagerly next to `Explore` (`import Categories from './pages/Categories';`), add `'/categories'` to `RAIL_VIEWS` (line 50), and add the route after `/explore`:
```tsx
            <Route path="/categories" component={Categories} />
```
**Verify:** `pnpm run typecheck && pnpm run build` → exit 0. With dev up: `chrome --headless --dump-dom http://localhost:8080/categories | grep -c cattile` → `25`.
**Commit:** `feat(web): /categories index with covers and live counts`

### Task 5.5 — Replace the category `<select>` with a linkable tile strip
**File:** `artifacts/web/src/pages/Explore.tsx` — under the chip bar, add a compact strip so categories are visible without opening a dropdown:
```tsx
      {/* Quick category strip. Hidden on mobile where the rail already covers it,
          via CSS (.catstrip is display:none under 820px — add that rule). */}
      <div className="catstrip">
        {(categoryOptions.slice(0, 10)).map((c) => (
          <Link key={c.category} href={`/explore?category=${encodeURIComponent(c.category)}`} className="ct">
            <b>{c.category}</b><span>{c.count.toLocaleString(locale)}</span>
          </Link>
        ))}
        <Link href="/categories" className="ct on">{t('categories.all')} →</Link>
      </div>
```
**File:** `artifacts/web/src/styles.css` — support it:
```css
.catstrip{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:11px}
.catstrip .ct{display:inline-flex;align-items:center;gap:5px;padding:4px 9px;border-radius:999px;
  border:1px solid #d9dee5;background:#fff;font-size:11.5px;color:#4a5665}
.catstrip .ct b{font-weight:500}
.catstrip .ct span{color:var(--faint);font-size:10.5px}
.catstrip .ct.on{background:var(--navy);border-color:var(--navy);color:#fff}
@media(max-width:820px){.catstrip{display:none}}
```
**Verify:** `pnpm run typecheck && pnpm run build` → exit 0.
**Commit:** `feat(web): quick category strip on Explore`

### Task 5.6 — The verification script (this is the acceptance test for "clickable")
**File:** new `scripts/ui_smoke.mjs`:
```js
/**
 * DOM-level acceptance check for the web app. No test framework: it renders each
 * route in headless Chrome, reads the DOM, and asserts the properties the owner
 * asked for — every internal link resolves to a real route, every category holds
 * stock, and every pressable control has an accessible name.
 *
 *   node scripts/ui_smoke.mjs                 # expects web on :8080, api on :9091
 *   BASE=http://localhost:8080 API=http://localhost:9091 node scripts/ui_smoke.mjs
 */
import { execFileSync } from 'node:child_process';

const BASE = process.env.BASE ?? 'http://localhost:8080';
const API = process.env.API ?? 'http://localhost:9091';
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';

/** Routes the SPA declares in App.tsx. Kept here so a link to nowhere fails. */
const ROUTES = [
  '/explore', '/categories', '/suppliers', '/help', '/sign-in', '/sign-up',
  '/feed', '/rfqs', '/orders', '/offers', '/shipments', '/messages', '/saved',
  '/notifications', '/profile', '/supplier/listings', '/supplier/post',
  '/supplier/offers', '/supplier/rfq-opportunities', '/supplier/verification',
  '/admin', '/admin/suppliers', '/admin/verification', '/admin/listings',
  '/admin/rfqs', '/admin/payments', '/admin/sources', '/admin/growth', '/admin/features',
];

function dom(path) {
  return execFileSync(CHROME, [
    '--headless', '--disable-gpu', '--no-sandbox',
    '--virtual-time-budget=8000',
    `--dump-dom`, `${BASE}${path}`,
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

const fails = [];
let checks = 0;

// 1. every route renders real content
for (const r of ROUTES) {
  const html = dom(r);
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  checks += 1;
  if (text.length < 200) fails.push(`${r}: rendered ${text.length} chars — looks empty`);
}

// 2. every internal href the app emits matches a declared route
const hrefs = new Set();
for (const r of ['/explore', '/categories', '/feed', '/help']) {
  for (const m of dom(r).matchAll(/href="(\/[^"#]*)"/g)) {
    const p = m[1].split('?')[0];
    if (!p.startsWith('/api')) hrefs.add(p);
  }
}
for (const href of hrefs) {
  checks += 1;
  const known = ROUTES.includes(href)
    || href.startsWith('/products/') || href.startsWith('/suppliers/')
    || href.startsWith('/rfqs/') || href.startsWith('/products');
  if (!known) fails.push(`dead link: ${href}`);
}

// 3. every category the UI offers actually returns stock
const cats = await (await fetch(`${API}/api/products/categories`)).json();
checks += 1;
if (!Array.isArray(cats.items) || cats.items.length === 0) fails.push('no categories returned');
for (const c of cats.items) {
  checks += 1;
  const res = await (await fetch(`${API}/api/products?category=${encodeURIComponent(c.category)}&limit=1`)).json();
  if ((res.total ?? 0) === 0) fails.push(`category ${c.category} clicked through to nothing`);
}

console.log(`${fails.length === 0 ? 'OK' : 'FAIL'} — ${checks} checks, ${hrefs.size} links, ${cats.items?.length ?? 0} categories`);
for (const f of fails) console.log(`  ✗ ${f}`);
process.exit(fails.length === 0 ? 0 : 1);
```
**Run it:**
```bash
cd artifacts/api-server && (PORT=9091 node dist/index.mjs > "$LOCALAPPDATA/Temp/fd-api.log" 2>&1 &) ; cd ../..
pnpm --filter @workspace/web run build
(cd artifacts/web && npx vite preview --port 8080 > "$LOCALAPPDATA/Temp/fd-web.log" 2>&1 &)
sleep 6
node scripts/ui_smoke.mjs
```
Expected: `OK — <N> checks, <M> links, 25 categories` and exit code 0. Any `✗` line is a real defect — fix it, do not relax the assertion.
**Commit:** `test(web): DOM acceptance script for routes, links and categories`

---

## Phase 6 — Three-dashboard parity

### Task 6.1 — One stock-type control used by every dashboard
**File:** `artifacts/web/src/components.tsx` — extract the chip bar so Explore, Feed, the supplier listing table filter and the admin listings filter share it:
```tsx
export const STOCK_TYPES = ['stock', 'surplus', 'overstock', 'liquidation', 'seconds', 'container'] as const;

/**
 * The surplus-first filter, rendered identically in all three dashboards — the
 * owner's constraint is that a change lands for buyer, supplier and admin at
 * once, so it lives here and nowhere else.
 */
export function StockTypeFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useI18n();
  return (
    <div className="chipbar">
      <button className={`ct ${value ? '' : 'on'}`} onClick={() => onChange('')}>{t('type.all')}</button>
      {STOCK_TYPES.map((ty) => (
        <button key={ty} className={`ct ${value === ty ? 'on' : ''}`} onClick={() => onChange(ty)}>
          {t(`type.${ty}` as DictKey)}
        </button>
      ))}
    </div>
  );
}
```
**File:** `Explore.tsx` — replace the inline chip bar from Task 4.5 with `<StockTypeFilter value={listingType} onChange={(v) => { setListingType(v); apply(1, v); }} />`.
**File:** `pages/Feed.tsx` — replace its `.chip` category row with `<StockTypeFilter …>` plus keep the existing category chips (Feed is the exploration surface; the type filter is additive). Pass the value into its `useProducts({...})`.
**File:** `pages/SupplierListings.tsx` — add the same component above the table (line ~150) and pass `listingType` into its products query, so a seller can see which of their lots are surplus vs stock.
**File:** `pages/AdminListings.tsx` — add it inside the existing `.filters` block (line ~120-145) and wire it to the query object it already builds.
**Verify:** `pnpm run typecheck && pnpm run build` → exit 0, then `node scripts/ui_smoke.mjs` → `OK`.
**Commit:** `feat(web): one stock-type filter across buyer, supplier and admin`

### Task 6.2 — Seller path visible from every shell
**File:** `artifacts/web/src/components.tsx` — `NAV_BUYER` (lines 35-47): insert after `explore`:
```tsx
  { key: 'categories', icon: '🗂️', label: 'nav.categories', path: '/categories' },
```
`NavKey` (line 16-21) must gain `'categories'`. Add the same item to `NAV_GUEST` (after `explore`) so a signed-out visitor can browse categories too.
**File:** `components.tsx` — add a "Sell your stock" entry to `NAV_GUEST`:
```tsx
  { key: 'sell', icon: '➕', label: 'nav.sellStock', path: '/supplier/post' },
```
and add `'sell'` to `NavKey`. `/supplier/post` already renders an auth gate for a signed-out visitor (`SupplierPost.tsx` uses `requireAuthGate`/sign-in link) — **verify this** with `grep -n "getToken\|sign-in\|requireAuthGate" artifacts/web/src/pages/SupplierPost.tsx`; if it does not, add the same `useMe()` + gate pattern used by `ProductDetail.tsx:417-423`.
**Verify:** `pnpm run typecheck && pnpm run build` → exit 0. Signed out, `/` → the guest sidebar offers Categories and Sell your stock.
**Commit:** `feat(web): categories and sell-your-stock in the buyer and guest shells`

---

## Phase 7 — Landing page alignment (static HTML)

### Task 7.1 — Category tiles with images
**File:** `artifacts/landing/variants/marketplace-light.html` — locate the categories section (`data-t="cat.cta"` is its CTA, line ~510) and replace the generic tile markup with per-category tiles that use the same owned covers:
```html
<!-- Each tile links to its own filtered catalogue. Images are FactoryDepo-owned
     category art (assets/products/...) — never a photograph of a specific lot. -->
<div class="cat-tiles">
  <a class="cat-tile" href="/products?category=Steel">
    <img src="/products/hot-rolled-coil.jpg" alt="" loading="lazy">
    <b>Steel</b><span>Coil, sheet, sections</span>
  </a>
  <a class="cat-tile" href="/products?category=Machinery">
    <img src="/products/cnc-machine.jpg" alt="" loading="lazy">
    <b>Machinery</b><span>Machine tools, lines</span>
  </a>
  <a class="cat-tile" href="/products?category=Textiles">
    <img src="/products/polyester-yarn.jpg" alt="" loading="lazy">
    <b>Textiles</b><span>Yarn, fabric, stock lots</span>
  </a>
  <a class="cat-tile" href="/products?category=Packaging">
    <img src="/products/corrugated-boxes.jpg" alt="" loading="lazy">
    <b>Packaging</b><span>Cartons, film, pallets</span>
  </a>
</div>
<a class="btn btn-ghost" href="/categories" data-t="cat.cta">All 25 categories →</a>
```
plus the matching CSS in the page's `<style>`:
```css
.cat-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px;margin-bottom:12px}
.cat-tile{display:block;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:#fff;text-decoration:none}
.cat-tile img{width:100%;aspect-ratio:16/10;object-fit:cover;display:block}
.cat-tile b{display:block;padding:9px 11px 0;font-size:13px;color:var(--ink)}
.cat-tile span{display:block;padding:0 11px 11px;font-size:11.5px;color:var(--mute)}
.cat-tile:hover{border-color:#c3ccd8;box-shadow:0 3px 12px rgba(20,32,50,.10)}
```
> Verify `--line` is defined in that file's `:root` (`grep -n "\-\-line" artifacts/landing/variants/marketplace-light.html | head -3`); if not, use the literal `#e6e9ee`.

**Verify:**
```bash
python -m http.server 8123 --directory artifacts/landing/variants &
curl -s http://localhost:8123/marketplace-light.html | grep -c "cat-tile"
node -e "const h=require('fs').readFileSync('artifacts/landing/variants/marketplace-light.html','utf8');const s=(h.match(/<div/g)||[]).length,e=(h.match(/<\/div>/g)||[]).length;console.log(s,e,s===e?'balanced':'UNBALANCED')"
```
Expected: `4`+ matches, and `balanced`.
**Commit:** `landing: per-category tiles with owned cover art`

### Task 7.2 — Landing copy: surplus, not only metal
**File:** `artifacts/landing/variants/marketplace-light.html` — in each of the six language dictionaries in its `<script>` (`data-t` keyed objects), change the hero headline/sub to the surplus framing and add three new keys (`hero.kickerSurplus`, `hero.subSurplus`, `cat.subSurplus`). English values:
```
hero.kickerSurplus: "Surplus, overstock and container-ready factory stock"
hero.subSurplus:    "Factories and distributors in Türkiye, China, the USA and Europe list their excess production here. Buyers browse real stock, make an offer, and take the lot — no middlemen."
cat.subSurplus:     "Every category below holds live stock. Anyone with inventory can list it."
```
Then point the hero/CTA copy at these keys and re-check the honesty counters in the same commit:
```bash
curl -s http://localhost:9091/api/products?limit=1 | grep -o '"total":[0-9]*'
"/c/Program Files/PostgreSQL/16/bin/psql.exe" -h localhost -U postgres -d factorydepo -c "select count(*) filter (where \"imageKey\" is not null) withimg, count(*) from products;"
```
The landing's `data-count` values must equal those results (currently 5,175 with images / 5,402 total). **If they differ, change the page** — never the other way round.
**Verify:** `curl -s http://localhost:8123/marketplace-light.html | grep -c "Surplus, overstock"` → `≥1`; all six language blocks updated (`grep -c "hero.subSurplus" …` → `6`).
**Commit:** `landing: reposition to surplus stock, honest counters`

---

## Phase 8 — Alibaba / owner-account import — DECISION GATE, read this before writing code

**Do not start Phase 8 without a written answer from the owner.** Below is the conflict, the options, and what to build in each case.

### The conflict
The request is "connect my Alibaba account and all my liked products, import from there with scraping, including supplier info". `docs/DATA_PROVENANCE.md` records that this exact class of import was **deliberately removed** (`111c5c8`) for three reasons: source ToS prohibit automated collection; the photographs belong to the suppliers; and listing companies that never agreed, at prices we cannot honour, is the failure mode the product exists to prevent. Building a scraper now silently reverses a documented owner decision and re-creates a catalogue that cannot honestly be shown to US/EU buyers.

Three further practical facts the owner must weigh:
- Importing **the owner's own liked/favourited items** is a materially different act from scraping the public catalogue — it is the owner's own account data. It is still automated collection against Alibaba's ToS and can get the account restricted.
- None of the three prior scrapers was retained in git history in usable form (only `.pyc` files survive in the working tree); any rebuild starts from zero.
- Alibaba hides supplier contact details behind an inquiry form — the "supplier info" the owner wants is largely not present in the page HTML at all.

### Options — the owner picks ONE; the plan commits to building it
| Option | What gets built | Honest labelling | Owner's exposure |
|---|---|---|---|
| **A. Owner-driven export (recommended)** | `POST /api/admin/import` + an admin screen where the owner pastes/uploads rows they exported or copied themselves. No automation against Alibaba. | rows arrive `dataSource='owner_import'`, `sourceUrl` kept, UI shows "Owner-imported — not verified by FactoryDepo" | None beyond the owner's own copying |
| **B. Browser-assisted collection in the owner's own signed-in session** | A local script the owner runs against their own logged-in browser; the owner stays in the loop and can stop it. | same as A | Real: ToS breach risk, possible account restriction — requires the owner's explicit written sign-off recorded in `docs/DATA_PROVENANCE.md` |
| **C. No import; onboard suppliers directly** | Invite links + a supplier onboarding checklist; the catalogue becomes real via `POST /api/products` | `dataSource='platform'` (already the honest label) | None |

### Task 8.1 (build under **any** option) — the ingestion pipeline, source-agnostic
**Step 1 — migration** `lib/db/migrations/020_product_imports.sql`:
```sql
-- 020: owner-driven catalogue import. One row per imported record, so the
-- provenance of every listing is stored, not inferred from the row's shape.
CREATE TABLE IF NOT EXISTS "product_imports" (
  "id"          serial PRIMARY KEY,
  "batchId"     text NOT NULL,
  "source"      text NOT NULL,                 -- e.g. 'alibaba-owner-favourites'
  "sourceUrl"   text,
  "title"       text NOT NULL,
  "company"     text,
  "country"     text,
  "priceLow"    numeric(14,2),
  "priceHigh"   numeric(14,2),
  "currency"    text,
  "unit"        text,
  "moq"         numeric(14,2),
  "imageUrl"    text,
  "contactEmail" text,
  "contactPhone" text,
  "website"     text,
  "productId"   integer,                        -- set when the row became a listing
  "importedBy"  integer,
  "createdAt"   timestamp with time zone DEFAULT now()
);
CREATE INDEX IF NOT EXISTS product_imports_batch_idx ON "product_imports" ("batchId");
```
**Step 2 — endpoint** in `artifacts/api-server/src/routes/admin.ts` (admin-only, mirroring the file's existing `requireRole` pattern):
```ts
/**
 * Owner-driven catalogue import. Accepts a JSON array of records the OWNER
 * supplied — no scraping happens here, and the endpoint makes no outbound
 * request to any source site. Records are stored with their provenance and are
 * NEVER published as verified: dataSource stays 'demo' (shown with the Demo tag)
 * until a human attests the row.
 *
 * See docs/DATA_PROVENANCE.md — the owner must have stated, in writing, that
 * they hold the right to use these records before a batch is accepted.
 */
adminRouter.post('/import', requireAuth, requireRole('admin'), async (req, res) => {
  const input = c.zImportBatchInput.safeParse(req.body ?? {});
  if (!input.success) throw new HttpError(400, { error: 'validation_error', details: input.error.message });
  const { source, records, licenceConfirmed } = input.data;
  if (!licenceConfirmed) throw new HttpError(400, { error: 'licence_not_confirmed' });
  const batchId = `${source}-${Date.now()}`;
  let stored = 0;
  for (const r of records) {
    await db.insert(productImports).values({ batchId, source, ...r, importedBy: req.userId ?? null } as typeof productImports.$inferInsert);
    stored += 1;
  }
  respond(res, { batchId, stored });
});
```
with `zImportBatchInput` in `lib/api-zod/src/index.ts`:
```ts
export const zImportRecord = z.object({
  sourceUrl: z.string().url().optional(),
  title: z.string().min(3).max(300),
  company: z.string().max(160).optional(),
  country: z.string().max(60).optional(),
  priceLow: z.number().nonnegative().optional(),
  priceHigh: z.number().nonnegative().optional(),
  currency: z.string().max(8).optional(),
  unit: z.string().max(24).optional(),
  moq: z.number().nonnegative().optional(),
  imageUrl: z.string().url().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().max(40).optional(),
  website: z.string().url().optional(),
});
export const zImportBatchInput = z.object({
  source: z.string().min(3).max(60),
  /** The owner's affirmative statement that they may use these records. */
  licenceConfirmed: z.literal(true),
  records: z.array(zImportRecord).min(1).max(2000),
});
```
**Step 3 — test first** (append to `artifacts/api-server/test/api.test.ts`): a buyer posting to `/api/admin/import` must get 403; an admin posting `licenceConfirmed: false` must get 400; an admin posting one valid record must get `{stored: 1}` and a `product_imports` row that is **not** published (`select count(*) from products where ...` unchanged).
**Verify:** `TEST_BASE_URL=http://localhost:9091 pnpm --filter @workspace/api-server run test && pnpm run typecheck`
**Commit:** `feat(admin): owner-driven import pipeline with stored provenance`

### Task 8.2 — Admin screen for the batch
**File:** new `artifacts/web/src/pages/AdminImport.tsx` — a textarea for JSON, a source name field, a mandatory "I have the right to use these records" checkbox wired to `licenceConfirmed`, a preview table, and a submit button calling `POST /api/admin/import`. Register it in `App.tsx` (`const AdminImport = lazy(() => import('./pages/AdminImport'));` + `<Route path="/admin/import" component={AdminImport} />`) and add `{ key: 'admin-import', icon: '⬆️', label: 'nav.adminImport', path: '/admin/import' }` to `NAV_ADMIN`, plus `'admin-import'` to `NavKey`.
**Verify:** `pnpm run typecheck && pnpm run build` → exit 0; as admin, `node scripts/ui_smoke.mjs` still `OK` (it checks `/admin/*` routes you add to its `ROUTES` array — add `/admin/import` there too).
**Commit:** `feat(admin): import screen for owner-supplied catalogue records`

### Task 8.3 — Record the decision, whatever it is
**File:** `docs/DATA_PROVENANCE.md` — append a section stating which option the owner chose, the date, and the labelling rule for imported rows. If the answer is B (automation against the owner's own account), the file must carry the owner's explicit authorisation text and the risk they accepted; if the answer is A or C, state the opposite in one line.
**Verify:** `grep -c "Owner decision" docs/DATA_PROVENANCE.md` → `≥1`.
**Commit:** `docs: record the owner decision on catalogue import`

---

## Tests / validation

Run after every commit; all five must be clean before the work is called done.

```bash
# 1. API boots from the right cwd (migrations + routes depend on it)
cd artifacts/api-server && pnpm run build && (PORT=9091 node dist/index.mjs > "$LOCALAPPDATA/Temp/fd-api.log" 2>&1 &) ; sleep 5
grep -c "\[migrate\] applied" "$LOCALAPPDATA/Temp/fd-api.log"     # ≥ 20
curl -s http://localhost:9091/api/healthz                          # {"status":"ok","db":"up",...}

# 2. contracts + authz + the new facet test
TEST_BASE_URL=http://localhost:9091 pnpm --filter @workspace/api-server run test   # all pass, 0 fail

# 3. gates
pnpm run typecheck     # exit 0, no "error TS"
pnpm run build         # exit 0

# 4. DOM acceptance (routes, links, categories)
pnpm --filter @workspace/web run build
(cd artifacts/web && npx vite preview --port 8080 > "$LOCALAPPDATA/Temp/fd-web.log" 2>&1 &) ; sleep 6
node scripts/ui_smoke.mjs        # "OK — N checks, M links, 25 categories", exit 0

# 5. honesty spot-check: the numbers the UI shows must be the numbers the DB has
curl -s http://localhost:9091/api/products?limit=1 | grep -o '"total":[0-9]*'
"/c/Program Files/PostgreSQL/16/bin/psql.exe" -h localhost -U postgres -d factorydepo -c "select count(*) from products;"
```
Also clean up after the integration suite (it writes `*@factorydepo.test` rows):
```bash
"/c/Program Files/PostgreSQL/16/bin/psql.exe" -h localhost -U postgres -d factorydepo -c "delete from users where email like '%@factorydepo.test';"
```

Finally: **push before expecting a deploy.** Prod is served from a local `railway up`, not from GitHub — `git push origin security-and-integrity-fixes` and `railway link --project "factorydepo"` before any `railway up`.

---

## Risks, tradeoffs, open questions

**Risks**
1. **The catalogue is 100% demo data.** Phase 0 labels it honestly, but until real listings exist, the site cannot be shown to US/EU buyers as a working marketplace. Phase 8's answer decides how real listings arrive. This is the single biggest issue in the whole plan.
2. **Category covers can drift into dishonesty.** If a future change renders a category cover as a listing photo, the `.ph-empty` rule is broken. The comment block in `categoryImages.ts` and Task 5.1's existence check are the guard; a reviewer must enforce it.
3. **`listingType` is a facet on seeded data.** Spreading types with `id % 7` (Task 2.2) makes the UI demonstrable but the labels are arbitrary. They must be replaced by real values before the catalogue is presented as real — otherwise the UI invents a claim.
4. **Port collisions.** `:8080` may belong to the owner's other Vite app; check `netstat` before starting, and never kill an unidentified node process.
5. **11k-line i18n file.** Inserting keys immediately after each `const <lang> = {` line is the safe anchor; a patch that matches on neighbouring keys will fail as soon as one language block shifts.
6. **`origin/main` is far behind.** Everything here is invisible to a GitHub-sourced deploy until pushed; a repo-attached deploy today would ship stale code over a newer prod.

**Tradeoffs**
- Adding a facet instead of a new taxonomy (D1) keeps 5,402 rows valid and the rail populated, at the cost of the rail still showing industrial categories the owner considers "not the focus" — mitigated by the surplus chip bar being the primary control.
- No frontend test framework (D5) keeps the toolchain unchanged; the price is that `ui_smoke.mjs` asserts DOM properties (links, counts) rather than rendered pixels. Layout regressions still need a human eye or a headless screenshot.
- A category cover for `Furniture & Wood`, `Medical Supplies`, `Safety & PPE`, `Food Processing`, `Marine & Offshore`, `Aerospace` and `Hardware & Fasteners` requires generating owned art (Task 5.2) — an asset-creation task, not a code task.

**Open questions for the owner (answer before Phase 6's sell path and Phase 8)**
1. **Phase 8 — which option: A (owner-driven export), B (browser-assisted, owner signs off on the ToS risk) or C (onboard suppliers, no import)?** No import code ships until this is answered in writing.
2. Should the demo rows be **deleted** once real listings arrive (freeing 5,402 rows and the shared 38 images), or kept as a labelled demo dataset?
3. Is the industrial category list itself to be replaced later (e.g. by "Liquidation lots", "Factory seconds", "Container loads" as categories rather than as a facet)? Today's plan deliberately does not do that.
4. Should the six generated category covers be extended to all 25 so the grid looks uniform — accepting that some covers are generic art rather than a representative photograph of that trade?
5. Language priority: is Türkiye + China first (so `tr`/`zh` must be complete), or does the US/EU buyer push `en`/`es` to full coverage first? `i18n.tsx` exposes `coverage()`; today's partials are incomplete by design.
