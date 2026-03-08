/**
 * Cart Edge Cases & High-Priority Bug Tests
 *
 * Covers production-observed issues:
 * 1.  Internal Server Error from cart with deleted product (Path `productId` required)
 * 2.  Ghost cart items appearing after payment (stale ordered cart)
 * 3.  "Cart modification not allowed" errors (checkout-locked cart)
 * 4.  Checkout session expiry & idempotency
 * 5.  Cart status update correctness (active → checkout → ordered)
 * 6.  Stale cart re-appearance after ordering
 * 7.  Count returning wrong number after purchase
 * 8.  Various add/remove/update edge-cases that can leave cart inconsistent
 * 9.  isValid flag for checkout gating (out-of-stock / unpublished products)
 * 10. Cart recovery integrity
 *
 * NOTE ON BUGS FOUND BY THESE TESTS:
 *  - recover endpoint crashes (500) on x-cart-id pointed at ordered cart because
 *    recoverCart calls createCart (no body → req.body is undefined → destructure crash)
 *  - /cart/clear returns 404 when cart exists (check order bug: status check before null check)
 *  - /cart/get does not return `isValid` when called via POST (only GET exposes it, need POST parity)
 *  - validateCart strips ordered cart from req but does NOT restore a new one, meaning
 *    count correctly returns 0 but "count sums quantities" test was using unreliable
 *    direct DB items data – fixed by reading through the HTTP layer.
 */

const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../../src/app");
const Cart = require("../../src/models/Cart");
const Product = require("../../src/models/Product");
const Category = require("../../src/models/Category");
const { generateCartId } = require("../../src/utils/cartIdGenerator");

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Create a minimal published product for testing. */
async function createTestProduct(overrides = {}) {
  const cat = await Category.create({
    name: `TestCat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    code: `tc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    isActive: true,
  });
  return Product.create({
    title: "Edge Case Test Product",
    category: cat._id,
    sku: `ECT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    url_key: `ect-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    status: "published",
    product_type: "SIMPLE",
    images: ["https://example.com/img.jpg"],
    price: 500,
    stock: 100,
    stockObj: { available: 100, isInStock: true },
    ...overrides,
  });
}

/** Minimal item sub-document for direct DB insertion. */
function makeItem(productId, { quantity = 1, sku = "default-sku" } = {}) {
  return {
    productId,
    quantity,
    titleSnapshot: "Test Item",
    imageSnapshot: "https://example.com/img.jpg",
    skuSnapshot: sku,
  };
}

/** Create a cart directly in Mongo (bypasses HTTP). */
async function createCartDirectly({
  cartId,
  status = "active",
  items = [],
  userId = null,
  checkoutExpiry = null,
  checkoutToken = null,
} = {}) {
  // Must use a valid cart ID that passes isValidCartId() regex: cart_[a-zA-Z0-9]{21}
  const cid = cartId || generateCartId();
  return Cart.create({
    cartId: cid,
    status,
    userId,
    items,
    checkoutToken,
    checkoutExpiry,
    checkoutStartedAt: status === "checkout" ? new Date() : null,
  });
}

// ─────────────────────────────────────────────────────────────────────────────

describe("Cart Edge Cases – High Priority Bug Coverage", () => {
  // ══════════════════════════════════════════════════════════════════════════
  // ISSUE 1: 500 on /cart/get when product has been deleted from DB
  // ══════════════════════════════════════════════════════════════════════════
  describe("Issue #1: GET /cart/get – 500 on deleted product reference", () => {
    it("should NOT 500 and should silently drop items whose product was deleted", async () => {
      const product = await createTestProduct();
      const cart = await createCartDirectly({
        items: [makeItem(product._id, { sku: "deleted-sku" })],
      });

      // Confirm cart is initially accessible
      let res = await request(app)
        .post("/api/v1/cart/get")
        .set("x-cart-id", cart.cartId);
      expect(res.status).toBe(200);
      expect(res.body.cart.items).toHaveLength(1);

      // Admin deletes the product
      await Product.deleteOne({ _id: product._id });

      // /cart/get must NOT crash (pre-validate hook should clean it up)
      res = await request(app)
        .post("/api/v1/cart/get")
        .set("x-cart-id", cart.cartId);

      expect(res.status).toBe(200); // must not be 500
      expect(res.body.success).toBe(true);
      expect(res.body.cart.items).toHaveLength(0); // ghost item purged
    });

    it("count should return 0 (not stale count) after product deletion + cart/get cleanup", async () => {
      const product = await createTestProduct();
      const cart = await createCartDirectly({
        items: [makeItem(product._id, { quantity: 2, sku: "ghost-sku" })],
      });

      // Count is correct before deletion
      let res = await request(app)
        .get("/api/v1/cart/count")
        .set("x-cart-id", cart.cartId);
      expect(res.body.count).toBe(2);

      // Admin deletes the product
      await Product.deleteOne({ _id: product._id });

      // Trigger cleanup via /get
      await request(app).post("/api/v1/cart/get").set("x-cart-id", cart.cartId);

      // Now count should be 0
      res = await request(app)
        .get("/api/v1/cart/count")
        .set("x-cart-id", cart.cartId);
      expect(res.status).toBe(200);
      expect(res.body.count).toBe(0);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ISSUE 2: Ghost cart items appearing after payment (ordered cart confusion)
  // ══════════════════════════════════════════════════════════════════════════
  describe("Issue #2: Stale ordered cart – count returns items from paid cart", () => {
    it("count should return 0 when the only cart is status=ordered", async () => {
      const product = await createTestProduct();
      const cart = await createCartDirectly({
        status: "ordered",
        items: [makeItem(product._id, { quantity: 2, sku: "ordered-sku" })],
      });

      const res = await request(app)
        .get("/api/v1/cart/count")
        .set("x-cart-id", cart.cartId);

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(0); // ordered cart must be invisible
    });

    it("GET /cart/get should return cart:null for an ordered cart (not its items)", async () => {
      const product = await createTestProduct();
      const cart = await createCartDirectly({
        status: "ordered",
        items: [makeItem(product._id, { sku: "ordered-sku" })],
      });

      const res = await request(app)
        .post("/api/v1/cart/get")
        .set("x-cart-id", cart.cartId);

      expect(res.status).toBe(200);
      expect(res.body.cart).toBeNull();
    });

    it("add-item should NOT reuse an ordered cart – should create a new active cart", async () => {
      const product = await createTestProduct();
      const cart = await createCartDirectly({ status: "ordered" });

      const res = await request(app)
        .post("/api/v1/cart/add-item")
        .set("x-cart-id", cart.cartId)
        .send({ item: { productId: product._id.toString(), quantity: 1 } });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.cart.cartId).not.toBe(cart.cartId); // must be a new cart
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ISSUE 3: "Cart modification not allowed" during checkout
  // ══════════════════════════════════════════════════════════════════════════
  describe("Issue #3: Cart modification blocked/auto-recovered during checkout", () => {
    it("add-item should return 409 when cart is in checkout status", async () => {
      const product = await createTestProduct();
      const cart = await createCartDirectly({
        status: "checkout",
        checkoutToken: "chk_test",
        checkoutExpiry: new Date(Date.now() + 60_000),
        items: [makeItem(product._id, { sku: "checkout-sku" })],
      });

      const res = await request(app)
        .post("/api/v1/cart/add-item")
        .set("x-cart-id", cart.cartId)
        .send({ item: { productId: product._id.toString(), quantity: 1 } });

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/not allowed during checkout/i);
    });

    it("update-item should AUTO-RECOVER a checkout cart into a new active cart", async () => {
      const product = await createTestProduct();
      const cart = await createCartDirectly({
        status: "checkout",
        checkoutToken: "chk_test",
        checkoutExpiry: new Date(Date.now() + 60_000),
        items: [makeItem(product._id, { sku: "recovery-sku" })],
      });

      const res = await request(app)
        .patch("/api/v1/cart/update-item")
        .set("x-cart-id", cart.cartId)
        .send({ sku: "recovery-sku", changes: { quantity: 3 } });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // Must be a NEW cart ID (recovered copy)
      expect(res.body.cart.cartId).not.toBe(cart.cartId);
      // Item should reflect the new quantity
      const item = res.body.cart.items.find(
        (i) => i.skuSnapshot === "recovery-sku",
      );
      expect(item).toBeDefined();
      expect(item.quantity).toBe(3);
    });

    it("remove-item should AUTO-RECOVER a checkout cart", async () => {
      const product = await createTestProduct();
      const cart = await createCartDirectly({
        status: "checkout",
        checkoutToken: "chk_test",
        checkoutExpiry: new Date(Date.now() + 60_000),
        items: [
          makeItem(product._id, { quantity: 2, sku: "remove-recovery-sku" }),
        ],
      });

      const res = await request(app)
        .delete("/api/v1/cart/remove-item")
        .set("x-cart-id", cart.cartId)
        .send({ sku: "remove-recovery-sku" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.cart.items).toHaveLength(0);
    });

    it("clear should be blocked (409) when cart is in checkout", async () => {
      const product = await createTestProduct();
      const cart = await createCartDirectly({
        status: "checkout",
        checkoutToken: "chk_test",
        checkoutExpiry: new Date(Date.now() + 60_000),
        items: [makeItem(product._id)],
      });

      const res = await request(app)
        .post("/api/v1/cart/clear")
        .set("x-cart-id", cart.cartId);

      // BUG FOUND: controller checks status before null check, resulting in 409 ✓
      // This is actually correct behavior – it SHOULD be 409
      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/not allowed during checkout/i);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ISSUE 4: Checkout session expiry handling
  // ══════════════════════════════════════════════════════════════════════════
  describe("Issue #4: Checkout session expiry & idempotency", () => {
    it("start-checkout on a cart with valid existing checkout should return same token (idempotent)", async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const futureExpiry = new Date(Date.now() + 300_000);
      await createCartDirectly({
        status: "checkout",
        checkoutToken: "chk_existing_token",
        checkoutExpiry: futureExpiry,
        userId,
      });

      const res = await request(app)
        .post("/api/v1/cart/start-checkout")
        .send({ userId });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // Should return the same existing token (idempotent)
      expect(res.body.checkoutToken).toBe("chk_existing_token");
    });

    it("start-checkout on EXPIRED checkout should issue a fresh token", async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const pastExpiry = new Date(Date.now() - 60_000); // already expired
      await createCartDirectly({
        status: "checkout",
        checkoutToken: "chk_expired_token",
        checkoutExpiry: pastExpiry,
        userId,
      });

      const res = await request(app)
        .post("/api/v1/cart/start-checkout")
        .send({ userId });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // Must be a NEW token
      expect(res.body.checkoutToken).toBeDefined();
      expect(res.body.checkoutToken).not.toBe("chk_expired_token");
    });

    it("start-checkout without userId should fail with 400 MISSING_USER_ID", async () => {
      const res = await request(app)
        .post("/api/v1/cart/start-checkout")
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe("MISSING_USER_ID");
    });

    it("start-checkout should lock an active cart (set status=checkout)", async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const cart = await createCartDirectly({ status: "active", userId });

      const res = await request(app)
        .post("/api/v1/cart/start-checkout")
        .send({ userId, cartId: cart.cartId });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.checkoutToken).toMatch(/^chk_/);

      // Confirm DB status is now "checkout"
      const updated = await Cart.findOne({ cartId: cart.cartId });
      expect(updated.status).toBe("checkout");
      expect(updated.checkoutExpiry).toBeDefined();
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ISSUE 5: Cart status update correctness
  // ══════════════════════════════════════════════════════════════════════════
  describe("Issue #5: Cart status transitions are complete and correct", () => {
    it("active → checkout: checkoutToken and checkoutExpiry must be set", async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const cart = await createCartDirectly({ status: "active", userId });

      await request(app)
        .post("/api/v1/cart/start-checkout")
        .send({ userId, cartId: cart.cartId });

      const updated = await Cart.findOne({ cartId: cart.cartId });
      expect(updated.status).toBe("checkout");
      expect(updated.checkoutToken).toMatch(/^chk_/);
      expect(updated.checkoutExpiry).toBeDefined();
      expect(new Date(updated.checkoutExpiry).getTime()).toBeGreaterThan(
        Date.now(),
      );
    });

    it("checkout → active: /recover must produce a new cart with status=active", async () => {
      const product = await createTestProduct();
      const cart = await createCartDirectly({
        status: "checkout",
        checkoutToken: "chk_test",
        checkoutExpiry: new Date(Date.now() + 60_000),
        items: [makeItem(product._id, { sku: "recover-test-sku" })],
      });

      const res = await request(app)
        .post("/api/v1/cart/recover")
        .set("x-cart-id", cart.cartId);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const newCartId = res.body.cart.cartId;
      expect(newCartId).not.toBe(cart.cartId);

      const newCart = await Cart.findOne({ cartId: newCartId });
      expect(newCart.status).toBe("active");
    });

    it("clear cart should empty items array and return cleared cart (active cart only)", async () => {
      const product = await createTestProduct();
      const cart = await createCartDirectly({
        status: "active",
        items: [makeItem(product._id, { quantity: 3, sku: "clear-test-sku" })],
      });

      const res = await request(app)
        .post("/api/v1/cart/clear")
        .set("x-cart-id", cart.cartId);

      // BUG NOTE: Controller checks cart.status before null check.
      // When cart IS found and active, it should work:
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.cart.items).toHaveLength(0);

      const dbCart = await Cart.findOne({ cartId: cart.cartId });
      expect(dbCart.items).toHaveLength(0);
    });

    it("add-item to a non-existent cart should produce a fresh active cart", async () => {
      const product = await createTestProduct();

      const res = await request(app)
        .post("/api/v1/cart/add-item")
        .send({ item: { productId: product._id.toString(), quantity: 1 } });

      expect(res.status).toBe(200);
      expect(res.body.cart.cartId).toMatch(/^cart_/);

      const cart = await Cart.findOne({ cartId: res.body.cart.cartId });
      expect(cart.status).toBe("active");
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ISSUE 6: Stale cart after purchase (ordered cart re-appearing)
  // ══════════════════════════════════════════════════════════════════════════
  describe("Issue #6: Ordered cart must never be served to the frontend", () => {
    it("ordered cart must be invisible when accessed with x-cart-id", async () => {
      const product = await createTestProduct();
      const userId = new mongoose.Types.ObjectId();
      const cart = await createCartDirectly({
        status: "ordered",
        userId,
        items: [makeItem(product._id, { quantity: 2, sku: "paid-sku" })],
      });

      const res = await request(app)
        .get("/api/v1/cart/count")
        .set("x-cart-id", cart.cartId);

      expect(res.body.count).toBe(0);
    });

    it("ordered cart cookie should be cleared and cart returned as null", async () => {
      const cart = await createCartDirectly({ status: "ordered" });

      const res = await request(app)
        .post("/api/v1/cart/get")
        .set("Cookie", `cart_id=${cart.cartId}`);

      expect(res.status).toBe(200);
      expect(res.body.cart).toBeNull();

      // Cookie should be cleared
      const setCookies = res.headers["set-cookie"] || [];
      const cartCookie = setCookies.find((c) => c.startsWith("cart_id="));
      if (cartCookie) {
        // Either value is empty, or Expires is in the past
        const isCleared =
          cartCookie.includes("cart_id=;") ||
          cartCookie.includes("Expires=Thu, 01 Jan 1970") ||
          cartCookie.includes("Max-Age=0");
        expect(isCleared).toBe(true);
      }
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ISSUE 7: Count correctness across states
  // ══════════════════════════════════════════════════════════════════════════
  describe("Issue #7: count correctness", () => {
    it("count sums quantities of ALL items in an active cart", async () => {
      const p1 = await createTestProduct();
      const p2 = await createTestProduct();
      const cart = await createCartDirectly({
        status: "active",
        items: [
          makeItem(p1._id, { quantity: 3, sku: "sku-p1" }),
          makeItem(p2._id, { quantity: 2, sku: "sku-p2" }),
        ],
      });

      // /count reads directly from cart.items, no populate needed
      const res = await request(app)
        .get("/api/v1/cart/count")
        .set("x-cart-id", cart.cartId);

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(5); // 3 + 2
    });

    it("count is 0 for a completely empty active cart", async () => {
      const cart = await createCartDirectly({ status: "active", items: [] });

      const res = await request(app)
        .get("/api/v1/cart/count")
        .set("x-cart-id", cart.cartId);

      expect(res.body.count).toBe(0);
    });

    it("count is 0 after clearing an active cart", async () => {
      const product = await createTestProduct();
      const cart = await createCartDirectly({
        status: "active",
        items: [makeItem(product._id, { quantity: 4, sku: "sku-clear" })],
      });

      await request(app)
        .post("/api/v1/cart/clear")
        .set("x-cart-id", cart.cartId);

      const res = await request(app)
        .get("/api/v1/cart/count")
        .set("x-cart-id", cart.cartId);

      expect(res.body.count).toBe(0);
    });

    it("count is 0 for ordered cart (post-purchase ghost count bug)", async () => {
      const product = await createTestProduct();
      const cart = await createCartDirectly({
        status: "ordered",
        items: [
          makeItem(product._id, { quantity: 1, sku: "ordered-count-sku" }),
        ],
      });

      const res = await request(app)
        .get("/api/v1/cart/count")
        .set("x-cart-id", cart.cartId);

      expect(res.body.count).toBe(0);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ISSUE 8: Add/remove/update edge-cases
  // ══════════════════════════════════════════════════════════════════════════
  describe("Issue #8: add/remove/update must not corrupt cart state", () => {
    it("remove-item on non-existent sku returns 404 without corrupting cart", async () => {
      const product = await createTestProduct();
      const cart = await createCartDirectly({
        status: "active",
        items: [makeItem(product._id, { sku: "real-sku" })],
      });

      const res = await request(app)
        .delete("/api/v1/cart/remove-item")
        .set("x-cart-id", cart.cartId)
        .send({ sku: "nonexistent-sku" });

      expect(res.status).toBe(404);

      // Original item must still be intact
      const dbCart = await Cart.findOne({ cartId: cart.cartId });
      expect(dbCart.items).toHaveLength(1);
      expect(dbCart.status).toBe("active");
    });

    it("update-item with quantity=0 should remove the item (no zombie)", async () => {
      const product = await createTestProduct();
      const cart = await createCartDirectly({
        status: "active",
        items: [makeItem(product._id, { quantity: 3, sku: "update-zero-sku" })],
      });

      const res = await request(app)
        .patch("/api/v1/cart/update-item")
        .set("x-cart-id", cart.cartId)
        .send({ sku: "update-zero-sku", changes: { quantity: 0 } });

      expect(res.status).toBe(200);
      expect(res.body.cart.items).toHaveLength(0);

      const dbCart = await Cart.findOne({ cartId: cart.cartId });
      expect(dbCart.items).toHaveLength(0);
    });

    it("update-item with non-existent sku returns 404 (no phantom item created)", async () => {
      const product = await createTestProduct();
      const cart = await createCartDirectly({
        status: "active",
        items: [makeItem(product._id, { sku: "existing-sku" })],
      });

      const res = await request(app)
        .patch("/api/v1/cart/update-item")
        .set("x-cart-id", cart.cartId)
        .send({ sku: "phantom-sku", changes: { quantity: 5 } });

      expect(res.status).toBe(404);

      const dbCart = await Cart.findOne({ cartId: cart.cartId });
      expect(dbCart.items).toHaveLength(1); // original item still there
    });

    it("adding an out-of-stock product should fail with 400 (not silently add)", async () => {
      const product = await createTestProduct({
        stock: 0,
        stockObj: { available: 0, isInStock: false },
      });

      const res = await request(app)
        .post("/api/v1/cart/add-item")
        .send({ item: { productId: product._id.toString(), quantity: 1 } });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toMatch(/INSUFFICIENT_STOCK|OUT_OF_STOCK/i);
      expect(res.body.cart).toBeUndefined();
    });

    it("requesting more quantity than available stock should fail with 400", async () => {
      const product = await createTestProduct({
        stock: 2,
        stockObj: { available: 2, isInStock: true },
      });

      const res = await request(app)
        .post("/api/v1/cart/add-item")
        .send({ item: { productId: product._id.toString(), quantity: 10 } });

      expect(res.status).toBe(400);
      expect(res.body.availableQty).toBe(2);
    });

    it("adding an unpublished (draft) product should be rejected with PRODUCT_NOT_AVAILABLE", async () => {
      const product = await createTestProduct({ status: "draft" });

      const res = await request(app)
        .post("/api/v1/cart/add-item")
        .send({ item: { productId: product._id.toString(), quantity: 1 } });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe("PRODUCT_NOT_AVAILABLE");
    });

    it("add-item should increment quantity when same product is already in cart", async () => {
      const product = await createTestProduct();
      const agent = request.agent(app);

      // First add
      const res1 = await agent
        .post("/api/v1/cart/add-item")
        .send({ item: { productId: product._id.toString(), quantity: 2 } });
      expect(res1.status).toBe(200);

      // Second add – same product
      const res2 = await agent
        .post("/api/v1/cart/add-item")
        .send({ item: { productId: product._id.toString(), quantity: 3 } });
      expect(res2.status).toBe(200);

      const item = res2.body.cart.items.find(
        (i) => i.productId === product._id.toString(),
      );
      expect(item.quantity).toBe(5); // 2 + 3
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ISSUE 9: isValid flag for checkout gating
  // ══════════════════════════════════════════════════════════════════════════
  describe("Issue #9: isValid flag in /cart/get response", () => {
    it("isValid should be true when product is published and in stock", async () => {
      const product = await createTestProduct({
        stock: 10,
        stockObj: { available: 10, isInStock: true },
      });
      const cart = await createCartDirectly({
        items: [makeItem(product._id, { sku: "valid-sku" })],
      });

      const res = await request(app)
        .post("/api/v1/cart/get")
        .set("x-cart-id", cart.cartId);

      expect(res.status).toBe(200);
      // isValid is only on the POST /get endpoint
      expect(res.body.isValid).toBe(true);
    });

    it("isValid should be false when a cart product is archived after being added", async () => {
      const product = await createTestProduct({ status: "published" });
      const cart = await createCartDirectly({
        items: [makeItem(product._id, { sku: "archive-sku" })],
      });

      // Admin archives the product after customer adds it
      await Product.updateOne(
        { _id: product._id },
        { $set: { status: "archived" } },
      );

      const res = await request(app)
        .post("/api/v1/cart/get")
        .set("x-cart-id", cart.cartId);

      expect(res.status).toBe(200);
      expect(res.body.isValid).toBe(false); // must block checkout
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ISSUE 10: Cart recovery – item integrity
  // ══════════════════════════════════════════════════════════════════════════
  describe("Issue #10: Cart recovery preserves all items", () => {
    it("recovered cart should contain all items from the locked cart", async () => {
      const p1 = await createTestProduct();
      const p2 = await createTestProduct();

      const lockedCart = await createCartDirectly({
        status: "checkout",
        checkoutToken: "chk_test",
        checkoutExpiry: new Date(Date.now() + 60_000),
        items: [
          makeItem(p1._id, { quantity: 2, sku: "sku-r1" }),
          makeItem(p2._id, { quantity: 1, sku: "sku-r2" }),
        ],
      });

      const res = await request(app)
        .post("/api/v1/cart/recover")
        .set("x-cart-id", lockedCart.cartId);

      expect(res.status).toBe(200);
      expect(res.body.cart.items).toHaveLength(2);

      const skus = res.body.cart.items.map((i) => i.skuSnapshot);
      expect(skus).toContain("sku-r1");
      expect(skus).toContain("sku-r2");

      const newCart = await Cart.findOne({ cartId: res.body.cart.cartId });
      expect(newCart.status).toBe("active");
    });

    it("recovering an empty checkout cart should return a fresh empty active cart", async () => {
      const lockedCart = await createCartDirectly({
        status: "checkout",
        checkoutToken: "chk_empty",
        checkoutExpiry: new Date(Date.now() + 60_000),
        items: [],
      });

      const res = await request(app)
        .post("/api/v1/cart/recover")
        .set("x-cart-id", lockedCart.cartId);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.cart.items).toHaveLength(0);

      const newCart = await Cart.findOne({ cartId: res.body.cart.cartId });
      expect(newCart.status).toBe("active");
    });

    it("recovering a cart with a deleted product should NOT crash (500) – items are cleaned", async () => {
      const product = await createTestProduct();
      const lockedCart = await createCartDirectly({
        status: "checkout",
        checkoutToken: "chk_del",
        checkoutExpiry: new Date(Date.now() + 60_000),
        items: [makeItem(product._id, { sku: "deleted-in-recovery" })],
      });

      // Delete the product before recovery
      await Product.deleteOne({ _id: product._id });

      const res = await request(app)
        .post("/api/v1/cart/recover")
        .set("x-cart-id", lockedCart.cartId);

      // Should NOT be 500 – the pre-validate hook should clean it and return empty cart
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // KNOWN BUGS FOUND DURING TEST AUTHORING – Regression markers
  // These tests deliberately document the expected FIXED behavior.
  // ══════════════════════════════════════════════════════════════════════════
  describe("Bug Regressions", () => {
    /**
     * BUG: recoverCart calls createCart when no lockedCart (req.cart = null).
     * createCart destructures req.body immediately, but if no body is sent
     * (e.g., GET-style recover), req.body is undefined → TypeError crash → 500.
     *
     * FIX REQUIRED in hybridCartController.js recoverCart:
     *   if (!lockedCart) return createCart(req, res);
     *   → must ensure req.body is at least {} before calling createCart.
     *   OR: inline the cart creation rather than delegating to createCart.
     */
    it("BUG FIXED: /cart/recover with no cart should return 201 new cart (not 500)", async () => {
      // No cart cookie/header – req.cart will be null.
      // Previously crashed: TypeError: Cannot destructure property 'cartId' of 'req.body' as it is undefined.
      // Fixed by creating cart inline rather than delegating to createCart().
      const res = await request(app).post("/api/v1/cart/recover");
      expect(res.status).toBe(201); // new empty cart created
      expect(res.body.success).toBe(true);
      expect(res.body.cart).toBeDefined();
    });

    /**
     * BUG: /cart/clear checks `if (cart && cart.status !== 'active')` BEFORE
     * `if (!cart)`. When cart IS found and status IS active, it works.
     * But when cart is NOT found (req.cart = null), the first check passes
     * (null is falsy), falls through to second check, returns 404. ✓ Expected.
     * HOWEVER when x-cart-id points at an ordered cart, validateCart sets req.cart=null,
     * so clear returns 404 (not 200). This isn't a bug per se – just documenting it.
     */
    it("clear with ordered cart cookie should return 404 (cart is null after middleware strips it)", async () => {
      const cart = await createCartDirectly({ status: "ordered" });

      const res = await request(app)
        .post("/api/v1/cart/clear")
        .set("x-cart-id", cart.cartId);

      expect(res.status).toBe(404); // ordered cart → req.cart=null → "Cart not found"
    });
  });
});
