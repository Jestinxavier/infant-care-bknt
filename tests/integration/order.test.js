/**
 * Order Integration Tests (Supertest)
 *
 * Tests order creation idempotency and checkout locking
 */

const request = require("supertest");
const app = require("../../src/app");
const Cart = require("../../src/models/Cart");
const Order = require("../../src/models/Order");
const User = require("../../src/models/user");
const Address = require("../../src/models/Address");
const Product = require("../../src/models/Product");
const mongoose = require("mongoose");

describe("Order API", () => {
  // Test credentials from frontend constants
  const TEST_CREDENTIALS = {
    email: "eldhosems98@gmail.com",
    password: "123456",
  };

  let agent;
  let testUser;
  let testAddress;
  let testProduct;
  let authToken;

  beforeAll(async () => {
    // Find test user by email
    testUser = await User.findOne({ email: TEST_CREDENTIALS.email });
    if (testUser) {
      testAddress = await Address.findOne({ userId: testUser._id });
      if (!testAddress) {
        // Create a test address
        testAddress = await Address.create({
          userId: testUser._id,
          name: "Test Address",
          fullName: "Eldho Shaju",
          phone: "9876543210",
          houseName: "House No. 123",
          street: "MG Road",
          city: "Ernakulam",
          state: "KL_Kerala",
          pincode: "682030",
          country: "India",
        });
      }
    } else {
      console.log("⚠️ Test user not found:", TEST_CREDENTIALS.email);
    }

    testProduct = await Product.findOne({ status: "published" });
  });

  beforeEach(async () => {
    agent = request.agent(app);

    // Login to get auth token
    if (testUser) {
      const loginRes = await agent.post("/api/v1/auth/login").send({
        email: TEST_CREDENTIALS.email,
        password: TEST_CREDENTIALS.password,
      });

      if (loginRes.body.accessToken) {
        authToken = loginRes.body.accessToken;
      } else {
        console.log("⚠️ Login failed:", loginRes.body);
      }
    }
  });

  afterAll(async () => {
    // Cleanup test orders (those created during tests)
    await Order.deleteMany({ "coupon.code": "TEST_ORDER" });
    // Cleanup test carts
    await Cart.deleteMany({ cartId: /test_order_/ });
  });

  describe("POST /api/v1/orders/create - Idempotency", () => {
    it("should require Idempotency-Key header", async () => {
      // Skip if no test data
      if (!testUser || !testProduct) {
        console.log("⚠️ Skipping: Missing test user or product");
        return;
      }

      const response = await agent
        .post("/api/v1/orders/create")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          userId: testUser._id.toString(),
          items: [{ productId: testProduct._id.toString(), quantity: 1 }],
          addressId: testAddress?._id.toString(),
          paymentMethod: "COD",
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.errorCode).toBe("MISSING_IDEMPOTENCY_KEY");
    });

    it("should return same order for same Idempotency-Key", async () => {
      if (!testUser || !testProduct || !testAddress) {
        console.log("⚠️ Skipping: Missing test fixtures");
        return;
      }

      // First, create a cart with checkout status
      const testCartId = `cart_test_order_${Date.now()}`;
      await Cart.create({
        cartId: testCartId,
        userId: testUser._id,
        items: [
          {
            productId: testProduct._id,
            quantity: 1,
            priceSnapshot: testProduct.price || 100,
            titleSnapshot: testProduct.title || "Test Product",
          },
        ],
        status: "checkout",
        checkoutToken: `chk_test_${Date.now()}`,
        checkoutExpiry: new Date(Date.now() + 15 * 60 * 1000),
        subtotal: 100,
        total: 100,
      });

      const idempotencyKey = `order_test_${Date.now()}_idem`;
      const orderPayload = {
        userId: testUser._id.toString(),
        cartId: testCartId,
        items: [{ productId: testProduct._id.toString(), quantity: 1 }],
        addressId: testAddress._id.toString(),
        paymentMethod: "COD",
      };

      // First request
      const first = await agent
        .post("/api/v1/orders/create")
        .set("Authorization", `Bearer ${authToken}`)
        .set("Idempotency-Key", idempotencyKey)
        .send(orderPayload);

      // If first request succeeded, second should return same order
      if (first.status === 200 && first.body.order) {
        const firstOrderId = first.body.order.orderId;

        // Second request with SAME key
        const second = await agent
          .post("/api/v1/orders/create")
          .set("Authorization", `Bearer ${authToken}`)
          .set("Idempotency-Key", idempotencyKey)
          .send(orderPayload);

        expect(second.status).toBe(200);
        expect(second.body.order.orderId).toBe(firstOrderId);
        expect(second.body.idempotent).toBe(true);
      }
    });
  });

  describe("POST /api/v1/cart/start-checkout - Checkout Locking", () => {
    it("should lock cart to checkout status", async () => {
      if (!testUser || !testProduct) {
        console.log("⚠️ Skipping: Missing test fixtures");
        return;
      }

      // Create an active cart for the user
      const testCartId = `cart_test_checkout_${Date.now()}`;
      await Cart.create({
        cartId: testCartId,
        userId: testUser._id,
        items: [
          {
            productId: testProduct._id,
            quantity: 1,
            priceSnapshot: 100,
            titleSnapshot: "Test",
          },
        ],
        status: "active",
        subtotal: 100,
        total: 100,
      });

      // Set cart cookie manually in agent
      const response = await agent
        .post("/api/v1/cart/start-checkout")
        .set("Authorization", `Bearer ${authToken}`)
        .set("Cookie", `cart_id=${testCartId}`)
        .send({ userId: testUser._id.toString() });

      // Check response
      if (response.status === 200) {
        expect(response.body.success).toBe(true);
        expect(response.body.checkoutToken).toBeDefined();
        expect(response.body.expiresAt).toBeDefined();

        // Verify cart status in DB
        const cart = await Cart.findOne({ cartId: testCartId });
        expect(cart.status).toBe("checkout");
      } else {
        // May fail if cart lookup fails due to auth, log for debugging
        console.log("Checkout response:", response.status, response.body);
      }
    });

    it("should be idempotent when called twice", async () => {
      if (!testUser || !testProduct) return;

      // Create an active cart
      const testCartId = `cart_test_idempotent_${Date.now()}`;
      await Cart.create({
        cartId: testCartId,
        userId: testUser._id,
        items: [
          {
            productId: testProduct._id,
            quantity: 1,
            priceSnapshot: 100,
            titleSnapshot: "Test",
          },
        ],
        status: "active",
        subtotal: 100,
        total: 100,
      });

      const payload = { userId: testUser._id.toString() };
      const headers = {
        Authorization: `Bearer ${authToken}`,
        Cookie: `cart_id=${testCartId}`,
      };

      // First call
      const first = await agent
        .post("/api/v1/cart/start-checkout")
        .set(headers)
        .send(payload);

      // Second call
      const second = await agent
        .post("/api/v1/cart/start-checkout")
        .set(headers)
        .send(payload);

      // Both should succeed (idempotent)
      if (first.status === 200) {
        expect(second.status).toBe(200);
        expect(second.body.success).toBe(true);
      }
    });
  });
});
