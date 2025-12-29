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

## 💡 Best Practices

- **Isolation**: Each test in these suites should ideally be independent.
- **Mocks**: External services like Cloudinary and SMTP are mocked globally in `tests/setup.js`.
- **Database**: The database is cleared between tests via the `afterEach` hook in `setup.js`. If you need data to persist across multiple `it` blocks, use a single `it` block or recreate the state in `beforeEach`.
