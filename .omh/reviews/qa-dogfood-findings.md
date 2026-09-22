# FactoryDepo — exploratory QA (dogfooding) findings

**Date:** 2026-09-22 · **Branch/tree:** `design` @ `02b8aa4` (`C:/Users/Hp/FactoryDepo/.worktrees/design`)
**Surfaces audited:** product detail page · marketing landing page · buyer dashboard · supplier dashboard · admin console · the shared header/nav every page inherits
**Build under test:** built SPA at `http://localhost:5190` (`vite preview`, API proxied to `http://localhost:9095`, dev DB: 5,418 products / 1,611 suppliers), landing served statically at `http://localhost:5299/artifacts/landing/variants/marketplace-light.html`
**Accounts:** `buyer@factorydepo.com`, `supplier@factorydepo.com` (owns supplier profile #4), `demo@factorydepo.com` (admin) — all password `factorydepo`
**Method:** headless Chrome over CDP with a per-step console/network collector (`fd-run.mjs`), a route scanner (`fd-scan.mjs`), a true-390/768 device-emulation overflow probe (`fd-mobile.mjs`) and a request/DOM-weight probe (`fd-perf.mjs`), plus `curl` against the API for ground truth. Every finding below was reproduced in the browser, not inferred from code.

**Totals: 0 BLOCKER · 2 MAJOR · 7 MINOR · 4 NIT** (13 findings)

---

## MAJOR

### M1 — The buyer cannot make an offer anywhere in the UI; the offer flow has no entry point
- **Route:** `/offers` (and every listing surface: `/explore`, `/products/:id`, `/feed`)
- **Steps:** sign in as `buyer@factorydepo.com` → open any listing (e.g. `/products/5412`) → inspect the four CTAs (`Buy now`, `Request quotation`, `Contact seller`, `Ask a question`) → open `/offers` → look for a "make an offer" control on any card, header or rail.
- **Expected:** the buyer's offer flow (the owner's "make an offer in one tap") reaches `POST /api/offers` from at least one surface — the accept/counter/reject machinery already exists and is reachable.
- **Actual:** there is no control anywhere in the SPA that creates an offer. `useCreateOffer()` exists in `lib/api-client-react` but is imported by **no** file under `artifacts/web/src` (`grep -rn "useCreateOffer" artifacts/web/src` → no hits, `useCreateCounterOffer` / `useAcceptOffer` / `useRejectOffer` are used by `/offers`). `/offers` therefore only ever displays offers that arrived from seed data or a direct API call; the buyer journey ends at "view / counter an offer someone else created". (The supplier-side quote flow *is* complete — see V7 — so this is specifically the buyer-offer path.)
- **Evidence:** `grep -rn "useCreateOffer" artifacts/web/src/` → empty; `/offers` page body lists rows and counter/accept buttons only; screenshot `C:/Users/Hp/AppData/Local/hermes/profiles/factory-depo/cache/scratch/shots-buyer/_orders.png` context, `/offers` DOM captured in `scan-buyer.json`.
- **Severity:** MAJOR if buyer-side offer creation was in scope for this build (the pages and the hook exist); NIT if it is deliberately deferred — needs an owner decision, because the reading "the flow is built" is currently false.

### M2 — Supplier directories render the entire catalogue list unpaginated (26k–35k DOM nodes, ~90,000 px tall)
- **Routes:** `/suppliers` (public), `/admin/suppliers`, `/admin/sources`
- **Steps:** open `/suppliers` at 1440 → measure DOM and page height; repeat on `/admin/suppliers` and `/admin/sources`.
- **Expected:** a directory of 1,611 rows is windowed, paginated, or incrementally rendered (the rest of the app has a shared `Pager` with honest `showing x–y of N`).
- **Actual:** every supplier row is rendered into the DOM at once; the only affordance is a client-side text filter, and there is no pager at all (`grep -n "Pager" artifacts/web/src/pages/Suppliers.tsx` → none). Measured after load:

  | route | DOM nodes | page text | rows | scroll height | full-page PNG |
  |---|---|---|---|---|---|
  | `/suppliers` | 25,889 | 182,865 chars | 1,615 | 91,904 px | 7.1 MB |
  | `/admin/suppliers` | 35,465 | 271,461 chars | 1,617 | 91,598 px | — |
  | `/admin/sources` | 33,905 | 349,540 chars | 1,619 | 84,497 px | — |

  For contrast, `/explore` is 829 nodes / 13 requests and `/rfqs` is 1,739 nodes. There is no N+1 in the network panel (3–4 API calls per page) — the cost is all client-side layout/memory, which lands hardest on the 390 px phone case.
- **Evidence:** `fd-perf.mjs` output (numbers above); `curl` totals `{"total":1611}` for `/api/suppliers`; screenshot `…/cache/scratch/shots-pub/_suppliers.png` (7.1 MB full-page capture).
- **Severity:** MAJOR (perf/UX, buyer-facing surface, no pagination escape hatch).

---

## MINOR

### m3 — Server error text is shown untranslated inside the Turkish UI
- **Route:** `/products/21` (any listing the signed-in supplier owns)
- **Steps:** log in as `supplier@factorydepo.com` → open `/products/21` → click `Satıcıyla iletişime geç` (Contact seller) → type a message → `Mesajı gönder`.
- **Expected:** a Turkish message (the modal, its labels, the hint and the disabled-state copy are all Turkish), or a translatable error code.
- **Actual:** the modal renders the API's raw English string: **"You cannot message your own supplier profile."** — the only English string in an otherwise fully translated modal. The API answers `400 {"error":"own_supplier"}`; the client deliberately surfaces the server text (`ContactModal`: "The API's own message — e.g. `own_supplier` … Nothing is invented to soften it"), so the leak is the missing code→copy mapping.
- **Evidence:** DOM snapshot of `.modal` after submit (see `run-own.json`); screenshot `…/cache/scratch/shots-sup/err-own-supplier.png`; network log `[http.400] http://localhost:5190/api/threads`.
- **Severity:** MINOR.

### m4 — Notifications are English-only on a Turkish dashboard (with a punctuation bug)
- **Route:** `/notifications` (buyer and supplier)
- **Steps:** log in as `buyer@factorydepo.com` → open `/notifications`.
- **Expected:** notification text in the interface language (`tr` here), like every other dashboard string.
- **Actual:** page chrome is Turkish ("Bildirimler", "Okunmamış", "1 sa önce") while 10 of 12 row bodies are English: "New message from Mehmet Demir.", "Order #73 was delivered.", "Shipment for order #73 advanced.", "Payment for order #72 was confirmed.", "Payment of USD 12250 recorded for order #72 — awaiting confirmation.", "Offer #10 was rejected.", "Offer #9 was countered." One row is worse: **"New message from Ahmed K.."** — a double full stop, because the API appends "." to a name that already ends in one (`routes/messages.ts`: ``text: `New message from ${ctx.name}.` ``).
- **Evidence:** DOM text of the list (reproduced in `run-misc.json`), screenshot `…/cache/scratch/shots-misc/misc-notifications.png`.
- **Severity:** MINOR.

### m5 — Moderation table reports "1 / 0 Sayfa" (page 1 of 0) when a search matches nothing
- **Route:** `/admin/listings` (admin)
- **Steps:** log in as `demo@factorydepo.com` → `/admin/listings` → type `zzz-no-such-listing-xyz` in the toolbar search → click `Ara`.
- **Expected:** an empty state with a zero/absent page count (the page's own rule is "these numbers are the server's numbers").
- **Actual:** rows and counts correctly go to 0, but the page-count tile reads **`1 / 0` Sayfa** ("1 / 0 Page"). Screenshot evidence below shows the tile next to "0 Bu filtrelerle eşleşen ilanlar".
- **Evidence:** screenshot `…/cache/scratch/shots-admin/srch-search-junk.png` (KPI row: `0 · 0 · 0 · 1/0`); DOM snapshot in `run-search.json` step 7: `"kpis":"📦 0 … 📄 1 / 0 Sayfa"`.
- **Severity:** MINOR (honesty rule: the figure contradicts itself).

### m6 — Mobile tap targets below the 24 px minimum
- **Route:** `/products/5412` at 390 px (same pattern on other surfaces)
- **Steps:** open the product page with a 390×844 viewport → measure every visible `button|a|input|select`.
- **Expected:** interactive targets ≥ 24×24 CSS px (WCAG 2.5.8) — 32 px for comfortable touch.
- **Actual:** breadcrumb and meta links are 16–19 px tall (`Ana sayfa` 51×18, `Food Processing` 88×18, `SINOCEAN SUZHOU Ltd` 138×16, `Bu tedarikçinin tüm ürünleri` 143×17, supplier/category lines in cards 15×17), the qty stepper is 30×30, listing price links are 24 px tall. Header buttons (`Giriş yap` 62×25, `Ücretsiz katıl` 84×25) and the language select (74×25) clear the 24 px line but not 32 px.
- **Evidence:** measured element list in `run-mob-pdp.json` step 5; screenshots `…/cache/scratch/shots-m/pdp390-pdp-390-top.png`, `…/shots-m/pdp390-pdp-390-bottom.png`.
- **Severity:** MINOR (accessibility).

### m7 — Category tiles carry no alt text
- **Route:** `/categories`
- **Steps:** open `/categories`, count `<img>` elements without an `alt` attribute.
- **Expected:** decorative covers may be `alt=""`, content covers should be described; either way the attribute should exist (the landing page's 43 images all have `alt`).
- **Actual:** `25 of 25` images have no `alt` attribute at all.
- **Evidence:** probe field `imgsNoAlt: 25` (of `imgs: 25`) in `scan-public.json`; screenshot `…/cache/scratch/shots-pub/_categories.png`.
- **Severity:** MINOR (accessibility).

### m8 — Landing page "Skip to listings" link points at a non-existent anchor
- **Route:** landing page (`artifacts/landing/variants/marketplace-light.html`)
- **Steps:** open the landing → press Tab to reach the first focusable element (`.skip`, "Skip to listings") → activate it.
- **Expected:** focus/scroll jumps to the listing grid section.
- **Actual:** the link is `href="#listings"` but no element in the document has `id="listings"` — the grid section is `id="more"`. `grep -o 'href="#…"'` lists 8 anchors; `grep -o 'id="…"'` returns `categories, counters, faq, more, q, requests, services, suppliers, surplus, trust, verification` — `#listings` has no target, so the skip link does nothing. Every other in-page anchor resolves (`#surplus`, `#trust`, `#categories`, `#suppliers`, `#requests`, `#services`, `#faq` all OK).
- **Evidence:** anchor/id greps above; in-browser check `#listings =MISSING, #surplus =OK, #trust =OK, …` in `run-l3-1440.json`.
- **Severity:** MINOR (keyboard accessibility on the page every visitor lands on).

### m9 — Buyer-facing supplier profile discloses the source marketplace and source store URL
- **Route:** `/suppliers/1572` (public, no login)
- **Steps:** open `/suppliers/1572`.
- **Expected:** per the owner's white-label mandate (Sep 2026 control plane: "buyer sees our price/name/WhatsApp desk and nothing else; source link … admin-only"), a buyer-facing profile should not name the source marketplace or link its store page.
- **Actual:** the profile body reads: *"Imported from made-in-china.com — SINOCEAN SUZHOU Ltd. Store: https://14ac0f882ffb54ca.en.made-in-china.com. Contact via platform (email/phone are not publicly listed)."* — the source domain and the source store URL are shown to anonymous visitors, alongside the same supplier's real name.
- **Evidence:** DOM text in `run-misc.json` step 22; screenshot `…/cache/scratch/shots-misc/misc-supplier.png`. Note the rows carrying this text are `dataSource='demo'` bootstrap rows, so this may be intentional attribution rather than a control-plane violation — flagged for an owner decision rather than asserted as a bug.
- **Severity:** MINOR.

---

## NIT

### n10 — "Ask a question" behaves differently from the other three CTAs for signed-out visitors
- **Route:** `/products/5412` (anonymous)
- **Steps:** with no token, click each CTA in turn: `Buy now`, `Request quotation`, `Contact seller`, `Ask a question`.
- **Expected:** consistent behaviour.
- **Actual:** the first three raise the "Üye erişimi" (member access) gate immediately; `Ask a question` switches to the Q&A tab, reveals the composer with the hint "Satıcıya soru sormak için oturum açın" and only gates on **submit** (`ProductQa.submit` → `requireAuthGate()`). Deliberate-looking degrade, but the asymmetry is user-visible (`overlay:false` for the 4th, `overlay:true` for the other three).
- **Evidence:** `run-gate.json` steps `gate1`–`gate4`.
- **Severity:** NIT.

### n11 — Publish-stepper validation error persists after the field is corrected
- **Route:** `/supplier/post`
- **Steps:** click `Sonraki` with an empty Lot name → error appears → fill the name (and category) → observe the message before pressing `Sonraki` again.
- **Expected:** the message clears when its field becomes valid.
- **Actual:** "Lota bir ad verin — en az 2 karakter." stays visible after the name is filled and the completion pill rises 27% → 45%; it only disappears on a successful step advance.
- **Evidence:** `run-post2.json` steps 6 → 14 (`err` non-empty in both).
- **Severity:** NIT.

### n12 — `/explore` pagination is not addressable; a bogus `?page=` is silently ignored
- **Route:** `/explore`
- **Steps:** with the SPA open, set the URL to `/explore?page=9999` (pushState + popstate).
- **Expected:** either an explicit out-of-range page ("showing 0 of 5,418") or the page honoured.
- **Actual:** the `page` query parameter is not read at all (`Explore.tsx` keeps `page` in local state); the page silently renders page 1 with all 5,418 results. Consequence: a page-2 link cannot be shared or bookmarked, but no user can get stuck out of range either.
- **Evidence:** `run-search2.json` step 20 (`/explore?page=9999` → `5.419 ilan`, page 1 rendered); pager guards in `dash.tsx::Pager` (`page <= 1` / `page >= pages` disable the arrows).
- **Severity:** NIT.

### n13 — Admin overview: 5 of 14 KPI tiles are non-interactive while the rest navigate
- **Route:** `/admin`
- **Steps:** open `/admin`, click each KPI tile; compare with the tile list and their `href`s.
- **Expected:** consistent affordance — either all tiles navigate or none.
- **Actual:** `Tedarikçi hesapları`, `İlanlar`, `Gerçek ilanlar`, `Başlangıç ilanları`, `Teklif talepleri`, `Gönderilen teklifler`, `Sevkiyatlar`, `Onay bekleyen ödemeler`, `Onaylanan ödemeler` carry `href`s and navigate (verified `/admin/suppliers` via tile 2); `Kayıtlı kullanıcılar`, `Alıcı hesapları`, `Teklifler`, `Halen açık teklifler`, `Siparişler` have no `href`/`onClick` and do nothing. `Kpi` only adds `cursor:pointer` and a hover shadow when it is clickable, so the dead tiles are visually inert (no false affordance) — the gap is the missing destination (there is no admin orders/users page), not a broken click.
- **Evidence:** tile/href list in `run-admin.json` step 3; `Kpi` implementation in `artifacts/web/src/dash.tsx`.
- **Severity:** NIT.

---

## Verified working (no defect found)

**Product detail page (`/products/:id`)** — all four CTAs reach their endpoint and produce real state, checked against the API after each click:
- **V1 Buy now** → checkout modal (qty presets MOQ/5×/10×, live total, validating shipping form) → `POST /api/orders` → success screen "Sipariş #98 onaylandı"; order 98 exists in `GET /api/orders`. With an empty form the submit button is correctly disabled (no silent failure).
- **V2 Request quotation** → `POST /api/rfqs` → "Talep yayınlandı"; RFQ 250 appears in `GET /api/rfqs?mine=1` and on `/suppliers/rfq-opportunities` for the supplier.
- **V3 Contact seller** → creates the thread then posts the first message → "Mesaj gönderildi"; the thread shows in the buyer's `/messages` ("Anatolian Machinery A.Ş. · Hydraulic Press 200T · 2 mesaj") and in the seller's inbox. The supplier-messaging-their-own-profile case returns the API's 400 and does **not** fake a success (see m3 for the language gap).
- **V4 Ask a question** → switches to the Q&A tab, focuses the composer, `POST /api/products/21/questions` writes a `pending` row that renders as "Sorunuz / Satıcının cevabı bekleniyor"; anonymous `GET` returns nothing (visibility model honoured). Logged in as the **owning supplier** (profile #4), the same row appears with an answer box ("Bekleyen", pending badge); answering flips it to `answered` with the answer, the seller name and "Satıcının cevabı"; the answer is then visible to anonymous visitors and the asker, with no console errors. The asker cannot answer their own question via the UI.
- **V5 Quantity clamp / line total**: `999999` → clamps to `quantityAvailable` (100 → line total `$650,000`), `0` / `-5` / empty → snaps back to MOQ (1 → `$6,500`), `+` steps up, `−` steps down and disables at MOQ, line total always `qty × unit price`. Checkout stock also decremented after the order (99 → 98 Set).

**Landing page** — real content, honest figures, correct fallback chain: served over plain HTTP with no same-origin API it falls back to `http://localhost:9095` and renders live rows (`8 / 5.175 lot` from `hasImage=1`, 8 trending cards, 6 RFQ rows, 25 category tiles); 43 images, 0 broken, all with `alt`; counters 5.175 / 1.611 / 25 / 3 match the API totals (1,611 suppliers, 25 categories, 3 distinct country codes) and carry their derivation rule. All 10 sections non-empty; no overflow at 1440/768/390; no browser console errors. Every outbound link family maps to a route that renders: `/explore` (+`?q=` and 25 `?category=` variants), `/products/<id>`, `/suppliers` (+`/suppliers/<id>`), `/rfqs` (+`/rfqs/<id>`), `/categories`, `/feed`, `/help`, `/sign-in`, `/sign-up`, `/supplier/post`, `/supplier/listings`.

**Buyer dashboard** — `/orders` (7 orders, KPI totals and `$11,725.71` average add up), `/offers`, `/shipments`, `/messages`, `/saved`, `/notifications`, `/profile` all render real API state with honest empty/hint copy; `/dashboard` redirects to the buyer home. No stale totals observed: every list's count matched its rows.

**Supplier dashboard** — the stepped publish flow completes: 4 steps, per-step validation (empty `Next` → "Lota bir ad verin — en az 2 karakter." with the field marked, step does not advance), progress pill 27→45→73→82%, the review step restates exactly the submitted values, `Stok yayınla` creates the listing and redirects to `/supplier/listings`. The new listing is in the catalogue immediately (`GET /api/products?q=DOGFOOD` → id 6672, `dataSource: platform`, no Demo tag, visible to anonymous `/explore`); `/supplier/listings` count went 7 → 8 and the admin "İlanlar (tüm kaynaklar)" tile 5,418 → 5,419. Supplier RFQ→quote flow: `/rfqs/250` quote form submits ($980 / 14 gün), the row appears as "Gönderildi" for both sides and the RFQ tile goes to 1 offer; submit is disabled while price/lead are empty.

**Admin console** — `/admin` KPI tiles navigate when they are linked (tile 2 → `/admin/suppliers`, tile 3 → `/admin/listings`); `/admin/listings` server-side pagination is correct (`5419 kayıttan 1–50 arası gösteriliyor`, `1 / 109`, page 2 → `51–100` and `2 / 109`, page-size 50→100 re-pages to `1 / 55`, prev/next disable at the ends); the toolbar search correctly returns an empty state for junk (`zzz-…` → 0 rows, empty-state card) and 21 rows for `Ice Machine`; page-scoped facets narrow the current page honestly (source `demo` → 83 rows, `platform` → 17 rows, with the "this page only" rule stated in the tile titles); `/admin/suppliers`, `/admin/verification`, `/admin/rfqs`, `/admin/payments`, `/admin/growth`, `/admin/features` all render real or honestly-zero data (no invented metrics, `—` for unknowns).

**Shared header/nav & routes** — ~50 route loads across anonymous / buyer / supplier / admin at 1440, 768 and 390: **zero console errors, zero uncaught rejections, zero 5xx, zero dead routes**. Legacy paths keep redirecting: `/products` → `/explore`, `/rfq` → `/rfqs`, `/rfq/:id` → `/rfqs/:id`, `/dashboard` → role home; unknown paths (`/nonexistent-xyz`, `/search`) fall back to `/explore`; `/products/<missing>`, `/suppliers/<missing>`, `/rfqs/<missing>` render honest "not found" pages with a return link (the 404s in the network log are the expected API reads). Every protected route (`/orders`, `/messages`, `/profile`, `/supplier/*`, `/admin`) shows a tailored sign-in gate for anonymous visitors, never a blank screen or fake data. Client-side navigation keeps one document (no full reload on nav clicks) and `?category=`/`?q=` changes re-render the grid (`/explore?category=Machinery` → 1.389, `/explore?q=Hydraulic Press` → 3 via the topbar search). `/feed` renders. No horizontal overflow at any of the three widths on the audited surfaces, and the mobile product action bar reserves its own space (no content hidden underneath at the page end).

---

## Notes for the next session

- **Test residue in the dev DB** (created by this pass, all deletable): listing **6672** ("QA DOGFOOD PROBE LOT …"), order **#98**, RFQ **250** + 1 quote, 1 message thread + 2 messages, question **#23** (asked + answered). No source file was modified and nothing was committed.
- **Cross-check:** m4 (English notification bodies) overlaps finding #11 of the concurrent `.omh/reviews/honesty-and-i18n-audit.md`, and M2 matches its oversized-supplier-directory capture — independently reproduced here; m3, M1, m5–m9 and n10–n13 are not covered there.
- **Environment artifacts, not defects:** `GET http://localhost:9095/` returns 500 in this `.worktrees/…` checkout (`send`'s `dotfiles: 'ignore'` rule — production has no dot segment); `/api/auth/login` is limited to 10 attempts / 15 min per IP, which locks out further scripted logins (worked around with existing tokens). The throwaway `*@factorydepo.test` rows noted in the brief were ignored.
- **Not covered:** creating an offer (impossible from the UI — M1), payments confirmation against a real transfer, verification document upload/approval, `/admin/features` toggle behaviour, and the standalone `/feed` TikTok-style discovery interaction beyond rendering.

---

## Overall readiness for a production deploy

This build is in good shape for a supervised production deploy, and I found **no blocker-grade defect**: every audited journey that the UI claims to support actually completes against the real API — buy-now, quotation, contact-seller messaging, listing Q&A (ask → pending → owner answers → public), the four-step publish flow (creating a listing that is immediately visible in the catalogue), supplier quotations, and the admin console's KPIs, pagination and filters — with zero console errors, zero 5xx and zero dead routes across ~50 route loads at 1440/768/390, honest counts everywhere I cross-checked them against the API, and correct sign-in gates on every private surface. What holds it back from an unqualified "ship it": the buyer-side offer flow has no entry point at all (M1) while its accept/counter/reject machinery is live, so the offers pages can only ever show seeded rows; the supplier directories render 1,615 rows in one unpaginated document (M2, up to 35k DOM nodes and ~90,000 px of scroll, worst on a phone); and the server side leaks untranslated English into a six-language UI (M3 untranslated API error, M4 English notification bodies plus a doubled full stop), which undercuts the polish of the surfaces the owner cares about most. The remaining items are cosmetic or accessibility nits (a "1 / 0 Sayfa" page count, sub-24 px tap targets, missing `alt`s, a dead skip link, an offer-source URL shown to buyers that policy says is admin-only). Fix M1–M4 — roughly the offer entry point, list windowing, and one error-code/notification-text pass — and this is comfortably launchable as a demo-catalogue marketplace.
