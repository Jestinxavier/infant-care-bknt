const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../../src/app");
const Cart = require("../../src/models/Cart");
const Product = require("../../src/models/Product");
const Category = require("../../src/models/Category");
const User = require("../../src/models/user");
const { generateCartId } = require("../../src/utils/cartIdGenerator");

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Create a minimal published product for testing. */
async function createTestProduct(overrides = {}) {
  const cat = await Category.create({
    name: `MergeCat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    code: `mc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    isActive: true,
  });
  return Product.create({
    title: "Merge Test Product",
    category: cat._id,
    sku: `MTC-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    url_key: `mtc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    status: "published",
    product_type: "SIMPLE",
    images: ["https://example.com/img.jpg"],
    price: 500,
    stock: 100,
    stockObj: { available: 100, isInStock: true },
    ...overrides,
  });
}

function makeItem(
  productId,
  { quantity = 1, sku = "default-sku", variantId = null } = {},
) {
  return {
    productId,
    variantId,
    quantity,
    titleSnapshot: "Test Item",
    imageSnapshot: "https://example.com/img.jpg",
    skuSnapshot: sku,
  };
}

async function createCartDirectly({
  cartId,
  status = "active",
  items = [],
  userId = null,
} = {}) {
  return Cart.create({
    cartId: cartId || generateCartId(),
    status,
    userId,
    items,
  });
}

// ─────────────────────────────────────────────────────────────────────────────

describe("Cart Merge Integration Tests (POST /cart/merge)", () => {
  let userToken;
  let userId;
  let testUser = {
    username: "mergetestuser",
    email: "mergetest@example.com",
    password: "Password123!",
    otp: "123456",
  };

  beforeAll(async () => {
    // 1. Cleanup first
    await User.deleteOne({ email: testUser.email });

    // 2. Create User
    await request(app)
      .post("/api/v1/auth/request-otp")
      .send({ email: testUser.email });
    await request(app).post("/api/v1/auth/verify-otp").send({
      email: testUser.email,
      username: testUser.username,
      password: testUser.password,
      otp: testUser.otp,
    });

    // 3. Login to get token
    const res = await request(app).post("/api/v1/auth/login").send({
      email: testUser.email,
      password: testUser.password,
    });
    userToken = res.body.accessToken;

    // 4. Get User ID reliably from DB
    const userDoc = await User.findOne({ email: testUser.email });
    userId = userDoc._id;
  });

  afterAll(async () => {
    await User.deleteOne({ email: testUser.email });
  });

  // Clear carts between tests
  afterEach(async () => {
    await Cart.deleteMany({ userId });
    await Cart.deleteMany({ userId: null });
  });

  it("should return 401 if user is not authenticated", async () => {
    const res = await request(app).post("/api/v1/cart/merge");
    expect(res.status).toBe(401);
  });

  describe("CASE A: Both guestCart and userCart exist → MERGE guest INTO user", () => {
    it("should merge guest items into user cart, sum duplicate quantities, and delete guest cart", async () => {
      const p1 = await createTestProduct();
      const p2 = await createTestProduct();

      // User's existing active cart
      const userCart = await createCartDirectly({
        userId,
        items: [
          makeItem(p1._id, { quantity: 2, sku: "P1-USER" }),
          makeItem(p2._id, { quantity: 1, sku: "P2-USER" }),
        ],
      });

      // Guest cart (has duplicate p1, and new p3)
      const p3 = await createTestProduct();
      const guestCart = await createCartDirectly({
        items: [
          makeItem(p1._id, { quantity: 3, sku: "P1-GUEST" }), // Duplicate!
          makeItem(p3._id, { quantity: 4, sku: "P3-GUEST" }), // New item
        ],
      });

      // Execute merge
      const res = await request(app)
        .post("/api/v1/cart/merge")
        .set("Authorization", `Bearer ${userToken}`)
        .set("x-guest-cart-id", guestCart.cartId);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const mergedCart = res.body.cart;
      expect(mergedCart.cartId).toBe(userCart.cartId); // Should keep user cart ID
      expect(mergedCart.items).toHaveLength(3); // p1, p2, p3

      // Verify sums
      const p1Item = mergedCart.items.find(
        (i) => i.productId === p1._id.toString(),
      );
      expect(p1Item.quantity).toBe(5); // 2 + 3

      const p2Item = mergedCart.items.find(
        (i) => i.productId === p2._id.toString(),
      );
      expect(p2Item.quantity).toBe(1);

      const p3Item = mergedCart.items.find(
        (i) => i.productId === p3._id.toString(),
      );
      expect(p3Item.quantity).toBe(4);

      // Verify guest cart was deleted
      const deletedGuestCart = await Cart.findOne({ cartId: guestCart.cartId });
      expect(deletedGuestCart).toBeNull();
    });

    it("should cap summed quantities at 99", async () => {
      const p1 = await createTestProduct();

      await createCartDirectly({
        userId,
        items: [makeItem(p1._id, { quantity: 90 })],
      });

      const guestCart = await createCartDirectly({
        items: [makeItem(p1._id, { quantity: 20 })],
      });

      const res = await request(app)
        .post("/api/v1/cart/merge")
        .set("Authorization", `Bearer ${userToken}`)
        .set("x-guest-cart-id", guestCart.cartId);

      const mergedItem = res.body.cart.items.find(
        (i) => i.productId === p1._id.toString(),
      );
      expect(mergedItem.quantity).toBe(99); // 90 + 20 capped
    });
  });

  describe("CASE B: Only userCart exists → RESTORE user cart", () => {
    it("should return the unmodified user cart", async () => {
      const p1 = await createTestProduct();
      const userCart = await createCartDirectly({
        userId,
        items: [makeItem(p1._id, { quantity: 2 })],
      });

      const res = await request(app)
        .post("/api/v1/cart/merge")
        .set("Authorization", `Bearer ${userToken}`);
      // No guest cart ID provided

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.cart.cartId).toBe(userCart.cartId);
      expect(res.body.cart.items).toHaveLength(1);
    });
  });

  describe("CASE C: Only guestCart exists → ASSIGN to user", () => {
    it("should update guest cart's userId to the logged in user", async () => {
      const p1 = await createTestProduct();
      const guestCart = await createCartDirectly({
        items: [makeItem(p1._id, { quantity: 3 })],
      });

      const res = await request(app)
        .post("/api/v1/cart/merge")
        .set("Authorization", `Bearer ${userToken}`)
        .set("x-guest-cart-id", guestCart.cartId);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.cart.cartId).toBe(guestCart.cartId);

      // DB check
      const updatedCart = await Cart.findOne({ cartId: guestCart.cartId });
      expect(updatedCart.userId.toString()).toBe(userId.toString());
    });

    it("should NOT assign if guest cart belongs to a DIFFERENT authenticated user", async () => {
      const anotherUserId = new mongoose.Types.ObjectId();
      const guestCart = await createCartDirectly({
        userId: anotherUserId, // Owned by someone else
      });

      const res = await request(app)
        .post("/api/v1/cart/merge")
        .set("Authorization", `Bearer ${userToken}`)
        .set("x-guest-cart-id", guestCart.cartId);

      expect(res.status).toBe(200); // Handled gracefully
      expect(res.body.message).toMatch(/belongs to another user/i);
      expect(res.body.cart).toBeNull();
    });
  });

  describe("CASE D: Neither exists", () => {
    it("should return null cart with success message", async () => {
      const res = await request(app)
        .post("/api/v1/cart/merge")
        .set("Authorization", `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.cart).toBeNull();
      expect(res.body.message).toBe("No cart to merge or restore");
    });
  });
});
