# Cart System Test Suite

Comprehensive testing strategy for the e-commerce cart backend.

## Quick Start

```bash
# Install test dependencies
npm install --save-dev jest supertest

# Run unit tests
npm test -- tests/unit

# Run integration tests (requires MongoDB)
MONGODB_TEST_URI=mongodb://localhost:27017/test npm test -- tests/integration

# Run load tests (requires k6)
k6 run tests/load/cart-concurrent.js
k6 run tests/load/order-idempotency.js
```

---

## Test Matrix

| Category        | Test File                  | Test Case                | Pass Criteria          | Failure Indicates      |
| :-------------- | :------------------------- | :----------------------- | :--------------------- | :--------------------- |
| **Unit**        | `cartMerge.test.js`        | Merge sum quantities     | Qty = user + guest     | Merge logic bug        |
| **Unit**        | `cartMerge.test.js`        | Prefer user strategy     | User items only        | Strategy selection bug |
| **Unit**        | `cartMerge.test.js`        | Prefer guest strategy    | Guest items only       | Strategy selection bug |
| **Unit**        | `cartMerge.test.js`        | Dedup by product+variant | Unique key combo       | Key generation bug     |
| **Unit**        | `cartMerge.test.js`        | Quantity overflow        | Max 99                 | No cap protection      |
| **Unit**        | `orderIdempotency.test.js` | Key lookup               | Returns existing order | Index not working      |
| **Integration** | `cart.test.js`             | Single cart creation     | 1 cart in DB           | Atomic upsert failed   |
| **Integration** | `cart.test.js`             | Cookie set               | HttpOnly cookie        | Cookie config wrong    |
| **Integration** | `cart.test.js`             | Double-click race        | Same cart ID           | Race condition         |
| **Integration** | `order.test.js`            | Missing key = 400        | 400 error              | Validation missing     |
| **Integration** | `order.test.js`            | Same key = same order    | Idempotent response    | Idempotency broken     |
| **Integration** | `order.test.js`            | Checkout lock            | status=checkout        | Lock not applied       |
| **Load**        | `cart-concurrent.js`       | 100 VUs add-item         | <1% duplicates         | Upsert race condition  |
| **Load**        | `order-idempotency.js`     | Webhook retries          | 0 duplicates           | Key not enforced       |

---

## Acceptance Criteria

### Unit Tests

- ✅ All merge strategies produce correct output
- ✅ Deduplication uses composite key (productId + variantId)
- ✅ Quantity caps at 99 to prevent overflow
- ✅ Edge cases (empty carts) handled gracefully

### Integration Tests

- ✅ Cart creation is atomic (findOneAndUpdate + upsert)
- ✅ HTTP-only cookie is set correctly
- ✅ Same session reuses same cart
- ✅ Idempotency-Key header is required
- ✅ Same key returns same order (no duplicates)
- ✅ Checkout locking prevents concurrent checkout

### Load Tests

- ✅ p95 response time < 500ms under 100 VUs
- ✅ < 1% HTTP failures
- ✅ 0 duplicate orders from webhook retries
- ✅ < 1% duplicate carts from race conditions

---

## Failure Debugging Guide

| Symptom                 | Likely Cause                           | Fix                          |
| :---------------------- | :------------------------------------- | :--------------------------- |
| Duplicate carts created | `findOneAndUpdate` not atomic          | Check upsert options         |
| Duplicate orders        | Missing unique index on idempotencyKey | Add sparse unique index      |
| Cookie not set          | Missing `res.cookie()` call            | Check controller response    |
| 409 on checkout         | Cart already locked                    | Check status filter in query |
| Slow responses          | Missing DB indexes                     | Add compound indexes         |
| Timeouts                | Connection pool exhausted              | Increase pool size           |

---

## Test File Structure

```
backend/tests/
├── unit/
│   ├── cartMerge.test.js       # Cart merge logic
│   └── orderIdempotency.test.js # Order idempotency
├── integration/
│   ├── cart.test.js            # Cart API tests
│   └── order.test.js           # Order API tests
└── load/
    ├── cart-concurrent.js      # k6 concurrent add-item
    └── order-idempotency.js    # k6 webhook retry
```

---

## Running in CI/CD

```yaml
# GitHub Actions example
test:
  runs-on: ubuntu-latest
  services:
    mongodb:
      image: mongo:6
      ports:
        - 27017:27017
  steps:
    - uses: actions/checkout@v3
    - run: npm install
    - run: npm test -- --coverage
      env:
        MONGODB_TEST_URI: mongodb://localhost:27017/test
```
