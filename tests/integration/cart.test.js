/**
 * Cart Integration Tests (Supertest)
 *
 * Tests atomic cart creation and race condition handling
 */

const request = require("supertest");
const app = require("../../src/app");
const Cart = require("../../src/models/Cart");
const Product = require("../../src/models/Product");

describe("Cart API", () => {
  let agent;
  let testProductId;

  beforeAll(async () => {
    // Find an existing product for testing
    const product = await Product.findOne({ status: "published" });
    if (product) {
      testProductId = product._id.toString();
    }
  });

  beforeEach(async () => {
    // Clean up test carts (only those with _test_ in the ID)
    await Cart.deleteMany({ cartId: /test_/ });
    // Create new agent (maintains cookies across requests)
    agent = request.agent(app);
  });

  afterAll(async () => {
    // Cleanup any test carts
    await Cart.deleteMany({ cartId: /test_/ });
  });

  describe("POST /api/v1/cart/add-item", () => {
    it("should create a cart and add item when no cart exists", async () => {
      // Skip if no test product available
      if (!testProductId) {
        console.log("⚠️ Skipping: No published product found for testing");
        return;
      }

      const response = await agent.post("/api/v1/cart/add-item").send({
        item: {
          productId: testProductId,
          variantId: null,
          quantity: 1,
        },
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.cart).toBeDefined();
      expect(response.body.cart.cartId).toMatch(/^cart_/);
    });

    it("should set HTTP-only cookie with cart ID", async () => {
      if (!testProductId) return;

      const response = await agent.post("/api/v1/cart/add-item").send({
        item: {
          productId: testProductId,
          quantity: 1,
        },
      });

      expect(response.status).toBe(200);

      // Check for Set-Cookie header
      const cookies = response.headers["set-cookie"];
      expect(cookies).toBeDefined();

      const cartCookie = cookies?.find((c) => c.startsWith("cart_id="));
      expect(cartCookie).toBeDefined();
      expect(cartCookie).toContain("HttpOnly");
    });

    it("should reuse existing cart from cookie on subsequent requests", async () => {
      if (!testProductId) return;

      // First request - creates cart
      const first = await agent.post("/api/v1/cart/add-item").send({
        item: {
          productId: testProductId,
          quantity: 1,
        },
      });

      expect(first.status).toBe(200);
      const cartId = first.body.cart.cartId;

      // Second request - uses same cart (cookie is maintained by agent)
      const second = await agent.post("/api/v1/cart/add-item").send({
        item: {
          productId: testProductId,
          quantity: 1,
        },
      });

      expect(second.status).toBe(200);
      expect(second.body.cart.cartId).toBe(cartId);

      // Quantity should be updated (not a new item)
      const item = second.body.cart.items.find(
        (i) =>
          i.productId === testProductId || i.productId._id === testProductId
      );
      expect(item.quantity).toBeGreaterThanOrEqual(2);
    });
  });

  describe("GET /api/v1/cart/get", () => {
    it("should return 404 when no cart exists", async () => {
      const response = await request(app).get("/api/v1/cart/get");

      // API returns 404 for non-existent cart (expected behavior)
      expect(response.status).toBe(404);
    });

    it("should return cart data when cart exists", async () => {
      if (!testProductId) return;

      // First create a cart
      await agent.post("/api/v1/cart/add-item").send({
        item: { productId: testProductId, quantity: 1 },
      });

      // Then get cart
      const response = await agent.get("/api/v1/cart/get");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.cart).toBeDefined();
      expect(response.body.cart.items.length).toBeGreaterThan(0);
    });
  });

  describe("GET /api/v1/cart/count", () => {
    it("should return 0 for empty/non-existent cart", async () => {
      const response = await request(app).get("/api/v1/cart/count");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.count).toBe(0);
    });

    it("should return correct count after adding items", async () => {
      if (!testProductId) return;

      // Add item
      await agent.post("/api/v1/cart/add-item").send({
        item: { productId: testProductId, quantity: 3 },
      });

      // Get count
      const response = await agent.get("/api/v1/cart/count");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.count).toBe(3);
    });
  });

  describe("Atomic Cart Creation (Race Condition Test)", () => {
    it("should handle concurrent requests for same session", async () => {
      if (!testProductId) return;

      // Create initial cart to get cookie
      const initial = await agent.post("/api/v1/cart/add-item").send({
        item: { productId: testProductId, quantity: 1 },
      });
      const cartId = initial.body.cart.cartId;

      // Simulate rapid double-click with same cookie
      const [result1, result2] = await Promise.all([
        agent.post("/api/v1/cart/add-item").send({
          item: { productId: testProductId, quantity: 1 },
        }),
        agent.post("/api/v1/cart/add-item").send({
          item: { productId: testProductId, quantity: 1 },
        }),
      ]);

      // Both should succeed
      expect(result1.status).toBe(200);
      expect(result2.status).toBe(200);

      // Both should use the same cart
      expect(result1.body.cart.cartId).toBe(cartId);
      expect(result2.body.cart.cartId).toBe(cartId);
    });
  });
});
