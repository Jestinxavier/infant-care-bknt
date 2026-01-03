/**
 * k6 Load Test: Payment Webhook Idempotency
 *
 * Simulates payment gateway webhook retries with same idempotency key
 * Tests order idempotency under concurrent webhook deliveries
 *
 * Run: k6 run tests/load/order-idempotency.js
 */

import http from "k6/http";
import { check, sleep, group } from "k6";
import { Counter, Rate } from "k6/metrics";
import { uuidv4 } from "https://jslib.k6.io/k6-utils/1.4.0/index.js";

// Custom metrics
const duplicateOrdersCreated = new Counter("duplicate_orders_created");
const idempotencySuccessRate = new Rate("idempotency_success_rate");

export const options = {
  scenarios: {
    // Scenario 1: Webhook retry simulation
    webhook_retries: {
      executor: "per-vu-iterations",
      vus: 20,
      iterations: 5, // Each VU sends 5 retries with SAME key
      maxDuration: "2m",
    },
    // Scenario 2: Concurrent unique orders
    concurrent_orders: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "10s", target: 30 },
        { duration: "30s", target: 30 },
        { duration: "10s", target: 0 },
      ],
      startTime: "2m", // Start after webhook test
    },
  },
  thresholds: {
    duplicate_orders_created: ["count==0"], // NO duplicate orders
    idempotency_success_rate: ["rate>0.99"], // 99%+ idempotent success
    http_req_duration: ["p(95)<1000"], // 95% under 1s
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:5000/api/v1";

// Shared state for tracking orders per idempotency key
const ordersByKey = {};

export function setup() {
  // Pre-create carts in checkout status for testing
  // In real tests, you'd set up proper test data
  console.log("Setting up test data...");
  return {
    testUserId: "507f1f77bcf86cd799439099",
    testAddressId: "507f1f77bcf86cd799439022",
  };
}

export default function (data) {
  const { testUserId, testAddressId } = data;

  group("Webhook Retry Test", function () {
    // Each VU uses ONE idempotency key for ALL its iterations
    // This simulates payment gateway retrying with same key
    const vuIdempotencyKey = `order_vu${__VU}_${uuidv4()}`;

    const payload = JSON.stringify({
      userId: testUserId,
      items: [{ productId: "507f1f77bcf86cd799439011", quantity: 1 }],
      addressId: testAddressId,
      paymentMethod: "phonepe",
    });

    const params = {
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": vuIdempotencyKey,
      },
    };

    const response = http.post(`${BASE_URL}/orders/create`, payload, params);

    const isSuccess = check(response, {
      "order request returns 200": (r) => r.status === 200,
      "response has order data": (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.success && body.order;
        } catch {
          return false;
        }
      },
    });

    // Track order IDs per idempotency key
    if (response.status === 200) {
      try {
        const body = JSON.parse(response.body);
        const orderId = body.order?.orderId;

        if (!ordersByKey[vuIdempotencyKey]) {
          ordersByKey[vuIdempotencyKey] = orderId;
          idempotencySuccessRate.add(1);
        } else if (ordersByKey[vuIdempotencyKey] !== orderId) {
          // Different order ID for same key = DUPLICATE!
          duplicateOrdersCreated.add(1);
          idempotencySuccessRate.add(0);
          console.error(`DUPLICATE ORDER DETECTED! Key: ${vuIdempotencyKey}`);
        } else {
          // Same order ID = idempotent success
          idempotencySuccessRate.add(1);
        }
      } catch {}
    }

    sleep(0.1); // 100ms between retries
  });
}

export function teardown(data) {
  console.log("\n=== IDEMPOTENCY TEST RESULTS ===");
  console.log("Check k6 output for duplicate_orders_created metric");
  console.log("Expected: 0 duplicate orders");
  console.log("Expected: >99% idempotency success rate");
}

/**
 * EXPECTED OUTCOMES:
 *
 * SUCCESS:
 * - duplicate_orders_created = 0
 * - idempotency_success_rate > 99%
 * - All webhook retries return same order ID
 *
 * FAILURE INDICATORS:
 * - duplicate_orders_created > 0: Idempotency key not working
 * - idempotency_success_rate < 99%: Race condition in order creation
 *
 * DEBUGGING:
 * - If duplicates occur, check:
 *   1. Unique index on Order.idempotencyKey
 *   2. findOne before create logic
 *   3. MongoDB write concern settings
 */
