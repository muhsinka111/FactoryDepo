# Data provenance policy

FactoryDepo's catalog must never present data as real supply when it isn't.
Every `products` and `suppliers` row carries a `dataSource` column:

| Value      | Meaning                                                                 |
| ---------- | ------------------------------------------------------------------------ |
| `platform` | A real listing, created by a real supplier through the app.              |
| `demo`     | Bootstrap seed data (`artifacts/api-server/src/bootstrap-seed.ts`), used to give an empty database a working marketplace to demo. Not a real offer. |

There is no third value for scraped data — scraped listings are not kept.

## What was removed, and why

The repo previously shipped `scripts/import/`: scrapers for Alibaba,
Made-in-China and IndiaMART, ~6,800 scraped listings as `.jsonl`, and 1,788
product photographs downloaded from `alicdn.com` and re-served from
`artifacts/web/public/products/`. All of it was removed for three
independent reasons, any one of which would be sufficient on its own:

1. **Terms of service.** Alibaba, Made-in-China and IndiaMART all prohibit
   automated collection of their listings.
2. **Image rights.** The photographs belong to the suppliers or the source
   platforms — re-serving them from our own domain as "our" catalog is
   infringement, not attribution.
3. **Product honesty.** Listing real companies who never agreed to be on
   this marketplace, at prices we cannot actually honour, is exactly the
   failure this product is meant to protect buyers from. A marketplace that
   can't tell a buyer whether a listing is real should not show it as real.

Data quality was also poor on inspection — e.g. the first scraped Alibaba
record had the title `"![Search icon"` with an SVG icon as its "product" URL.

## How the removal was done

- The scraper scripts, their `.jsonl` output, and the 1,788 scraped images
  (filenames prefixed `ali_`) were deleted from the repo.
- The 38 remaining images in `artifacts/web/public/products/` are
  AI-generated (fal.media) category photography that FactoryDepo owns —
  these were kept.
- The database rows the scrapers produced are removed by
  `scripts/remove_scraped_data.sql`, a one-time script run manually against
  the target database (**not** a boot migration — it must not auto-run
  unattended against production). See that file for instructions.
- `lib/db/migrations/008_data_provenance.sql` adds the `dataSource` columns
  and labels all pre-existing rows `demo` (there is no product-creation UI
  yet, so nothing in the database predating this migration can be a real
  `platform` listing).

## Still open

`dataSource: 'demo'` is available to the frontend in every product/supplier
API response, but the UI does not yet render a "demo data" label on these
listings. Until it does, the catalog is technically honest in the API but
not yet honest on screen — add the label before treating this catalog as
presentable to real buyers.
