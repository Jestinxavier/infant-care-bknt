const crypto = require("crypto");
const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../../src/app");
const Cart = require("../../src/models/Cart");
const Order = require("../../src/models/Order");
const Payment = require("../../src/models/Payment");
const SiteSetting = require("../../src/models/SiteSetting");
const emailService = require("../../src/services/emailService");
const { generateCartId } = require("../../src/utils/cartIdGenerator");

const BASE = "/api/v1/payments";
const RAZORPAY_SECRET = "test_razorpay_secret";

let counter = 0;
const uniqueOrderId = () => `PAY-${Date.now()}-${counter++}`;
const cartHeader = (cartId) => ({ "x-cart-id": cartId });

const address = () => ({
  fullName: "Payment Parent",
  phone: "9876543210",
  houseName: "Green Villa",
  street: "12 Main Street",
  city: "Kochi",
  state: "Kerala",
  pincode: "682001",
  country: "India",
});

async function createCart({ items = 1, status = "active" } = {}) {
  return Cart.create({
    cartId: generateCartId(),
    status,
    items:
      items > 0
        ? [
            {
              productId: new mongoose.Types.ObjectId(),
              quantity: items,
              titleSnapshot: "Payment fixture product",
              imageSnapshot: "https://example.com/payment.jpg",
              skuSnapshot: `PAY-${counter++}`,
            },
          ]
        : [],
  });
}

async function createOrder({
  orderId = uniqueOrderId(),
  razorpayOrderId = `order_${orderId}`,
} = {}) {
  return Order.create({
    orderId,
    razorpayOrderId,
    items: [
      {
        productId: new mongoose.Types.ObjectId(),
        quantity: 2,
        price: 250,
        regularPrice: 300,
        name: "Payment fixture product",
        sku: `PAY-${counter++}`,
        image: "https://example.com/payment.jpg",
        urlKey: "payment-fixture-product",
      },
    ],
    totalQuantity: 2,
    totalAmount: 500,
    subtotal: 500,
    shippingCost: 0,
    discount: 0,
    shippingAddress: address(),
    // Checkout creates online orders as pending until payment is confirmed.
    paymentStatus: "pending",
    orderStatus: "pending",
    paymentMethod: "RAZORPAY",
    placedAt: new Date(),
    statusHistory: [{ status: "pending", timestamp: new Date() }],
  });
}

const signatureFor = (orderId, paymentId) =>
  crypto
    .createHmac("sha256", RAZORPAY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

describe("Payments surface", () => {
  beforeEach(() => {
    process.env.RAZORPAY_KEY_SECRET = RAZORPAY_SECRET;
    emailService.sendOrderConfirmationEmail.mockResolvedValue({
      success: true,
    });
  });

  it("validates payment-option cart requirements", async () => {
    const missing = await request(app).get(`${BASE}/options`);
    expect(missing.status).toBe(400);
    expect(missing.body.message).toMatch(/Cart ID is required/i);

    const unknown = await request(app)
      .get(`${BASE}/options`)
      .set(cartHeader(generateCartId()));
    expect(unknown.status).toBe(404);

    const emptyCart = await createCart({ items: 0 });
    const empty = await request(app)
      .get(`${BASE}/options`)
      .set(cartHeader(emptyCart.cartId));
    expect(empty.status).toBe(400);
    expect(empty.body.message).toMatch(/Cart is empty/i);
  });

  it("returns enabled payment options from settings", async () => {
    const cart = await createCart();
    await SiteSetting.create({
      key: "payment_methods",
      type: "json",
      scope: "payment",
      value: {
        methods: [
          { code: "COD", label: "Cash on Delivery", isEnabled: true },
          { code: "RAZORPAY", label: "Card / UPI", isEnabled: false },
        ],
      },
    });
    await SiteSetting.create({
      key: "payment.active_gateway",
      type: "string",
      scope: "payment",
      value: "razorpay",
    });

    const response = await request(app)
      .get(`${BASE}/options`)
      .set(cartHeader(cart.cartId));
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.options).toHaveLength(1);
    expect(response.body.options[0]).toMatchObject({
      code: "COD",
      isEnabled: true,
    });
  });

  it("returns an empty option list when no methods are configured", async () => {
    const cart = await createCart();

    const response = await request(app)
      .get(`${BASE}/options`)
      .set(cartHeader(cart.cartId));
    expect(response.status).toBe(200);
    expect(response.body.options).toEqual([]);
    expect(response.body.message).toMatch(/No payment methods/i);
  });

  it("rejects incomplete and invalid Razorpay signatures", async () => {
    const order = await createOrder();

    const missing = await request(app)
      .post(`${BASE}/razorpay/verify`)
      .send({});
    expect(missing.status).toBe(400);

    const invalid = await request(app)
      .post(`${BASE}/razorpay/verify`)
      .send({
        orderId: order.orderId,
        razorpay_order_id: `order_${order.orderId}`,
        razorpay_payment_id: `pay_${order.orderId}`,
        razorpay_signature: "invalid",
      });
    expect(invalid.status).toBe(400);
    expect(invalid.body.message).toMatch(/signature verification failed/i);

    // The endpoint is public: a bad signature must not cancel the order (or
    // restore its stock), otherwise anyone could cancel any order.
    const untouched = await Order.findOne({ orderId: order.orderId });
    expect(untouched.paymentStatus).toBe("pending");
    expect(untouched.orderStatus).toBe("pending");
  });

  it("rejects a valid payment replayed against a different order", async () => {
    const cheapOrder = await createOrder();
    const targetOrder = await createOrder();
    const paymentId = `pay_${cheapOrder.orderId}`;

    // Signature is genuine, but for the cheap order's Razorpay order.
    const response = await request(app)
      .post(`${BASE}/razorpay/verify`)
      .send({
        orderId: targetOrder.orderId,
        razorpay_order_id: cheapOrder.razorpayOrderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signatureFor(cheapOrder.razorpayOrderId, paymentId),
      });
    expect(response.status).toBe(400);

    const target = await Order.findOne({ orderId: targetOrder.orderId });
    expect(target.paymentStatus).toBe("pending");
    expect(target.orderStatus).toBe("pending");
  });

  it("confirms a paid order after a valid Razorpay signature", async () => {
    const order = await createOrder();
    const razorpayOrderId = `order_${order.orderId}`;
    const razorpayPaymentId = `pay_${order.orderId}`;
    await Payment.create({
      orderId: order._id,
      amount: order.totalAmount,
      method: "RAZORPAY",
      status: "initiated",
    });

    const response = await request(app)
      .post(`${BASE}/razorpay/verify`)
      .send({
        orderId: order.orderId,
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: razorpayPaymentId,
        razorpay_signature: signatureFor(razorpayOrderId, razorpayPaymentId),
      });
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const paidOrder = await Order.findOne({ orderId: order.orderId });
    expect(paidOrder.paymentStatus).toBe("paid");
    expect(paidOrder.orderStatus).toBe("confirmed");
    expect(paidOrder.paymentMethod).toBe("RAZORPAY");
    expect(paidOrder.phonepeTransactionId).toBe(razorpayPaymentId);

    const payment = await Payment.findOne({ orderId: order._id });
    expect(payment.status).toBe("success");
    expect(payment.transactionId).toBe(razorpayPaymentId);

    // Replaying the same verification must not regress a shipped order or
    // resend the confirmation email.
    await Order.updateOne({ _id: order._id }, { $set: { orderStatus: "shipped" } });
    const emailsBefore = emailService.sendOrderConfirmationEmail.mock.calls.length;
    const replay = await request(app)
      .post(`${BASE}/razorpay/verify`)
      .send({
        orderId: order.orderId,
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: razorpayPaymentId,
        razorpay_signature: signatureFor(razorpayOrderId, razorpayPaymentId),
      });
    expect(replay.status).toBe(200);
    const afterReplay = await Order.findOne({ orderId: order.orderId });
    expect(afterReplay.orderStatus).toBe("shipped");
    expect(emailService.sendOrderConfirmationEmail.mock.calls.length).toBe(emailsBefore);
  });

  it("returns 404 when a valid signature references an unknown order", async () => {
    const orderId = uniqueOrderId();
    const razorpayOrderId = `order_${orderId}`;
    const razorpayPaymentId = `pay_${orderId}`;

    const response = await request(app)
      .post(`${BASE}/razorpay/verify`)
      .send({
        orderId,
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: razorpayPaymentId,
        razorpay_signature: signatureFor(razorpayOrderId, razorpayPaymentId),
      });
    expect(response.status).toBe(404);
  });
});
