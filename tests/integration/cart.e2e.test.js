const request = require("supertest");
const app = require("../../src/app");
const mongoose = require("mongoose");
const Category = require("../../src/models/Category");
const Product = require("../../src/models/Product");
const User = require("../../src/models/user");
const Cart = require("../../src/models/Cart");
const Coupon = require("../../src/models/Coupon");

describe("Cart End-to-End Flow (Add, Update, Delete, Coupon, Checkout)", () => {
  let userToken;
  let userId;
  let p1, p2; // Products
  let couponPercentage, couponFlat;
  let cartId; // Track the cookie-supplied cartId across requests

  const testUser = {
    username: "carte2euser",
    email: "carte2e@example.com",
    password: "Password123!",
    otp: "123456",
  };

  /** Helper to maintain cookie across requests via Supertest Agent */
  const agent = request.agent(app);

  beforeAll(async () => {
    // 1. Setup User
    await User.deleteOne({ email: testUser.email });
    await request(app)
      .post("/api/v1/auth/request-otp")
      .send({ email: testUser.email });
    await request(app).post("/api/v1/auth/verify-otp").send({
      email: testUser.email,
      username: testUser.username,
      password: testUser.password,
      otp: testUser.otp,
    });
    const loginRes = await request(app).post("/api/v1/auth/login").send({
      email: testUser.email,
      password: testUser.password,
    });
    console.log("LOGIN RESPONSE", loginRes.body);
    userToken = loginRes.body.accessToken;
    userId = (await User.findOne({ email: testUser.email }))._id;

    // 2. Setup Category
    const cat = await Category.create({
      name: "E2E Test Category",
      code: "e2e-cat",
      isActive: true,
    });

    // 3. Setup Products
    p1 = await Product.create({
      title: "Premium E2E Laptop",
      category: cat._id,
      sku: "E2E-LAPTOP-001",
      url_key: "e2e-laptop",
      status: "published",
      product_type: "SIMPLE",
      images: ["https://example.com/laptop.jpg"],
      price: 100000,
      stock: 50,
      stockObj: { available: 50, isInStock: true },
    });

    p2 = await Product.create({
      title: "E2E Mouse",
      category: cat._id,
      sku: "E2E-MOUSE-001",
      url_key: "e2e-mouse",
      status: "published",
      product_type: "SIMPLE",
      images: ["https://example.com/mouse.jpg"],
      price: 2000,
      stock: 500,
      stockObj: { available: 500, isInStock: true },
    });

    // 4. Setup Coupons
    couponPercentage = await Coupon.create({
      code: "SAVE10",
      type: "percentage",
      value: 10, // 10%
      minCartValue: 5000,
      maxDiscount: 12000,
      startDate: new Date(Date.now() - 86400000), // Yesterday
      endDate: new Date(Date.now() + 86400000), // Tomorrow
      isActive: true,
      perUserLimit: 2,
    });

    couponFlat = await Coupon.create({
      code: "FLAT500",
      type: "flat",
      value: 500, // Rs 500 flat
      minCartValue: 1000,
      startDate: new Date(Date.now() - 86400000),
      endDate: new Date(Date.now() + 86400000),
      isActive: true,
      perUserLimit: 1,
    });
  });

  afterAll(async () => {
    await User.deleteOne({ email: testUser.email });
    await Cart.deleteMany({ userId });
    await Product.deleteMany({ sku: { $regex: /^E2E-/ } });
    await Category.deleteOne({ code: "e2e-cat" });
    await Coupon.deleteMany({ code: { $in: ["SAVE10", "FLAT500"] } });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // CHECK ALL CART OPERATIONS IN ONE FLOW (To avoid global afterEach teardowns)
  // ════════════════════════════════════════════════════════════════════════════
  it("Should sequentially test add, update, delete, coupon, and checkout", async () => {
    // ── STEP 1: ADD TO CART ──
    let res = await agent
      .post("/api/v1/cart/add-item")
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        item: { productId: p1._id.toString(), quantity: 1 },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.cart.items).toHaveLength(1);

    const p1Item = res.body.cart.items[0];
    expect(p1Item.productId).toBe(p1._id.toString());
    expect(p1Item.quantity).toBe(1);

    cartId = res.body.cart.cartId; // Save for subsequent tests
    expect(res.body.cart.subtotal).toBe(100000); // 100k

    // ── STEP 1b: ADD MULTIPLE ──
    res = await agent
      .post("/api/v1/cart/add-item")
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        item: { productId: p2._id.toString(), quantity: 2 },
      });

    expect(res.status).toBe(200);
    expect(res.body.cart.items).toHaveLength(2);
    expect(res.body.cart.subtotal).toBe(104000);

    // ── STEP 2: CART COUNT UPDATE ──
    const skuP1 = "E2E-LAPTOP-001";
    res = await agent
      .patch("/api/v1/cart/update-item")
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        sku: skuP1,
        changes: { quantity: 2 },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const updatedItem = res.body.cart.items.find(
      (i) => i.skuSnapshot === skuP1,
    );
    expect(updatedItem.quantity).toBe(2);
    expect(res.body.cart.subtotal).toBe(204000);

    // ── STEP 3: DELETE FROM CART ──
    const skuP2 = "E2E-MOUSE-001";
    res = await agent
      .delete("/api/v1/cart/remove-item")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ sku: skuP2 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.cart.items).toHaveLength(1);
    expect(res.body.cart.subtotal).toBe(200000);

    // ── STEP 4: COUPON APPLY ──
    // 4a: Below min value
    const highCoupon = await Coupon.create({
      code: "HIGH500",
      type: "flat",
      value: 500,
      minCartValue: 5000000,
      startDate: new Date(Date.now() - 86400),
      endDate: new Date(Date.now() + 86400000),
      isActive: true,
    });

    res = await agent
      .post("/api/v1/cart/apply-coupon")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ code: "HIGH500" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/Minimum cart value/);
    await Coupon.deleteOne({ _id: highCoupon._id });

    // 4b: Max limit caps
    res = await agent
      .post("/api/v1/cart/apply-coupon")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ code: "SAVE10" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    let cart = res.body.cart;
    expect(cart.coupon.code).toBe("SAVE10");
    expect(cart.coupon.discountAmount).toBe(12000); // Capped from 20000
    expect(cart.total).toBe(188000);

    // 4c: Replace coupon
    res = await agent
      .post("/api/v1/cart/apply-coupon")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ code: "FLAT500" });

    expect(res.status).toBe(200);
    cart = res.body.cart;
    expect(cart.coupon.code).toBe("FLAT500");
    expect(cart.coupon.discountAmount).toBe(500);
    expect(cart.total).toBe(199500);

    // ── STEP 5: COUPON REMOVE ──
    res = await agent
      .delete("/api/v1/cart/remove-coupon")
      .set("Authorization", `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    cart = res.body.cart;
    expect(cart.coupon).toBeUndefined();
    expect(cart.total).toBe(200000);

    // ── STEP 6: CHECKOUT STAGE ──
    res = await agent
      .post("/api/v1/cart/start-checkout")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ userId: userId.toString() });

    expect(res.status).toBe(200);
    expect(res.body.checkoutToken).toMatch(/^chk_/);

    const dbCart = await Cart.findOne({ cartId });
    expect(dbCart.status).toBe("checkout");

    // ── STEP 6b: Modification blocked/auto-recover ──
    res = await agent
      .delete("/api/v1/cart/remove-item")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ sku: skuP1 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.cart.cartId).not.toBe(cartId);
    expect(res.body.cart.items).toHaveLength(0);

    const newDbCart = await Cart.findOne({ cartId: res.body.cart.cartId });
    expect(newDbCart.status).toBe("active");
  });
});
