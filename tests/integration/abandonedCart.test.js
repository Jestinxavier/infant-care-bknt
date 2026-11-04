const request = require("supertest");
const app = require("../../src/app");
const Category = require("../../src/models/Category");
const Product = require("../../src/models/Product");
const Cart = require("../../src/models/Cart");
const Order = require("../../src/models/Order");
const Coupon = require("../../src/models/Coupon");
const SiteSetting = require("../../src/models/SiteSetting");
const EmailPreference = require("../../src/models/EmailPreference");
const emailService = require("../../src/services/emailService");
const { runAbandonedCartJob } = require("../../src/services/abandonedCartService");
const {
  createCartRestoreToken,
  createUnsubscribeToken,
} = require("../../src/utils/marketingTokens");
const { SITE_SETTING_KEYS } = require("../../src/config/siteSettingRegistry");
const { createVerifiedUser, accessTokenFor } = require("../helpers/authFixtures");
const { PAYMENT_METHODS } = require("../../resources/constants");

const HOUR = 60 * 60 * 1000;
let seq = 0;
const unique = (p) => `${p}-${Date.now()}-${seq++}`;
const cartIdFor = () => `cart_${String(Date.now()).padEnd(13, "0")}${String(seq++).padStart(8, "0")}`.slice(0, 26);

const enable = (overrides = {}) =>
  SiteSetting.findOneAndUpdate(
    { key: SITE_SETTING_KEYS.MARKETING_ABANDONED_CART },
    {
      key: SITE_SETTING_KEYS.MARKETING_ABANDONED_CART,
      scope: "marketing",
      type: "json",
      value: {
        enabled: true,
        firstReminderHours: 3,
        secondReminderHours: 24,
        maxCartAgeDays: 7,
        minCartValue: 0,
        coupon: { enabled: true, percent: 5, maxDiscount: 100, minCartValue: 800, validHours: 48, cooldownDays: 60 },
        ...overrides,
      },
    },
    { upsert: true },
  );

const createProduct = async (price = 1000) => {
  const token = unique("ac");
  const category = await Category.create({ name: `AC Cat ${token}`, code: `ac-cat-${token}`, isActive: true });
  return Product.create({
    title: `Muslin Swaddle ${token}`,
    description: "Abandoned cart test product",
    category: category._id,
    categoryName: category.name,
    categoryCode: category.code,
    url_key: `ac-product-${token}`,
    sku: `AC-${token}`.toUpperCase(),
    status: "published",
    product_type: "SIMPLE",
    price,
    stock: 20,
    stockObj: { available: 20, isInStock: true },
    images: ["https://example.com/ac.jpg"],
  });
};

/** Guest cart with contact, last changed `idleHours` ago. */
const createIdleCart = async ({ idleHours = 4, price = 1000, contactEmail = "parent@example.com", userId = null } = {}) => {
  const product = await createProduct(price);
  const cart = await Cart.create({
    cartId: cartIdFor(),
    userId,
    items: [{ productId: product._id, quantity: 1, titleSnapshot: product.title, imageSnapshot: "https://example.com/ac.jpg" }],
    contact: contactEmail ? { email: contactEmail, name: "Anjali", capturedAt: new Date() } : undefined,
  });
  // Backdate last activity without hooks touching updatedAt
  await Cart.collection.updateOne({ _id: cart._id }, { $set: { updatedAt: new Date(Date.now() - idleHours * HOUR) } });
  return Cart.findById(cart._id).lean();
};

describe("Abandoned cart reminders", () => {
  beforeEach(() => {
    emailService.sendAbandonedCartEmail.mockClear();
  });

  it("does nothing while the feature is off (default)", async () => {
    await createIdleCart();
    const result = await runAbandonedCartJob();
    expect(result).toEqual({ skipped: "disabled" });
    expect(emailService.sendAbandonedCartEmail).not.toHaveBeenCalled();
  });

  it("sends reminder 1 once, then reminder 2 with a private one-time coupon", async () => {
    await enable();
    const cart = await createIdleCart({ idleHours: 4, price: 1000 });

    await runAbandonedCartJob();
    expect(emailService.sendAbandonedCartEmail).toHaveBeenCalledTimes(1);
    const [recipient, , opts1] = emailService.sendAbandonedCartEmail.mock.calls[0];
    expect(recipient.email).toBe("parent@example.com");
    expect(opts1.step).toBe(1);
    expect(opts1.coupon).toBeNull();
    expect(opts1.cartTotal).toBe(1000);
    expect(opts1.restoreUrl).toContain("/api/v1/cart/restore?token=");

    // Running again does not resend reminder 1
    await runAbandonedCartJob();
    expect(emailService.sendAbandonedCartEmail).toHaveBeenCalledTimes(1);

    // A day later: reminder 2 with a coupon (cart value 1000 >= 800)
    await runAbandonedCartJob({ now: Date.now() + 21 * HOUR });
    expect(emailService.sendAbandonedCartEmail).toHaveBeenCalledTimes(2);
    const opts2 = emailService.sendAbandonedCartEmail.mock.calls[1][2];
    expect(opts2.step).toBe(2);
    expect(opts2.coupon.code).toMatch(/^COMEBACK-[A-Z2-9]{6}$/);

    const coupon = await Coupon.findOne({ code: opts2.coupon.code }).lean();
    expect(coupon).toMatchObject({
      source: "abandoned_cart",
      isPublic: false,
      usageLimit: 1,
      perUserLimit: 1,
      issuedToEmail: "parent@example.com",
      issuedForCartId: cart.cartId,
    });
    const saved = await Cart.findById(cart._id).lean();
    expect(saved.reminders.map((r) => r.step)).toEqual([1, 2]);
    expect(saved.reminders[1].couponCode).toBe(opts2.coupon.code);
    // Reminder bookkeeping must not count as shopper activity
    expect(new Date(saved.updatedAt).getTime()).toBe(new Date(cart.updatedAt).getTime());
  });

  it("skips unsubscribed shoppers, completed orders, unreachable and fresh carts", async () => {
    await enable();
    await EmailPreference.create({ email: "optout@example.com", unsubscribed: ["cart_reminders"] });
    await createIdleCart({ contactEmail: "optout@example.com" });
    await createIdleCart({ contactEmail: "bought@example.com" });
    await Order.create({
      orderId: unique("AC-ORDER"),
      items: [],
      totalQuantity: 1,
      totalAmount: 500,
      subtotal: 500,
      paymentMethod: PAYMENT_METHODS.COD,
      guestInfo: { email: "bought@example.com", name: "B" },
      shippingAddress: { fullName: "B" },
    });
    await createIdleCart({ contactEmail: null }); // guest with no contact
    await createIdleCart({ idleHours: 1 }); // too recent

    await runAbandonedCartJob();
    expect(emailService.sendAbandonedCartEmail).not.toHaveBeenCalled();
  });

  it("still reminds when the only order since is an unpaid online one", async () => {
    await enable();
    await createIdleCart({ contactEmail: "failedpay@example.com" });
    await Order.create({
      orderId: unique("AC-ORDER"),
      items: [],
      totalQuantity: 1,
      totalAmount: 500,
      subtotal: 500,
      paymentMethod: PAYMENT_METHODS.PHONEPE,
      paymentStatus: "failed",
      guestInfo: { email: "failedpay@example.com", name: "F" },
      shippingAddress: { fullName: "F" },
    });
    await runAbandonedCartJob();
    expect(emailService.sendAbandonedCartEmail).toHaveBeenCalledTimes(1);
  });

  it("gives no coupon below the coupon minimum, and reaches logged-in owners by account email", async () => {
    await enable();
    const user = await createVerifiedUser();
    await createIdleCart({ idleHours: 30, price: 300, contactEmail: null, userId: user._id });
    await runAbandonedCartJob(); // step 1
    await runAbandonedCartJob(); // step 2 (already 30h idle)
    const calls = emailService.sendAbandonedCartEmail.mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0].email).toBe(user.email.toLowerCase());
    expect(calls[1][2].coupon).toBeNull();
  });

  it("saves guest contact at checkout without resetting the reminder clock", async () => {
    const cart = await createIdleCart({ contactEmail: null, idleHours: 5 });
    const res = await request(app)
      .post("/api/v1/cart/contact")
      .set("x-cart-id", cart.cartId)
      .send({ email: "New@Example.com", name: "Riya" });
    expect(res.status).toBe(200);
    expect(res.body.saved).toBe(true);
    const saved = await Cart.findById(cart._id).lean();
    expect(saved.contact.email).toBe("new@example.com");
    expect(new Date(saved.updatedAt).getTime()).toBe(new Date(cart.updatedAt).getTime());

    const bad = await request(app).post("/api/v1/cart/contact").set("x-cart-id", cart.cartId).send({ email: "nope" });
    expect(bad.status).toBe(400);
  });

  it("restore link sets the cart cookie and redirects to /cart; bad links still redirect", async () => {
    const cart = await createIdleCart();
    const ok = await request(app).get(`/api/v1/cart/restore?token=${encodeURIComponent(createCartRestoreToken(cart.cartId))}`);
    expect(ok.status).toBe(302);
    expect(ok.headers.location).toMatch(/\/cart\?from=reminder$/);
    expect(ok.headers["set-cookie"].join(";")).toContain(cart.cartId);

    const bad = await request(app).get("/api/v1/cart/restore?token=tampered");
    expect(bad.status).toBe(302);
    expect(bad.headers["set-cookie"]).toBeUndefined();
  });

  it("unsubscribe: GET is read-only, POST opts out, resubscribe undoes", async () => {
    const token = encodeURIComponent(createUnsubscribeToken("Parent2@Example.com", "cart_reminders"));
    const status = await request(app).get(`/api/v1/email/unsubscribe?token=${token}`);
    expect(status.status).toBe(200);
    expect(status.body).toMatchObject({ unsubscribed: false, email: "p******@example.com" });

    const off = await request(app).post(`/api/v1/email/unsubscribe?token=${token}`).type("form").send("List-Unsubscribe=One-Click");
    expect(off.status).toBe(200);
    expect((await EmailPreference.findOne({ email: "parent2@example.com" }).lean()).unsubscribed).toContain("cart_reminders");

    await request(app).post("/api/v1/email/resubscribe").send({ token: decodeURIComponent(token) });
    expect((await EmailPreference.findOne({ email: "parent2@example.com" }).lean()).unsubscribed).not.toContain("cart_reminders");

    const bad = await request(app).post("/api/v1/email/unsubscribe?token=forged");
    expect(bad.status).toBe(400);
  });

  it("admin list shows open carts with live value and a 30-day summary", async () => {
    await enable();
    await createIdleCart({ idleHours: 6, price: 1000 });
    const admin = await createVerifiedUser({ role: "admin" });
    const res = await request(app)
      .get("/api/v1/admin/abandoned-carts?view=open")
      .set("Authorization", `Bearer ${accessTokenFor(admin)}`);
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
    expect(res.body.items[0]).toMatchObject({ value: 1000, customer: { type: "guest", email: "parent@example.com" } });
    expect(res.body.summary.last30Days.open).toBeGreaterThanOrEqual(1);

    const anon = await request(app).get("/api/v1/admin/abandoned-carts");
    expect(anon.status).toBe(401);
  });
});
