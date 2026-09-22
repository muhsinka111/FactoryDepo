# ralplan — Seller shop tools + admin control plane (owner directive, 2026-09-22)

## Owner directive (verbatim intent)
1. "the seller able to create listing, upload file, and able to change price, location — everything
   they can do; admin only can control — so have more tools to seller to make listing better and
   more tools to admin site to control and check."
2. "if we scrap the products, if we upload it ourself somehow from anywhere — we are the supplier,
   and it should have all our company info."
3. "seller can also create listing and they have their own shop."

## Decisions taken (owner-answered)
- Media storage: **in Postgres** (durable, no external service, no credentials). Container disk is
  ephemeral on Railway, so file-system storage is not an option.
- FactoryDepo's own company info: owner will supply the details; the capability + editor ship now,
  fields stay empty (render `—`) until they are entered. Never invent them.

## Contract layer (driver-owned, single writer) — migration 022 + zod + api-spec + hooks
- `suppliers`: `addressLine`, `logoMediaId`, `incoterms`, `leadTimeDays`, `paymentTerms`.
- `products`: `location`, `leadTimeDays`, `moderationStatus` (`visible|pulled`), `pulledReason`,
  `pulledBy`, `pulledAt`, `updatedAt`.
- `media` (bytea + contentType + owner), `product_media` (gallery, ordered), `admin_audit`
  (adminUserId, action, entity, entityId, before, after).

## Task table (file-disjoint)
| id  | scope | files it OWNS | acceptance |
|-----|-------|---------------|-----------|
| T14 | seller surface + media (api-server) | `routes/suppliers.ts`, `routes/media.ts` (new), `routes/products.ts`, `index.ts` (mount + body limit) | `PATCH /api/suppliers/me` edits only the caller's shop; `POST /api/media` stores ≤2 MB image and returns an id; `GET /api/media/:id` serves it with its content type; `POST/DELETE /api/products/:id/media` manages the gallery (owner or admin only); product PATCH accepts `location`/`leadTimeDays`; a non-owner gets 403 and a pulled listing cannot be edited by its owner |
| T15 | admin control (api-server) | `routes/admin.ts`, `routes/adminAudit.ts` (new) | admin can edit any listing (incl. price), pull/restore it, delete it, and edit any supplier; every such action writes an `admin_audit` row; a non-admin gets 403 |
| T16 | seller UI | seller pages under `artifacts/web/src/pages/` (SupplierListings, SupplierPost, new ShopProfile) | seller edits price/location/quantity inline, uploads photos, edits their shop profile, previews their public shop |
| T17 | admin UI | `artifacts/web/src/pages/Admin*` | admin sees/edit/pulls any listing, edits suppliers, sees the audit trail of their own actions |

`i18n.tsx` is single-writer: the driver lands every new key after the wave that needs it and before
the wave's UI can be called finished (placeholder contract in the meantime: English constant +
comment naming the wanted key, reported in the task result).

## Non-negotiable rules carried into every task
- Ownership-scoped writes (seller B can never touch A's rows); admin-only routes behind
  `requireRole('admin')`; the integration suite asserts both.
- `dataSource` is set explicitly on every insert (`platform` for anything a seller creates).
- Admin visibility of upstream sourcing data stays admin-only; buyer projections never include it.
- Demo rows keep rendering `<DemoTag />`; unknown values render `—`, never an invented number.
- Country policy: Türkiye/China/USA/Europe only.

## Verification for the wave
`pnpm run typecheck` · `pnpm run build` · `TEST_BASE_URL=http://localhost:9095 pnpm --filter
@workspace/api-server run test` (fresh rate-limit window) · browser click-path proof for each new
control (upload a file, edit a price, pull a listing) · `scripts/ui_smoke.mjs`.
