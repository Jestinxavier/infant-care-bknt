# Testing Inventory

This directory is the source of truth for application-wide test coverage.

## Files

- `coverage-matrix.md`: human-readable inventory of backend endpoints, direct app routes, background jobs, dashboard routes, storefront routes, media server routes, feature/action groups, existing tests, and review findings.
- `route-inventory.json`: machine-readable version of the same inventory.

## Generate and validate

```bash
node backend/scripts/generate-test-inventory.mjs
node backend/scripts/generate-test-inventory.mjs --check
```

`--check` exits non-zero when the committed inventory is out of date. Use it in CI.

## Completeness rules

- Every backend route surface and direct app route must be mapped to a test owner and status.
- Every background job must have success, failure, retry, idempotency, and cleanup coverage.
- Every dashboard route must have render, access, loading/empty/error, interaction, responsive, and accessibility coverage.
- Every storefront route must have render, state, interaction, responsive, and accessibility coverage.
- Every media server route must have upload, auth, failure, boundary, cleanup, and file-handling coverage where applicable.
- Every feature/action group must have at least one API or UI test.
- New routes, pages, dialogs, bulk actions, and background jobs require an inventory update.

## Status workflow

- `TODO`: no test mapped.
- `IN PROGRESS`: test exists but does not cover the required cases.
- `COVERED`: required cases are mapped to test files.
- `BLOCKED`: cannot test until a dependency or environment issue is resolved.

## Important scope note

The route inventory is generated from code. The feature/action groups are curated and must be updated when a new UI action is added without adding a route. A route-complete inventory is not the same as proof that every button and state has a test; the status column is where that proof is recorded.
