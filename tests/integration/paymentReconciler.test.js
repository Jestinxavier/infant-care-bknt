const Category = require("../../src/models/Category");
const Product = require("../../src/models/Product");
const Order = require("../../src/models/Order");
const Cart = require("../../src/models/Cart");
const request = require("supertest");
const app = require("../../src/app");
const razorpaySDK = require("../../src/controllers/payment/razorpaySDK");
const phonepeSDK = require("../../src/controllers/payment/phonepeSDK");
const { backfillLegacyStock } = require("../../src/utils/legacyStockBackfill");
const { createVerifiedUser, accessTokenFor } = require("../helpers/authFixtures");
const Coupon = require("../../src/models/Coupon");
const {
  reconcileStalePayments,
  releasePreviousAttempt,
} = require("../../src/services/paymentReconciler");
const emailService = require("../../src/services/emailService");
const { PAYMENT_METHODS } = require("../../resources/constants");

const MIN = 60 * 1000;
let seq = 0;
const unique = (p) => `${p}-${Date.now()}-${seq++}`;
const cartIdFor = () =>
  `cart_${String(Date.now()).padEnd(13, "0")}${String(seq++).padStart(8, "0")}`.slice(0, 26);

const createProduct = async (available = 0) => {
  const token = unique("rc");
  const category = await Category.create({ name: `RC ${token}`, code: `rc-${token}`, isActive: true });
  return Product.create({
    title: `Baby Blanket ${token}`,
    description: "Reconciler test product",
    category: category._id,
    categoryName: category.name,
    categoryCode: category.code,
    url_key: `rc-product-${token}`,
    sku: `RC-${token}`.toUpperCase(),
    status: "published",
    product_type: "SIMPLE",
    price: 799,
    // The last unit is held by the unpaid order, so the shelf shows 0
    stock: available,
    stockObj: { available, isInStock: available > 0 },
    images: ["https://example.com/rc.jpg"],
  });
};

/** An online-payment order placed `ageMin` minutes ago, holding 1 unit. */
const createOrder = async ({
  ageMin = 90,
  paymentMethod = PAYMENT_METHODS.PHONEPE,
  paymentStatus = "pending",
  orderStatus = "pending",
  razorpayOrderId = null,
} = {}) => {
  const product = await createProduct(0);
  const order = await Order.create({
    orderId: unique("ORD-RC"),
    items: [{ productId: product._id, quantity: 1, price: 799, name: product.title }],
    totalQuantity: 1,
    totalAmount: 799,
    subtotal: 799,
    paymentMethod,
    paymentStatus,
    orderStatus,
    razorpayOrderId,
    guestInfo: { email: "parent@example.com", name: "Anjali" },
    shippingAddress: { fullName: "Anjali", state: "Kerala" },
  });
  await Order.collection.updateOne(
    { _id: order._id },
    { $set: { createdAt: new Date(Date.now() - ageMin * MIN) } },
  );
  const cart = await Cart.create({
    cartId: cartIdFor(),
    status: "checkout",
    orderId: order._id,
    items: [{ productId: product._id, quantity: 1, titleSnapshot: product.title }],
  });
  return { order, product, cart };
};

const stockOf = async (product) => (await Product.findById(product._id).lean()).stockObj.available;
const orderOf = (order) => Order.findById(order._id).lean();

const gatewaysWith = ({ phonepe, razorpay } = {}) => ({
  phonepeStatus: jest.fn(phonepe || (async () => ({ state: "PENDING" }))),
  razorpayPayments: jest.fn(razorpay || (async () => [])),
  razorpayMarkPaid: jest.fn(razorpaySDK.markOrderAsPaid),
  phonepeMarkPaid: jest.fn(phonepeSDK.markPhonePeOrderPaid),
});

/** A single-use coupon (like COMEBACK codes) already used by `order`. */
const attachUsedCoupon = async (order) => {
  const coupon = await Coupon.create({
    code: unique("COMEBACK").toUpperCase(),
    type: "percentage",
    value: 5,
    startDate: new Date(Date.now() - 24 * 60 * MIN),
    endDate: new Date(Date.now() + 24 * 60 * MIN),
    usageLimit: 1,
    usageCount: 1,
  });
  await Order.updateOne(
    { _id: order._id },
    {
      $set: {
        coupon: { code: coupon.code, couponId: coupon._id, discountAmount: 40 },
        coupons: [{ code: coupon.code, couponId: coupon._id, discountAmount: 40 }],
      },
    },
  );
  return coupon;
};
const usageOf = async (coupon) => (await Coupon.findById(coupon._id).lean()).usageCount;
const secondsAgo = (min) => Math.floor((Date.now() - min * MIN) / 1000);

const run = (gateways, opts = {}) => reconcileStalePayments({ gateways, ...opts });
const outcomeFor = (res, order) => res.results.find((r) => r.orderId === order.orderId)?.outcome;

describe("Stale online-payment reconciler", () => {
  beforeEach(async () => {
    // The shared mock returns undefined; the real sender returns a promise
    emailService.sendOrderConfirmationEmail.mockResolvedValue(true);
    // Each test only sees its own orders
    await Order.deleteMany({});
  });

  it("cancels an unpaid PhonePe order after expiry and returns the stock once", async () => {
    const { order, product, cart } = await createOrder();
    const gateways = gatewaysWith({ phonepe: async () => ({ state: "FAILED", raw: {} }) });

    const first = await run(gateways);
    expect(outcomeFor(first, order)).toBe("cancelled");
    // A second run (or a late webhook) must not add the stock back again
    await run(gateways);

    const saved = await orderOf(order);
    expect(saved.orderStatus).toBe("cancelled");
    expect(saved.paymentStatus).toBe("failed");
    expect(await stockOf(product)).toBe(1);
    const savedCart = await Cart.findById(cart._id).lean();
    expect(savedCart.status).toBe("active");
    expect(savedCart.orderId).toBeUndefined();
  });

  it("marks a PhonePe order paid when the webhook was missed, keeping the stock sold", async () => {
    const { order, product, cart } = await createOrder();
    const gateways = gatewaysWith({
      phonepe: async () => ({ state: "COMPLETED", transactionId: "T123", raw: {} }),
    });

    expect(outcomeFor(await run(gateways), order)).toBe("marked-paid");

    const saved = await orderOf(order);
    expect(saved.paymentStatus).toBe("paid");
    expect(saved.orderStatus).toBe("confirmed");
    expect(saved.phonepeTransactionId).toBe("T123");
    expect(await stockOf(product)).toBe(0);
    expect((await Cart.findById(cart._id).lean()).status).toBe("ordered");
  });

  it("leaves an order alone while PhonePe still says PENDING", async () => {
    const { order, product } = await createOrder();
    const res = await run(gatewaysWith({ phonepe: async () => ({ state: "PENDING" }) }));
    expect(outcomeFor(res, order)).toBe("left-pending");
    expect((await orderOf(order)).orderStatus).toBe("pending");
    expect(await stockOf(product)).toBe(0);
  });

  it("changes nothing when the gateway can't be reached", async () => {
    const { order, product } = await createOrder();
    const res = await run(
      gatewaysWith({ phonepe: async () => { throw new Error("timeout"); } }),
    );
    expect(outcomeFor(res, order)).toBe("error");
    expect((await orderOf(order)).orderStatus).toBe("pending");
    expect(await stockOf(product)).toBe(0);
  });

  it("does not touch orders whose payment page may still be open", async () => {
    const { order } = await createOrder({ ageMin: 30 });
    const gateways = gatewaysWith({ phonepe: async () => ({ state: "FAILED" }) });
    const res = await run(gateways);
    expect(outcomeFor(res, order)).toBeUndefined();
    expect(gateways.phonepeStatus).not.toHaveBeenCalled();
  });

  it("does not touch old stuck orders automatically", async () => {
    const { order } = await createOrder({ ageMin: 5 * 24 * 60 });
    const gateways = gatewaysWith({ phonepe: async () => ({ state: "FAILED" }) });
    expect(outcomeFor(await run(gateways), order)).toBeUndefined();
    expect((await orderOf(order)).orderStatus).toBe("pending");
  });

  it("never touches COD orders or orders an admin already moved on", async () => {
    const cod = await createOrder({ paymentMethod: PAYMENT_METHODS.COD });
    const confirmed = await createOrder({ orderStatus: "confirmed" });
    const gateways = gatewaysWith({ phonepe: async () => ({ state: "FAILED" }) });

    const res = await run(gateways);
    expect(res.results).toHaveLength(0);
    expect((await orderOf(cod.order)).orderStatus).toBe("pending");
    expect((await orderOf(confirmed.order)).orderStatus).toBe("confirmed");
  });

  it("finds orders whose payment method was saved in lowercase", async () => {
    const { order } = await createOrder();
    await Order.collection.updateOne({ _id: order._id }, { $set: { paymentMethod: "phonepe" } });
    const res = await run(gatewaysWith({ phonepe: async () => ({ state: "FAILED" }) }));
    expect(outcomeFor(res, order)).toBe("cancelled");
  });

  it("dry run reports the outcome without changing anything", async () => {
    const { order, product } = await createOrder();
    const res = await run(
      gatewaysWith({ phonepe: async () => ({ state: "FAILED" }) }),
      { dryRun: true },
    );
    expect(outcomeFor(res, order)).toBe("would-cancel");
    expect((await orderOf(order)).orderStatus).toBe("pending");
    expect(await stockOf(product)).toBe(0);
  });

  it("does not restore stock twice when a webhook cancels the order mid-check", async () => {
    const { order, product } = await createOrder();
    const gateways = gatewaysWith({
      phonepe: async () => {
        // The FAILED webhook lands while we wait for PhonePe's answer
        await Order.updateOne(
          { _id: order._id },
          { $set: { orderStatus: "cancelled", paymentStatus: "failed" } },
        );
        await Product.updateOne({ _id: product._id }, { $inc: { "stockObj.available": 1, stock: 1 } });
        return { state: "FAILED" };
      },
    });

    expect(outcomeFor(await run(gateways), order)).toBe("skipped-changed");
    expect(await stockOf(product)).toBe(1);
  });

  it("rotates undecided orders so newer abandoned ones are still reached", async () => {
    const stuck = await createOrder({ ageMin: 300 });
    const abandoned = await createOrder({ ageMin: 100 });
    const gateways = gatewaysWith({
      phonepe: async (orderId) =>
        orderId === stuck.order.orderId ? { state: "PENDING" } : { state: "FAILED" },
    });

    // Simulate a batch that only has room for one: the stuck order was
    // checked last run, so the never-checked abandoned one goes first now
    await Order.updateOne(
      { _id: stuck.order._id },
      { $set: { paymentReconcileCheckedAt: new Date() } },
    );
    const res = await run(gateways);

    expect(res.results[0].orderId).toBe(abandoned.order.orderId);
    expect(outcomeFor(res, abandoned.order)).toBe("cancelled");
    expect((await orderOf(stuck.order)).paymentReconcileCheckedAt).toBeInstanceOf(Date);
  });

  describe("Razorpay", () => {
    it("marks the order paid when a captured payment exists", async () => {
      const { order, product } = await createOrder({
        paymentMethod: PAYMENT_METHODS.RAZORPAY,
        razorpayOrderId: "order_rzp_1",
      });
      const gateways = gatewaysWith({
        razorpay: async () => [{ id: "pay_1", status: "captured" }],
      });

      expect(outcomeFor(await run(gateways), order)).toBe("marked-paid");
      const saved = await orderOf(order);
      expect(saved.paymentStatus).toBe("paid");
      expect(saved.orderStatus).toBe("confirmed");
      expect(await stockOf(product)).toBe(0);
    });

    it("waits while a payment is authorized but not captured", async () => {
      const { order } = await createOrder({
        paymentMethod: PAYMENT_METHODS.RAZORPAY,
        razorpayOrderId: "order_rzp_2",
      });
      const res = await run(
        gatewaysWith({ razorpay: async () => [{ id: "pay_2", status: "authorized" }] }),
      );
      expect(outcomeFor(res, order)).toBe("left-pending");
      expect((await orderOf(order)).orderStatus).toBe("pending");
    });

    it("cancels and returns stock when no payment went through", async () => {
      const { order, product } = await createOrder({
        paymentMethod: PAYMENT_METHODS.RAZORPAY,
        razorpayOrderId: "order_rzp_3",
      });
      const res = await run(
        gatewaysWith({ razorpay: async () => [{ id: "pay_3", status: "failed" }] }),
      );
      expect(outcomeFor(res, order)).toBe("cancelled");
      expect((await orderOf(order)).orderStatus).toBe("cancelled");
      expect(await stockOf(product)).toBe(1);
    });

    it("leaves orders without a Razorpay order id for an admin", async () => {
      const { order } = await createOrder({ paymentMethod: PAYMENT_METHODS.RAZORPAY });
      const gateways = gatewaysWith();
      expect(outcomeFor(await run(gateways), order)).toBe("left-unknown");
      expect(gateways.razorpayPayments).not.toHaveBeenCalled();
    });

    it("cancels when the popup was closed without paying, and gives the coupon back", async () => {
      const { order, product, cart } = await createOrder({
        paymentMethod: PAYMENT_METHODS.RAZORPAY,
        razorpayOrderId: "order_rzp_closed",
      });
      const coupon = await attachUsedCoupon(order);

      // Closing the popup leaves no payment at all on the Razorpay order
      const res = await run(gatewaysWith({ razorpay: async () => [] }));
      expect(outcomeFor(res, order)).toBe("cancelled");
      // Running again must not hand the stock or coupon back twice
      await run(gatewaysWith({ razorpay: async () => [] }));

      expect(await stockOf(product)).toBe(1);
      expect(await usageOf(coupon)).toBe(0);
      expect((await Cart.findById(cart._id).lean()).status).toBe("active");
    });

    it("treats a payment stuck in 'created' for long as abandoned, but a fresh one as in progress", async () => {
      const fresh = await createOrder({
        paymentMethod: PAYMENT_METHODS.RAZORPAY,
        razorpayOrderId: "order_rzp_fresh",
      });
      const stale = await createOrder({
        paymentMethod: PAYMENT_METHODS.RAZORPAY,
        razorpayOrderId: "order_rzp_stale",
      });
      const res = await run(
        gatewaysWith({
          razorpay: async (id) => [
            {
              id: `pay_${id}`,
              status: "created",
              created_at: id === "order_rzp_fresh" ? secondsAgo(2) : secondsAgo(40),
            },
          ],
        }),
      );
      expect(outcomeFor(res, fresh.order)).toBe("left-pending");
      expect(outcomeFor(res, stale.order)).toBe("cancelled");
    });
  });

  describe("Placing the order again after closing the Razorpay popup", () => {
    // The earlier attempt is only minutes old: the scheduled job hasn't run
    const firstAttempt = () =>
      createOrder({
        ageMin: 3,
        paymentMethod: PAYMENT_METHODS.RAZORPAY,
        razorpayOrderId: "order_rzp_retry",
      });
    const cartOf = (cart) => Cart.findById(cart._id).lean();

    it("releases the unpaid attempt so its stock and coupon can be used again", async () => {
      const { order, product, cart } = await firstAttempt();
      const coupon = await attachUsedCoupon(order);

      const result = await releasePreviousAttempt(await cartOf(cart), {
        gateways: gatewaysWith({ razorpay: async () => [] }),
      });

      expect(result).toBe("released");
      expect((await orderOf(order)).orderStatus).toBe("cancelled");
      expect(await stockOf(product)).toBe(1);
      expect(await usageOf(coupon)).toBe(0);
      // The customer is mid-checkout: the cart must stay in checkout
      expect((await cartOf(cart)).status).toBe("checkout");
    });

    it("double-tapping releases the earlier attempt only once", async () => {
      const { order, product, cart } = await firstAttempt();
      const coupon = await attachUsedCoupon(order);
      const gateways = gatewaysWith({ razorpay: async () => [] });
      const snapshot = await cartOf(cart);

      await Promise.all([
        releasePreviousAttempt(snapshot, { gateways }),
        releasePreviousAttempt(snapshot, { gateways }),
      ]);

      expect(await stockOf(product)).toBe(1);
      expect(await usageOf(coupon)).toBe(0);
    });

    it("stops when the earlier attempt was actually paid", async () => {
      const { order, product, cart } = await firstAttempt();
      const result = await releasePreviousAttempt(await cartOf(cart), {
        gateways: gatewaysWith({ razorpay: async () => [{ id: "pay_ok", status: "captured" }] }),
      });

      expect(result).toBe("paid");
      const saved = await orderOf(order);
      expect(saved.paymentStatus).toBe("paid");
      expect(saved.orderStatus).toBe("confirmed");
      expect(await stockOf(product)).toBe(0);
    });

    it("asks the customer to wait while a payment is still moving", async () => {
      const { order, cart } = await firstAttempt();
      const result = await releasePreviousAttempt(await cartOf(cart), {
        gateways: gatewaysWith({ razorpay: async () => [{ id: "pay_wait", status: "authorized" }] }),
      });
      expect(result).toBe("in-progress");
      expect((await orderOf(order)).orderStatus).toBe("pending");
    });

    it("carries on unchanged when Razorpay can't be reached", async () => {
      const { order, product, cart } = await firstAttempt();
      const result = await releasePreviousAttempt(await cartOf(cart), {
        gateways: gatewaysWith({ razorpay: async () => { throw new Error("timeout"); } }),
      });
      expect(result).toBe("unknown");
      expect((await orderOf(order)).orderStatus).toBe("pending");
      expect(await stockOf(product)).toBe(0);
    });

    it("never reports 'released' when the payment webhook wins the race", async () => {
      const { order, product, cart } = await firstAttempt();
      const gateways = gatewaysWith({
        razorpay: async () => {
          // Razorpay's list doesn't show the capture yet, but the webhook lands
          // and marks the order paid before our cancel claim runs
          await razorpaySDK.markOrderAsPaid(order.orderId, "pay_late", {});
          return [];
        },
      });

      const result = await releasePreviousAttempt(await cartOf(cart), { gateways });

      expect(result).toBe("paid");
      expect((await orderOf(order)).paymentStatus).toBe("paid");
      expect(await stockOf(product)).toBe(0);
    });

    it("doesn't release a brand-new attempt whose popup may still be opening", async () => {
      const { order, cart } = await createOrder({
        ageMin: 0,
        paymentMethod: PAYMENT_METHODS.RAZORPAY,
        razorpayOrderId: "order_rzp_new",
      });
      const result = await releasePreviousAttempt(await cartOf(cart), {
        gateways: gatewaysWith({ razorpay: async () => [] }),
      });
      expect(result).toBe("in-progress");
      expect((await orderOf(order)).orderStatus).toBe("pending");
    });

    it("ignores COD orders and carts with no earlier attempt", async () => {
      const cod = await createOrder({ ageMin: 3, paymentMethod: PAYMENT_METHODS.COD });
      const gateways = gatewaysWith();
      expect(await releasePreviousAttempt(await cartOf(cod.cart), { gateways })).toBe("none");
      expect(await releasePreviousAttempt({ status: "active" }, { gateways })).toBe("none");
      expect(await releasePreviousAttempt(null, { gateways })).toBe("none");
      expect(gateways.razorpayPayments).not.toHaveBeenCalled();
      expect((await orderOf(cod.order)).orderStatus).toBe("pending");
    });
  });

  describe("Admin cancels from the dashboard", () => {
    const cancelAsAdmin = async (order) => {
      const admin = await createVerifiedUser({ role: "admin" });
      return request(app)
        .patch("/api/v1/admin/orders/update-status")
        .set("Authorization", `Bearer ${accessTokenFor(admin)}`)
        .send({ orderId: order.orderId, status: "cancelled" });
    };

    it("gives back stock and the coupon for an unpaid order", async () => {
      const { order, product } = await createOrder({ ageMin: 10, paymentMethod: PAYMENT_METHODS.RAZORPAY });
      const coupon = await attachUsedCoupon(order);

      const res = await cancelAsAdmin(order);

      expect(res.status).toBe(200);
      expect(await stockOf(product)).toBe(1);
      expect(await usageOf(coupon)).toBe(0);
    });

    it("keeps the coupon used for a paid order (only stock comes back)", async () => {
      const { order, product } = await createOrder({
        ageMin: 10,
        paymentMethod: PAYMENT_METHODS.RAZORPAY,
        paymentStatus: "paid",
        orderStatus: "confirmed",
      });
      const coupon = await attachUsedCoupon(order);

      const res = await cancelAsAdmin(order);

      expect(res.status).toBe(200);
      expect(await stockOf(product)).toBe(1);
      expect(await usageOf(coupon)).toBe(1);
    });
  });

  describe("Products that only have the old stock field", () => {
    it("copies the old count over so the product keeps selling correctly", async () => {
      const product = await createProduct(0);
      await Product.collection.updateOne(
        { _id: product._id },
        { $set: { stock: 10 }, $unset: { stockObj: "" } },
      );

      await backfillLegacyStock([{ productId: product._id }]);
      const after = await Product.findById(product._id).lean();
      expect(after.stockObj.available).toBe(10);

      // A product that already has the main count is never overwritten
      await Product.collection.updateOne({ _id: product._id }, { $set: { "stockObj.available": 3, stock: 99 } });
      await backfillLegacyStock([{ productId: product._id }]);
      expect((await Product.findById(product._id).lean()).stockObj.available).toBe(3);
    });

    it("handles a null main count and variants", async () => {
      const product = await createProduct(0);
      await Product.collection.updateOne(
        { _id: product._id },
        {
          $set: {
            "stockObj.available": null,
            stock: 4,
            variants: [
              { id: "v-legacy", sku: "V-LEGACY", stock: 6 },
              { id: "v-ok", sku: "V-OK", stock: 50, stockObj: { available: 2, isInStock: true } },
            ],
          },
        },
      );

      await backfillLegacyStock([
        { productId: product._id },
        { productId: product._id, variantId: "v-legacy" },
        { productId: product._id, variantId: "v-ok" },
      ]);

      const after = await Product.collection.findOne({ _id: product._id });
      expect(after.stockObj.available).toBe(4);
      expect(after.variants.find((v) => v.id === "v-legacy").stockObj.available).toBe(6);
      expect(after.variants.find((v) => v.id === "v-ok").stockObj.available).toBe(2);
    });
  });
});
