# Database maintenance scripts

All mutating scripts share one mode contract:

| Flag | Meaning |
|---|---|
| `--dry-run` | Preview only. Never writes. |
| `--apply` | Apply/write mode. Aliases: `--write`, `--execute`, `--live`. |

`--dry-run` and `--apply` are mutually exclusive. If neither is passed, each
script keeps its historical default (see the table below), so old commands keep
working. New commands should always pass one explicitly.

Scripts that accept `--uri <url>` read it before `MONGODB_URI`; otherwise they
read `MONGODB_URI` from `.env`.

## Recommended `version-3.1` deployment order

Run from `backend/` with production `.env` loaded. Do not skip the backup.

```bash
# 0. Backup (live by default; --dry-run only previews the collection list)
pnpm exec node scripts/backup-database.js --apply
# → note the printed backup folder

# 1. Read-only inspection
pnpm exec node scripts/review-attribute-values.js
pnpm exec node scripts/propose-attribute-values.js

# 2. Seed/normalize the attribute catalogue
pnpm exec node scripts/seed-attribute-values.js --apply
pnpm exec node scripts/backfill_attribute_synonyms.js --add-missing --apply

# 3. Normalize values (all dry-run by default — review, then apply)
pnpm exec node scripts/migrate-material-values.js
pnpm exec node scripts/migrate-material-values.js --apply

pnpm exec node scripts/migrate-color-print-values.js
pnpm exec node scripts/migrate-color-print-values.js --apply

pnpm exec node scripts/migrate-filter-value-cleanups.js
pnpm exec node scripts/migrate-filter-value-cleanups.js --apply

pnpm exec node scripts/backfill-product-colors.js
pnpm exec node scripts/backfill-product-colors.js --apply

# 4. Recompute flags and reconcile
pnpm exec node scripts/backfill-needs-review.js
pnpm exec node scripts/backfill-needs-review.js --apply

pnpm exec node scripts/reconcile-product-attribute-values.js
pnpm exec node scripts/reconcile-product-attribute-values.js --apply

pnpm exec node scripts/seed-category-filter-attributes.js
pnpm exec node scripts/seed-category-filter-attributes.js --apply

# 5. Search / stock
pnpm exec node scripts/normalize-stock-flags.js --apply
pnpm exec node scripts/reindex-search.js --apply

# 6. CMS content
pnpm exec node scripts/seed-cms-faq.js --apply
pnpm exec node scripts/migrate-cms-faq.js --apply
pnpm exec node scripts/migrate-cms-about.js --apply
pnpm exec node scripts/migrate-cms-policies.js --apply
pnpm exec node scripts/rename-cms-policy-pages.js --apply
pnpm exec node scripts/strip-cms-link-domains.js
pnpm exec node scripts/strip-cms-link-domains.js --apply

# 7. Optional / one-off
pnpm exec node scripts/seed_chat_knowledge.js --dry-run
pnpm exec node scripts/seed_chat_knowledge.js --apply
pnpm exec node scripts/purgeNoiseErrorLogs.js --apply

# Only if the old standalone Variant collection still has data.
# This creates the embedded Product.variants, so run it BEFORE the URL-key scripts.
pnpm exec node scripts/migrateVariants.js
pnpm exec node scripts/migrateVariants.js --apply

pnpm exec node scripts/generateUrlKeysForExistingProducts.js --dry-run
pnpm exec node scripts/generateUrlKeysForExistingProducts.js --apply
pnpm exec node scripts/generateVariantUrlKeys.js --dry-run
pnpm exec node scripts/generateVariantUrlKeys.js --apply
pnpm exec node scripts/syncVariantCodes.js --dry-run
pnpm exec node scripts/syncVariantCodes.js --apply
```

`migrateVariants.js` is dry by default; write with `--apply`
(`--execute`/`--write`/`--live` also work). It should run before
`generateVariantUrlKeys.js` and `syncVariantCodes.js`.

## Default modes (historical, kept for compatibility)

Dry by default (safe to run without flags):

- `migrate-material-values`
- `migrate-color-print-values`
- `migrate-filter-value-cleanups`
- `backfill-product-colors`
- `backfill-needs-review`
- `reconcile-product-attribute-values`
- `seed-category-filter-attributes`
- `strip-cms-link-domains`
- `migrateVariants` (apply with `--execute`/`--apply`)
- `purgeNoiseErrorLogs` (apply with `--live`/`--apply`)

Live by default (pass `--dry-run` to preview):

- `seed-attribute-values`
- `backfill_attribute_synonyms`
- `normalize-stock-flags`
- `reindex-search`
- `seed-cms-faq`
- `migrate-cms-about`
- `migrate-cms-faq`
- `migrate-cms-policies`
- `rename-cms-policy-pages`
- `_rename-about-slug`
- `backup-database`
- `restore-database`
- `seed_chat_knowledge`
- `createAdmin`
- `seedCategories`
- `seedDeliveryPartners`
- `generateUrlKeysForExistingProducts`
- `generateVariantUrlKeys`
- `syncVariantCodes`

Read-only (no mode flag needed): `review-attribute-values`,
`propose-attribute-values`, `probe-cms-faq`.

Legacy one-off scripts that previously had no mode flag now accept
`--dry-run` as a coarse guard: `addDeliveryCodCost`, `addRazorpayToPaymentMethods`,
`backfill_filter_attributes`, `fix-password`, `migrate-category-code`,
`migrate-product-tags-to-collections`, `seedActiveGateway`,
`seedPaymentSettings`, `updateProductStatus`, `create_plp_indexes`,
`set_active_gateway_razorpay`.

## Notes

- `backup-database.js` accepts `--out <dir>` and `--uri <url>`.
- `restore-database.js` requires `--dir <backup-folder>`; without `--merge` it
  drops each collection before restoring.
- `_rename-about-slug.js` only applies to legacy databases that still have an
  `about-us` page. It exits non-zero if that page is missing.
- `migrate-cms-about.js` now defaults to slug `our-story`.
- `reindex-search.js` must run after all product/attribute writes.
- `seed_chat_knowledge.js` skips a non-empty knowledge base unless `--force`.
