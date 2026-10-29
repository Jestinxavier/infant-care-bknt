const request = require("supertest");
const mongoose = require("mongoose");
const axios = require("axios");
const app = require("../../src/app");
const Category = require("../../src/models/Category");
const Order = require("../../src/models/Order");
const Product = require("../../src/models/Product");
const emailService = require("../../src/services/emailService");
const {
  createVerifiedUser,
  accessTokenFor,
} = require("../helpers/authFixtures");

jest.mock("axios", () => {
  const actual = jest.requireActual("axios");
  const mock = { ...actual, post: jest.fn(), get: jest.fn() };
  mock.default = mock;
  return mock;
});

const BASE = "/api/v1/admin/orders/refund";
let counter = 0;
const uniqueToken = (prefix) => `${prefix}-${Date.now()}-${counter++}`;
const auth = (token) => ({ Authorization: `Bearer ${token}` });

const address = () => ({
  fullName: "Refund Parent",
  phone: "9876543210",
  houseName: "Green Villa",
  street: "12 Main Street",
  city: "Kochi",
  state: "Kerala",
  pincode: "682001",
  country: "India",
});

async function createOrder(overrides = {}) {
  const token = uniqueToken("refund");
  return Order.create({
    orderId: `REF-${token}`.toUpperCase(),
    items: [
      {
        productId: new mongoose.Types.ObjectId(),
        quantity: 2,
        price: 250,
        regularPrice: 300,
        name: "Refund fixture product",
        sku: `REF-${token}`.toUpperCase(),
        image: "https://example.com/refund.jpg",
        urlKey: "refund-fixture-product",
      },
    ],
    totalQuantity: 2,
    totalAmount: 500,
    subtotal: 500,
    shippingCost: 0,
    discount: 0,
    shippingAddress: address(),
    paymentStatus: "paid",
    orderStatus: "processing",
    paymentMethod: "RAZORPAY",
    phonepeTransactionId: `pay_${token}`,
    placedAt: new Date(),
    statusHistory: [{ status: "processing", timestamp: new Date() }],
    ...overrides,
  });
}

describe("Refund surface", () => {
  let superAdminToken;

  beforeEach(async () => {
    process.env.RAZORPAY_KEY_ID = "rzp_test_key";
    process.env.RAZORPAY_KEY_SECRET = "rzp_test_secret";
    emailService.sendRefundInitiatedEmail.mockResolvedValue({ success: true });
    const superAdmin = await createVerifiedUser({ role: "super-admin" });
    superAdminToken = accessTokenFor(superAdmin);
  });

  it("requires authentication and super-admin privileges", async () => {
    const order = await createOrder();
    const body = { orderId: order.orderId, refundAmount: 50000 };

    const anonymous = await request(app).post(BASE).send(body);
    expect(anonymous.status).toBe(401);

    const admin = await createVerifiedUser({ role: "admin" });
    const denied = await request(app)
      .post(BASE)
      .set(auth(accessTokenFor(admin)))
      .send(body);
    expect(denied.status).toBe(403);
    expect(denied.body.message).toMatch(/developer or super-admin/i);

    const regular = await createVerifiedUser({ role: "user" });
    const regularDenied = await request(app)
      .post(BASE)
      .set(auth(accessTokenFor(regular)))
      .send(body);
    expect(regularDenied.status).toBe(403);
  });

  it("validates the order id and rejects ineligible orders and amounts", async () => {
    const missing = await request(app)
      .post(BASE)
      .set(auth(superAdminToken))
      .send({});
    expect(missing.status).toBe(400);
    expect(missing.body.message).toMatch(/orderId is required/i);

    const unknown = await request(app)
      .post(BASE)
      .set(auth(superAdminToken))
      .send({ orderId: "REF-DOES-NOT-EXIST" });
    expect(unknown.status).toBe(404);
    expect(unknown.body.message).toMatch(/order not found/i);

    const cod = await createOrder({ paymentMethod: "COD" });
    const unsupported = await request(app)
      .post(BASE)
      .set(auth(superAdminToken))
      .send({ orderId: cod.orderId });
    expect(unsupported.status).toBe(400);
    expect(unsupported.body.message).toMatch(/not supported/i);

    const unpaid = await createOrder({
      paymentMethod: "PHONEPE",
      phonepeTransactionId: "pp_unpaid",
      paymentStatus: "pending",
    });
    const notPaid = await request(app)
      .post(BASE)
      .set(auth(superAdminToken))
      .send({ orderId: unpaid.orderId });
    expect(notPaid.status).toBe(400);
    expect(notPaid.body.message).toMatch(/payment status: pending/i);

    const paid = await createOrder({
      paymentMethod: "PHONEPE",
      phonepeTransactionId: "pp_paid",
    });
    const excessive = await request(app)
      .post(BASE)
      .set(auth(superAdminToken))
      .send({ orderId: paid.orderId, refundAmount: 60000 });
    expect(excessive.status).toBe(400);
    expect(excessive.body.message).toMatch(/invalid refund amount/i);
  });

  it("processes a full Razorpay refund, cancels the order, and restores stock", async () => {
    const category = await Category.create({
      name: `Refund Category ${Date.now()}`,
      code: `refund-category-${Date.now()}`,
      isActive: true,
    });
    const product = await Product.create({
      title: "Refund stock product",
      description: "Stock restoration fixture",
      category: category._id,
      categoryName: category.name,
      categoryCode: category.code,
      url_key: uniqueToken("refund-stock"),
      sku: uniqueToken("REFUND-STOCK").toUpperCase(),
      status: "published",
      product_type: "SIMPLE",
      price: 250,
      stock: 3,
      stockObj: { available: 3, isInStock: true },
      images: ["https://example.com/product.jpg"],
    });
    const order = await createOrder();
    order.items[0].productId = product._id;
    await order.save();

    axios.post.mockResolvedValue({
      data: { id: "rfnd_full", status: "processed", amount: 50000 },
    });

    const response = await request(app)
      .post(BASE)
      .set(auth(superAdminToken))
      .send({ orderId: order.orderId, reason: "Damaged on arrival" });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      refund: {
        refundId: "rfnd_full",
        state: "COMPLETED",
        amount: 50000,
        merchantRefundId: "rfnd_full",
        orderId: order.orderId,
      },
    });

    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining(`/payments/${order.phonepeTransactionId}/refund`),
      expect.objectContaining({ amount: 50000, speed: "normal" }),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Basic /),
        }),
      }),
    );

    const updated = await Order.findById(order._id).lean();
    expect(updated.paymentStatus).toBe("refunded");
    expect(updated.refundStatus).toBe("COMPLETED");
    expect(updated.refundId).toBe("rfnd_full");
    expect(updated.refundAmountPaise).toBe(50000);
    expect(updated.refundReason).toBe("Damaged on arrival");
    expect(updated.orderStatus).toBe("cancelled");
    expect(updated.statusHistory.at(-1)).toMatchObject({
      status: "cancelled",
      note: "Order cancelled automatically due to refund: Damaged on arrival",
    });
    expect(updated.refundAttempts).toHaveLength(1);
    expect(updated.refundAttempts[0]).toMatchObject({
      merchantRefundId: "rfnd_full",
      state: "COMPLETED",
      amountPaise: 50000,
    });

    const restored = await Product.findById(product._id).lean();
    expect(restored.stock).toBe(5);
    expect(restored.stockObj.available).toBe(5);
    expect(emailService.sendRefundInitiatedEmail).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ orderId: order.orderId }),
      50000,
    );
  });

  it("does not duplicate cancellation history for an already cancelled order", async () => {
    const cancelledAt = new Date("2026-01-01T00:00:00.000Z");
    const order = await createOrder({
      orderStatus: "cancelled",
      statusHistory: [
        { status: "processing", timestamp: new Date("2025-12-31T00:00:00.000Z") },
        { status: "cancelled", timestamp: cancelledAt },
      ],
    });
    axios.post.mockResolvedValue({
      data: { id: "rfnd_cancelled", status: "pending", amount: 50000 },
    });

    const response = await request(app)
      .post(BASE)
      .set(auth(superAdminToken))
      .send({ orderId: order.orderId });

    expect(response.status).toBe(200);
    const updated = await Order.findById(order._id).lean();
    expect(updated.orderStatus).toBe("cancelled");
    expect(updated.statusHistory).toHaveLength(2);
    expect(updated.refundStatus).toBe("PENDING");
  });

  it("polls Razorpay status and resolves refund attempts", async () => {
    const refundId = "rfnd_status";
    const order = await createOrder({
      orderStatus: "cancelled",
      refundId,
      refundStatus: "PENDING",
      refundAttempts: [
        {
          merchantRefundId: refundId,
          state: "PENDING",
          amountPaise: 50000,
          initiatedAt: new Date(),
        },
      ],
    });
    axios.get.mockResolvedValue({
      data: { id: refundId, status: "processed", amount: 50000 },
    });

    const completed = await request(app)
      .get(`${BASE}/${refundId}`)
      .set(auth(superAdminToken));
    expect(completed.status).toBe(200);
    expect(completed.body.refundStatus).toMatchObject({
      merchantRefundId: refundId,
      state: "COMPLETED",
      amount: 50000,
    });

    const afterComplete = await Order.findById(order._id).lean();
    expect(afterComplete.refundStatus).toBe("COMPLETED");
    expect(afterComplete.refundedAt).toBeInstanceOf(Date);
    expect(afterComplete.refundAttempts[0].state).toBe("COMPLETED");
    expect(afterComplete.refundAttempts[0].resolvedAt).toBeInstanceOf(Date);

    axios.get.mockResolvedValue({
      data: { id: refundId, status: "failed", amount: 50000 },
    });
    const failed = await request(app)
      .get(`${BASE}/${refundId}`)
      .set(auth(superAdminToken));
    expect(failed.status).toBe(200);
    expect(failed.body.refundStatus.state).toBe("FAILED");

    const afterFailure = await Order.findById(order._id).lean();
    expect(afterFailure.refundStatus).toBe("FAILED");
    expect(afterFailure.paymentStatus).toBe("paid");
  });
});
