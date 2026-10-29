# Test Coverage Matrix

Generated from backend routes, dashboard routes, storefront pages, media server routes, and the feature action inventory.

Regenerate:

```bash
node backend/scripts/generate-test-inventory.mjs
node backend/scripts/generate-test-inventory.mjs --check
```

## Scope

| Area | Count |
| --- | ---: |
| Backend mounts | 37 |
| Backend endpoint surfaces | 299 |
| Protected admin route surfaces | 170 |
| Direct app routes | 9 |
| Background jobs | 4 |
| Backend duplicate method/path pairs | 2 |
| Dashboard routes | 41 |
| Storefront pages/routes | 23 |
| Media server routes | 11 |
| Feature/action groups | 65 |
| Existing test files | 70 |

## Completeness rule

Every backend endpoint, direct app route, background job, dashboard route, storefront route, media server route, and action group in this file must have a test owner and a status before a feature is considered complete. New routes or actions require regenerating this inventory and updating the status. The `--check` mode fails when the generated inventory differs from this file.

## Case legend

`H` happy path, `VAL` validation, `AUTH` authentication/authorization, `SIG` webhook signature verification, `ERR` error/not-found/conflict, `BND` boundaries, `IDEM` idempotency/concurrency, `CLN` cleanup, `STATE` empty/loading/error/pagination/filter, `DRAFT` draft/persistence, `RENDER` render, `INTERACTION` user interaction, `RESP` responsive, `A11Y` accessibility, `SEC` security, `RETRY` integration failure/retry, `EXP` export, `FILE` upload/media.

## Mounted route files

| Base | File | Source |
| --- | --- | --- |
| `/api/v1/addresses` | `src/routes/addressRoutes.js` | `src/app.js:198` |
| `/api/v1/admin` | `src/routes/adminRoutes.js` | `src/app.js:219` |
| `/api/v1/admin/ai-reports` | `src/routes/adminAiReportRoutes.js` | `src/app.js:251` |
| `/api/v1/admin/assets` | `src/routes/asset.js` | `src/app.js:240` |
| `/api/v1/admin/attributes` | `src/routes/attributeRoutes.js` | `src/app.js:244` |
| `/api/v1/admin/cms` | `src/features/cms/cms.admin.routes.js` | `src/app.js:222` |
| `/api/v1/admin/collections` | `src/routes/collectionRoutes.js` | `src/app.js:245` |
| `/api/v1/admin/csv-images` | `src/routes/csvImageRoutes.js` | `src/app.js:237` |
| `/api/v1/admin/delivery-partners` | `src/routes/deliveryPartnerRoutes.js` | `src/app.js:220` |
| `/api/v1/admin/faq-categories` | `src/routes/faqCategoryRoutes.js` | `src/app.js:230` |
| `/api/v1/admin/media` | `src/routes/mediaRoutes.js` | `src/app.js:227` |
| `/api/v1/admin/pages` | `src/features/cms/pages/pages.admin.routes.js` | `src/app.js:224` |
| `/api/v1/admin/settings` | `src/routes/siteSettingsRoutes.js` | `src/app.js:233` |
| `/api/v1/analytics` | `src/routes/analyticsRoutes.js` | `src/app.js:248` |
| `/api/v1/attributes` | `src/routes/attributeRoutes.js` | `src/app.js:243` |
| `/api/v1/auth` | `src/routes/auth.js` | `src/app.js:190` |
| `/api/v1/cart` | `src/routes/hybridCartRoutes.js` | `src/app.js:196` |
| `/api/v1/category` | `src/routes/categoryRoutes.js` | `src/app.js:192` |
| `/api/v1/chat` | `src/routes/chatRoutes.js` | `src/app.js:209` |
| `/api/v1/cms` | `src/features/cms/cms.routes.js` | `src/app.js:214` |
| `/api/v1/cms` | `src/features/cms/pages/pages.public.routes.js` | `src/app.js:213` |
| `/api/v1/cms/products` | `src/features/product/product.cms.routes.js` | `src/app.js:211` |
| `/api/v1/collection` | `src/routes/collectionStorefrontRoutes.js` | `src/app.js:193` |
| `/api/v1/faqs` | `src/routes/faqRoutes.js` | `src/app.js:205` |
| `/api/v1/filter` | `src/routes/filterRoutes.js` | `src/app.js:195` |
| `/api/v1/footer` | `src/routes/footerRoutes.js` | `src/app.js:204` |
| `/api/v1/health` | `src/routes/healthRoutes.js` | `src/app.js:202` |
| `/api/v1/homepage` | `src/routes/homepageRoutes.js` | `src/app.js:203` |
| `/api/v1/meta` | `src/routes/metaConversionRoutes.js` | `src/app.js:207` |
| `/api/v1/orders` | `src/routes/orderRoutes.js` | `src/app.js:197` |
| `/api/v1/payments` | `src/routes/paymentRoutes.js` | `src/app.js:201` |
| `/api/v1/product` | `src/routes/product.js` | `src/app.js:191` |
| `/api/v1/review` | `src/routes/reviewRoutes.js` | `src/app.js:199` |
| `/api/v1/settings` | `src/routes/siteSettingsRoutes.js` | `src/app.js:208` |
| `/api/v1/stock-notify` | `src/routes/stockNotificationRoutes.js` | `src/app.js:206` |
| `/api/v1/variants` | `src/routes/variantRoutes.js` | `src/app.js:194` |
| `/api/v1/wishlist` | `src/routes/wishlistRoutes.js` | `src/app.js:200` |

## Unmounted route files

These files define routes but are not mounted from `src/app.js` or another mounted router. Confirm whether they are dead code or missing functionality.

- `src/features/product/product.admin.routes.js`
- `src/features/product/product.routes.js`
- `src/routes/cmsRoutes.js`

## Inventory review findings

### Admin-prefixed endpoints without an admin or permission guard

Review these before treating them as defects. Some are public or authenticated routes mounted under the admin prefix so the same router can serve both dashboard and storefront callers.

| Method | Endpoint | Access | Source |
| --- | --- | --- | --- |
| GET | `/api/v1/admin/attributes` | public | `src/routes/attributeRoutes.js:29` |
| GET | `/api/v1/admin/attributes/:id` | public | `src/routes/attributeRoutes.js:32` |
| GET | `/api/v1/admin/faq-categories` | public | `src/routes/faqCategoryRoutes.js:14` |
| GET | `/api/v1/admin/assets` | authenticated | `src/routes/asset.js:99` |
| DELETE | `/api/v1/admin/assets/:id` | authenticated | `src/routes/asset.js:123` |
| POST | `/api/v1/admin/assets/:id/promote` | authenticated | `src/routes/asset.js:223` |
| POST | `/api/v1/admin/assets/bulk-delete` | authenticated | `src/routes/asset.js:151` |
| POST | `/api/v1/admin/assets/cleanup` | authenticated | `src/routes/asset.js:255` |
| POST | `/api/v1/admin/assets/promote` | authenticated | `src/routes/asset.js:185` |
| POST | `/api/v1/admin/assets/upload` | authenticated | `src/routes/asset.js:56` |
| GET | `/api/v1/admin/settings/maintenance` | public | `src/routes/siteSettingsRoutes.js:132` |
| GET | `/api/v1/admin/settings/popular-searches` | public | `src/routes/siteSettingsRoutes.js:60` |
| GET | `/api/v1/admin/settings/public` | public | `src/routes/siteSettingsRoutes.js:48` |
| GET | `/api/v1/admin/settings/suggested-products` | public | `src/routes/siteSettingsRoutes.js:121` |

### Duplicate method/path definitions

| Method | Endpoint | Sources |
| --- | --- | --- |
| GET | `/api/v1/settings/popular-searches` | `src/routes/siteSettingsRoutes.js:60`<br>`src/routes/siteSettingsRoutes.js:74` |
| GET | `/api/v1/admin/settings/popular-searches` | `src/routes/siteSettingsRoutes.js:60`<br>`src/routes/siteSettingsRoutes.js:74` |

## Missing referenced assets

None.

## Direct app routes

| ID | Area | Domain | Method | Route | Access | Handler | Cases | Source | Test owner | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| APP-001 | platform | Platform | GET | `/` | public | inline | H | `backend/src/app.js:266` | `backend/tests/integration/directAppRoutes.test.js` | COVERED |
| APP-002 | platform | Platform | GET | `/api-docs` | public-dev | swagger-ui | H,RENDER,A11Y | `backend/src/app.js:256` | `backend/tests/integration/directAppRoutes.test.js` | COVERED |
| APP-003 | payments | Payments | GET | `/api/payments/check/:orderId` | admin | manualCheckPaymentStatus | H,VAL,AUTH,ERR | `backend/src/app.js:293` | `backend/tests/integration/directAppRoutes.test.js` | COVERED |
| APP-004 | payments | Payments | POST | `/api/webhook/phonepe` | signature | inline | H,VAL,AUTH,SIG,ERR,IDEM | `backend/src/app.js:137` | `backend/tests/integration/directAppRoutes.test.js` | COVERED |
| APP-005 | payments | Payments | POST | `/api/webhooks/phonepe` | signature | inline | H,VAL,AUTH,SIG,ERR,IDEM | `backend/src/app.js:136` | `backend/tests/integration/directAppRoutes.test.js` | COVERED |
| APP-006 | payments | Payments | POST | `/api/webhooks/razorpay` | signature | inline | H,VAL,AUTH,SIG,ERR,IDEM | `backend/src/app.js:138` | `backend/tests/integration/directAppRoutes.test.js` | COVERED |
| APP-007 | platform | Platform | GET | `/email-logo.png` | public | inline | H,ERR | `backend/src/app.js:275` | `backend/tests/integration/directAppRoutes.test.js` | COVERED |
| APP-008 | payments | Payments | GET | `/order-confirmation` | public | checkOrderStatus | H,VAL,ERR,STATE | `backend/src/app.js:288` | `backend/tests/integration/directAppRoutes.test.js` | COVERED |
| APP-009 | payments | Payments | GET | `/razorpay-confirmation` | public | checkRazorpayOrderStatus | H,VAL,ERR,STATE | `backend/src/app.js:289` | `backend/tests/integration/directAppRoutes.test.js` | COVERED |

## Background jobs

| ID | Job | Trigger | Cases | Source | Test owner | Status |
| --- | --- | --- | --- | --- | --- | --- |
| JOB-001 | Media cleanup cron | cron | H,ERR,RETRY,IDEM,CLN | `backend/src/services/mediaCleanupService.js:81` | `backend/tests/integration/backgroundJobsSurface.test.js` | COVERED |
| JOB-002 | CSV image cleanup cron | cron | H,ERR,RETRY,IDEM,CLN | `backend/src/services/csvImageCleanupService.js:96` | `backend/tests/integration/backgroundJobsSurface.test.js` | COVERED |
| JOB-003 | Expired asset cleanup cron and startup run | cron+startup | H,ERR,RETRY,IDEM,CLN | `backend/src/jobs/cleanupExpiredAssets.js:132` | `backend/tests/integration/backgroundJobsSurface.test.js` | COVERED |
| JOB-004 | Daily AI report cron | cron | H,ERR,RETRY,IDEM,EXP | `backend/src/services/aiReportService.js:458` | `backend/tests/integration/backgroundJobsSurface.test.js` | COVERED |

## Backend API inventory

| ID | Area | Domain | Method | Endpoint | Access | Handler | Cases | Source | Test owner | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0001 | dashboard | Admin Users | GET | `/api/v1/admin/users` | permission:manage:users | getAdminUsers | H,VAL,AUTH,ERR,BND,STATE | `src/routes/adminRoutes.js:148` | `backend/tests/integration/adminUserSurface.test.js` | COVERED |
| API-0002 | dashboard | Admin Users | POST | `/api/v1/admin/users` | permission:manage:roles | createAdminUser | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/adminRoutes.js:155` | `backend/tests/integration/adminUserSurface.test.js` | COVERED |
| API-0003 | dashboard | Admin Users | DELETE | `/api/v1/admin/users/:id` | permission:manage:users | deleteAdminUser | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/adminRoutes.js:176` | `backend/tests/integration/adminUserSurface.test.js` | COVERED |
| API-0004 | dashboard | Admin Users | PATCH | `/api/v1/admin/users/:id` | permission:manage:roles | updateAdminUser | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/adminRoutes.js:169` | `backend/tests/integration/adminUserSurface.test.js` | COVERED |
| API-0005 | dashboard | Admin Users | GET | `/api/v1/admin/users/audit` | permission:manage:roles | getAdminUserAudit | H,VAL,AUTH,ERR,BND,STATE | `src/routes/adminRoutes.js:162` | `backend/tests/integration/adminUserSurface.test.js` | COVERED |
| API-0006 | dashboard | Attributes | GET | `/api/v1/admin/attributes` | public | getAllAttributes | H,VAL,AUTH,ERR,BND,STATE | `src/routes/attributeRoutes.js:29` | `backend/tests/integration/catalogSurface.test.js` | COVERED |
| API-0007 | dashboard | Attributes | POST | `/api/v1/admin/attributes` | admin | createAttribute | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/attributeRoutes.js:39` | `backend/tests/integration/catalogSurface.test.js` | COVERED |
| API-0008 | dashboard | Attributes | DELETE | `/api/v1/admin/attributes/:id` | admin | deleteAttribute | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/attributeRoutes.js:45` | `backend/tests/integration/catalogSurface.test.js` | COVERED |
| API-0009 | dashboard | Attributes | GET | `/api/v1/admin/attributes/:id` | public | getAttributeById | H,VAL,AUTH,ERR,BND,STATE | `src/routes/attributeRoutes.js:32` | `backend/tests/integration/catalogSurface.test.js` | COVERED |
| API-0010 | dashboard | Attributes | PATCH | `/api/v1/admin/attributes/:id` | admin | updateAttribute | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/attributeRoutes.js:42` | `backend/tests/integration/catalogSurface.test.js` | COVERED |
| API-0011 | dashboard | Attributes | POST | `/api/v1/admin/attributes/:id/values` | admin | addAllowedValue | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/attributeRoutes.js:52` | `backend/tests/integration/catalogSurface.test.js` | COVERED |
| API-0012 | dashboard | Attributes | DELETE | `/api/v1/admin/attributes/:id/values/:valueCode` | admin | removeAllowedValue | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/attributeRoutes.js:58` | `backend/tests/integration/catalogSurface.test.js` | COVERED |
| API-0013 | dashboard | Attributes | PATCH | `/api/v1/admin/attributes/:id/values/:valueCode` | admin | updateAllowedValue | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/attributeRoutes.js:55` | `backend/tests/integration/catalogSurface.test.js` | COVERED |
| API-0014 | dashboard | Attributes | POST | `/api/v1/admin/attributes/:id/values/merge` | admin | mergeAllowedValues | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/attributeRoutes.js:62` | `backend/tests/integration/catalogSurface.test.js` | COVERED |
| API-0015 | dashboard | Cache & Revalidation | POST | `/api/v1/admin/revalidate` | admin | inline | H,VAL,AUTH,ERR,BND,IDEM,CLN | `routes/admin/revalidate.js:51` | `backend/tests/integration/adminOperationsSurface.test.js` | COVERED |
| API-0016 | dashboard | Categories | GET | `/api/v1/admin/categories` | admin | getAllCategories | H,VAL,AUTH,ERR,BND,STATE | `src/routes/adminRoutes.js:1698` | `backend/tests/integration/catalogSurface.test.js` | COVERED |
| API-0017 | dashboard | Categories | POST | `/api/v1/admin/categories` | admin | createCategory | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/adminRoutes.js:1876` | `backend/tests/integration/catalogSurface.test.js` | COVERED |
| API-0018 | dashboard | Categories | DELETE | `/api/v1/admin/categories/:categoryId` | admin | deleteCategory | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/adminRoutes.js:2009` | `backend/tests/integration/catalogSurface.test.js` | COVERED |
| API-0019 | dashboard | Categories | GET | `/api/v1/admin/categories/:categoryId` | admin | getCategoryById | H,VAL,AUTH,ERR,BND,STATE | `src/routes/adminRoutes.js:1808` | `backend/tests/integration/catalogSurface.test.js` | COVERED |
| API-0020 | dashboard | Categories | PATCH | `/api/v1/admin/categories/:categoryId` | admin | updateCategory | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/adminRoutes.js:1953` | `backend/tests/integration/catalogSurface.test.js` | COVERED |
| API-0021 | dashboard | Categories | POST | `/api/v1/admin/categories/:categoryId` | admin | getCategoryById | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/adminRoutes.js:1814` | `backend/tests/integration/catalogSurface.test.js` | COVERED |
| API-0022 | dashboard | Categories | POST | `/api/v1/admin/categories/bulk-delete` | admin | bulkDeleteCategories | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/adminRoutes.js:1732` | `backend/tests/integration/catalogSurface.test.js` | COVERED |
| API-0023 | dashboard | CMS | GET | `/api/v1/admin/cms` | admin | cmsAdminController.getAllContent | H,VAL,AUTH,ERR,BND,STATE | `src/features/cms/cms.admin.routes.js:40` | `backend/tests/integration/cmsSurface.test.js` | COVERED |
| API-0024 | dashboard | CMS | POST | `/api/v1/admin/cms` | admin | cmsAdminController.updateContent | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/features/cms/cms.admin.routes.js:69` | `backend/tests/integration/cmsSurface.test.js` | COVERED |
| API-0025 | dashboard | CMS | DELETE | `/api/v1/admin/cms/:page` | admin | cmsAdminController.deleteContent | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/features/cms/cms.admin.routes.js:166` | `backend/tests/integration/cmsSurface.test.js` | COVERED |
| API-0026 | dashboard | CMS | GET | `/api/v1/admin/cms/:page` | admin | cmsAdminController.getContentByPage | H,VAL,AUTH,ERR,BND,STATE | `src/features/cms/cms.admin.routes.js:123` | `backend/tests/integration/cmsSurface.test.js` | COVERED |
| API-0027 | dashboard | CMS | PUT | `/api/v1/admin/cms/:page` | admin | cmsAdminController.updateContentByPage | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/features/cms/cms.admin.routes.js:151` | `backend/tests/integration/cmsSurface.test.js` | COVERED |
| API-0028 | dashboard | CMS | PATCH | `/api/v1/admin/cms/:page/block/:blockType` | admin | cmsAdminController.updateSingleBlock | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/features/cms/cms.admin.routes.js:108` | `backend/tests/integration/cmsSurface.test.js` | COVERED |
| API-0029 | dashboard | CMS | GET | `/api/v1/admin/cms/landings` | admin | listLandings | H,VAL,AUTH,ERR,BND,STATE | `src/features/cms/cms.admin.routes.js:28` | `backend/tests/integration/cmsSurface.test.js` | COVERED |
| API-0030 | dashboard | CMS | POST | `/api/v1/admin/cms/landings` | admin | createLanding | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/features/cms/cms.admin.routes.js:28` | `backend/tests/integration/cmsSurface.test.js` | COVERED |
| API-0031 | dashboard | CMS | DELETE | `/api/v1/admin/cms/landings/:slug` | admin | deleteLanding | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/features/cms/cms.admin.routes.js:29` | `backend/tests/integration/cmsSurface.test.js` | COVERED |
| API-0032 | dashboard | CMS | GET | `/api/v1/admin/cms/landings/:slug` | admin | getLanding | H,VAL,AUTH,ERR,BND,STATE | `src/features/cms/cms.admin.routes.js:29` | `backend/tests/integration/cmsSurface.test.js` | COVERED |
| API-0033 | dashboard | CMS | PUT | `/api/v1/admin/cms/landings/:slug` | admin | updateLanding | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/features/cms/cms.admin.routes.js:29` | `backend/tests/integration/cmsSurface.test.js` | COVERED |
| API-0034 | dashboard | CMS Pages | GET | `/api/v1/admin/pages` | admin | pagesAdminController.listPages | H,VAL,AUTH,ERR,BND,STATE | `src/features/cms/pages/pages.admin.routes.js:30` | `backend/tests/integration/cmsSurface.test.js` | COVERED |
| API-0035 | dashboard | CMS Pages | POST | `/api/v1/admin/pages` | admin | pagesAdminController.createPage | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/features/cms/pages/pages.admin.routes.js:32` | `backend/tests/integration/cmsSurface.test.js` | COVERED |
| API-0036 | dashboard | CMS Pages | DELETE | `/api/v1/admin/pages/:id` | admin | pagesAdminController.deletePage | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/features/cms/pages/pages.admin.routes.js:48` | `backend/tests/integration/cmsSurface.test.js` | COVERED |
| API-0037 | dashboard | CMS Pages | GET | `/api/v1/admin/pages/:id` | admin | pagesAdminController.getPageById | H,VAL,AUTH,ERR,BND,STATE | `src/features/cms/pages/pages.admin.routes.js:34` | `backend/tests/integration/cmsSurface.test.js` | COVERED |
| API-0038 | dashboard | CMS Pages | PUT | `/api/v1/admin/pages/:id` | admin | pagesAdminController.saveDraft | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/features/cms/pages/pages.admin.routes.js:36` | `backend/tests/integration/cmsSurface.test.js` | COVERED |
| API-0039 | dashboard | CMS Pages | POST | `/api/v1/admin/pages/:id/publish` | admin | pagesAdminController.publishPage | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/features/cms/pages/pages.admin.routes.js:42` | `backend/tests/integration/cmsSurface.test.js` | COVERED |
| API-0040 | dashboard | Collections | GET | `/api/v1/admin/collections` | admin | listCollections | H,VAL,AUTH,ERR,BND,STATE | `src/routes/collectionRoutes.js:17` | `backend/tests/integration/catalogSurface.test.js` | COVERED |
| API-0041 | dashboard | Collections | POST | `/api/v1/admin/collections` | admin | createCollection | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/collectionRoutes.js:18` | `backend/tests/integration/catalogSurface.test.js` | COVERED |
| API-0042 | dashboard | Collections | DELETE | `/api/v1/admin/collections/:id` | admin | deleteCollection | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/collectionRoutes.js:20` | `backend/tests/integration/catalogSurface.test.js` | COVERED |
| API-0043 | dashboard | Collections | PATCH | `/api/v1/admin/collections/:id` | admin | updateCollection | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/collectionRoutes.js:19` | `backend/tests/integration/catalogSurface.test.js` | COVERED |
| API-0044 | dashboard | Collections | GET | `/api/v1/admin/collections/redirects` | admin | listCollectionRedirects | H,VAL,AUTH,ERR,BND,STATE | `src/routes/collectionRoutes.js:26` | `backend/tests/integration/catalogSurface.test.js` | COVERED |
| API-0045 | dashboard | Collections | DELETE | `/api/v1/admin/collections/redirects/:id` | admin | deleteCollectionRedirect | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/collectionRoutes.js:27` | `backend/tests/integration/catalogSurface.test.js` | COVERED |
| API-0046 | dashboard | CSV Import | GET | `/api/v1/admin/csv-images` | admin | csvImageController.listTempImages | H,VAL,AUTH,ERR,BND,STATE,EXP,FILE | `src/routes/csvImageRoutes.js:42` | `backend/tests/integration/assetSurface.test.js` | COVERED |
| API-0047 | dashboard | CSV Import | DELETE | `/api/v1/admin/csv-images/:temp_key` | admin | csvImageController.deleteTempImage | H,VAL,AUTH,ERR,BND,IDEM,CLN,EXP,FILE | `src/routes/csvImageRoutes.js:158` | `backend/tests/integration/assetSurface.test.js` | COVERED |
| API-0048 | dashboard | CSV Import | POST | `/api/v1/admin/csv-images/cleanup` | admin | csvImageController.manualCleanup | H,VAL,AUTH,ERR,BND,IDEM,CLN,EXP,FILE | `src/routes/csvImageRoutes.js:136` | `backend/tests/integration/assetSurface.test.js` | COVERED |
| API-0049 | dashboard | CSV Import | POST | `/api/v1/admin/csv-images/convert` | admin | csvImageController.convertToPermanent | H,VAL,AUTH,ERR,BND,IDEM,CLN,EXP,FILE | `src/routes/csvImageRoutes.js:113` | `backend/tests/integration/assetSurface.test.js` | COVERED |
| API-0050 | dashboard | CSV Import | POST | `/api/v1/admin/csv-images/upload` | admin | inline | H,VAL,AUTH,ERR,BND,IDEM,CLN,EXP,FILE | `src/routes/csvImageRoutes.js:65` | `backend/tests/integration/assetSurface.test.js` | COVERED |
| API-0051 | dashboard | CSV Import | POST | `/api/v1/admin/csv-images/validate` | admin | csvImageController.validateTempImages | H,VAL,AUTH,ERR,BND,IDEM,CLN,EXP,FILE | `src/routes/csvImageRoutes.js:89` | `backend/tests/integration/assetSurface.test.js` | COVERED |
| API-0052 | dashboard | Customers | GET | `/api/v1/admin/customers` | admin | getAllCustomers | H,VAL,AUTH,ERR,BND,STATE | `src/routes/adminRoutes.js:1527` | `backend/tests/integration/adminOperationsSurface.test.js` | COVERED |
| API-0053 | dashboard | Customers | POST | `/api/v1/admin/customers` | admin | getAllCustomers | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/adminRoutes.js:1528` | `backend/tests/integration/adminOperationsSurface.test.js` | COVERED |
| API-0054 | dashboard | Customers | GET | `/api/v1/admin/customers/:customerId` | admin | getCustomerById | H,VAL,AUTH,ERR,BND,STATE | `src/routes/adminRoutes.js:1548` | `backend/tests/integration/adminOperationsSurface.test.js` | COVERED |
| API-0055 | dashboard | Dashboard | GET | `/api/v1/admin/dashboard` | admin | getDashboardStats | H,VAL,AUTH,ERR,BND,STATE | `src/routes/adminRoutes.js:314` |  | COVERED |
| API-0056 | dashboard | Delivery Partners | GET | `/api/v1/admin/delivery-partners` | admin | getAllDeliveryPartners | H,VAL,AUTH,ERR,BND,STATE | `src/routes/deliveryPartnerRoutes.js:144` | `backend/tests/integration/adminOperationsSurface.test.js` | COVERED |
| API-0057 | dashboard | Delivery Partners | POST | `/api/v1/admin/delivery-partners` | admin | createDeliveryPartner | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/deliveryPartnerRoutes.js:145` | `backend/tests/integration/adminOperationsSurface.test.js` | COVERED |
| API-0058 | dashboard | Delivery Partners | DELETE | `/api/v1/admin/delivery-partners/:id` | admin | deleteDeliveryPartner | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/deliveryPartnerRoutes.js:147` | `backend/tests/integration/adminOperationsSurface.test.js` | COVERED |
| API-0059 | dashboard | Delivery Partners | PATCH | `/api/v1/admin/delivery-partners/:id` | admin | updateDeliveryPartner | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/deliveryPartnerRoutes.js:146` | `backend/tests/integration/adminOperationsSurface.test.js` | COVERED |
| API-0060 | dashboard | Error Logs | DELETE | `/api/v1/admin/error-logs` | permission:manage:error_logs | clearAllErrorLogs | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/adminRoutes.js:132` |  | COVERED |
| API-0061 | dashboard | Error Logs | GET | `/api/v1/admin/error-logs` | permission:view:error_logs | getErrorLogs | H,VAL,AUTH,ERR,BND,STATE | `src/routes/adminRoutes.js:125` |  | COVERED |
| API-0062 | dashboard | Error Logs | DELETE | `/api/v1/admin/error-logs/:id` | permission:manage:error_logs | deleteErrorLog | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/adminRoutes.js:139` |  | COVERED |
| API-0063 | dashboard | FAQs | GET | `/api/v1/admin/faq-categories` | public | getAllCategories | H,VAL,AUTH,ERR,BND,STATE | `src/routes/faqCategoryRoutes.js:14` | `backend/tests/integration/faqSurface.test.js` | COVERED |
| API-0064 | dashboard | FAQs | POST | `/api/v1/admin/faq-categories` | admin | createCategory | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/faqCategoryRoutes.js:15` | `backend/tests/integration/faqSurface.test.js` | COVERED |
| API-0065 | dashboard | FAQs | DELETE | `/api/v1/admin/faq-categories/:id` | admin | deleteCategory | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/faqCategoryRoutes.js:19` | `backend/tests/integration/faqSurface.test.js` | COVERED |
| API-0066 | dashboard | FAQs | PUT | `/api/v1/admin/faq-categories/:id` | admin | updateCategory | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/faqCategoryRoutes.js:18` | `backend/tests/integration/faqSurface.test.js` | COVERED |
| API-0067 | dashboard | FAQs | PUT | `/api/v1/admin/faq-categories/fix-display-order` | admin | fixDisplayOrder | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/faqCategoryRoutes.js:16` | `backend/tests/integration/faqSurface.test.js` | COVERED |
| API-0068 | dashboard | FAQs | PUT | `/api/v1/admin/faq-categories/reorder` | admin | reorderCategories | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/faqCategoryRoutes.js:17` | `backend/tests/integration/faqSurface.test.js` | COVERED |
| API-0069 | dashboard | Media | DELETE | `/api/v1/admin/media/delete` | admin | mediaController.deleteMedia | H,VAL,AUTH,ERR,BND,IDEM,CLN,FILE | `src/routes/mediaRoutes.js:129` | `backend/tests/integration/assetSurface.test.js` | COVERED |
| API-0070 | dashboard | Media | POST | `/api/v1/admin/media/delete-temp` | admin | mediaController.deleteTempMedia | H,VAL,AUTH,ERR,BND,IDEM,CLN,FILE | `src/routes/mediaRoutes.js:201` | `backend/tests/integration/assetSurface.test.js` | COVERED |
| API-0071 | dashboard | Media | POST | `/api/v1/admin/media/finalize` | admin | mediaController.finalizeMedia | H,VAL,AUTH,ERR,BND,IDEM,CLN,FILE | `src/routes/mediaRoutes.js:165` | `backend/tests/integration/assetSurface.test.js` | COVERED |
| API-0072 | dashboard | Media | POST | `/api/v1/admin/media/upload` | admin | inline | H,VAL,AUTH,ERR,BND,IDEM,CLN,FILE | `src/routes/mediaRoutes.js:89` | `backend/tests/integration/assetSurface.test.js` | COVERED |
| API-0073 | dashboard | Media Assets | GET | `/api/v1/admin/assets` | authenticated | getAssets | H,VAL,AUTH,ERR,BND,STATE,FILE | `src/routes/asset.js:99` | `backend/tests/integration/assetSurface.test.js` | COVERED |
| API-0074 | dashboard | Media Assets | DELETE | `/api/v1/admin/assets/:id` | authenticated | deleteAsset | H,VAL,AUTH,ERR,BND,IDEM,CLN,FILE | `src/routes/asset.js:123` | `backend/tests/integration/assetSurface.test.js` | COVERED |
| API-0075 | dashboard | Media Assets | POST | `/api/v1/admin/assets/:id/promote` | authenticated | inline | H,VAL,AUTH,ERR,BND,IDEM,CLN,FILE | `src/routes/asset.js:223` | `backend/tests/integration/assetSurface.test.js` | COVERED |
| API-0076 | dashboard | Media Assets | POST | `/api/v1/admin/assets/bulk-delete` | authenticated | bulkDeleteAssets | H,VAL,AUTH,ERR,BND,IDEM,CLN,FILE | `src/routes/asset.js:151` | `backend/tests/integration/assetSurface.test.js` | COVERED |
| API-0077 | dashboard | Media Assets | POST | `/api/v1/admin/assets/cleanup` | authenticated | inline | H,VAL,AUTH,ERR,BND,IDEM,CLN,FILE | `src/routes/asset.js:255` | `backend/tests/integration/assetSurface.test.js` | COVERED |
| API-0078 | dashboard | Media Assets | POST | `/api/v1/admin/assets/promote` | authenticated | promoteAsset | H,VAL,AUTH,ERR,BND,IDEM,CLN,FILE | `src/routes/asset.js:185` | `backend/tests/integration/assetSurface.test.js` | COVERED |
| API-0079 | dashboard | Media Assets | POST | `/api/v1/admin/assets/upload` | authenticated | uploadAsset | H,VAL,AUTH,ERR,BND,IDEM,CLN,FILE | `src/routes/asset.js:56` | `backend/tests/integration/assetSurface.test.js` | COVERED |
| API-0080 | dashboard | Notifications | GET | `/api/v1/admin/notifications` | admin | getNotifications | H,VAL,AUTH,ERR,BND,STATE | `src/routes/adminRoutes.js:109` | `backend/tests/integration/adminOperationsSurface.test.js` | COVERED |
| API-0081 | dashboard | Notifications | DELETE | `/api/v1/admin/notifications/:id` | admin | deleteNotification | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/adminRoutes.js:117` | `backend/tests/integration/adminOperationsSurface.test.js` | COVERED |
| API-0082 | dashboard | Notifications | PATCH | `/api/v1/admin/notifications/:id/read` | admin | markAsRead | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/adminRoutes.js:116` | `backend/tests/integration/adminOperationsSurface.test.js` | COVERED |
| API-0083 | dashboard | Notifications | PATCH | `/api/v1/admin/notifications/read-all` | admin | markAllAsRead | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/adminRoutes.js:110` | `backend/tests/integration/adminOperationsSurface.test.js` | COVERED |
| API-0084 | dashboard | Offers | GET | `/api/v1/admin/coupons` | admin | listCoupons | H,VAL,AUTH,ERR,BND,STATE | `src/routes/adminRoutes.js:1595` | `backend/tests/integration/adminOperationsSurface.test.js` | COVERED |
| API-0085 | dashboard | Offers | POST | `/api/v1/admin/coupons` | admin | createCoupon | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/adminRoutes.js:1596` | `backend/tests/integration/adminOperationsSurface.test.js` | COVERED |
| API-0086 | dashboard | Offers | DELETE | `/api/v1/admin/coupons/:id` | admin | deleteCoupon | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/adminRoutes.js:1619` | `backend/tests/integration/adminOperationsSurface.test.js` | COVERED |
| API-0087 | dashboard | Offers | PATCH | `/api/v1/admin/coupons/:id` | admin | updateCoupon | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/adminRoutes.js:1618` | `backend/tests/integration/adminOperationsSurface.test.js` | COVERED |
| API-0088 | dashboard | Offers | GET | `/api/v1/admin/coupons/product-search` | admin | searchProductsForCoupon | H,VAL,AUTH,ERR,BND,STATE | `src/routes/adminRoutes.js:1612` | `backend/tests/integration/adminOperationsSurface.test.js` | COVERED |
| API-0089 | dashboard | Orders | GET | `/api/v1/admin/orders` | admin | getAllOrders | H,VAL,AUTH,ERR,BND,STATE | `src/routes/adminRoutes.js:1129` | `backend/tests/integration/orderSurface.test.js` | COVERED |
| API-0090 | dashboard | Orders | POST | `/api/v1/admin/orders` | admin | getAllOrders | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/adminRoutes.js:1130` | `backend/tests/integration/orderSurface.test.js` | COVERED |
| API-0091 | dashboard | Orders | GET | `/api/v1/admin/orders/export` | admin | exportOrders | H,VAL,AUTH,ERR,BND,STATE,EXP | `src/routes/adminRoutes.js:1186` | `backend/tests/integration/orderSurface.test.js` | COVERED |
| API-0092 | dashboard | Orders | POST | `/api/v1/admin/orders/export` | admin | exportOrders | H,VAL,AUTH,ERR,BND,IDEM,CLN,EXP | `src/routes/adminRoutes.js:1185` | `backend/tests/integration/orderSurface.test.js` | COVERED |
| API-0093 | dashboard | Orders | PATCH | `/api/v1/admin/orders/mark-cod-paid` | admin | markCodOrderAsPaid | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/adminRoutes.js:1445` | `backend/tests/integration/orderSurface.test.js` | COVERED |
| API-0094 | dashboard | Orders | PATCH | `/api/v1/admin/orders/mark-paid` | admin | markOrderAsPaid | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/adminRoutes.js:1414` | `backend/tests/integration/orderSurface.test.js` | COVERED |
| API-0095 | dashboard | Orders | POST | `/api/v1/admin/orders/refund` | admin | initiateRefund | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/adminRoutes.js:1339` | `backend/tests/integration/orderSurface.test.js` | COVERED |
| API-0096 | dashboard | Orders | GET | `/api/v1/admin/orders/refund/:refundId` | admin | getRefundStatus | H,VAL,AUTH,ERR,BND,STATE | `src/routes/adminRoutes.js:1369` | `backend/tests/integration/orderSurface.test.js` | COVERED |
| API-0097 | dashboard | Orders | POST | `/api/v1/admin/orders/send-invoice` | admin | sendOrderInvoice | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/adminRoutes.js:1272` | `backend/tests/integration/orderSurface.test.js` | COVERED |
| API-0098 | dashboard | Orders | GET | `/api/v1/admin/orders/status-counts` | admin | getOrderStatusCounts | H,VAL,AUTH,ERR,BND,STATE | `src/routes/adminRoutes.js:1133` | `backend/tests/integration/orderSurface.test.js` | COVERED |
| API-0099 | dashboard | Orders | PATCH | `/api/v1/admin/orders/update-status` | admin | updateOrderStatus | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/adminRoutes.js:1489` | `backend/tests/integration/orderSurface.test.js` | COVERED |
| API-0100 | dashboard | Products | GET | `/api/v1/admin/products` | admin | getAllProducts | H,VAL,AUTH,ERR,BND,STATE | `src/routes/adminRoutes.js:298` | `backend/tests/integration/productSurface.test.js` | COVERED |
| API-0101 | dashboard | Products | POST | `/api/v1/admin/products` | admin | getAllProducts | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/adminRoutes.js:299` | `backend/tests/integration/productSurface.test.js` | COVERED |
| API-0102 | dashboard | Products | DELETE | `/api/v1/admin/products/:productId` | admin | deleteProduct | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/adminRoutes.js:1019` | `backend/tests/integration/productSurface.test.js` | COVERED |
| API-0103 | dashboard | Products | GET | `/api/v1/admin/products/:productId` | admin | getProductById | H,VAL,AUTH,ERR,BND,STATE | `src/routes/adminRoutes.js:888` | `backend/tests/integration/productSurface.test.js` | COVERED |
| API-0104 | dashboard | Products | PATCH | `/api/v1/admin/products/:productId` | admin | updateProduct | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/adminRoutes.js:963` | `backend/tests/integration/productSurface.test.js` | COVERED |
| API-0105 | dashboard | Products | POST | `/api/v1/admin/products/:productId` | admin | getProductById | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/adminRoutes.js:889` | `backend/tests/integration/productSurface.test.js` | COVERED |
| API-0106 | dashboard | Products | POST | `/api/v1/admin/products/ai/fix-errors` | admin | aiProductImportController.fixImportErrors | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/adminRoutes.js:731` | `backend/tests/integration/productSurface.test.js` | COVERED |
| API-0107 | dashboard | Products | POST | `/api/v1/admin/products/ai/generate` | admin | aiProductImportController.generateProducts | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/adminRoutes.js:724` | `backend/tests/integration/productSurface.test.js` | COVERED |
| API-0108 | dashboard | Products | GET | `/api/v1/admin/products/ai/knowledge-base` | admin | aiProductImportController.getKnowledgeBase | H,VAL,AUTH,ERR,BND,STATE | `src/routes/adminRoutes.js:738` | `backend/tests/integration/productSurface.test.js` | COVERED |
| API-0109 | dashboard | Products | POST | `/api/v1/admin/products/bulk-delete` | admin | bulkDeleteProducts | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/adminRoutes.js:556` | `backend/tests/integration/productSurface.test.js` | COVERED |
| API-0110 | dashboard | Products | POST | `/api/v1/admin/products/commit-import` | admin | bulkImportController.commitImport | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/adminRoutes.js:714` |  | COVERED |
| API-0111 | dashboard | Products | GET | `/api/v1/admin/products/count-filter-value` | admin | countFilterValue | H,VAL,AUTH,ERR,BND,STATE | `src/routes/adminRoutes.js:629` | `backend/tests/integration/productSurface.test.js` | COVERED |
| API-0112 | dashboard | Products | POST | `/api/v1/admin/products/create` | admin | createProduct | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/adminRoutes.js:816` | `backend/tests/integration/product.test.js` | COVERED |
| API-0113 | dashboard | Products | GET | `/api/v1/admin/products/design-families` | admin | getDesignFamilies | H,VAL,AUTH,ERR,BND,STATE | `src/routes/adminRoutes.js:649` | `backend/tests/integration/productSurface.test.js` | COVERED |
| API-0114 | dashboard | Products | POST | `/api/v1/admin/products/reindex-search` | admin | reindexSearchIndex | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/adminRoutes.js:603` | `backend/tests/integration/productSurface.test.js` | COVERED |
| API-0115 | dashboard | Products | GET | `/api/v1/admin/products/search` | admin | searchProducts | H,VAL,AUTH,ERR,BND,STATE | `src/routes/adminRoutes.js:589` | `backend/tests/integration/productSurface.test.js` | COVERED |
| API-0116 | dashboard | Products | GET | `/api/v1/admin/products/sku-lookup` | admin | skuLookup | H,VAL,AUTH,ERR,BND,STATE | `src/routes/adminRoutes.js:627` | `backend/tests/integration/productSurface.test.js` | COVERED |
| API-0117 | dashboard | Products | POST | `/api/v1/admin/products/validate-import` | admin | bulkImportController.validateImport | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/adminRoutes.js:682` |  | COVERED |
| API-0118 | dashboard | Reports | GET | `/api/v1/admin/ai-reports` | admin | listReports | H,VAL,AUTH,ERR,BND,STATE | `src/routes/adminAiReportRoutes.js:15` |  | COVERED |
| API-0119 | dashboard | Reports | GET | `/api/v1/admin/ai-reports/:date` | admin | getReport | H,VAL,AUTH,ERR,BND,STATE | `src/routes/adminAiReportRoutes.js:16` |  | COVERED |
| API-0120 | dashboard | Reports | POST | `/api/v1/admin/ai-reports/generate` | admin | generateReport | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/adminAiReportRoutes.js:17` |  | COVERED |
| API-0121 | dashboard | Reports | GET | `/api/v1/admin/reports/customers` | admin | getCustomersReport | H,VAL,AUTH,ERR,BND,STATE | `src/routes/adminRoutes.js:413` |  | COVERED |
| API-0122 | dashboard | Reports | GET | `/api/v1/admin/reports/orders-by-status` | admin | getOrdersByStatus | H,VAL,AUTH,ERR,BND,STATE | `src/routes/adminRoutes.js:474` |  | COVERED |
| API-0123 | dashboard | Reports | GET | `/api/v1/admin/reports/payment-method-split` | admin | getPaymentMethodSplit | H,VAL,AUTH,ERR,BND,STATE | `src/routes/adminRoutes.js:540` |  | COVERED |
| API-0124 | dashboard | Reports | GET | `/api/v1/admin/reports/returns-cancellations` | admin | getReturnsCancellations | H,VAL,AUTH,ERR,BND,STATE | `src/routes/adminRoutes.js:507` |  | COVERED |
| API-0125 | dashboard | Reports | GET | `/api/v1/admin/reports/revenue-over-time` | admin | getRevenueOverTime | H,VAL,AUTH,ERR,BND,STATE | `src/routes/adminRoutes.js:441` |  | COVERED |
| API-0126 | dashboard | Reports | GET | `/api/v1/admin/reports/sales-by-product` | admin | getSalesByProduct | H,VAL,AUTH,ERR,BND,STATE | `src/routes/adminRoutes.js:361` |  | COVERED |
| API-0127 | dashboard | Reviews | GET | `/api/v1/admin/reviews` | admin | getAllReviews | H,VAL,AUTH,ERR,BND,STATE | `src/routes/adminRoutes.js:1566` | `backend/tests/integration/reviewSurface.test.js` | COVERED |
| API-0128 | dashboard | Reviews | POST | `/api/v1/admin/reviews/approve` | admin | approveReview | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/adminRoutes.js:2043` | `backend/tests/integration/reviewSurface.test.js` | COVERED |
| API-0129 | dashboard | Reviews | POST | `/api/v1/admin/reviews/reject` | admin | rejectReview | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/adminRoutes.js:2072` | `backend/tests/integration/reviewSurface.test.js` | COVERED |
| API-0130 | dashboard | Reviews | POST | `/api/v1/admin/reviews/reply` | admin | replyToReview | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/adminRoutes.js:1577` | `backend/tests/integration/reviewSurface.test.js` | COVERED |
| API-0131 | dashboard | Site Settings | GET | `/api/v1/admin/settings` | admin | getAllSettings | H,VAL,AUTH,ERR,BND,STATE | `src/routes/siteSettingsRoutes.js:150` | `backend/tests/integration/settingsSurface.test.js` | COVERED |
| API-0132 | dashboard | Site Settings | POST | `/api/v1/admin/settings` | admin | createSetting | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/siteSettingsRoutes.js:214` | `backend/tests/integration/settingsSurface.test.js` | COVERED |
| API-0133 | dashboard | Site Settings | DELETE | `/api/v1/admin/settings/:key` | admin | deleteSetting | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/siteSettingsRoutes.js:268` | `backend/tests/integration/settingsSurface.test.js` | COVERED |
| API-0134 | dashboard | Site Settings | GET | `/api/v1/admin/settings/:key` | admin | getSetting | H,VAL,AUTH,ERR,BND,STATE | `src/routes/siteSettingsRoutes.js:172` | `backend/tests/integration/settingsSurface.test.js` | COVERED |
| API-0135 | dashboard | Site Settings | PUT | `/api/v1/admin/settings/:key` | admin | updateSetting | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/siteSettingsRoutes.js:248` | `backend/tests/integration/settingsSurface.test.js` | COVERED |
| API-0136 | dashboard | Site Settings | GET | `/api/v1/admin/settings/maintenance` | public | getMaintenanceSettings | H,VAL,AUTH,ERR,BND,STATE | `src/routes/siteSettingsRoutes.js:132` | `backend/tests/integration/settingsSurface.test.js` | COVERED |
| API-0137 | dashboard | Site Settings | PUT | `/api/v1/admin/settings/maintenance` | admin | updateMaintenanceSettings | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/siteSettingsRoutes.js:135` | `backend/tests/integration/settingsSurface.test.js` | COVERED |
| API-0138 | dashboard | Site Settings | GET | `/api/v1/admin/settings/popular-searches` | public | getPopularSearches | H,VAL,AUTH,ERR,BND,STATE | `src/routes/siteSettingsRoutes.js:60` | `backend/tests/integration/settingsSurface.test.js` | COVERED |
| API-0139 | dashboard | Site Settings | PUT | `/api/v1/admin/settings/popular-searches` | admin | upsertPopularSearches | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/siteSettingsRoutes.js:109` | `backend/tests/integration/settingsSurface.test.js` | COVERED |
| API-0140 | dashboard | Site Settings | GET | `/api/v1/admin/settings/popular-searches/admin` | admin | getPopularSearchesAdmin | H,VAL,AUTH,ERR,BND,STATE | `src/routes/siteSettingsRoutes.js:77` | `backend/tests/integration/settingsSurface.test.js` | COVERED |
| API-0141 | dashboard | Site Settings | PUT | `/api/v1/admin/settings/popular-searches/admin` | admin | upsertPopularSearches | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/siteSettingsRoutes.js:112` | `backend/tests/integration/settingsSurface.test.js` | COVERED |
| API-0142 | dashboard | Site Settings | GET | `/api/v1/admin/settings/public` | public | getPublicSettings | H,VAL,AUTH,ERR,BND,STATE | `src/routes/siteSettingsRoutes.js:48` | `backend/tests/integration/settingsSurface.test.js` | COVERED |
| API-0143 | dashboard | Site Settings | GET | `/api/v1/admin/settings/suggested-products` | public | getSuggestedProducts | H,VAL,AUTH,ERR,BND,STATE | `src/routes/siteSettingsRoutes.js:121` | `backend/tests/integration/settingsSurface.test.js` | COVERED |
| API-0144 | dashboard | Site Settings | PUT | `/api/v1/admin/settings/suggested-products` | admin | upsertSuggestedProducts | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/siteSettingsRoutes.js:127` | `backend/tests/integration/settingsSurface.test.js` | COVERED |
| API-0145 | dashboard | Site Settings | GET | `/api/v1/admin/settings/suggested-products/admin` | admin | getSuggestedProductsAdmin | H,VAL,AUTH,ERR,BND,STATE | `src/routes/siteSettingsRoutes.js:124` | `backend/tests/integration/settingsSurface.test.js` | COVERED |
| API-0146 | operations | Health | GET | `/api/v1/health/connection-logs` | admin | getConnectionLogs | H,VAL,AUTH,ERR,BND,STATE | `src/routes/healthRoutes.js:144` |  | COVERED |
| API-0147 | operations | Health | GET | `/api/v1/health/database` | admin | checkDatabaseHealth | H,VAL,AUTH,ERR,BND,STATE | `src/routes/healthRoutes.js:48` |  | COVERED |
| API-0148 | operations | Health | GET | `/api/v1/health/env-check` | admin | checkEnvironmentVariables | H,VAL,AUTH,ERR,BND,STATE | `src/routes/healthRoutes.js:120` |  | COVERED |
| API-0149 | operations | Health | GET | `/api/v1/health/ip-info` | admin | getIPInfo | H,VAL,AUTH,ERR,BND,STATE | `src/routes/healthRoutes.js:132` |  | COVERED |
| API-0150 | operations | Health | GET | `/api/v1/health/ping` | admin | pingDatabase | H,VAL,AUTH,ERR,BND,STATE | `src/routes/healthRoutes.js:79` |  | COVERED |
| API-0151 | operations | Health | GET | `/api/v1/health/status` | admin | getCompleteHealth | H,VAL,AUTH,ERR,BND,STATE | `src/routes/healthRoutes.js:108` |  | COVERED |
| API-0152 | shared | Attributes | GET | `/api/v1/attributes` | public | getAllAttributes | H,VAL,AUTH,ERR,BND,STATE | `src/routes/attributeRoutes.js:29` | `backend/tests/integration/catalogSurface.test.js` | COVERED |
| API-0153 | shared | Attributes | POST | `/api/v1/attributes` | admin | createAttribute | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/attributeRoutes.js:39` | `backend/tests/integration/catalogSurface.test.js` | COVERED |
| API-0154 | shared | Attributes | DELETE | `/api/v1/attributes/:id` | admin | deleteAttribute | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/attributeRoutes.js:45` | `backend/tests/integration/catalogSurface.test.js` | COVERED |
| API-0155 | shared | Attributes | GET | `/api/v1/attributes/:id` | public | getAttributeById | H,VAL,AUTH,ERR,BND,STATE | `src/routes/attributeRoutes.js:32` | `backend/tests/integration/catalogSurface.test.js` | COVERED |
| API-0156 | shared | Attributes | PATCH | `/api/v1/attributes/:id` | admin | updateAttribute | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/attributeRoutes.js:42` | `backend/tests/integration/catalogSurface.test.js` | COVERED |
| API-0157 | shared | Attributes | POST | `/api/v1/attributes/:id/values` | admin | addAllowedValue | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/attributeRoutes.js:52` | `backend/tests/integration/catalogSurface.test.js` | COVERED |
| API-0158 | shared | Attributes | DELETE | `/api/v1/attributes/:id/values/:valueCode` | admin | removeAllowedValue | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/attributeRoutes.js:58` | `backend/tests/integration/catalogSurface.test.js` | COVERED |
| API-0159 | shared | Attributes | PATCH | `/api/v1/attributes/:id/values/:valueCode` | admin | updateAllowedValue | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/attributeRoutes.js:55` | `backend/tests/integration/catalogSurface.test.js` | COVERED |
| API-0160 | shared | Attributes | POST | `/api/v1/attributes/:id/values/merge` | admin | mergeAllowedValues | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/attributeRoutes.js:62` | `backend/tests/integration/catalogSurface.test.js` | COVERED |
| API-0161 | shared | CMS | GET | `/api/v1/cms/:page` | public | cmsController.getContentByPage | H,VAL,AUTH,ERR,BND,STATE | `src/features/cms/cms.routes.js:59` | `backend/tests/integration/cmsSurface.test.js` | COVERED |
| API-0162 | shared | CMS | GET | `/api/v1/cms/block-pages/:slug` | public | getPublicLanding | H,VAL,AUTH,ERR,BND,STATE | `src/features/cms/cms.routes.js:57` | `backend/tests/integration/cmsSurface.test.js` | COVERED |
| API-0163 | shared | CMS Pages | GET | `/api/v1/cms/pages/:slug` | public | pagesPublicController.getPublishedPage | H,VAL,AUTH,ERR,BND,STATE | `src/features/cms/pages/pages.public.routes.js:24` | `backend/tests/integration/cmsSurface.test.js` | COVERED |
| API-0164 | shared | CMS Products | GET | `/api/v1/cms/products` | public | cmsProductController.getProductsForCms | H,VAL,AUTH,ERR,BND,STATE | `src/features/product/product.cms.routes.js:34` | `backend/tests/integration/cmsSurface.test.js` | COVERED |
| API-0165 | shared | Site Settings | GET | `/api/v1/settings` | admin | getAllSettings | H,VAL,AUTH,ERR,BND,STATE | `src/routes/siteSettingsRoutes.js:150` | `backend/tests/integration/settingsSurface.test.js` | COVERED |
| API-0166 | shared | Site Settings | POST | `/api/v1/settings` | admin | createSetting | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/siteSettingsRoutes.js:214` | `backend/tests/integration/settingsSurface.test.js` | COVERED |
| API-0167 | shared | Site Settings | DELETE | `/api/v1/settings/:key` | admin | deleteSetting | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/siteSettingsRoutes.js:268` | `backend/tests/integration/settingsSurface.test.js` | COVERED |
| API-0168 | shared | Site Settings | GET | `/api/v1/settings/:key` | admin | getSetting | H,VAL,AUTH,ERR,BND,STATE | `src/routes/siteSettingsRoutes.js:172` | `backend/tests/integration/settingsSurface.test.js` | COVERED |
| API-0169 | shared | Site Settings | PUT | `/api/v1/settings/:key` | admin | updateSetting | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/siteSettingsRoutes.js:248` | `backend/tests/integration/settingsSurface.test.js` | COVERED |
| API-0170 | shared | Site Settings | GET | `/api/v1/settings/maintenance` | public | getMaintenanceSettings | H,VAL,AUTH,ERR,BND,STATE | `src/routes/siteSettingsRoutes.js:132` | `backend/tests/integration/settingsSurface.test.js` | COVERED |
| API-0171 | shared | Site Settings | PUT | `/api/v1/settings/maintenance` | admin | updateMaintenanceSettings | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/siteSettingsRoutes.js:135` | `backend/tests/integration/settingsSurface.test.js` | COVERED |
| API-0172 | shared | Site Settings | GET | `/api/v1/settings/popular-searches` | public | getPopularSearches | H,VAL,AUTH,ERR,BND,STATE | `src/routes/siteSettingsRoutes.js:60` | `backend/tests/integration/settingsSurface.test.js` | COVERED |
| API-0173 | shared | Site Settings | PUT | `/api/v1/settings/popular-searches` | admin | upsertPopularSearches | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/siteSettingsRoutes.js:109` | `backend/tests/integration/settingsSurface.test.js` | COVERED |
| API-0174 | shared | Site Settings | GET | `/api/v1/settings/popular-searches/admin` | admin | getPopularSearchesAdmin | H,VAL,AUTH,ERR,BND,STATE | `src/routes/siteSettingsRoutes.js:77` | `backend/tests/integration/settingsSurface.test.js` | COVERED |
| API-0175 | shared | Site Settings | PUT | `/api/v1/settings/popular-searches/admin` | admin | upsertPopularSearches | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/siteSettingsRoutes.js:112` | `backend/tests/integration/settingsSurface.test.js` | COVERED |
| API-0176 | shared | Site Settings | GET | `/api/v1/settings/public` | public | getPublicSettings | H,VAL,AUTH,ERR,BND,STATE | `src/routes/siteSettingsRoutes.js:48` | `backend/tests/integration/settingsSurface.test.js` | COVERED |
| API-0177 | shared | Site Settings | GET | `/api/v1/settings/suggested-products` | public | getSuggestedProducts | H,VAL,AUTH,ERR,BND,STATE | `src/routes/siteSettingsRoutes.js:121` | `backend/tests/integration/settingsSurface.test.js` | COVERED |
| API-0178 | shared | Site Settings | PUT | `/api/v1/settings/suggested-products` | admin | upsertSuggestedProducts | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/siteSettingsRoutes.js:127` | `backend/tests/integration/settingsSurface.test.js` | COVERED |
| API-0179 | shared | Site Settings | GET | `/api/v1/settings/suggested-products/admin` | admin | getSuggestedProductsAdmin | H,VAL,AUTH,ERR,BND,STATE | `src/routes/siteSettingsRoutes.js:124` | `backend/tests/integration/settingsSurface.test.js` | COVERED |
| API-0180 | storefront | Addresses | POST | `/api/v1/addresses` | authenticated | getAddresses | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/addressRoutes.js:152` | `backend/tests/integration/accountSurface.test.js` | COVERED |
| API-0181 | storefront | Addresses | DELETE | `/api/v1/addresses/:addressId` | authenticated | deleteAddress | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/addressRoutes.js:280` | `backend/tests/integration/accountSurface.test.js` | COVERED |
| API-0182 | storefront | Addresses | PUT | `/api/v1/addresses/:addressId` | authenticated | updateAddress | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/addressRoutes.js:243` | `backend/tests/integration/accountSurface.test.js` | COVERED |
| API-0183 | storefront | Addresses | POST | `/api/v1/addresses/create` | authenticated | createAddress | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/addressRoutes.js:108` | `backend/tests/integration/accountSurface.test.js` | COVERED |
| API-0184 | storefront | Analytics | POST | `/api/v1/analytics/track` | public | track | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/analyticsRoutes.js:7` | `backend/tests/integration/storefrontTrackingSurface.test.js` | COVERED |
| API-0185 | storefront | Auth | POST | `/api/v1/auth/change-password` | authenticated | changePassword | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/auth.js:843` | `backend/tests/integration/authSurface.test.js` | COVERED |
| API-0186 | storefront | Auth | POST | `/api/v1/auth/check-user` | public | checkUserExists | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/auth.js:97` | `backend/tests/integration/authSurface.test.js` | COVERED |
| API-0187 | storefront | Auth | POST | `/api/v1/auth/google` | public | googleAuth | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/auth.js:874` | `backend/tests/integration/authSurface.test.js` | COVERED |
| API-0188 | storefront | Auth | POST | `/api/v1/auth/login` | public | login | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/auth.js:373` | `backend/tests/integration/authSurface.test.js` | COVERED |
| API-0189 | storefront | Auth | POST | `/api/v1/auth/logout` | public | logout | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/auth.js:448` | `backend/tests/integration/authSurface.test.js` | COVERED |
| API-0190 | storefront | Auth | GET | `/api/v1/auth/profile` | authenticated | getProfile | H,VAL,AUTH,ERR,BND,STATE | `src/routes/auth.js:572` | `backend/tests/integration/authSurface.test.js` | COVERED |
| API-0191 | storefront | Auth | PUT | `/api/v1/auth/profile` | authenticated | updateProfile | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/auth.js:613` | `backend/tests/integration/authSurface.test.js` | COVERED |
| API-0192 | storefront | Auth | POST | `/api/v1/auth/refresh` | public | refreshToken | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/auth.js:411` | `backend/tests/integration/authSurface.test.js` | COVERED |
| API-0193 | storefront | Auth | POST | `/api/v1/auth/request-login-otp` | public | requestLoginOTP | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/auth.js:145` | `backend/tests/integration/authSurface.test.js` | COVERED |
| API-0194 | storefront | Auth | POST | `/api/v1/auth/request-otp` | public | requestOTP | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/auth.js:244` | `backend/tests/integration/authSurface.test.js` | COVERED |
| API-0195 | storefront | Auth | POST | `/api/v1/auth/request-password-reset` | public | requestPasswordReset | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/auth.js:670` | `backend/tests/integration/authSurface.test.js` | COVERED |
| API-0196 | storefront | Auth | POST | `/api/v1/auth/request-password-reset-otp` | public | requestPasswordResetOTP | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/auth.js:750` | `backend/tests/integration/authSurface.test.js` | COVERED |
| API-0197 | storefront | Auth | POST | `/api/v1/auth/resend-otp` | public | resendOTP | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/auth.js:490` | `backend/tests/integration/authSurface.test.js` | COVERED |
| API-0198 | storefront | Auth | POST | `/api/v1/auth/reset-password` | public | resetPassword | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/auth.js:703` | `backend/tests/integration/authSurface.test.js` | COVERED |
| API-0199 | storefront | Auth | POST | `/api/v1/auth/verify-login-otp` | public | verifyLoginOTP | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/auth.js:199` | `backend/tests/integration/authSurface.test.js` | COVERED |
| API-0200 | storefront | Auth | POST | `/api/v1/auth/verify-otp` | public | verifyOTP | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/auth.js:320` | `backend/tests/integration/authSurface.test.js` | COVERED |
| API-0201 | storefront | Auth | POST | `/api/v1/auth/verify-password-reset-otp` | public | verifyPasswordResetOTP | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/auth.js:805` | `backend/tests/integration/authSurface.test.js` | COVERED |
| API-0202 | storefront | Cart | POST | `/api/v1/cart/add-item` | public | addItem | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/hybridCartRoutes.js:99` | `backend/tests/integration/cartSurface.test.js` | COVERED |
| API-0203 | storefront | Cart | POST | `/api/v1/cart/apply-coupon` | public | applyCoupon | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/hybridCartRoutes.js:324` | `backend/tests/integration/cartSurface.test.js` | COVERED |
| API-0204 | storefront | Cart | POST | `/api/v1/cart/clear` | public | clearCart | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/hybridCartRoutes.js:171` | `backend/tests/integration/cartSurface.test.js` | COVERED |
| API-0205 | storefront | Cart | GET | `/api/v1/cart/count` | public | getCount | H,VAL,AUTH,ERR,BND,STATE | `src/routes/hybridCartRoutes.js:198` | `backend/tests/integration/cartSurface.test.js` | COVERED |
| API-0206 | storefront | Cart | POST | `/api/v1/cart/count` | public | getCount | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/hybridCartRoutes.js:199` | `backend/tests/integration/cartSurface.test.js` | COVERED |
| API-0207 | storefront | Cart | GET | `/api/v1/cart/coupons` | public | getAvailableCoupons | H,VAL,AUTH,ERR,BND,STATE | `src/routes/hybridCartRoutes.js:378` | `backend/tests/integration/cartSurface.test.js` | COVERED |
| API-0208 | storefront | Cart | POST | `/api/v1/cart/create` | public | createCart | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/hybridCartRoutes.js:46` | `backend/tests/integration/cartSurface.test.js` | COVERED |
| API-0209 | storefront | Cart | POST | `/api/v1/cart/get` | public | getCart | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/hybridCartRoutes.js:66` | `backend/tests/integration/cartSurface.test.js` | COVERED |
| API-0210 | storefront | Cart | GET | `/api/v1/cart/items` | public | getItems | H,VAL,AUTH,ERR,BND,STATE | `src/routes/hybridCartRoutes.js:217` | `backend/tests/integration/cartSurface.test.js` | COVERED |
| API-0211 | storefront | Cart | POST | `/api/v1/cart/items` | public | getItems | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/hybridCartRoutes.js:218` | `backend/tests/integration/cartSurface.test.js` | COVERED |
| API-0212 | storefront | Cart | POST | `/api/v1/cart/merge` | authenticated | mergeCart | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/hybridCartRoutes.js:299` | `backend/tests/integration/cartSurface.test.js` | COVERED |
| API-0213 | storefront | Cart | GET | `/api/v1/cart/price-summary` | public | getPriceSummary | H,VAL,AUTH,ERR,BND,STATE | `src/routes/hybridCartRoutes.js:236` | `backend/tests/integration/cartSurface.test.js` | COVERED |
| API-0214 | storefront | Cart | POST | `/api/v1/cart/price-summary` | public | getPriceSummary | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/hybridCartRoutes.js:242` | `backend/tests/integration/cartSurface.test.js` | COVERED |
| API-0215 | storefront | Cart | GET | `/api/v1/cart/product-data` | public | getProductData | H,VAL,AUTH,ERR,BND,STATE | `src/routes/hybridCartRoutes.js:265` | `backend/tests/integration/cartSurface.test.js` | COVERED |
| API-0216 | storefront | Cart | POST | `/api/v1/cart/product-data` | public | getProductData | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/hybridCartRoutes.js:266` | `backend/tests/integration/cartSurface.test.js` | COVERED |
| API-0217 | storefront | Cart | POST | `/api/v1/cart/recover` | public | recoverCart | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/hybridCartRoutes.js:390` | `backend/tests/integration/cartSurface.test.js` | COVERED |
| API-0218 | storefront | Cart | DELETE | `/api/v1/cart/remove-coupon` | public | removeCoupon | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/hybridCartRoutes.js:336` | `backend/tests/integration/cartSurface.test.js` | COVERED |
| API-0219 | storefront | Cart | DELETE | `/api/v1/cart/remove-item` | public | removeItem | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/hybridCartRoutes.js:159` | `backend/tests/integration/cartSurface.test.js` | COVERED |
| API-0220 | storefront | Cart | POST | `/api/v1/cart/start-checkout` | public | startCheckout | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/hybridCartRoutes.js:366` | `backend/tests/integration/cartSurface.test.js` | COVERED |
| API-0221 | storefront | Cart | GET | `/api/v1/cart/summary` | public | getSummary | H,VAL,AUTH,ERR,BND,STATE | `src/routes/hybridCartRoutes.js:284` | `backend/tests/integration/cartSurface.test.js` | COVERED |
| API-0222 | storefront | Cart | POST | `/api/v1/cart/summary` | public | getSummary | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/hybridCartRoutes.js:285` | `backend/tests/integration/cartSurface.test.js` | COVERED |
| API-0223 | storefront | Cart | PATCH | `/api/v1/cart/update-item` | public | updateItem | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/hybridCartRoutes.js:132` | `backend/tests/integration/cartSurface.test.js` | COVERED |
| API-0224 | storefront | Categories | GET | `/api/v1/category` | public | getAllCategories | H,VAL,AUTH,ERR,BND,STATE | `src/routes/categoryRoutes.js:80` | `backend/tests/integration/catalogSurface.test.js` | COVERED |
| API-0225 | storefront | Categories | POST | `/api/v1/category` | authenticated | createCategory | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/categoryRoutes.js:171` | `backend/tests/integration/catalogSurface.test.js` | COVERED |
| API-0226 | storefront | Categories | DELETE | `/api/v1/category/:categoryId` | authenticated | deleteCategory | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/categoryRoutes.js:276` | `backend/tests/integration/catalogSurface.test.js` | COVERED |
| API-0227 | storefront | Categories | GET | `/api/v1/category/:categoryId` | public | getCategoryById | H,VAL,AUTH,ERR,BND,STATE | `src/routes/categoryRoutes.js:131` | `backend/tests/integration/catalogSurface.test.js` | COVERED |
| API-0228 | storefront | Categories | PUT | `/api/v1/category/:categoryId` | authenticated | updateCategory | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/categoryRoutes.js:235` | `backend/tests/integration/catalogSurface.test.js` | COVERED |
| API-0229 | storefront | Categories | POST | `/api/v1/category/bulk-delete` | authenticated | bulkDeleteCategories | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/categoryRoutes.js:111` | `backend/tests/integration/catalogSurface.test.js` | COVERED |
| API-0230 | storefront | Chat | GET | `/api/v1/chat/admin/knowledge` | admin | getKnowledge | H,VAL,AUTH,ERR,BND,STATE | `src/routes/chatRoutes.js:41` | `backend/tests/integration/chatSurface.test.js` | COVERED |
| API-0231 | storefront | Chat | POST | `/api/v1/chat/admin/knowledge` | admin | addKnowledge | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/chatRoutes.js:42` | `backend/tests/integration/chatSurface.test.js` | COVERED |
| API-0232 | storefront | Chat | DELETE | `/api/v1/chat/admin/knowledge/:id` | admin | deleteKnowledge | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/chatRoutes.js:43` | `backend/tests/integration/chatSurface.test.js` | COVERED |
| API-0233 | storefront | Chat | GET | `/api/v1/chat/admin/sessions` | admin | getEscalatedSessions | H,VAL,AUTH,ERR,BND,STATE | `src/routes/chatRoutes.js:33` | `backend/tests/integration/chatSurface.test.js` | COVERED |
| API-0234 | storefront | Chat | GET | `/api/v1/chat/admin/sessions/:sessionId` | admin | getSessionById | H,VAL,AUTH,ERR,BND,STATE | `src/routes/chatRoutes.js:35` | `backend/tests/integration/chatSurface.test.js` | COVERED |
| API-0235 | storefront | Chat | PATCH | `/api/v1/chat/admin/sessions/:sessionId/details` | admin | updateSessionDetails | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/chatRoutes.js:37` | `backend/tests/integration/chatSurface.test.js` | COVERED |
| API-0236 | storefront | Chat | POST | `/api/v1/chat/admin/sessions/:sessionId/join` | admin | joinSession | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/chatRoutes.js:39` | `backend/tests/integration/chatSurface.test.js` | COVERED |
| API-0237 | storefront | Chat | POST | `/api/v1/chat/admin/sessions/:sessionId/reply` | admin | staffReply | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/chatRoutes.js:38` | `backend/tests/integration/chatSurface.test.js` | COVERED |
| API-0238 | storefront | Chat | POST | `/api/v1/chat/admin/sessions/:sessionId/resolve` | admin | resolveSession | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/chatRoutes.js:40` | `backend/tests/integration/chatSurface.test.js` | COVERED |
| API-0239 | storefront | Chat | GET | `/api/v1/chat/admin/sessions/:sessionId/suggest-replies` | admin | suggestReplies | H,VAL,AUTH,ERR,BND,STATE | `src/routes/chatRoutes.js:36` | `backend/tests/integration/chatSurface.test.js` | COVERED |
| API-0240 | storefront | Chat | GET | `/api/v1/chat/admin/sessions/counts` | admin | getSessionCounts | H,VAL,AUTH,ERR,BND,STATE | `src/routes/chatRoutes.js:34` | `backend/tests/integration/chatSurface.test.js` | COVERED |
| API-0241 | storefront | Chat | POST | `/api/v1/chat/message` | public | sendMessage | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/chatRoutes.js:27` | `backend/tests/integration/chatSurface.test.js` | COVERED |
| API-0242 | storefront | Chat | POST | `/api/v1/chat/session` | public | getOrCreateSession | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/chatRoutes.js:26` | `backend/tests/integration/chatSurface.test.js` | COVERED |
| API-0243 | storefront | Chat | POST | `/api/v1/chat/session/:sessionId/contact` | public | saveContact | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/chatRoutes.js:29` | `backend/tests/integration/chatSurface.test.js` | COVERED |
| API-0244 | storefront | Chat | POST | `/api/v1/chat/session/:sessionId/end` | public | endSession | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/chatRoutes.js:30` | `backend/tests/integration/chatSurface.test.js` | COVERED |
| API-0245 | storefront | Chat | POST | `/api/v1/chat/session/:sessionId/request-human` | public | requestHuman | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/chatRoutes.js:28` | `backend/tests/integration/chatSurface.test.js` | COVERED |
| API-0246 | storefront | Collections | GET | `/api/v1/collection/:slug` | public | getCollectionBySlug | H,VAL,AUTH,ERR,BND,STATE | `src/routes/collectionStorefrontRoutes.js:12` | `backend/tests/integration/catalogSurface.test.js` | COVERED |
| API-0247 | storefront | FAQs | GET | `/api/v1/faqs` | public | getAllFAQs | H,VAL,AUTH,ERR,BND,STATE | `src/routes/faqRoutes.js:79` | `backend/tests/integration/faqSurface.test.js` | COVERED |
| API-0248 | storefront | FAQs | POST | `/api/v1/faqs` | admin | createFAQ | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/faqRoutes.js:103` | `backend/tests/integration/faqSurface.test.js` | COVERED |
| API-0249 | storefront | FAQs | DELETE | `/api/v1/faqs/:id` | admin | deleteFAQ | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/faqRoutes.js:158` | `backend/tests/integration/faqSurface.test.js` | COVERED |
| API-0250 | storefront | FAQs | PUT | `/api/v1/faqs/:id` | admin | updateFAQ | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/faqRoutes.js:134` | `backend/tests/integration/faqSurface.test.js` | COVERED |
| API-0251 | storefront | FAQs | PUT | `/api/v1/faqs/reorder` | admin | reorderFAQs | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/faqRoutes.js:104` | `backend/tests/integration/faqSurface.test.js` | COVERED |
| API-0252 | storefront | Meta Conversions | POST | `/api/v1/meta/event` | public | inline | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/metaConversionRoutes.js:24` | `backend/tests/integration/storefrontTrackingSurface.test.js` | COVERED |
| API-0253 | storefront | Orders | GET | `/api/v1/orders` | authenticated | getOrders | H,VAL,AUTH,ERR,BND,STATE | `src/routes/orderRoutes.js:207` | `backend/tests/integration/orderSurface.test.js` | COVERED |
| API-0254 | storefront | Orders | GET | `/api/v1/orders/:orderId` | authenticated | getOrderById | H,VAL,AUTH,ERR,BND,STATE | `src/routes/orderRoutes.js:224` | `backend/tests/integration/orderSurface.test.js` | COVERED |
| API-0255 | storefront | Orders | POST | `/api/v1/orders/create` | public | createOrder | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/orderRoutes.js:227` | `backend/tests/integration/orderSurface.test.js` | COVERED |
| API-0256 | storefront | Orders | POST | `/api/v1/orders/guest-claim` | authenticated | guestClaim | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/orderRoutes.js:221` | `backend/tests/integration/orderSurface.test.js` | COVERED |
| API-0257 | storefront | Orders | POST | `/api/v1/orders/guest-convert` | public | guestConvert | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/orderRoutes.js:218` | `backend/tests/integration/orderSurface.test.js` | COVERED |
| API-0258 | storefront | Orders | GET | `/api/v1/orders/guest-lookup` | public | guestOrderLookup | H,VAL,AUTH,ERR,BND,STATE | `src/routes/orderRoutes.js:211` | `backend/tests/integration/orderSurface.test.js` | COVERED |
| API-0259 | storefront | Orders | GET | `/api/v1/orders/payment-status/:orderId` | public | getPaymentStatus | H,VAL,AUTH,ERR,BND,STATE | `src/routes/orderRoutes.js:215` | `backend/tests/integration/orderSurface.test.js` | COVERED |
| API-0260 | storefront | Payments | GET | `/api/v1/payments/options` | public | getPaymentOptions | H,VAL,AUTH,ERR,BND,STATE | `src/routes/paymentRoutes.js:11` | `backend/tests/integration/paymentsSurface.test.js` | COVERED |
| API-0261 | storefront | Payments | POST | `/api/v1/payments/razorpay/verify` | public | verifyPaymentSignature | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/paymentRoutes.js:12` | `backend/tests/integration/paymentsSurface.test.js` | COVERED |
| API-0262 | storefront | Product Filters | GET | `/api/v1/filter/:slug` | public | getFilters | H,VAL,AUTH,ERR,BND,STATE | `src/routes/filterRoutes.js:153` | `backend/tests/integration/catalogSurface.test.js` | COVERED |
| API-0263 | storefront | Product Variants | PATCH | `/api/v1/variants/:productId/bulk-price` | authenticated | bulkUpdatePrice | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/variantRoutes.js:149` | `backend/tests/integration/productSurface.test.js` | COVERED |
| API-0264 | storefront | Product Variants | PATCH | `/api/v1/variants/:productId/bulk-stock` | authenticated | bulkUpdateStock | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/variantRoutes.js:111` | `backend/tests/integration/productSurface.test.js` | COVERED |
| API-0265 | storefront | Product Variants | GET | `/api/v1/variants/:productId/export` | authenticated | exportVariants | H,VAL,AUTH,ERR,BND,STATE,EXP | `src/routes/variantRoutes.js:39` | `backend/tests/integration/productSurface.test.js` | COVERED |
| API-0266 | storefront | Product Variants | POST | `/api/v1/variants/:productId/import` | authenticated | importVariants | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/variantRoutes.js:70` | `backend/tests/integration/variantImportSurface.test.js` | COVERED |
| API-0267 | storefront | Products | GET | `/api/v1/product/:param` | public | inline | H,VAL,AUTH,ERR,BND,STATE | `src/routes/product.js:587` | `backend/tests/integration/productSurface.test.js` | COVERED |
| API-0268 | storefront | Products | DELETE | `/api/v1/product/:productId` | authenticated | deleteProduct | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/product.js:853` | `backend/tests/integration/productSurface.test.js` | COVERED |
| API-0269 | storefront | Products | POST | `/api/v1/product/:productId` | public | getProductById | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/product.js:626` | `backend/tests/integration/productSurface.test.js` | COVERED |
| API-0270 | storefront | Products | GET | `/api/v1/product/all` | public | getAllProducts | H,VAL,AUTH,ERR,BND,STATE | `src/routes/product.js:465` | `backend/tests/integration/productSurface.test.js` | COVERED |
| API-0271 | storefront | Products | POST | `/api/v1/product/all` | public | getAllProducts | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/product.js:467` | `backend/tests/integration/productSurface.test.js` | COVERED |
| API-0272 | storefront | Products | POST | `/api/v1/product/bulk-delete` | authenticated | bulkDeleteProducts | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/product.js:788` | `backend/tests/integration/productSurface.test.js` | COVERED |
| API-0273 | storefront | Products | POST | `/api/v1/product/check-stock` | public | checkStock | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/product.js:152` | `backend/tests/integration/productSurface.test.js` | COVERED |
| API-0274 | storefront | Products | POST | `/api/v1/product/create` | authenticated | createProduct | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/product.js:245` | `backend/tests/integration/product.test.js` | COVERED |
| API-0275 | storefront | Products | GET | `/api/v1/product/price-stock/:url_key` | public | getPriceAndStock | H,VAL,AUTH,ERR,BND,STATE | `src/routes/product.js:174` | `backend/tests/integration/productSurface.test.js` | COVERED |
| API-0276 | storefront | Products | GET | `/api/v1/product/recommendations` | public | getRecommendations | H,VAL,AUTH,ERR,BND,STATE | `src/routes/product.js:585` | `backend/tests/integration/productSurface.test.js` | COVERED |
| API-0277 | storefront | Products | GET | `/api/v1/product/search` | public | inline | H,VAL,AUTH,ERR,BND,STATE | `src/routes/product.js:52` | `backend/tests/integration/productSearchSurface.test.js` | COVERED |
| API-0278 | storefront | Products | GET | `/api/v1/product/search-index` | public | getSearchIndex | H,VAL,AUTH,ERR,BND,STATE | `src/routes/product.js:94` | `backend/tests/integration/productSurface.test.js` | COVERED |
| API-0279 | storefront | Products | GET | `/api/v1/product/search/suggest` | public | searchSuggest | H,VAL,AUTH,ERR,BND,STATE | `src/routes/product.js:120` | `backend/tests/integration/productSurface.test.js` | COVERED |
| API-0280 | storefront | Products | PUT | `/api/v1/product/update` | authenticated | updateProduct | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/product.js:321` | `backend/tests/integration/productSurface.test.js` | COVERED |
| API-0281 | storefront | Products | GET | `/api/v1/product/url/:url_key` | public | getProductByUrlKey | H,VAL,AUTH,ERR,BND,STATE | `src/routes/product.js:563` | `backend/tests/integration/productSurface.test.js` | COVERED |
| API-0282 | storefront | Products | POST | `/api/v1/product/url/:url_key` | public | getProductByUrlKey | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/product.js:564` | `backend/tests/integration/productSurface.test.js` | COVERED |
| API-0283 | storefront | Products | GET | `/api/v1/product/variant/:variantId` | public | getVariantById | H,VAL,AUTH,ERR,BND,STATE | `src/routes/product.js:693` | `backend/tests/integration/productSurface.test.js` | COVERED |
| API-0284 | storefront | Reviews | POST | `/api/v1/review/add` | authenticated | addReview | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/reviewRoutes.js:174` | `backend/tests/integration/reviewSurface.test.js` | COVERED |
| API-0285 | storefront | Reviews | POST | `/api/v1/review/guest/add` | public | addGuestReview | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/reviewRoutes.js:175` | `backend/tests/integration/reviewSurface.test.js` | COVERED |
| API-0286 | storefront | Reviews | GET | `/api/v1/review/my-purchases` | authenticated | getPurchasedProductsForReview | H,VAL,AUTH,ERR,BND,STATE | `src/routes/reviewRoutes.js:115` | `backend/tests/integration/reviewSurface.test.js` | COVERED |
| API-0287 | storefront | Reviews | DELETE | `/api/v1/review/my-review/:reviewId` | authenticated | deleteMyReview | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/reviewRoutes.js:302` | `backend/tests/integration/reviewSurface.test.js` | COVERED |
| API-0288 | storefront | Reviews | PUT | `/api/v1/review/my-review/:reviewId` | authenticated | updateMyReview | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/reviewRoutes.js:264` | `backend/tests/integration/reviewSurface.test.js` | COVERED |
| API-0289 | storefront | Reviews | GET | `/api/v1/review/my-reviews` | authenticated | getMyReviews | H,VAL,AUTH,ERR,BND,STATE | `src/routes/reviewRoutes.js:207` | `backend/tests/integration/reviewSurface.test.js` | COVERED |
| API-0290 | storefront | Reviews | GET | `/api/v1/review/product/:productId` | public | getProductReviews | H,VAL,AUTH,ERR,BND,STATE | `src/routes/reviewRoutes.js:375` | `backend/tests/integration/reviewSurface.test.js` | COVERED |
| API-0291 | storefront | Reviews | GET | `/api/v1/review/top` | public | getTopReviews | H,VAL,AUTH,ERR,BND,STATE | `src/routes/reviewRoutes.js:429` | `backend/tests/integration/reviewSurface.test.js` | COVERED |
| API-0292 | storefront | Reviews | GET | `/api/v1/review/variant/:variantId` | public | getVariantReviews | H,VAL,AUTH,ERR,BND,STATE | `src/routes/reviewRoutes.js:343` | `backend/tests/integration/reviewSurface.test.js` | COVERED |
| API-0293 | storefront | Stock Notifications | POST | `/api/v1/stock-notify/register` | public | registerInterest | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/stockNotificationRoutes.js:40` | `backend/tests/integration/storefrontContentSurface.test.js` | COVERED |
| API-0294 | storefront | Storefront Footer | GET | `/api/v1/footer` | public | getFooter | H,VAL,AUTH,ERR,BND,STATE | `src/routes/footerRoutes.js:52` | `backend/tests/integration/storefrontContentSurface.test.js` | COVERED |
| API-0295 | storefront | Storefront Homepage | GET | `/api/v1/homepage` | public | getHomepage | H,VAL,AUTH,ERR,BND,STATE | `src/routes/homepageRoutes.js:43` | `backend/tests/integration/storefrontContentSurface.test.js` | COVERED |
| API-0296 | storefront | Storefront Homepage | GET | `/api/v1/homepage/:id` | public | getHomepageById | H,VAL,AUTH,ERR,BND,STATE | `src/routes/homepageRoutes.js:81` | `backend/tests/integration/storefrontContentSurface.test.js` | COVERED |
| API-0297 | storefront | Wishlist | GET | `/api/v1/wishlist` | authenticated | getWishlist | H,VAL,AUTH,ERR,BND,STATE | `src/routes/wishlistRoutes.js:6` | `backend/tests/integration/accountSurface.test.js` | COVERED |
| API-0298 | storefront | Wishlist | GET | `/api/v1/wishlist/products` | authenticated | getWishlistProducts | H,VAL,AUTH,ERR,BND,STATE | `src/routes/wishlistRoutes.js:7` | `backend/tests/integration/accountSurface.test.js` | COVERED |
| API-0299 | storefront | Wishlist | POST | `/api/v1/wishlist/toggle` | authenticated | toggleWishlist | H,VAL,AUTH,ERR,BND,IDEM,CLN | `src/routes/wishlistRoutes.js:8` | `backend/tests/integration/accountSurface.test.js` | COVERED |

## Dashboard route inventory

| ID | Domain | Route | Component | Access | Required actions | Cases | Test owner | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| UI-D-001 | Auth | `/login` | LoginPage | public | Login, invalid login, redirect when authenticated | RENDER,ACCESS,STATE,INTERACTION,RESPONSIVE,A11Y | `dashboard/e2e/public-routes.spec.ts` | PARTIAL (RENDER) |
| UI-D-002 | Auth | `/reset-password` | ResetPasswordPage | public | Request reset, reset with token, invalid/expired token | RENDER,ACCESS,STATE,INTERACTION,RESPONSIVE,A11Y | `dashboard/e2e/public-routes.spec.ts` | PARTIAL (RENDER) |
| UI-D-003 | Dashboard | `/` | DashboardPage | authenticated | Stats, charts, role-based home redirect | RENDER,ACCESS,STATE,INTERACTION,RESPONSIVE,A11Y | `dashboard/e2e/routes.spec.ts` | PARTIAL (RENDER) |
| UI-D-004 | Products | `/products` | ProductsPage | authenticated | List, search, filter, sort, pagination, quick edit, select, export, delete | RENDER,ACCESS,STATE,INTERACTION,RESPONSIVE,A11Y | `dashboard/e2e/routes.spec.ts` | PARTIAL (RENDER) |
| UI-D-005 | Products | `/products/new` | NewProductPage | authenticated | Create simple, configurable, and bundle products | RENDER,ACCESS,STATE,INTERACTION,RESPONSIVE,A11Y | `dashboard/e2e/routes.spec.ts` | PARTIAL (RENDER) |
| UI-D-006 | Products | `/products/:productId/edit` | EditProductPage | authenticated | Load, edit, validate, publish, draft, delete | RENDER,ACCESS,STATE,INTERACTION,RESPONSIVE,A11Y | `dashboard/e2e/routes.spec.ts` | PARTIAL (RENDER) |
| UI-D-007 | Products | `/products/import` | CsvImportPage | authenticated | CSV validate, preview, commit, errors, AI import | RENDER,ACCESS,STATE,INTERACTION,RESPONSIVE,A11Y | `dashboard/e2e/routes.spec.ts` | PARTIAL (RENDER) |
| UI-D-008 | Categories | `/categories` | CategoriesPage | authenticated | Tree/list, create, edit, delete, bulk, reorder, active state | RENDER,ACCESS,STATE,INTERACTION,RESPONSIVE,A11Y | `dashboard/e2e/routes.spec.ts` | PARTIAL (RENDER) |
| UI-D-009 | Collections | `/collections` | CollectionsPage | authenticated | List, create, edit, delete, product assignment | RENDER,ACCESS,STATE,INTERACTION,RESPONSIVE,A11Y | `dashboard/e2e/routes.spec.ts` | PARTIAL (RENDER) |
| UI-D-010 | CMS | `/cms/home` | CmsHomePage | authenticated | Blocks, widgets, preview, save, publish | RENDER,ACCESS,STATE,INTERACTION,RESPONSIVE,A11Y | `dashboard/e2e/routes.spec.ts` | PARTIAL (RENDER) |
| UI-D-011 | CMS | `/cms/header` | CmsHeaderPage | authenticated | Announcement, navigation, preview, save | RENDER,ACCESS,STATE,INTERACTION,RESPONSIVE,A11Y | `dashboard/e2e/routes.spec.ts` | PARTIAL (RENDER) |
| UI-D-012 | CMS | `/cms/footer` | CmsFooterPage | authenticated | Footer sections, social/legal, preview, save | RENDER,ACCESS,STATE,INTERACTION,RESPONSIVE,A11Y | `dashboard/e2e/routes.spec.ts` | PARTIAL (RENDER) |
| UI-D-013 | CMS Pages | `/cms/pages` | PagesListPage | authenticated | List, create, delete, draft/publish filters | RENDER,ACCESS,STATE,INTERACTION,RESPONSIVE,A11Y | `dashboard/e2e/routes.spec.ts` | PARTIAL (RENDER) |
| UI-D-014 | CMS Pages | `/cms/pages/:pageId/edit` | PageEditorPage | authenticated | Block builder, preview, draft/publish, validation | RENDER,ACCESS,STATE,INTERACTION,RESPONSIVE,A11Y | `dashboard/e2e/routes.spec.ts` | PARTIAL (RENDER) |
| UI-D-015 | CMS Pages | `/cms/landings` | LandingsListPage | authenticated | List, create, delete, draft/publish filters | RENDER,ACCESS,STATE,INTERACTION,RESPONSIVE,A11Y | `dashboard/e2e/routes.spec.ts` | PARTIAL (RENDER) |
| UI-D-016 | CMS Pages | `/cms/landings/:slug/edit` | LandingEditorPage | authenticated | Block builder, preview, draft/publish, validation | RENDER,ACCESS,STATE,INTERACTION,RESPONSIVE,A11Y | `dashboard/e2e/routes.spec.ts` | PARTIAL (RENDER) |
| UI-D-017 | Media | `/gallery` | GalleryPage | authenticated | Upload, list, preview, delete, validation | RENDER,ACCESS,STATE,INTERACTION,RESPONSIVE,A11Y | `dashboard/e2e/routes.spec.ts` | PARTIAL (RENDER) |
| UI-D-018 | Offers | `/offers` | OffersPage | authenticated | List, create, edit, delete, status/date, product search | RENDER,ACCESS,STATE,INTERACTION,RESPONSIVE,A11Y | `dashboard/e2e/routes.spec.ts` | PARTIAL (RENDER) |
| UI-D-019 | Orders | `/orders` | OrdersPage | authenticated | List, search, filter, sort, pagination, export | RENDER,ACCESS,STATE,INTERACTION,RESPONSIVE,A11Y | `dashboard/e2e/routes.spec.ts` | PARTIAL (RENDER) |
| UI-D-020 | Orders | `/orders/cod-pending` | CodPendingPage | authenticated | COD pending list, filters, mark paid | RENDER,ACCESS,STATE,INTERACTION,RESPONSIVE,A11Y | `dashboard/e2e/routes.spec.ts` | PARTIAL (RENDER) |
| UI-D-021 | Orders | `/orders/:orderId` | OrderDetailsPage | authenticated | Detail, edit, items, addresses, payment, fulfillment, refund, timeline | RENDER,ACCESS,STATE,INTERACTION,RESPONSIVE,A11Y | `dashboard/e2e/routes.spec.ts` | PARTIAL (RENDER) |
| UI-D-022 | Settings | `/site-config` | SiteConfigPage | authenticated | Site metadata, maintenance, configuration save | RENDER,ACCESS,STATE,INTERACTION,RESPONSIVE,A11Y | `dashboard/e2e/routes.spec.ts` | PARTIAL (RENDER) |
| UI-D-023 | Settings | `/popular-searches` | PopularSearchesPage | authenticated | List, add, reorder, delete | RENDER,ACCESS,STATE,INTERACTION,RESPONSIVE,A11Y | `dashboard/e2e/routes.spec.ts` | PARTIAL (RENDER) |
| UI-D-024 | Settings | `/delivery-partners` | DeliveryPartnersPage | authenticated | List, create, edit, delete, active state | RENDER,ACCESS,STATE,INTERACTION,RESPONSIVE,A11Y | `dashboard/e2e/routes.spec.ts` | PARTIAL (RENDER) |
| UI-D-025 | Settings | `/product-attributes` | ProductAttributesPage | authenticated | Attributes, values, roles, filters, validation | RENDER,ACCESS,STATE,INTERACTION,RESPONSIVE,A11Y | `dashboard/e2e/routes.spec.ts` | PARTIAL (RENDER) |
| UI-D-026 | Profile | `/profile` | ProfilePage | authenticated | Profile update, change password, reset password | RENDER,ACCESS,STATE,INTERACTION,RESPONSIVE,A11Y | `dashboard/e2e/routes.spec.ts` | PARTIAL (RENDER) |
| UI-D-027 | Customers | `/customers` | CustomersPage | authenticated | List, search, filter, pagination, detail navigation | RENDER,ACCESS,STATE,INTERACTION,RESPONSIVE,A11Y | `dashboard/e2e/routes.spec.ts` | PARTIAL (RENDER) |
| UI-D-028 | Customers | `/customers/:customerId` | CustomerDetailsPage | authenticated | Profile, orders, addresses, account state | RENDER,ACCESS,STATE,INTERACTION,RESPONSIVE,A11Y | `dashboard/e2e/routes.spec.ts` | PARTIAL (RENDER) |
| UI-D-029 | Reviews | `/reviews` | ReviewsPage | authenticated | List, filter, approve, reject, reply, delete | RENDER,ACCESS,STATE,INTERACTION,RESPONSIVE,A11Y | `dashboard/e2e/routes.spec.ts` | PARTIAL (RENDER) |
| UI-D-030 | Cache & Revalidation | `/cache` | CachePage | authenticated | Inspect, clear, revalidate | RENDER,ACCESS,STATE,INTERACTION,RESPONSIVE,A11Y | `dashboard/e2e/routes.spec.ts` | PARTIAL (RENDER) |
| UI-D-031 | Error Logs | `/error-logs` | ErrorLogsPage | permission:view:error_logs | List, filter, inspect, delete | RENDER,ACCESS,STATE,INTERACTION,RESPONSIVE,A11Y | `dashboard/e2e/routes.spec.ts` | PARTIAL (RENDER) |
| UI-D-032 | Admin Users | `/admin-users` | AdminUsersPage | permission:manage:users\|manage:roles | List, create, role change, delete, audit | RENDER,ACCESS,STATE,INTERACTION,RESPONSIVE,A11Y | `dashboard/e2e/routes.spec.ts` | PARTIAL (RENDER) |
| UI-D-033 | Reports | `/reports/sales-by-product` | SalesByProductPage | permission:view:analytics\|view:financial_data | Date range, filters, table, export | RENDER,ACCESS,STATE,INTERACTION,RESPONSIVE,A11Y | `dashboard/e2e/routes.spec.ts` | PARTIAL (RENDER) |
| UI-D-034 | Reports | `/reports/customers` | CustomersReportPage | permission:view:analytics\|view:financial_data | Date range, filters, table, export | RENDER,ACCESS,STATE,INTERACTION,RESPONSIVE,A11Y | `dashboard/e2e/routes.spec.ts` | PARTIAL (RENDER) |
| UI-D-035 | Reports | `/reports/revenue-over-time` | RevenueOverTimePage | permission:view:analytics\|view:financial_data | Date range, filters, chart/table, export | RENDER,ACCESS,STATE,INTERACTION,RESPONSIVE,A11Y | `dashboard/e2e/routes.spec.ts` | PARTIAL (RENDER) |
| UI-D-036 | Reports | `/reports/orders-by-status` | OrdersByStatusPage | permission:view:analytics\|view:financial_data | Date range, filters, chart/table, export | RENDER,ACCESS,STATE,INTERACTION,RESPONSIVE,A11Y | `dashboard/e2e/routes.spec.ts` | PARTIAL (RENDER) |
| UI-D-037 | Reports | `/reports/returns-cancellations` | ReturnsCancellationsPage | permission:view:analytics\|view:financial_data | Date range, filters, table, export | RENDER,ACCESS,STATE,INTERACTION,RESPONSIVE,A11Y | `dashboard/e2e/routes.spec.ts` | PARTIAL (RENDER) |
| UI-D-038 | Reports | `/reports/payment-method-split` | PaymentMethodSplitPage | permission:view:analytics\|view:financial_data | Date range, filters, chart/table, export | RENDER,ACCESS,STATE,INTERACTION,RESPONSIVE,A11Y | `dashboard/e2e/routes.spec.ts` | PARTIAL (RENDER) |
| UI-D-039 | Reports | `/reports/ai-daily-report` | AiDailyReportPage | authenticated | Generate/load report, errors, empty state | RENDER,ACCESS,STATE,INTERACTION,RESPONSIVE,A11Y | `dashboard/e2e/routes.spec.ts` | PARTIAL (RENDER) |
| UI-D-040 | Chat | `/chat` | ChatPage | authenticated | Sessions, messages, AI response, errors | RENDER,ACCESS,STATE,INTERACTION,RESPONSIVE,A11Y | `dashboard/e2e/routes.spec.ts` | PARTIAL (RENDER) |
| UI-D-041 | Platform | `*` | NotFoundPage | authenticated | 404 page and return navigation | RENDER,ACCESS,STATE,INTERACTION,RESPONSIVE,A11Y | `dashboard/e2e/routes.spec.ts` | PARTIAL (RENDER) |

## Storefront route inventory

| ID | Domain | Route | Type | File | Cases | Test owner | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| UI-S-001 | Home | `/` | Page | `frontend/src/app/page.tsx` | RENDER,STATE,INTERACTION,RESPONSIVE,A11Y | `frontend/tests/e2e/05-route-surfaces.spec.ts` | PARTIAL (RENDER) |
| UI-S-002 | CMS Page | `/:slug` | Page | `frontend/src/app/[slug]/page.tsx` | RENDER,STATE,INTERACTION,RESPONSIVE,A11Y | `frontend/tests/e2e/05-route-surfaces.spec.ts` | PARTIAL (RENDER) |
| UI-S-003 | Account | `/account` | Page | `frontend/src/app/account/page.tsx` | RENDER,STATE,INTERACTION,RESPONSIVE,A11Y | `frontend/tests/e2e/05-route-surfaces.spec.ts` | PARTIAL (RENDER) |
| UI-S-004 | Account | `/account/:slug` | Page | `frontend/src/app/account/[slug]/page.tsx` | RENDER,STATE,INTERACTION,RESPONSIVE,A11Y | `frontend/tests/e2e/05-route-surfaces.spec.ts` | PARTIAL (RENDER) |
| UI-S-005 | Account | `/account/orders/:orderId` | Page | `frontend/src/app/account/orders/[orderId]/page.tsx` | RENDER,STATE,INTERACTION,RESPONSIVE,A11Y | `frontend/tests/e2e/05-route-surfaces.spec.ts` | PARTIAL (RENDER) |
| UI-S-006 | Cache & Revalidation | `/api/revalidate` | API route | `frontend/src/app/api/revalidate/route.ts` | H,VAL,AUTH,ERR,IDEM | `frontend/tests/e2e/05-route-surfaces.spec.ts` | PARTIAL (API) |
| UI-S-007 | Auth | `/auth` | Page | `frontend/src/app/auth/page.tsx` | RENDER,STATE,INTERACTION,RESPONSIVE,A11Y | `frontend/tests/e2e/05-route-surfaces.spec.ts` | PARTIAL (RENDER) |
| UI-S-008 | Cart | `/cart` | Page | `frontend/src/app/(cart-checkout)/cart/page.tsx` | RENDER,STATE,INTERACTION,RESPONSIVE,A11Y | `frontend/tests/e2e/05-route-surfaces.spec.ts` | PARTIAL (RENDER) |
| UI-S-009 | Categories | `/categories` | Page | `frontend/src/app/categories/page.tsx` | RENDER,STATE,INTERACTION,RESPONSIVE,A11Y | `frontend/tests/e2e/05-route-surfaces.spec.ts` | PARTIAL (RENDER) |
| UI-S-010 | Category Listing | `/category/*` | Page | `frontend/src/app/category/[...slug]/page.tsx` | RENDER,STATE,INTERACTION,RESPONSIVE,A11Y | `frontend/tests/e2e/05-route-surfaces.spec.ts` | PARTIAL (RENDER) |
| UI-S-011 | Checkout | `/checkout` | Page | `frontend/src/app/(cart-checkout)/checkout/page.tsx` | RENDER,STATE,INTERACTION,RESPONSIVE,A11Y | `frontend/tests/e2e/05-route-surfaces.spec.ts` | PARTIAL (RENDER) |
| UI-S-012 | Collection Listing | `/collection/:slug` | Page | `frontend/src/app/collection/[slug]/page.tsx` | RENDER,STATE,INTERACTION,RESPONSIVE,A11Y | `frontend/tests/e2e/05-route-surfaces.spec.ts` | PARTIAL (RENDER) |
| UI-S-013 | Contact | `/contact` | Page | `frontend/src/app/contact/page.tsx` | RENDER,STATE,INTERACTION,RESPONSIVE,A11Y | `frontend/tests/e2e/05-route-surfaces.spec.ts` | PARTIAL (RENDER) |
| UI-S-014 | PWA | `/offline` | Page | `frontend/src/app/offline/page.tsx` | RENDER,STATE,INTERACTION,RESPONSIVE,A11Y | `frontend/tests/e2e/05-route-surfaces.spec.ts` | PARTIAL (RENDER) |
| UI-S-015 | Order Confirmation | `/order-confirmation` | Page | `frontend/src/app/order-confirmation/page.tsx` | RENDER,STATE,INTERACTION,RESPONSIVE,A11Y | `frontend/tests/e2e/05-route-surfaces.spec.ts` | PARTIAL (RENDER) |
| UI-S-016 | Order Confirmation | `/order-confirmation/cod` | Page | `frontend/src/app/order-confirmation/cod/page.tsx` | RENDER,STATE,INTERACTION,RESPONSIVE,A11Y | `frontend/tests/e2e/05-route-surfaces.spec.ts` | PARTIAL (RENDER) |
| UI-S-017 | Order Tracking | `/orders/track` | Page | `frontend/src/app/orders/track/page.tsx` | RENDER,STATE,INTERACTION,RESPONSIVE,A11Y | `frontend/tests/e2e/05-route-surfaces.spec.ts` | PARTIAL (RENDER) |
| UI-S-018 | Development | `/product-card-demo` | Page | `frontend/src/app/product-card-demo/page.tsx` | RENDER,STATE,INTERACTION,RESPONSIVE,A11Y | `frontend/tests/e2e/05-route-surfaces.spec.ts` | PARTIAL (RENDER) |
| UI-S-019 | Product Detail | `/product/:slug` | Page | `frontend/src/app/product/[slug]/page.tsx` | RENDER,STATE,INTERACTION,RESPONSIVE,A11Y | `frontend/tests/e2e/05-route-surfaces.spec.ts` | PARTIAL (RENDER) |
| UI-S-020 | Policies | `/return&refund-policy` | Page | `frontend/src/app/return&refund-policy/page.tsx` | RENDER,STATE,INTERACTION,RESPONSIVE,A11Y | `frontend/tests/e2e/05-route-surfaces.spec.ts` | PARTIAL (RENDER) |
| UI-S-021 | Search | `/search` | Page | `frontend/src/app/search/page.tsx` | RENDER,STATE,INTERACTION,RESPONSIVE,A11Y | `frontend/tests/e2e/05-route-surfaces.spec.ts` | PARTIAL (RENDER) |
| UI-S-022 | Policies | `/terms&conditions` | Page | `frontend/src/app/terms&conditions/page.tsx` | RENDER,STATE,INTERACTION,RESPONSIVE,A11Y | `frontend/tests/e2e/05-route-surfaces.spec.ts` | PARTIAL (RENDER) |
| UI-S-023 | Wishlist | `/wishlist` | Page | `frontend/src/app/wishlist/page.tsx` | RENDER,STATE,INTERACTION,RESPONSIVE,A11Y | `frontend/tests/e2e/05-route-surfaces.spec.ts` | PARTIAL (RENDER) |

## Media server inventory

| ID | Method | Route | Access | Handler | Cases | Source | Test owner | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MEDIA-001 | GET | `/` | public | dashboard-html | H,STATE,RENDER,A11Y | `media-server-infantscare/server.js` | `media-server-infantscare/tests/mediaServer.test.js` | COVERED |
| MEDIA-002 | GET | `/api/media/backup/zip` | media-api-key | backupZip | H,AUTH,ERR,BND,FILE | `media-server-infantscare/routes/media.js:35` | `media-server-infantscare/tests/mediaServer.test.js` | COVERED |
| MEDIA-003 | DELETE | `/api/media/delete` | media-api-key | deleteImage | H,VAL,AUTH,ERR,BND,IDEM,CLN,FILE | `media-server-infantscare/routes/media.js:26` | `media-server-infantscare/tests/mediaServer.test.js` | COVERED |
| MEDIA-004 | POST | `/api/media/delete-batch` | media-api-key | deleteBatch | H,VAL,AUTH,ERR,BND,IDEM,CLN,FILE | `media-server-infantscare/routes/media.js:27` | `media-server-infantscare/tests/mediaServer.test.js` | COVERED |
| MEDIA-005 | GET | `/api/media/list` | media-api-key | listMedia | H,AUTH,ERR,STATE,FILE | `media-server-infantscare/routes/media.js:32` | `media-server-infantscare/tests/mediaServer.test.js` | COVERED |
| MEDIA-006 | GET | `/api/media/stats` | media-api-key | getStats | H,AUTH,ERR,STATE,FILE | `media-server-infantscare/routes/media.js:31` | `media-server-infantscare/tests/mediaServer.test.js` | COVERED |
| MEDIA-007 | POST | `/api/media/upload` | media-api-key | uploadImage | H,VAL,AUTH,ERR,BND,IDEM,CLN,FILE | `media-server-infantscare/routes/media.js:22` | `media-server-infantscare/tests/mediaServer.test.js` | COVERED |
| MEDIA-008 | POST | `/api/media/upload-multiple` | media-api-key | uploadMultiple | H,VAL,AUTH,ERR,BND,IDEM,CLN,FILE | `media-server-infantscare/routes/media.js:23` | `media-server-infantscare/tests/mediaServer.test.js` | COVERED |
| MEDIA-009 | POST | `/api/media/verify-key` | public | verifyAuth | H,VAL,AUTH,ERR | `media-server-infantscare/routes/media.js:30` | `media-server-infantscare/tests/mediaServer.test.js` | COVERED |
| MEDIA-010 | GET | `/dashboard` | public | dashboard-html | H,STATE,RENDER,A11Y | `media-server-infantscare/server.js` | `media-server-infantscare/tests/mediaServer.test.js` | COVERED |
| MEDIA-011 | GET | `/uploads/*` | public | static-files | H,ERR,BND | `media-server-infantscare/server.js` | `media-server-infantscare/tests/mediaServer.test.js` | COVERED |

## Feature and action inventory

`PARTIAL` means at least one automated layer covers part of the group; unlisted cases remain gaps. `TODO` means no direct automated coverage yet.

| ID | Area | Feature | Actions | Cases | Layers | Test owner | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ACT-001 | Platform | Authentication and session | Login, logout, refresh, expired session, redirect, role home | H,VAL,AUTH,ERR,BND,IDEM,CLN | API,COMP,E2E | backend/tests/integration/authSurface.test.js; dashboard/e2e/auth-interactions.spec.ts | PARTIAL |
| ACT-002 | Platform | Password recovery | Forgot password, reset token, expired/invalid token, password rules | H,VAL,AUTH,ERR,BND | API,COMP,E2E | backend/tests/integration/authSurface.test.js; dashboard/e2e/auth-interactions.spec.ts | PARTIAL |
| ACT-003 | Platform | Authorization | Route guards, permission gates, forbidden actions, role matrix | AUTH,ERR | UNIT,API,E2E | backend/tests/integration/adminAuthSurface.test.js; backend/tests/integration/securitySurface.test.js | PARTIAL |
| ACT-004 | Platform | Navigation and error states | Sidebar, 404, 403, 500, loading, retry | STATE,INTERACTION,A11Y | COMP,E2E | dashboard/e2e/routes.spec.ts; dashboard/e2e/interactions.spec.ts; frontend/tests/e2e/05-route-surfaces.spec.ts | PARTIAL |
| ACT-005 | Dashboard | Dashboard overview | Stats, charts, date/range data, empty/error/loading | H,STATE,ERR,RENDER | API,COMP,E2E | dashboard/e2e/routes.spec.ts | PARTIAL |
| ACT-006 | Products | Product listing | Search, filter, sort, pagination, quick edit, select, bulk delete, export | H,VAL,ERR,BND,STATE,IDEM,CLN,EXP | API,COMP,E2E | backend/tests/integration/productSurface.test.js; dashboard/e2e/interactions.spec.ts | PARTIAL |
| ACT-007 | Products | Simple product | Create, edit, images, price, stock, SEO, draft, publish, delete | H,VAL,AUTH,ERR,BND,IDEM,CLN,DRAFT | API,COMP,E2E | backend/tests/integration/productSurface.test.js; backend/tests/integration/product.test.js | PARTIAL |
| ACT-008 | Products | Configurable product | Attributes, variant generation, option values, variant pricing/stock, edit, publish | H,VAL,ERR,BND,IDEM,CLN,DRAFT | API,COMP,E2E | backend/tests/integration/bulk-import.test.js; backend/tests/integration/productSurface.test.js | PARTIAL |
| ACT-009 | Products | Bundle product | Child selection, quantities, stock, pricing, publish, edit | H,VAL,ERR,BND,IDEM,CLN,DRAFT | API,COMP,E2E | backend/tests/integration/bundleProductSurface.test.js | PARTIAL |
| ACT-010 | Products | Product media | Upload, image dimensions, validation, remove, reorder, broken URLs | H,VAL,ERR,BND,FILE,CLN | UNIT,API,COMP,E2E | backend/tests/integration/assetSurface.test.js | PARTIAL |
| ACT-011 | Products | CSV and AI import | Upload, validate, preview, commit, partial failure, duplicate SKU, AI generate/fix | H,VAL,ERR,BND,IDEM,RETRY,CLN | UNIT,API,E2E | backend/tests/integration/bulk-import.test.js; backend/tests/integration/variantImportSurface.test.js | PARTIAL |
| ACT-012 | Products | Search indexing | Reindex, SKU lookup, design families, count-filter-value, Meili failure | H,ERR,RETRY | UNIT,API | backend/tests/integration/productSearchSurface.test.js | PARTIAL |
| ACT-013 | Categories | Categories | Tree/list, CRUD, bulk delete, reorder, image, active/inactive | H,VAL,AUTH,ERR,BND,IDEM,CLN | API,COMP,E2E | backend/tests/integration/catalogSurface.test.js | PARTIAL |
| ACT-014 | Collections | Collections | CRUD, product assignment, slug/path, color, redirects | H,VAL,AUTH,ERR,BND,IDEM,CLN | API,COMP,E2E | backend/tests/integration/catalogSurface.test.js | PARTIAL |
| ACT-015 | Inventory | Inventory | Stock list, filter, update, low/out-of-stock, concurrency | H,VAL,ERR,BND,IDEM,STATE | API,COMP,E2E | backend/tests/integration/productSurface.test.js; backend/tests/integration/cartSurface.test.js | PARTIAL |
| ACT-016 | Offers | Coupons and offers | CRUD, date/status, product search, usage limits, discount rules | H,VAL,AUTH,ERR,BND,IDEM,CLN | UNIT,API,COMP,E2E | backend/tests/integration/adminOperationsSurface.test.js; backend/tests/integration/cartSurface.test.js | PARTIAL |
| ACT-017 | Orders | Order listing | Search, filter, sort, pagination, status counts, export, invoice | H,VAL,ERR,BND,STATE,EXP | API,COMP,E2E | backend/tests/integration/orderSurface.test.js | PARTIAL |
| ACT-018 | Orders | Order detail | Items, customer, addresses, totals, payment, timeline, edit | H,VAL,ERR,BND,IDEM | API,COMP,E2E | backend/tests/integration/orderSurface.test.js; dashboard/e2e/order-details.spec.ts | PARTIAL |
| ACT-019 | Orders | Fulfillment | Status update, mark paid, mark COD paid, tracking, partial fulfillment | H,VAL,ERR,BND,IDEM,CLN | API,E2E | backend/tests/integration/orderSurface.test.js | PARTIAL |
| ACT-020 | Orders | Refunds and cancellations | Refund request, partial/full, cancel, returns, inventory restore | H,VAL,ERR,BND,IDEM,CLN | API,COMP,E2E | backend/tests/integration/refundSurface.test.js | PARTIAL |
| ACT-021 | Orders | COD pending | List, filters, mark paid, race conditions, audit | H,VAL,ERR,BND,IDEM,STATE | API,COMP,E2E | backend/tests/integration/orderSurface.test.js | PARTIAL |
| ACT-022 | Customers | Customers | List, search, detail, orders, addresses, account state | H,VAL,ERR,BND,STATE | API,COMP,E2E | backend/tests/integration/adminOperationsSurface.test.js; backend/tests/integration/accountSurface.test.js | PARTIAL |
| ACT-023 | Reviews | Reviews | List, filter, approve, reject, reply, delete, sharing | H,VAL,AUTH,ERR,BND,IDEM,CLN | API,COMP,E2E | backend/tests/integration/reviewSurface.test.js; backend/tests/integration/reviewSharing.test.js | PARTIAL |
| ACT-024 | CMS | CMS home | Blocks/widgets, preview, save, publish, empty/error | H,VAL,ERR,BND,DRAFT | API,COMP,E2E | backend/tests/integration/cmsSurface.test.js | PARTIAL |
| ACT-025 | CMS | CMS header | Announcement strip, navigation menu, links, preview, save | H,VAL,ERR,BND,DRAFT | API,COMP,E2E | backend/tests/integration/cmsSurface.test.js | PARTIAL |
| ACT-026 | CMS | CMS footer | Sections, social/legal links, preview, save | H,VAL,ERR,BND,DRAFT | API,COMP,E2E | backend/tests/integration/cmsSurface.test.js; backend/tests/integration/storefrontContentSurface.test.js | PARTIAL |
| ACT-027 | CMS | Static pages | List, create, edit, delete, draft/publish, preview, URL validation | H,VAL,ERR,BND,IDEM,CLN,DRAFT | API,COMP,E2E | backend/tests/integration/cmsSurface.test.js | PARTIAL |
| ACT-028 | CMS | Landing pages | List, create, edit, delete, draft/publish, preview, URL validation | H,VAL,ERR,BND,IDEM,CLN,DRAFT | API,COMP,E2E | backend/tests/integration/cmsSurface.test.js; frontend/tests/e2e/04-landing-pages.spec.ts | PARTIAL |
| ACT-029 | CMS | Block builder | All widget types, reorder, gap, product/category picker, validation | H,VAL,ERR,BND,DRAFT | UNIT,COMP,E2E | frontend/tests/e2e/04-landing-pages.spec.ts; dashboard/e2e/interactions.spec.ts | PARTIAL |
| ACT-030 | CMS | Media and gallery | Upload, list, delete, dimensions, validation, broken assets | H,VAL,ERR,BND,FILE,CLN | UNIT,API,COMP,E2E | backend/tests/integration/assetSurface.test.js | PARTIAL |
| ACT-031 | CMS | Media server | Image/video upload, multiple upload, delete, batch delete, list, stats, ZIP backup, API-key auth | H,VAL,AUTH,ERR,BND,FILE,IDEM,CLN,EXP | API,COMP,E2E | media-server-infantscare/tests/mediaServer.test.js | COVERED |
| ACT-032 | CMS | Shared CMS contracts | Content types, page schema, block payload compatibility | H,VAL,BND | UNIT,CONTRACT | backend/tests/integration/cmsContractSurface.test.js | COVERED |
| ACT-033 | CMS | Revalidation | CMS update, page update, landing update, cache invalidation failure | H,ERR,RETRY | API,E2E | frontend/tests/e2e/05-route-surfaces.spec.ts; backend/tests/integration/cmsSurface.test.js | PARTIAL |
| ACT-034 | Settings | Site settings | Metadata, maintenance mode, popular searches, suggested products | H,VAL,AUTH,ERR,BND,IDEM | API,COMP,E2E | backend/tests/integration/settingsSurface.test.js | PARTIAL |
| ACT-035 | Settings | Delivery partners | CRUD, active state, assignment | H,VAL,AUTH,ERR,BND,IDEM,CLN | API,COMP,E2E | backend/tests/integration/adminOperationsSurface.test.js | PARTIAL |
| ACT-036 | Settings | Product attributes | Attribute CRUD, values, roles, filter config, validation | H,VAL,AUTH,ERR,BND,IDEM,CLN | API,COMP,E2E | backend/tests/integration/catalogSurface.test.js | PARTIAL |
| ACT-037 | Profile | Admin profile | Update info, change password, reset password, validation | H,VAL,AUTH,ERR,BND | API,COMP,E2E | backend/tests/integration/authSurface.test.js; backend/tests/integration/accountSurface.test.js | PARTIAL |
| ACT-038 | Admin | Admin users | List, create, role change, delete, permissions, audit | H,VAL,AUTH,ERR,BND,IDEM,CLN | API,COMP,E2E | backend/tests/integration/adminUserSurface.test.js | COVERED |
| ACT-039 | Reports | Reports | 7 reports, date range, filters, empty/error, export | H,VAL,ERR,BND,STATE,EXP | UNIT,API,COMP,E2E | backend/tests/integration/sales-by-product.test.js; backend/tests/integration/reports-date-range.test.js; dashboard/e2e/routes.spec.ts | PARTIAL |
| ACT-040 | Operations | Cache management | Inspect, clear, refresh, revalidate, failure | H,ERR,RETRY | API,E2E | frontend/tests/e2e/05-route-surfaces.spec.ts; backend/tests/integration/cmsSurface.test.js | PARTIAL |
| ACT-041 | Operations | Error logs | List, filter, inspect, delete, permission | H,VAL,AUTH,ERR,BND,CLN | API,COMP,E2E | backend/tests/integration/errorLogSurface.test.js | COVERED |
| ACT-042 | Operations | Notifications | List, mark read, mark all read, delete | H,VAL,AUTH,ERR,IDEM,CLN | API,COMP,E2E | backend/tests/integration/adminOperationsSurface.test.js | COVERED |
| ACT-043 | Operations | Chat | Sessions, messages, AI response, failure, history | H,VAL,AUTH,ERR,RETRY,STATE | API,COMP,E2E | backend/tests/integration/chatSurface.test.js | PARTIAL |
| ACT-044 | Storefront | Home | CMS widgets, sliders, banners, deals, reviews, recently viewed | H,ERR,STATE,RENDER,A11Y | API,COMP,E2E | frontend/tests/e2e/04-landing-pages.spec.ts; frontend/tests/e2e/05-route-surfaces.spec.ts | PARTIAL |
| ACT-045 | Storefront | Category and collection listings | Filters, sort, pagination, URL state, empty/error | H,VAL,ERR,BND,STATE | API,COMP,E2E | frontend/tests/e2e/05-route-surfaces.spec.ts | PARTIAL |
| ACT-046 | Storefront | Search | Query, popular searches, suggestions, empty/error | H,VAL,ERR,BND,STATE | API,COMP,E2E | backend/tests/integration/productSearchSurface.test.js; frontend/tests/e2e/05-route-surfaces.spec.ts | PARTIAL |
| ACT-047 | Storefront | Product detail | Variants, images, stock, price, reviews, wishlist, notify, suggested | H,VAL,ERR,BND,STATE | API,COMP,E2E | frontend/tests/e2e/05-route-surfaces.spec.ts; backend/tests/integration/productSurface.test.js | PARTIAL |
| ACT-048 | Storefront | Cart | Guest/user cart, merge, quantity, remove, coupon, stock, totals | H,VAL,ERR,BND,IDEM,STATE | UNIT,API,COMP,E2E | backend/tests/integration/cartSurface.test.js; frontend/tests/e2e/01-free-gift-cart.spec.ts | PARTIAL |
| ACT-049 | Storefront | Checkout | Address, shipping, coupon, payment, order, validation, retry | H,VAL,ERR,BND,IDEM,CLN | API,COMP,E2E | backend/tests/integration/cartSurface.test.js; frontend/tests/e2e/02-guest-checkout.spec.ts | PARTIAL |
| ACT-050 | Storefront | Payments | COD, online sandbox, success/failure/cancel, callback, refund | H,VAL,ERR,BND,IDEM,RETRY | API,E2E,MANUAL | backend/tests/integration/paymentsSurface.test.js | PARTIAL |
| ACT-051 | Storefront | Order confirmation and tracking | Confirmation, COD confirmation, tracking, not found | H,VAL,ERR,STATE | API,COMP,E2E | frontend/tests/e2e/05-route-surfaces.spec.ts; frontend/tests/e2e/02-guest-checkout.spec.ts | PARTIAL |
| ACT-052 | Storefront | Account | Profile, orders, order detail, addresses, password, protected routes | H,VAL,AUTH,ERR,BND,IDEM | API,COMP,E2E | backend/tests/integration/accountSurface.test.js | PARTIAL |
| ACT-053 | Storefront | Wishlist | Guest/user, add/remove, move to cart, empty state | H,VAL,AUTH,ERR,BND,IDEM | API,COMP,E2E | backend/tests/integration/wishlistSurface.test.js; frontend/tests/e2e/05-route-surfaces.spec.ts | PARTIAL |
| ACT-054 | Storefront | Reviews | Submit, validation, moderation, display, duplicate | H,VAL,ERR,BND,IDEM | API,COMP,E2E | backend/tests/integration/reviewSurface.test.js | PARTIAL |
| ACT-055 | Storefront | FAQs, contact, policies, static/landing pages | Render, navigation, forms, validation, 404 | H,VAL,ERR,STATE,A11Y | API,COMP,E2E | frontend/tests/e2e/05-route-surfaces.spec.ts; backend/tests/integration/storefrontContentSurface.test.js | PARTIAL |
| ACT-056 | Storefront | Chat and AI | Session, messages, suggestions, failure, fallback | H,VAL,ERR,RETRY,STATE | API,COMP,E2E | backend/tests/integration/chatSurface.test.js | PARTIAL |
| ACT-057 | Storefront | PWA and offline | Manifest, install prompt, offline page, service worker | H,ERR,STATE,A11Y | COMP,E2E,MANUAL | frontend/tests/e2e/05-route-surfaces.spec.ts; frontend/tests/e2e/06-seo.spec.ts | PARTIAL |
| ACT-058 | Storefront | SEO and metadata | Metadata, JSON-LD, sitemap, robots, canonical, revalidation | H,VAL,ERR | UNIT,E2E | frontend/tests/e2e/06-seo.spec.ts; frontend/tests/e2e/05-route-surfaces.spec.ts | COVERED |
| ACT-059 | Storefront | Analytics | GA, Clarity, Meta Pixel, conversion events, blocked scripts | H,ERR,RETRY | UNIT,E2E,MANUAL | backend/tests/integration/storefrontTrackingSurface.test.js | PARTIAL |
| ACT-060 | Cross-cutting | Responsive and accessibility | Mobile/tablet/desktop, keyboard, focus, labels, contrast, screen reader | RESP,A11Y | COMP,E2E,A11Y | dashboard/e2e/interactions.spec.ts; dashboard/e2e/public-routes.spec.ts; frontend/tests/e2e/05-route-surfaces.spec.ts | PARTIAL |
| ACT-061 | Cross-cutting | Security | Authn/authz, rate limits, CORS, uploads, injection, mass assignment, secrets | AUTH,VAL,SEC | UNIT,API,SEC | backend/tests/integration/securitySurface.test.js; backend/tests/integration/authSurface.test.js | PARTIAL |
| ACT-062 | Cross-cutting | Data integrity and concurrency | Transactions, duplicate submissions, stock races, idempotency, cleanup | IDEM,CLN,BND | UNIT,API,LOAD | backend/tests/integration/cartSurface.test.js; backend/tests/integration/orderSurface.test.js | PARTIAL |
| ACT-063 | Cross-cutting | External failure and resilience | Mongo, Redis, Meili, media, payment, email, AI timeout/retry | ERR,RETRY | UNIT,API,E2E | backend/tests/integration/productSearchSurface.test.js; backend/tests/integration/chatSurface.test.js; backend/tests/integration/paymentsSurface.test.js | PARTIAL |
| ACT-064 | Cross-cutting | Health and observability | Health, logs, error tracking, metrics, alerts | H,ERR | API,E2E,MANUAL | backend/tests/integration/health.test.js; backend/tests/integration/adminOperationsSurface.test.js | PARTIAL |
| ACT-065 | Cross-cutting | Background jobs | Media cleanup, CSV cleanup, asset cleanup, AI daily report | H,ERR,IDEM,RETRY | UNIT,API | backend/tests/integration/backgroundJobsSurface.test.js | COVERED |

## Existing test files

These suites already exist. They are not yet mapped to individual inventory rows; use them as a starting point and mark rows when each case is covered.

| File | Domain | Framework | Status |
| --- | --- | --- | --- |
| `backend/tests/integration/accountSurface.test.js` | Account | Jest | EXISTING |
| `backend/tests/integration/adminAuthSurface.test.js` | Auth | Jest | EXISTING |
| `backend/tests/integration/adminOperationsSurface.test.js` | Admin Operations | Jest | EXISTING |
| `backend/tests/integration/adminUserSurface.test.js` | Admin Users | Jest | EXISTING |
| `backend/tests/integration/assetSurface.test.js` | Media Assets | Jest | EXISTING |
| `backend/tests/integration/auth.test.js` | Auth | Jest | EXISTING |
| `backend/tests/integration/authSurface.test.js` | Auth | Jest | EXISTING |
| `backend/tests/integration/backgroundJobsSurface.test.js` | Background Jobs | Jest | EXISTING |
| `backend/tests/integration/bulk-import.test.js` | Products | Jest | EXISTING |
| `backend/tests/integration/bundleProductSurface.test.js` | Products | Jest | EXISTING |
| `backend/tests/integration/cart_order.test.js` | Cart | Jest | EXISTING |
| `backend/tests/integration/cart.e2e.test.js` | Cart | Jest | EXISTING |
| `backend/tests/integration/cart.edge-cases.test.js` | Cart | Jest | EXISTING |
| `backend/tests/integration/cart.merge.test.js` | Cart | Jest | EXISTING |
| `backend/tests/integration/cart.test.js` | Cart | Jest | EXISTING |
| `backend/tests/integration/cartSurface.test.js` | Cart | Jest | EXISTING |
| `backend/tests/integration/catalogSurface.test.js` | Products | Jest | EXISTING |
| `backend/tests/integration/chatSurface.test.js` | Chat | Jest | EXISTING |
| `backend/tests/integration/cms.test.js` | CMS | Jest | EXISTING |
| `backend/tests/integration/cmsContractSurface.test.js` | CMS | Jest | EXISTING |
| `backend/tests/integration/cmsSurface.test.js` | CMS | Jest | EXISTING |
| `backend/tests/integration/collectionSlugRedirect.test.js` | Collections | Jest | EXISTING |
| `backend/tests/integration/directAppRoutes.test.js` | Storefront | Jest | EXISTING |
| `backend/tests/integration/errorLogSurface.test.js` | Error Logs | Jest | EXISTING |
| `backend/tests/integration/faqSurface.test.js` | FAQs | Jest | EXISTING |
| `backend/tests/integration/health.test.js` | Health | Jest | EXISTING |
| `backend/tests/integration/maintenance.test.js` | Platform | Jest | EXISTING |
| `backend/tests/integration/order.test.js` | Orders | Jest | EXISTING |
| `backend/tests/integration/orderSurface.test.js` | Orders | Jest | EXISTING |
| `backend/tests/integration/paymentsSurface.test.js` | Payments | Jest | EXISTING |
| `backend/tests/integration/product.test.js` | Products | Jest | EXISTING |
| `backend/tests/integration/productSearchSurface.test.js` | Products | Jest | EXISTING |
| `backend/tests/integration/productSurface.test.js` | Products | Jest | EXISTING |
| `backend/tests/integration/productUrlKeyRedirect.test.js` | Products | Jest | EXISTING |
| `backend/tests/integration/publicReadSurface.test.js` | Storefront | Jest | EXISTING |
| `backend/tests/integration/refundSurface.test.js` | Refunds | Jest | EXISTING |
| `backend/tests/integration/reports-date-range.test.js` | Reports | Jest | EXISTING |
| `backend/tests/integration/reviewSharing.test.js` | Reviews | Jest | EXISTING |
| `backend/tests/integration/reviewSurface.test.js` | Reviews | Jest | EXISTING |
| `backend/tests/integration/sales-by-product.test.js` | Reports | Jest | EXISTING |
| `backend/tests/integration/securitySurface.test.js` | Security | Jest | EXISTING |
| `backend/tests/integration/settingsSurface.test.js` | Settings | Jest | EXISTING |
| `backend/tests/integration/storefrontContentSurface.test.js` | Storefront | Jest | EXISTING |
| `backend/tests/integration/storefrontTrackingSurface.test.js` | Analytics | Jest | EXISTING |
| `backend/tests/integration/variantImportSurface.test.js` | Unmapped | Jest | EXISTING |
| `backend/tests/integration/wishlistSurface.test.js` | Wishlist | Jest | EXISTING |
| `backend/tests/unit/cartFormatBlankItem.test.js` | Cart | Jest | EXISTING |
| `backend/tests/unit/cartMerge.test.js` | Cart | Jest | EXISTING |
| `backend/tests/unit/catalogAttributeResolver.test.js` | Products | Jest | EXISTING |
| `backend/tests/unit/cmsPages.test.js` | CMS | Jest | EXISTING |
| `backend/tests/unit/collectionSlugRedirect.test.js` | Collections | Jest | EXISTING |
| `backend/tests/unit/designId.test.js` | Products | Jest | EXISTING |
| `backend/tests/unit/filterAttributes.test.js` | Product Filters | Jest | EXISTING |
| `backend/tests/unit/googleAuth.test.js` | Auth | Jest | EXISTING |
| `backend/tests/unit/maintenance.test.js` | Platform | Jest | EXISTING |
| `backend/tests/unit/metaConversionService.test.js` | Meta Conversions | Jest | EXISTING |
| `backend/tests/unit/orderExportService.test.js` | Orders | Jest | EXISTING |
| `backend/tests/unit/orderIdempotency.test.js` | Orders | Jest | EXISTING |
| `dashboard/e2e/auth-interactions.spec.ts` | Auth | Playwright | EXISTING |
| `dashboard/e2e/interactions.spec.ts` | Dashboard | Playwright | EXISTING |
| `dashboard/e2e/order-details.spec.ts` | Orders | Playwright | EXISTING |
| `dashboard/e2e/order-details.visual.spec.ts` | Orders | Playwright | EXISTING |
| `dashboard/e2e/public-routes.spec.ts` | Auth | Playwright | EXISTING |
| `dashboard/e2e/routes.spec.ts` | Dashboard | Playwright | EXISTING |
| `frontend/tests/e2e/01-free-gift-cart.spec.ts` | Cart | Playwright | EXISTING |
| `frontend/tests/e2e/02-guest-checkout.spec.ts` | Checkout | Playwright | EXISTING |
| `frontend/tests/e2e/03-product-videos.spec.ts` | Product Detail | Playwright | EXISTING |
| `frontend/tests/e2e/04-landing-pages.spec.ts` | CMS | Playwright | EXISTING |
| `frontend/tests/e2e/05-route-surfaces.spec.ts` | Storefront | Playwright | EXISTING |
| `frontend/tests/e2e/06-seo.spec.ts` | SEO | Playwright | EXISTING |

## Known test-environment issues

- `SystemErrorLog.environment` does not accept `test`, so error persistence emits a validation warning during error-path tests.
- Redis is not available in Jest, so cache read/write warnings are expected and do not fail tests.
- Storefront guest-checkout mutation tests are skipped by default; set `E2E_ALLOW_ORDER_MUTATION=1` and `E2E_CHECKOUT_PRODUCT_SLUG` only against disposable test data.

## Coverage notes

- `backend/tests/integration/adminAuthSurface.test.js` verifies the AUTH case for all 170 protected admin route surfaces. Functional cases for those rows remain TODO.
- `backend/tests/integration/authSurface.test.js` covers all 17 auth route surfaces, including registration/login OTP, password reset, refresh rotation, logout, profile access, change-password, and Google auth validation.
- `backend/tests/integration/catalogSurface.test.js` covers category CRUD/bulk-delete across public and admin prefixes, attribute CRUD and allowed-value lifecycle, collection listing/detail/deletion, and storefront filter generation.
- `backend/tests/integration/productSurface.test.js` covers public product list/detail/URL/category reads, price-stock/suggestions/index/recommendations/stock checks, variant URL and legacy reads, admin product list/detail/update/delete, and variant bulk stock/price/export.
- `backend/tests/integration/settingsSurface.test.js` covers site-setting list/scope, create/read/update/delete, registered-key and type validation, scope protection, public settings, popular searches, suggested products, and maintenance mode.
- `backend/tests/integration/faqSurface.test.js` covers FAQ category list/create/duplicate/update/delete/reorder/fix and FAQ list/create/update/delete/reorder.
- `backend/tests/integration/cmsSurface.test.js` covers CMS content CRUD and block updates, landing-page CRUD/public reads, and static-page draft/publish/public-read/list/delete.
- `backend/tests/integration/cmsContractSurface.test.js` verifies semantic parity between the backend CMS registry and `shared/cms/content-types.json`, then round-trips a canonical payload for every content type through draft, publish, and public read.
- `backend/tests/integration/accountSurface.test.js` covers authenticated address create/list/update/delete/permissions and wishlist read/toggle/enriched-product isolation.
- `backend/tests/integration/adminOperationsSurface.test.js` covers notification read/delete, delivery-partner CRUD, coupon CRUD/validation/product search, and customer list/detail stats.
- `backend/tests/integration/orderSurface.test.js` covers authenticated order history/detail, guest lookup/claim/convert, payment status, admin order list/status-counts/detail/CSV export, status transitions, mark-paid (online/COD), and invoice requests.
- `backend/tests/integration/cartSurface.test.js` covers cart create/get/HEAD, item add/update/remove/clear, count/items/price-summary/product-data/summary in GET and POST forms, guest merge, checkout recovery/locking, empty-cart and guest guards, and coupon listing/apply/remove.
- `backend/tests/integration/paymentsSurface.test.js` covers payment-option cart/empty/config guards, enabled-method filtering, Razorpay signature parameter validation, failed-signature order cancellation, paid-order confirmation, and unknown-order signature handling.
- `backend/tests/integration/storefrontContentSurface.test.js` covers footer content/empty reads, homepage enabled filtering/order/product-slider stock filtering/by-id reads, and stock-notification validation/upsert behavior.
- `media-server-infantscare/tests/mediaServer.test.js` covers dashboard/static serving, API-key auth, upload/optimization, multi-upload failures, listing/search/pagination, stats, single/batch delete, and ZIP backups.
- `backend/tests/integration/backgroundJobsSurface.test.js` covers stale media/CSV/asset retention cleanup, dry runs, delete failures, cron/startup triggers, and deterministic daily AI report generation.
- `backend/tests/integration/productSearchSurface.test.js` covers required search terms, published/in-stock text search, SKU-prefix matches, product-type filtering, and pagination.
- `backend/tests/integration/chatSurface.test.js` covers session creation/resume/contact capture, AI reply persistence and product suggestions, escalation/queued replies, human handoff, contact updates, and idempotent chat ending.
- `dashboard/e2e/routes.spec.ts` and `dashboard/e2e/public-routes.spec.ts` cover route-level render, auth guard, redirect, dynamic-route, 404 checks, and mobile login-form visibility for all 41 dashboard routes.
- `dashboard/e2e/auth-interactions.spec.ts` covers login email validation, invalid-credential errors, forgot-password transition, and OTP request/verification transition.
- `dashboard/e2e/interactions.spec.ts` covers desktop/mobile sidebar state and navigation, dashboard date presets, product/order/customer search, product and order filter/export surfaces, order selection/bulk actions, and the CMS create-page dialog. Remaining per-route interaction, state, responsive, and accessibility cases remain `PARTIAL (RENDER)`.
- `dashboard/e2e/order-details.spec.ts` and `order-details.visual.spec.ts` cover item clamping, table/card chrome, section styling, location/customer de-duplication, the overflow action menu, and desktop/mobile visual baselines.
- `frontend/tests/e2e/05-route-surfaces.spec.ts` covers all 23 storefront route surfaces: public render, unauthenticated redirects, live product/category/collection data, policy redirects, and revalidation API auth/validation/idempotency. Authenticated account, cart, checkout, wishlist, and per-route interaction/responsive/accessibility cases remain `PARTIAL (RENDER)`.
- `backend/tests/integration/securitySurface.test.js` covers baseline security headers, credentialed CORS preflight, Mongo operator login sanitization, profile mass-assignment rejection, admin RBAC, and login rate limiting. Upload validation, injection, secret scanning, and broader permission-matrix cases remain `PARTIAL` for ACT-061.
- `backend/tests/integration/wishlistSurface.test.js` covers auth guards, empty state, add/remove toggling, per-user isolation, published-only enrichment, active/expired offers, and configurable variant price fallback. Guest wishlists and move-to-cart remain uncovered, so ACT-053 stays `PARTIAL`.
- `backend/tests/integration/errorLogSurface.test.js` covers error-log permissions, source/status/search/date filters, pagination and source metadata, read-only field sanitization, single deletion/404, and full purge.
- `frontend/tests/e2e/06-seo.spec.ts` covers robots allow/deny rules, sitemap static/category/product URLs, home canonical/social/JSON-LD metadata, product canonical/Product schema, search noindex, and the installable manifest. Sitemap fetching was corrected to the live `/product/all` and `/category` response shapes; install-prompt and service-worker behavior remain uncovered for ACT-057.
- `backend/tests/integration/adminUserSurface.test.js` covers admin-user listing/search/pagination, safe fields, creation validation/duplicates/email, role and suspension changes, self and last-super-admin guards, deletion guards, permission denial, and the audit trail. Combined role+suspension updates now write separate audit entries.
- `backend/tests/integration/refundSurface.test.js` covers refund auth/super-privilege gates, order lookup validation, unsupported methods/unpaid orders/amount bounds, full Razorpay refund persistence, automatic cancellation and inventory restore, duplicate-history prevention, email dispatch, and Razorpay status polling with attempt resolution. Partial-refund cancellation semantics and live PhonePe refund calls remain uncovered for ACT-020.
- `backend/tests/integration/bundleProductSurface.test.js` covers bundle config validation, simple/variant child SKUs, quantity-based availability and deductions, derived PDP stock/pricing, child title enrichment, unpublished/out-of-stock child handling, and admin composition/pricing edits. Bundle create-through-dashboard and idempotent cleanup cases remain uncovered for ACT-009.
- `backend/tests/integration/variantImportSurface.test.js` covers auth, missing-file, validate-only, single-row create, SKU-based re-import with embedded-id preservation, and missing-product failures for CSV variant import.
- `backend/tests/integration/storefrontTrackingSurface.test.js` covers analytics event shorthand/batch capping/invalid-event drops and Meta conversion validation plus normalized client/user-data forwarding.
- `backend/tests/integration/assetSurface.test.js` covers asset auth guards, filtered/page/cursor listing, temp/used/permanent delete rules, force archive, bulk delete outcomes, publicId/path promotion, upload validation and hash deduplication, and dry-run/real cleanup.
- `backend/tests/integration/reviewSurface.test.js` covers review auth guards, empty purchases, purchased-order product/variant enrichment, authenticated/guest review creation rules, owned review read/update/delete, public product/variant review pagination and approval filtering, and top-review formatting.
- `GET /email-logo.png` serves the local `mail_templates/logo.png` PNG asset; email templates still use the dashboard-hosted logo URL for delivery.
- `backend/tests/integration/publicReadSurface.test.js` covers public read smoke responses and payment-option validation. Response shape and data-state cases remain TODO.
- `backend/tests/integration/directAppRoutes.test.js` covers all 9 direct app routes, including the public email-logo PNG.
- `backend/tests/integration/cart_order.test.js` is skipped because it depends on missing test user/product fixtures.
- Auth, catalog, product, settings, FAQ, CMS, account, admin operations, order, cart, payment, storefront content, review, asset, analytics, Meta-conversion, CSV variant-import, customer-chat, product-search, background-job, and media-server rows in the backend API inventory are mapped to their owning suites and statuses. Protected admin rows without functional coverage are marked `PARTIAL (AUTH)`.

## Execution order

1. Run static checks: typecheck, lint, production build.
2. Run backend unit tests.
3. Run backend API integration tests for every endpoint row.
4. Run dashboard and storefront component tests for logic and rendering.
5. Run contract tests for request/response schemas.
6. Run Playwright smoke tests.
7. Run critical cross-application journeys.
8. Run domain-by-domain Playwright tests.
9. Run accessibility, responsive, visual, security, performance, and load tests.
10. Run the full suite on merge and nightly.

## Definition of done

- Every inventory row has a test file and status.
- Every write endpoint has happy, validation, auth, conflict, boundary, idempotency, and cleanup coverage.
- Every route has render, access, loading/empty/error, and responsive coverage.
- Every action group has at least one UI or API test.
- Data cleanup is verified.
- Tests run against an isolated database with external services mocked or sandboxed.

