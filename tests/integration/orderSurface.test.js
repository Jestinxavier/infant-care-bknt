const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../../src/app");
const Order = require("../../src/models/Order");
const DeliveryPartner = require("../../src/models/DeliveryPartner");
const emailService = require("../../src/services/emailService");
const {
  createVerifiedUser,
  accessTokenFor,
  uniqueEmail,
} = require("../helpers/authFixtures");

let counter = 0;
const uniqueToken = (prefix) => `${prefix}-${Date.now()}-${counter++}`;
const uniqueOrderId = () => `ORD-${Date.now()}-${counter++}`;
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const missingId = () => new mongoose.Types.ObjectId().toString();

const address = () => ({
  fullName: "Order Parent",
  phone: "9876543210",
  houseName: "Green Villa",
  street: "12 Main Street",
  city: "Kochi",
  state: "Kerala",
  pincode: "682001",
  country: "India",
});

const createOrder = async ({
  user = null,
  orderId = uniqueOrderId(),
  orderStatus = "processing",
  paymentStatus = "pending",
  paymentMethod = "PHONEPE",
  guest = false,
  guestInfo,
  createdAt,
} = {}) => {
  const order = await Order.create({
    userId: user?._id || null,
    isGuestOrder: guest,
    guestInfo,
    orderId,
    items: [
      {
        productId: new mongoose.Types.ObjectId(),
        quantity: 2,
        price: 250,
        regularPrice: 300,
        name: "Order fixture product",
        sku: `ORDER-${counter++}`,
        image: "https://example.com/order.jpg",
        urlKey: "order-fixture-product",
      },
    ],
    totalQuantity: 2,
    totalAmount: 500,
    subtotal: 500,
    shippingCost: 0,
    discount: 0,
    shippingAddress: address(),
    paymentStatus,
    orderStatus,
    paymentMethod,
    placedAt: new Date(),
    statusHistory: [{ status: orderStatus, timestamp: new Date() }],
  });

  if (createdAt) {
    await Order.updateOne(
      { _id: order._id },
      { $set: { createdAt } },
      { timestamps: false },
    );
  }
  return order;
};

describe("Order surface", () => {
  let adminToken;

  beforeEach(async () => {
    emailService.sendShipmentEmail.mockResolvedValue({ success: true });
    emailService.sendInvoiceEmail.mockResolvedValue({ success: true });
    emailService.sendOrderConfirmationEmail.mockResolvedValue({ success: true });
    emailService.getOrderRecipient.mockImplementation((order) => {
      if (order.userId?.email) {
        return {
          email: order.userId.email,
          username: order.userId.username || order.userId.email,
        };
      }
      if (order.guestInfo?.email) {
        return {
          email: order.guestInfo.email,
          username: order.guestInfo.name || "Customer",
        };
      }
      return null;
    });

    const admin = await createVerifiedUser({ role: "admin" });
    adminToken = accessTokenFor(admin);
  });

  it("requires authentication for user order history and admin orders", async () => {
    expect((await request(app).get("/api/v1/orders")).status).toBe(401);
    expect(
      (await request(app).get(`/api/v1/orders/${uniqueOrderId()}`)).status,
    ).toBe(401);
    expect((await request(app).get("/api/v1/admin/orders")).status).toBe(401);
    expect(
      (await request(app).get("/api/v1/admin/orders/status-counts")).status,
    ).toBe(401);
  });

  it("lists and reads user orders with status filters and ownership", async () => {
    const user = await createVerifiedUser();
    const other = await createVerifiedUser();
    const token = accessTokenFor(user);
    const otherToken = accessTokenFor(other);
    const processing = await createOrder({
      user,
      orderStatus: "processing",
      paymentStatus: "paid",
    });
    await createOrder({
      user,
      orderStatus: "shipped",
      paymentStatus: "paid",
    });
    await createOrder({ user: other, orderStatus: "processing" });

    const listed = await request(app)
      .get("/api/v1/orders")
      .query({ limit: 1, page: 1 })
      .set(auth(token));
    expect(listed.status).toBe(200);
    expect(listed.body.total).toBe(2);
    expect(listed.body.totalPages).toBe(2);
    expect(listed.body.orders).toHaveLength(1);
    expect(listed.body.orders[0].priceObj.grandTotal).toBe(500);
    expect(listed.body.orders[0].itemCount).toBe(2);

    const filtered = await request(app)
      .get("/api/v1/orders")
      .query({ status: "processing", limit: 100 })
      .set(auth(token));
    expect(filtered.body.orders).toHaveLength(1);
    expect(filtered.body.orders[0]._id).toBe(processing._id.toString());

    const detail = await request(app)
      .get(`/api/v1/orders/${processing.orderId}`)
      .set(auth(token));
    expect(detail.status).toBe(200);
    expect(detail.body.order).toMatchObject({
      orderId: processing.orderId,
      status: "processing",
      itemCount: 2,
    });
    expect(detail.body.order.payment).toMatchObject({
      status: "paid",
      method: "PHONEPE",
    });
    expect(detail.body.order.priceObj.grandTotal).toBe(500);
    expect(detail.body.order.items[0].productName).toBe("Order fixture product");

    const byObjectId = await request(app)
      .get(`/api/v1/orders/${processing._id}`)
      .set(auth(token));
    expect(byObjectId.status).toBe(200);

    const forbidden = await request(app)
      .get(`/api/v1/orders/${processing.orderId}`)
      .set(auth(otherToken));
    expect(forbidden.status).toBe(404);

    const missing = await request(app)
      .get(`/api/v1/orders/${uniqueOrderId()}`)
      .set(auth(token));
    expect(missing.status).toBe(404);
  });

  it("supports guest lookup, payment status, claim, and convert", async () => {
    const guestEmail = uniqueEmail("guest");
    const guestOrder = await createOrder({
      orderId: uniqueOrderId(),
      guest: true,
      guestInfo: {
        name: "Guest Parent",
        email: guestEmail,
        phone: "9876543210",
      },
      paymentStatus: "pending",
    });

    expect(
      (await request(app).get("/api/v1/orders/guest-lookup")).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .get("/api/v1/orders/guest-lookup")
          .query({ orderId: guestOrder.orderId, email: "wrong@example.com" })
      ).status,
    ).toBe(404);

    const lookedUp = await request(app)
      .get("/api/v1/orders/guest-lookup")
      .query({ orderId: guestOrder.orderId, phone: "98765 43210" });
    expect(lookedUp.status).toBe(200);
    expect(lookedUp.body.order).toMatchObject({
      orderId: guestOrder.orderId,
      itemCount: 2,
      totalAmount: 500,
    });
    expect(lookedUp.body.order.guestInfo).toBeUndefined();

    expect(
      (await request(app).get("/api/v1/orders/payment-status/missing")).status,
    ).toBe(404);
    const paymentStatus = await request(app).get(
      `/api/v1/orders/payment-status/${guestOrder.orderId}`,
    );
    expect(paymentStatus.status).toBe(200);
    expect(paymentStatus.body).toMatchObject({
      paymentStatus: "pending",
      orderStatus: "processing",
      totalAmount: 500,
    });

    const claimer = await createVerifiedUser({ email: guestEmail });
    const claimToken = accessTokenFor(claimer);
    expect(
      (
        await request(app)
          .post("/api/v1/orders/guest-claim")
          .set(auth(claimToken))
          .send({})
      ).status,
    ).toBe(400);
    const claimed = await request(app)
      .post("/api/v1/orders/guest-claim")
      .set(auth(claimToken))
      .send({ orderId: guestOrder.orderId });
    expect(claimed.status).toBe(200);
    expect(await Order.findById(guestOrder._id).then((o) => o.userId.toString())).toBe(
      claimer._id.toString(),
    );

    const convertEmail = uniqueEmail("convert");
    const convertOrder = await createOrder({
      orderId: uniqueOrderId(),
      guest: true,
      guestInfo: {
        name: "Convert Parent",
        email: convertEmail,
        phone: "9876543211",
      },
    });
    expect(
      (
        await request(app)
          .post("/api/v1/orders/guest-convert")
          .send({ orderId: convertOrder.orderId })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app).post("/api/v1/orders/guest-convert").send({
          orderId: uniqueOrderId(),
          email: convertEmail,
          password: "Password123!",
        })
      ).status,
    ).toBe(404);

    const converted = await request(app)
      .post("/api/v1/orders/guest-convert")
      .send({
        orderId: convertOrder.orderId,
        email: convertEmail,
        password: "Password123!",
        username: "Convert Parent",
      });
    expect(converted.status).toBe(201);
    expect(converted.body.user.email).toBe(convertEmail);
    expect(converted.headers["set-cookie"].join(";")).toContain("access_token=");
  });

  it("serves admin order lists, status counts, details, and exports", async () => {
    const user = await createVerifiedUser();
    const first = await createOrder({
      user,
      orderStatus: "processing",
      paymentStatus: "paid",
    });
    const second = await createOrder({
      user,
      orderStatus: "shipped",
      paymentStatus: "paid",
    });

    const listed = await request(app)
      .get("/api/v1/admin/orders")
      .query({ limit: 100 })
      .set(auth(adminToken));
    expect(listed.status).toBe(200);
    expect(listed.body.orders).toHaveLength(2);
    expect(listed.body.summary.totalAmount).toBe(1000);
    expect(listed.body.pagination.total).toBe(2);
    expect(listed.body.orders[0].customerName).toBe(user.username);

    const posted = await request(app)
      .post("/api/v1/admin/orders")
      .set(auth(adminToken))
      .send({ status: "processing", limit: 100 });
    expect(posted.status).toBe(200);
    expect(posted.body.orders).toHaveLength(1);

    const counts = await request(app)
      .get("/api/v1/admin/orders/status-counts")
      .set(auth(adminToken));
    expect(counts.status).toBe(200);
    expect(counts.body.total).toBe(2);
    expect(counts.body.totalAmount).toBe(1000);
    expect(counts.body.counts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "processing", count: 1, amount: 500 }),
        expect.objectContaining({ status: "shipped", count: 1, amount: 500 }),
      ]),
    );

    const detail = await request(app)
      .get(`/api/v1/admin/orders/${first.orderId}`)
      .set(auth(adminToken));
    expect(detail.status).toBe(200);
    expect(detail.body.order.orderId).toBe(first.orderId);
    expect(detail.body.order.items).toHaveLength(1);

    const detailByObjectId = await request(app)
      .post(`/api/v1/admin/orders/${first._id}`)
      .set(auth(adminToken))
      .send({});
    expect(detailByObjectId.status).toBe(200);

    const missing = await request(app)
      .get(`/api/v1/admin/orders/${uniqueOrderId()}`)
      .set(auth(adminToken));
    expect(missing.status).toBe(404);

    const exported = await request(app)
      .get("/api/v1/admin/orders/export")
      .set(auth(adminToken));
    expect(exported.status).toBe(200);
    expect(exported.headers["content-type"]).toMatch(/text\/csv/);
    expect(exported.text).toContain("Order ID");
    expect(exported.text).toContain(first.orderId);

    const itemExport = await request(app)
      .post("/api/v1/admin/orders/export")
      .set(auth(adminToken))
      .send({ type: "items", orderIds: [second._id.toString()] });
    expect(itemExport.status).toBe(200);
    expect(itemExport.text).toContain("Unit Price (INR)");
    expect(itemExport.text).toContain(second.orderId);

    const invalidExport = await request(app)
      .post("/api/v1/admin/orders/export")
      .set(auth(adminToken))
      .send({ type: "invalid" });
    expect(invalidExport.status).toBe(400);
  });

  it("validates and applies order status transitions", async () => {
    const user = await createVerifiedUser();
    const order = await createOrder({
      user,
      orderStatus: "processing",
      paymentStatus: "pending",
      paymentMethod: "COD",
    });
    const partner = await DeliveryPartner.create({
      name: `Order Partner ${uniqueToken("partner")}`,
      trackingUrlTemplate: "https://track.example.com/{trackingId}",
    });

    const missingOrder = await request(app)
      .patch("/api/v1/admin/orders/update-status")
      .set(auth(adminToken))
      .send({});
    expect(missingOrder.status).toBe(400);

    const notFound = await request(app)
      .patch("/api/v1/admin/orders/update-status")
      .set(auth(adminToken))
      .send({ orderId: uniqueOrderId(), status: "shipped" });
    expect(notFound.status).toBe(404);

    const invalidStatus = await request(app)
      .patch("/api/v1/admin/orders/update-status")
      .set(auth(adminToken))
      .send({ orderId: order.orderId, status: "teleported" });
    expect(invalidStatus.status).toBe(400);

    const invalidTransition = await request(app)
      .patch("/api/v1/admin/orders/update-status")
      .set(auth(adminToken))
      .send({ orderId: order.orderId, status: "delivered" });
    expect(invalidTransition.status).toBe(422);
    expect(invalidTransition.body.errorCode).toBe("INVALID_TRANSITION");

    const missingFulfillment = await request(app)
      .patch("/api/v1/admin/orders/update-status")
      .set(auth(adminToken))
      .send({ orderId: order.orderId, status: "shipped" });
    expect(missingFulfillment.status).toBe(400);

    const shipped = await request(app)
      .patch("/api/v1/admin/orders/update-status")
      .set(auth(adminToken))
      .send({
        orderId: order.orderId,
        status: "shipped",
        trackingId: "TRACK123",
        deliveryNote: "Left at reception",
        deliveryPartner: { name: partner.name },
      });
    expect(shipped.status).toBe(200);
    expect(shipped.body.order.orderStatus).toBe("shipped");
    expect(shipped.body.order.trackingId).toBe("TRACK123");
    expect(shipped.body.order.deliveryPartner.name).toBe(partner.name);

    const delivered = await request(app)
      .patch("/api/v1/admin/orders/update-status")
      .set(auth(adminToken))
      .send({ orderId: order.orderId, status: "delivered" });
    expect(delivered.status).toBe(200);
    expect(delivered.body.order.orderStatus).toBe("delivered");
    expect(delivered.body.order.paymentStatus).toBe("pending");
  });

  it("marks online and COD payments as paid with guards", async () => {
    const user = await createVerifiedUser();
    const online = await createOrder({
      user,
      orderStatus: "pending",
      paymentStatus: "pending",
      paymentMethod: "PHONEPE",
    });
    const cod = await createOrder({
      user,
      orderStatus: "delivered",
      paymentStatus: "pending",
      paymentMethod: "COD",
    });
    const undeliveredCod = await createOrder({
      user,
      orderStatus: "processing",
      paymentStatus: "pending",
      paymentMethod: "COD",
    });

    expect(
      (
        await request(app)
          .patch("/api/v1/admin/orders/mark-paid")
          .set(auth(adminToken))
          .send({})
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .patch("/api/v1/admin/orders/mark-paid")
          .set(auth(adminToken))
          .send({ orderId: online.orderId })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .patch("/api/v1/admin/orders/mark-paid")
          .set(auth(adminToken))
          .send({
            orderId: uniqueOrderId(),
            phonepeTransactionId: "TXN-MISSING",
          })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .patch("/api/v1/admin/orders/mark-paid")
          .set(auth(adminToken))
          .send({ orderId: cod.orderId, phonepeTransactionId: "TXN-COD" })
      ).status,
    ).toBe(400);

    const markedOnline = await request(app)
      .patch("/api/v1/admin/orders/mark-paid")
      .set(auth(adminToken))
      .send({ orderId: online.orderId, phonepeTransactionId: "TXN-ONLINE" });
    expect(markedOnline.status).toBe(200);
    expect(markedOnline.body.order).toMatchObject({
      paymentStatus: "paid",
      orderStatus: "confirmed",
      phonepeTransactionId: "TXN-ONLINE",
    });

    expect(
      (
        await request(app)
          .patch("/api/v1/admin/orders/mark-paid")
          .set(auth(adminToken))
          .send({ orderId: online.orderId, phonepeTransactionId: "TXN-AGAIN" })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .patch("/api/v1/admin/orders/mark-cod-paid")
          .set(auth(adminToken))
          .send({})
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .patch("/api/v1/admin/orders/mark-cod-paid")
          .set(auth(adminToken))
          .send({ orderId: online.orderId })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .patch("/api/v1/admin/orders/mark-cod-paid")
          .set(auth(adminToken))
          .send({ orderId: undeliveredCod.orderId })
      ).status,
    ).toBe(400);

    const markedCod = await request(app)
      .patch("/api/v1/admin/orders/mark-cod-paid")
      .set(auth(adminToken))
      .send({ orderId: cod.orderId });
    expect(markedCod.status).toBe(200);
    expect(markedCod.body.order.paymentStatus).toBe("paid");
    expect(markedCod.body.order.orderStatus).toBe("delivered");
    expect(markedCod.body.order.statusHistory.at(-1).note).toMatch(/COD/i);
  });

  it("sends invoices and validates invoice requests", async () => {
    const user = await createVerifiedUser();
    const order = await createOrder({ user, paymentStatus: "paid" });

    expect(
      (
        await request(app)
          .post("/api/v1/admin/orders/send-invoice")
          .set(auth(adminToken))
          .send({})
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post("/api/v1/admin/orders/send-invoice")
          .set(auth(adminToken))
          .send({ orderId: uniqueOrderId() })
      ).status,
    ).toBe(404);

    const sent = await request(app)
      .post("/api/v1/admin/orders/send-invoice")
      .set(auth(adminToken))
      .send({ orderId: order.orderId });
    expect(sent.status).toBe(200);
    expect(sent.body.message).toMatch(/invoice/i);
  });
});
