/**
 * k6 Load Test: Cart Concurrent Add-Item
 *
 * Simulates 50-100 concurrent users adding items to cart
 * Tests atomic cart creation under load
 *
 * Run: k6 run tests/load/cart-concurrent.js
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

// Custom metrics
const cartCreationErrors = new Counter("cart_creation_errors");
const duplicateCartRate = new Rate("duplicate_cart_rate");
const addItemDuration = new Trend("add_item_duration");

// Test configuration
export const options = {
  scenarios: {
    concurrent_add_item: {
      executor: "ramping-vus",
      startVUs: 10,
      stages: [
        { duration: "10s", target: 50 }, // Ramp up to 50 users
        { duration: "30s", target: 100 }, // Ramp up to 100 users
        { duration: "20s", target: 100 }, // Maintain 100 users
        { duration: "10s", target: 0 }, // Ramp down
      ],
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<500"], // 95% of requests under 500ms
    http_req_failed: ["rate<0.01"], // Less than 1% failure rate
    cart_creation_errors: ["count<5"], // Less than 5 cart creation errors
    duplicate_cart_rate: ["rate<0.01"], // Less than 1% duplicate carts
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:5000/api/v1";

// Sample product IDs (replace with actual test product IDs)
const PRODUCT_IDS = [
  "507f1f77bcf86cd799439011",
  "507f1f77bcf86cd799439012",
  "507f1f77bcf86cd799439013",
];

export default function () {
  // Each VU gets its own session (cookie jar)
  const jar = http.cookieJar();

  // Random product
  const productId = PRODUCT_IDS[Math.floor(Math.random() * PRODUCT_IDS.length)];
  const quantity = Math.floor(Math.random() * 3) + 1; // 1-3 items

  const payload = JSON.stringify({
    item: {
      productId: productId,
      variantId: null,
      quantity: quantity,
    },
  });

  const params = {
    headers: {
      "Content-Type": "application/json",
    },
    jar: jar,
  };

  // First add-item request (creates cart)
  const startTime = new Date();
  const response1 = http.post(`${BASE_URL}/cart/add-item`, payload, params);
  const duration1 = new Date() - startTime;
  addItemDuration.add(duration1);

  const success1 = check(response1, {
    "first add-item status is 200": (r) => r.status === 200,
    "first add-item returns cart": (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.success && body.cart && body.cart.cartId;
      } catch {
        return false;
      }
    },
  });

  if (!success1) {
    cartCreationErrors.add(1);
  }

  // Get cart ID from first response
  let cartId = null;
  try {
    const body1 = JSON.parse(response1.body);
    cartId = body1.cart?.cartId;
  } catch {}

  sleep(0.1); // Small delay between requests

  // Second add-item request (should use same cart)
  const response2 = http.post(`${BASE_URL}/cart/add-item`, payload, params);

  const success2 = check(response2, {
    "second add-item status is 200": (r) => r.status === 200,
    "second add-item uses same cart": (r) => {
      try {
        const body = JSON.parse(r.body);
        if (cartId && body.cart?.cartId !== cartId) {
          duplicateCartRate.add(1);
          return false;
        }
        duplicateCartRate.add(0);
        return true;
      } catch {
        return false;
      }
    },
  });

  sleep(1); // 1 second between iterations
}

// Executed once at end of test
export function teardown(data) {
  console.log("Load test completed");
  console.log(
    "Check k6 output for cart creation errors and duplicate cart rate"
  );
}

/**
 * EXPECTED OUTCOMES:
 *
 * SUCCESS:
 * - All requests return 200
 * - Each session maintains same cart ID
 * - No duplicate carts created for same session
 * - p95 response time < 500ms
 *
 * FAILURE INDICATORS:
 * - cart_creation_errors > 5: Atomic upsert failing
 * - duplicate_cart_rate > 1%: Race condition in cart creation
 * - http_req_failed > 1%: Server overwhelmed or bugs
 */
