# Integration Tests

Integration tests verify that the different parts of the application (Routing -> Middleware -> Controllers -> Models) work together correctly.

## 📂 Test Suites

### 1. [auth.test.js](./auth.test.js)
Verifies the complete authentication lifecycle:
- OTP generation and request.
- OTP verification and user registration.
- Login with JWT and HttpOnly cookies.

### 2. [product.test.js](./product.test.js)
Verifies product management:
- Admin-only creation of products with complex variant structures.
- Public product listing and search engine index generation.

### 3. [cart_order.test.js](./cart_order.test.js)
Verifies the storefront sales tunnel:
- Hybrid cart item persistence (with price/image snapshots).
- End-to-end checkout flow for registered users.
- Order creation and user order history.

### 4. [cms.test.js](./cms.test.js)
Verifies the Content Management System:
- Dynamic block synchronization for the homepage.
- Page-level content updates (About Us).
- Slug-based policy management (Privacy, Terms).

### 5. [health.test.js](./health.test.js)
Verifies basic server readiness and service availability.

### 6. [adminAuthSurface.test.js](./adminAuthSurface.test.js)
Verifies that every protected admin route surface in the generated coverage inventory rejects unauthenticated requests.

### 7. [publicReadSurface.test.js](./publicReadSurface.test.js)
Verifies public read routes without authentication, including empty-state handling and payment-option validation.

### 8. [directAppRoutes.test.js](./directAppRoutes.test.js)
Verifies root, Swagger, webhook rejection, payment confirmation, and manual payment-status routes registered directly on the Express app.

### 9. [authSurface.test.js](./authSurface.test.js)
Verifies all auth route surfaces:
- Registration and login OTP flows.
- Password and OTP login, refresh-token rotation, and logout.
- Profile read/update and dashboard access checks.
- Link-based and OTP-based password reset.
- Resend OTP, change password, and Google auth validation.

### 10. [catalogSurface.test.js](./catalogSurface.test.js)
Verifies the catalog route surfaces:
- Category listing, detail, create, update, delete, and bulk delete across public and admin prefixes.
- Attribute listing, detail, create, update, delete, and allowed-value lifecycle.
- Collection listing, detail, and deletion.
- Storefront filter generation for all products and category scopes.

### 11. [productSurface.test.js](./productSurface.test.js)
Verifies the product route surfaces:
- Public product listing, detail, URL lookups, and category reads.
- Price/stock, suggestions, search index, recommendations, and stock checks.
- Variant URL resolution and legacy variant reads.
- Admin product listing, detail aliases, updates, and deletes.
- Variant bulk stock/price updates and CSV export.

### 12. [settingsSurface.test.js](./settingsSurface.test.js)
Verifies site settings across public and admin prefixes:
- Settings list and scope handling.
- Create, read, update, and delete with registered-key/type validation.
- Scope protection, public settings, popular searches, suggested products, and maintenance mode.

### 13. [faqSurface.test.js](./faqSurface.test.js)
Verifies FAQ and FAQ category route surfaces:
- FAQ category list, create, duplicate handling, update, delete, reorder, and display-order repair.
- FAQ list, create, update, delete, and reorder.

### 14. [cmsSurface.test.js](./cmsSurface.test.js)
Verifies CMS route surfaces:
- CMS content list/create/read/update, block updates, and delete.
- Landing page CRUD and public reads.
- Static page draft/publish lifecycle, public reads, listing, and deletion.

### 15. [accountSurface.test.js](./accountSurface.test.js)
Verifies authenticated account surfaces:
- Address create, list, duplicate detection, update, delete, ownership checks, and 404 paths.
- Wishlist reads, toggle add/remove, enriched product responses, and per-user isolation.

### 16. [adminOperationsSurface.test.js](./adminOperationsSurface.test.js)
Verifies admin operations:
- Notification listing, read/read-all, and deletion.
- Delivery partner CRUD, duplicate names, and validation.
- Coupon CRUD, validation, duplicate codes, and coupon product search.
- Customer listing (GET/POST), stats, detail, and 404 paths.

### 17. [orderSurface.test.js](./orderSurface.test.js)
Verifies order and fulfillment surfaces:
- Authenticated order history, status filters, pagination, detail, and ownership isolation.
- Guest order lookup, payment status, claim, and guest-to-account conversion.
- Admin order list/detail aliases, status counts, and CSV export formats.
- Status-transition validation, fulfillment requirements, and COD delivery payment completion.
- Online and COD mark-paid guards, invoice requests, and validation paths.

### 18. [cartSurface.test.js](./cartSurface.test.js)
Verifies cart and checkout preparation surfaces:
- Cart creation, existing-cart reuse, invalid IDs, POST reads, and HEAD existence checks.
- Empty-cart count, items, price-summary, product-data, and summary responses.
- Item add/read/update/remove/clear, quantity totals, pricing, and missing-cart validation.
- Guest-cart merge, checkout-cart recovery, and empty recovery.
- Checkout locking/idempotency plus empty-cart and guest guards.
- Available-coupon listing, validation, percentage application, duplicate rejection, and removal.

### 19. [paymentsSurface.test.js](./paymentsSurface.test.js)
Verifies payment options and Razorpay verification:
- Payment-option cart requirement, missing-cart, and empty-cart guards.
- Enabled payment-method filtering and no-method configuration.
- Razorpay signature parameter validation and failed-signature order cancellation.
- Valid-signature confirmation, payment reconciliation, and unknown-order handling.

### 20. [storefrontContentSurface.test.js](./storefrontContentSurface.test.js)
Verifies public storefront content surfaces:
- Footer content reads and the no-document fallback.
- Homepage enabled-widget ordering, product-slider in-stock filtering, empty-state 404, and by-id reads.
- Stock-notification required-field/email/product/variant validation and pending-request upsert behavior.

### 21. [reviewSurface.test.js](./reviewSurface.test.js)
Verifies review surfaces:
- Auth guards, empty purchases, and purchased-order product/variant enrichment.
- Authenticated and guest review validation, order/item eligibility, duplicates, and approval defaults.
- Owned review listing, rating validation, update, and delete permissions.
- Public product/variant review approval filtering, pagination, averages, SKU lookup, and top-review formatting.

### 22. [assetSurface.test.js](./assetSurface.test.js)
Verifies media asset lifecycle surfaces:
- Auth guards, status/origin/search filters, page and cursor pagination, and cursor validation.
- Temp deletion, in-use/permanent protection, force archive, and bulk delete/archive failure reporting.
- PublicId and path-based promotion, upload validation, hash deduplication, and cleanup dry-run/real modes.

### 23. [storefrontTrackingSurface.test.js](./storefrontTrackingSurface.test.js)
Verifies storefront tracking surfaces:
- Analytics single-event shorthand, normalization, 20-event batch cap, invalid-event drops, and empty payloads.
- Meta conversion event-name validation and normalized user data/forwarding to the CAPI service.

### 24. [variantImportSurface.test.js](./variantImportSurface.test.js)
Verifies CSV variant import surfaces:
- Auth and missing-file guards.
- Validate-only parsing without persistence.
- Single-row create with SKU/price/stock/image mapping.
- SKU-based re-import preserving the embedded variant id.
- Missing-product failure handling.

### 25. [chatSurface.test.js](./chatSurface.test.js)
Verifies customer chat surfaces:
- Session creation/contact requirements, resume, and contact backfill.
- Message validation, AI reply persistence, product suggestions, and escalated-session queueing.
- Human handoff, contact updates, and idempotent chat ending.

### 26. [productSearchSurface.test.js](./productSearchSurface.test.js)
Verifies storefront product search:
- Required-term validation.
- Published/in-stock text search with draft and out-of-stock exclusion.
- SKU-prefix matching, product-type filtering, and pagination metadata.

### 27. [backgroundJobsSurface.test.js](./backgroundJobsSurface.test.js)
Verifies background maintenance jobs:
- Stale media and CSV temp-image cleanup with failure handling.
- Asset retention cleanup, dry runs, cron, and startup triggers.
- Daily AI report fallback generation, idempotent upserts, and IST date boundaries.

### 28. Media server suite (`media-server-infantscare/tests/mediaServer.test.js`)
Verifies the standalone media server:
- Dashboard/static file serving and API-key auth.
- Single/multi upload, WebP optimization, listing, stats, deletion, and ZIP backup.
- Run with `npm test` from `media-server-infantscare`.

### 29. [securitySurface.test.js](./securitySurface.test.js)
Verifies cross-cutting security behavior:
- Helmet security headers and removal of the Express framework banner.
- Credentialed CORS preflight for configured origins and request headers.
- Mongo operator sanitization on login and rejection of credential bypass attempts.
- Profile mass-assignment protection for role/permission fields.
- Regular-user denial on admin routes and login rate limiting.

### 30. [wishlistSurface.test.js](./wishlistSurface.test.js)
Verifies authenticated wishlist surfaces:
- Auth guards, empty state, and missing-product validation.
- Add/remove toggling, persistence, and per-user isolation.
- Published-only product enrichment, active/expired offers, stock, and configurable variant price fallback.

### 31. [errorLogSurface.test.js](./errorLogSurface.test.js)
Verifies admin error-log surfaces:
- Regular-user denial and read-only admin access.
- Source, status-code, search, and date-range filters plus pagination/source metadata.
- Raw reason/metadata/userId stripping for read-only admins versus full super-admin access.
- Single-log deletion, missing-id 404s, and full purge.

### 32. [adminUserSurface.test.js](./adminUserSurface.test.js)
Verifies admin-user management:
- Admin-only listing, search, pagination, safe-field projection, and super-admin counts.
- Create validation, duplicate rejection, credential email, and creation audit.
- Role/suspension updates, separate audit entries, self-change protection, and last-super-admin guards.
- Deletion guards, non-admin rejection, audit entries, and permission denial.

### 33. [refundSurface.test.js](./refundSurface.test.js)
Verifies admin refund surfaces:
- Auth and super-admin privilege gates plus order-id and amount validation.
- Rejection of unsupported methods, unpaid orders, and out-of-range amounts.
- Full Razorpay refund persistence, automatic cancellation, inventory restore, email, and attempt history.
- Already-cancelled orders without duplicate history; status polling for completed/failed refunds and attempt resolution.

### 34. [bundleProductSurface.test.js](./bundleProductSurface.test.js)
Verifies bundle product behavior:
- Config validation for missing items, malformed SKU/quantity, unknown SKUs, and simple/variant children.
- Quantity-aware availability and per-bundle stock deductions.
- Public bundle stock derivation, pricing, and child title/url enrichment.
- Unpublished or out-of-stock child handling and admin composition/pricing edits.

### 35. [cmsContractSurface.test.js](./cmsContractSurface.test.js)
Verifies the shared CMS contract:
- Backend content-type/field registry parity with `shared/cms/content-types.json` (order-insensitive, ignoring UI-only metadata).
- Canonical payload round-trip for every content type through draft save, publish, and public read.
- Required-field and repeater-shape validation for shared block definitions.
- Unknown-block rejection and content-type invariant checks.


## 💡 Best Practices

- **Isolation**: Each test in these suites should ideally be independent.
- **Mocks**: External services like Cloudinary and SMTP are mocked globally in `tests/setup.js`.
- **Database**: The database is cleared between tests via the `afterEach` hook in `setup.js`. If you need data to persist across multiple `it` blocks, use a single `it` block or recreate the state in `beforeEach`.

