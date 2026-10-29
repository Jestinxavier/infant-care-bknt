const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../../src/app");
const SystemErrorLog = require("../../src/models/SystemErrorLog");
const {
  createVerifiedUser,
  accessTokenFor,
} = require("../helpers/authFixtures");

let counter = 0;
const unique = (prefix) => `${prefix}-${Date.now()}-${counter++}`;
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const missingId = () => new mongoose.Types.ObjectId().toString();

const makeLog = async (overrides = {}) =>
  SystemErrorLog.create({
    message: `Failure ${unique("ERR")}`,
    reason: "stack trace",
    source: "unit-test",
    method: "GET",
    endpoint: "/api/v1/products",
    statusCode: 500,
    errorType: "Error",
    userId: new mongoose.Types.ObjectId(),
    metadata: { secret: "raw detail" },
    environment: "development",
    createdAt: new Date(),
    ...overrides,
  });

const adminToken = async (role = "super-admin") => {
  const user = await createVerifiedUser({ role });
  return accessTokenFor(user);
};

describe("Error log surface", () => {
  it("denies regular users and allows read-only admins", async () => {
    const regular = await createVerifiedUser({ role: "user" });
    const admin = await adminToken("admin");
    await makeLog();

    const forbidden = await request(app)
      .get("/api/v1/admin/error-logs")
      .set(auth(accessTokenFor(regular)));
    const allowed = await request(app)
      .get("/api/v1/admin/error-logs")
      .set(auth(admin));

    expect(forbidden.statusCode).toBe(403);
    expect(allowed.statusCode).toBe(200);
    expect(allowed.body.success).toBe(true);
    expect(allowed.body.data).toHaveLength(1);
  });

  it("filters by source, status, search, and date with pagination metadata", async () => {
    const token = await adminToken();
    const now = Date.now();
    const oldDate = new Date(now - 7 * 24 * 60 * 60 * 1000);

    await Promise.all([
      makeLog({
        message: "Checkout exploded",
        source: "CheckoutController",
        statusCode: 500,
        createdAt: new Date(now),
      }),
      makeLog({
        message: "Checkout validation failed",
        source: "CheckoutController",
        statusCode: 400,
        createdAt: new Date(now - 60_000),
      }),
      makeLog({
        message: "Old payment failure",
        source: "PaymentService",
        statusCode: 500,
        createdAt: oldDate,
      }),
    ]);

    const bySource = await request(app)
      .get("/api/v1/admin/error-logs?source=checkout&limit=1&page=1")
      .set(auth(token));
    expect(bySource.statusCode).toBe(200);
    expect(bySource.body.data).toHaveLength(1);
    expect(bySource.body.data[0].source).toBe("CheckoutController");
    expect(bySource.body.pagination).toMatchObject({
      page: 1,
      limit: 1,
      total: 2,
      totalPages: 2,
    });
    expect(bySource.body.meta.sources).toEqual(
      expect.arrayContaining(["CheckoutController", "PaymentService"])
    );

    const byStatus = await request(app)
      .get("/api/v1/admin/error-logs?statusCode=500")
      .set(auth(token));
    expect(byStatus.body.data).toHaveLength(2);

    const bySearch = await request(app)
      .get("/api/v1/admin/error-logs?search=exploded")
      .set(auth(token));
    expect(bySearch.body.data).toHaveLength(1);
    expect(bySearch.body.data[0].message).toBe("Checkout exploded");

    const byDate = await request(app)
      .get(`/api/v1/admin/error-logs?from=${encodeURIComponent(new Date(now - 3_600_000).toISOString())}`)
      .set(auth(token));
    expect(byDate.body.data).toHaveLength(2);
    expect(byDate.body.data.every((log) => log.source === "CheckoutController")).toBe(true);
  });

  it("strips raw internals for read-only admins but returns them to super-admins", async () => {
    const [admin, superAdmin] = await Promise.all([
      adminToken("admin"),
      adminToken("super-admin"),
    ]);
    const log = await makeLog();

    const readOnly = await request(app)
      .get("/api/v1/admin/error-logs")
      .set(auth(admin));
    const full = await request(app)
      .get("/api/v1/admin/error-logs")
      .set(auth(superAdmin));

    expect(readOnly.body.data).toHaveLength(1);
    expect(readOnly.body.data[0]).not.toHaveProperty("reason");
    expect(readOnly.body.data[0]).not.toHaveProperty("metadata");
    expect(readOnly.body.data[0]).not.toHaveProperty("userId");

    expect(full.body.data).toHaveLength(1);
    expect(full.body.data[0]).toMatchObject({
      _id: log._id.toString(),
      reason: "stack trace",
      metadata: { secret: "raw detail" },
      userId: log.userId.toString(),
    });
  });

  it("deletes one log, reports missing ids, and clears all logs", async () => {
    const token = await adminToken();
    const first = await makeLog();
    await makeLog();

    const denied = await request(app)
      .delete(`/api/v1/admin/error-logs/${first._id}`)
      .set(auth(await adminToken("admin")));
    expect(denied.statusCode).toBe(403);

    const removed = await request(app)
      .delete(`/api/v1/admin/error-logs/${first._id}`)
      .set(auth(token));
    expect(removed.statusCode).toBe(200);
    expect(removed.body).toEqual({ success: true, message: "Log deleted" });

    const missing = await request(app)
      .delete(`/api/v1/admin/error-logs/${missingId()}`)
      .set(auth(token));
    expect(missing.statusCode).toBe(404);

    const cleared = await request(app)
      .delete("/api/v1/admin/error-logs")
      .set(auth(token));
    expect(cleared.statusCode).toBe(200);
    expect(cleared.body.message).toMatch(/Cleared 1 error log/);
    expect(await SystemErrorLog.countDocuments()).toBe(0);
  });
});
