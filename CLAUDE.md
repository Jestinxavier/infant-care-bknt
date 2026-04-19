# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Express 5 REST API backend for Infant Care (`infantscare.in`), an e-commerce platform for baby products. Uses MongoDB/Mongoose, JWT auth, Socket.io, PhonePe payments, and Cloudinary image storage.

---

## Commands

```bash
pnpm dev               # nodemon hot reload (NODE_ENV=development)
pnpm start             # production (NODE_ENV=production)
pnpm test              # all tests (Jest + mongodb-memory-server)
pnpm test:unit         # tests/unit/ only
pnpm test:integration  # tests/integration/ only

# One-off admin scripts
pnpm create-admin      # seed an admin user
pnpm seed-categories   # seed product categories
pnpm seed:partners     # seed delivery partners
```

Tests use Jest with `mongodb-memory-server`. Config: `jest.config.js`. Pattern: `**/tests/**/*.test.js`.

---

## Environment Variables (`.env`)

| Variable | Purpose |
|---|---|
| `PORT`, `NODE_ENV` | Server config |
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Token signing |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Image uploads |
| `PHONEPE_*` | PhonePe payment gateway credentials |
| `EMAIL_*` | Nodemailer SMTP config |
| `FRONTEND_URL`, `DASHBOARD_URL`, `FRONTEND_URL_WWW` | CORS allowlist + revalidation target |
| `ADMIN_API_PREFIX` | Admin route prefix (default: `/admin`) |
| `NEXT_REVALIDATE_KEY` | Shared secret for triggering Next.js cache revalidation |

---

## Architecture

### Entry Points

- `src/server.js` — connects MongoDB, starts background cron jobs, initializes Socket.io, then starts the HTTP server
- `src/app.js` — Express app setup: CORS, middlewares, all route mounting

### Route Structure

Storefront routes at `/api/v1/*`, admin routes at `/api/v1${ADMIN_API_PREFIX}/*` (env-configurable, default `/admin`).

Two coexisting patterns:

**Legacy** (most routes):
```
src/routes/       → route definitions
src/controllers/  → business logic
src/models/       → Mongoose schemas
```

**Feature-based** (newer code — prefer this for new work):
```
src/features/cms/      → self-contained CMS module
src/features/order/    → order processing module
src/features/product/  → product CMS widgets
```

### Authentication Middleware

Both are in `src/middlewares/authMiddleware.js`:
- `verifyToken` — requires valid JWT Bearer token, attaches `req.user`
- `optionalVerifyToken` — populates `req.user` if token present, continues as guest otherwise. Used on cart routes.

Admin routes stack: `verifyToken` → `requireAdmin` (`src/middlewares/adminMiddleware.js`).

### Hybrid Cart

Supports both guests and authenticated users. Guest cart ID comes from `x-guest-cart-id` request header. On login, carts merge via the merge endpoint. Controller: `src/controllers/cart/hybridCartController.js`.

### PhonePe Payments

The webhook route (`POST /api/webhooks/phonepe`) is registered **before** `express.json()` so it can capture `req.rawBody` for signature verification. Payment controller: `src/controllers/payment/phonepeSDK.js`.

### Cache Revalidation

When content changes (product, category, CMS page, etc.), call `triggerRevalidation()` from `src/services/revalidateService.js`. It hits `FRONTEND_URL/api/revalidate` with `NEXT_REVALIDATE_KEY` to invalidate Next.js cache tags on the frontend.

### Background Jobs (started in `server.js`)

- `src/services/mediaCleanupService.js` — cleans orphaned Cloudinary media
- `src/services/csvImageCleanupService.js` — cleans temp CSV import images
- `src/jobs/cleanupExpiredAssets.js` — removes expired asset records
- `src/services/socketService.js` — Socket.io real-time layer

### Swagger Docs

Available at `/api-docs` when server is running. Spec generated from JSDoc annotations via `src/config/swagger.js`.
