const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../../src/app");
const Notification = require("../../src/models/Notification");
const DeliveryPartner = require("../../src/models/DeliveryPartner");
const Coupon = require("../../src/models/Coupon");
const Category = require("../../src/models/Category");
const Product = require("../../src/models/Product");
const {
  createVerifiedUser,
  accessTokenFor,
} = require("../helpers/authFixtures");

let counter = 0;
const uniqueToken = (prefix) => `${prefix}-${Date.now()}-${counter++}`;
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const missingId = () => new mongoose.Types.ObjectId().toString();
const futureDate = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const pastDate = () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

const couponPayload = (overrides = {}) => ({
  code: `ACC${Date.now()}${counter}`,
  type: "percentage",
  value: 10,
  maxDiscount: 100,
  minCartValue: 500,
  startDate: new Date(Date.now() - 60 * 1000).toISOString(),
  endDate: futureDate(),
  perUserLimit: 2,
  ...overrides,
});

describe("Admin operations surface", () => {
  let adminToken;
  let userToken;

  beforeEach(async () => {
    const admin = await createVerifiedUser({ role: "admin" });
    const user = await createVerifiedUser();
    adminToken = accessTokenFor(admin);
    userToken = accessTokenFor(user);
  });

  it("rejects non-admin users", async () => {
    expect(
      (await request(app).get("/api/v1/admin/notifications").set(auth(userToken)))
        .status,
    ).toBe(403);
    expect(
      (await request(app).get("/api/v1/admin/coupons").set(auth(userToken))).status,
    ).toBe(403);
    expect(
      (await request(app).get("/api/v1/admin/delivery-partners").set(auth(userToken)))
        .status,
    ).toBe(403);
    expect(
      (await request(app).get("/api/v1/admin/customers").set(auth(userToken))).status,
    ).toBe(403);
  });

  it("serves, reads, and deletes notifications", async () => {
    const unread = await Notification.create({
      type: "new_order",
      title: "New order",
      message: "A customer placed an order",
      orderId: "ORD123",
    });
    const read = await Notification.create({
      type: "system",
      title: "System notice",
      message: "Maintenance complete",
      isRead: true,
    });

    const listed = await request(app)
      .get("/api/v1/admin/notifications")
      .set(auth(adminToken));
    expect(listed.status).toBe(200);
    expect(listed.body.notifications).toHaveLength(2);
    expect(listed.body.unreadCount).toBe(1);

    const marked = await request(app)
      .patch(`/api/v1/admin/notifications/${unread._id}/read`)
      .set(auth(adminToken));
    expect(marked.status).toBe(200);
    expect(marked.body.notification.isRead).toBe(true);
    expect(marked.body.notification.readAt).toBeTruthy();

    const missingMark = await request(app)
      .patch(`/api/v1/admin/notifications/${missingId()}/read`)
      .set(auth(adminToken));
    expect(missingMark.status).toBe(404);

    const allRead = await request(app)
      .patch("/api/v1/admin/notifications/read-all")
      .set(auth(adminToken));
    expect(allRead.status).toBe(200);
    expect(await Notification.countDocuments({ isRead: false })).toBe(0);

    const removed = await request(app)
      .delete(`/api/v1/admin/notifications/${read._id}`)
      .set(auth(adminToken));
    expect(removed.status).toBe(200);
    expect(await Notification.countDocuments()).toBe(1);
  });

  it("creates, updates, lists, and deletes delivery partners", async () => {
    const token = uniqueToken("partner");
    const created = await request(app)
      .post("/api/v1/admin/delivery-partners")
      .set(auth(adminToken))
      .send({
        name: `Partner ${token}`,
        trackingUrlTemplate: `https://track.example.com/${token}/{trackingId}`,
      });
    expect(created.status).toBe(201);
    expect(created.body.data.isActive).toBe(true);

    const duplicate = await request(app)
      .post("/api/v1/admin/delivery-partners")
      .set(auth(adminToken))
      .send({
        name: `Partner ${token}`,
        trackingUrlTemplate: "https://track.example.com/{trackingId}",
      });
    expect(duplicate.status).toBe(400);
    expect(duplicate.body.message).toMatch(/already exists/i);

    const invalid = await request(app)
      .post("/api/v1/admin/delivery-partners")
      .set(auth(adminToken))
      .send({
        trackingUrlTemplate: "https://track.example.com/{trackingId}",
      });
    expect(invalid.status).toBe(400);

    const listed = await request(app)
      .get("/api/v1/admin/delivery-partners")
      .set(auth(adminToken));
    expect(listed.status).toBe(200);
    expect(
      listed.body.data.some((partner) => partner.name === `Partner ${token}`),
    ).toBe(true);

    const updated = await request(app)
      .patch(`/api/v1/admin/delivery-partners/${created.body.data._id}`)
      .set(auth(adminToken))
      .send({ isActive: false, name: `Partner ${token} updated` });
    expect(updated.status).toBe(200);
    expect(updated.body.data.isActive).toBe(false);
    expect(updated.body.data.name).toBe(`Partner ${token} updated`);

    const missingUpdate = await request(app)
      .patch(`/api/v1/admin/delivery-partners/${missingId()}`)
      .set(auth(adminToken))
      .send({ isActive: true });
    expect(missingUpdate.status).toBe(404);

    const removed = await request(app)
      .delete(`/api/v1/admin/delivery-partners/${created.body.data._id}`)
      .set(auth(adminToken));
    expect(removed.status).toBe(200);

    const missingDelete = await request(app)
      .delete(`/api/v1/admin/delivery-partners/${missingId()}`)
      .set(auth(adminToken));
    expect(missingDelete.status).toBe(404);
  });

  it("manages coupons and coupon product search", async () => {
    const payload = couponPayload();
    const created = await request(app)
      .post("/api/v1/admin/coupons")
      .set(auth(adminToken))
      .send(payload);
    expect(created.status).toBe(201);
    expect(created.body.coupon.code).toBe(payload.code.toUpperCase());
    expect(created.body.coupon.status).toBe("ACTIVE");

    const duplicate = await request(app)
      .post("/api/v1/admin/coupons")
      .set(auth(adminToken))
      .send({ ...payload, code: payload.code.toLowerCase() });
    expect(duplicate.status).toBe(400);
    expect(duplicate.body.errorCode).toBe("DUPLICATE_CODE");

    const missingFields = await request(app)
      .post("/api/v1/admin/coupons")
      .set(auth(adminToken))
      .send({ code: "MISSING" });
    expect(missingFields.status).toBe(400);

    const badRange = await request(app)
      .post("/api/v1/admin/coupons")
      .set(auth(adminToken))
      .send(couponPayload({ startDate: futureDate(), endDate: pastDate() }));
    expect(badRange.status).toBe(400);

    const badPercentage = await request(app)
      .post("/api/v1/admin/coupons")
      .set(auth(adminToken))
      .send(couponPayload({ value: 101 }));
    expect(badPercentage.status).toBe(400);

    const listed = await request(app)
      .get("/api/v1/admin/coupons")
      .set(auth(adminToken));
    expect(listed.status).toBe(200);
    expect(listed.body.coupons).toHaveLength(1);

    const updated = await request(app)
      .patch(`/api/v1/admin/coupons/${created.body.coupon._id}`)
      .set(auth(adminToken))
      .send({ minCartValue: 750, isActive: false });
    expect(updated.status).toBe(200);
    expect(updated.body.coupon.minCartValue).toBe(750);
    expect(updated.body.coupon.isActive).toBe(false);

    const missingUpdate = await request(app)
      .patch(`/api/v1/admin/coupons/${missingId()}`)
      .set(auth(adminToken))
      .send({ minCartValue: 100 });
    expect(missingUpdate.status).toBe(404);

    const category = await Category.create({
      name: `Coupon Category ${uniqueToken("cat")}`,
      code: `coupon-cat-${uniqueToken("code")}`,
    });
    const product = await Product.create({
      title: `Coupon Product ${uniqueToken("title")}`,
      description: "Coupon search fixture",
      category: category._id,
      categoryName: category.name,
      categoryCode: category.code,
      url_key: `coupon-product-${uniqueToken("url")}`,
      sku: `COUPON-${uniqueToken("sku")}`.toUpperCase(),
      status: "published",
      price: 100,
      stock: 1,
    });
    const searched = await request(app)
      .get("/api/v1/admin/coupons/product-search")
      .query({ q: "Coupon Product", category: category._id.toString() })
      .set(auth(adminToken));
    expect(searched.status).toBe(200);
    expect(searched.body.products.some((item) => item._id === product._id.toString())).toBe(
      true,
    );

    const removed = await request(app)
      .delete(`/api/v1/admin/coupons/${created.body.coupon._id}`)
      .set(auth(adminToken));
    expect(removed.status).toBe(200);
    expect(await Coupon.countDocuments()).toBe(0);
  });

  it("lists customers with stats and returns customer detail", async () => {
    const customer = await createVerifiedUser({
      username: uniqueToken("customer"),
      phone: "9998887776",
    });
    await createVerifiedUser({ role: "admin" });

    const listed = await request(app)
      .get("/api/v1/admin/customers")
      .query({ search: customer.email, limit: 100 })
      .set(auth(adminToken));
    expect(listed.status).toBe(200);
    expect(listed.body.customers).toHaveLength(1);
    expect(listed.body.customers[0]).toMatchObject({
      id: customer._id.toString(),
      email: customer.email,
      phone: "9998887776",
      orderCount: 0,
      totalSpent: 0,
    });

    const posted = await request(app)
      .post("/api/v1/admin/customers")
      .set(auth(adminToken))
      .send({ search: customer.email, sortBy: "totalSpent", sortOrder: 1 });
    expect(posted.status).toBe(200);
    expect(posted.body.customers).toHaveLength(1);

    const detail = await request(app)
      .get(`/api/v1/admin/customers/${customer._id}`)
      .set(auth(adminToken));
    expect(detail.status).toBe(200);
    expect(detail.body.customer.email).toBe(customer.email);
    expect(detail.body.addresses).toEqual([]);
    expect(detail.body.orders).toEqual([]);

    const missing = await request(app)
      .get(`/api/v1/admin/customers/${missingId()}`)
      .set(auth(adminToken));
    expect(missing.status).toBe(404);

    const noMatches = await request(app)
      .get("/api/v1/admin/customers")
      .query({ search: "no-such-customer-xyz" })
      .set(auth(adminToken));
    expect(noMatches.status).toBe(200);
    expect(noMatches.body.customers).toEqual([]);
  });
});
