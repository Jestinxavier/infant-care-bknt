// uuid@14 is ESM-only and cannot be parsed by Jest's CJS runtime (same
// constraint that setup.js handles for nanoid). Mock it for this suite.
jest.mock("uuid", () => ({ v4: () => "00000000-0000-4000-8000-000000000000" }));

const request = require("supertest");
const app = require("../../src/app");
const User = require("../../src/models/user");
const maintenanceService = require("../../src/services/maintenanceService");

describe("Maintenance Mode", () => {
  let adminToken;
  let userToken;

  // Login returns tokens as httpOnly cookies (no body token), so read the
  // access token from the Set-Cookie header and use it as a Bearer token.
  const login = async (email, password) => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password });
    const cookies = res.headers["set-cookie"] || [];
    const accessCookie = cookies.find((c) => c.startsWith("access_token="));
    if (!accessCookie) {
      throw new Error(
        `Login failed (${res.statusCode}): ${JSON.stringify(res.body)}`
      );
    }
    return accessCookie.split(";")[0].split("=")[1];
  };

  beforeEach(async () => {
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const adminEmail = `maint_admin_${suffix}@example.com`;
    const userEmail = `maint_user_${suffix}@example.com`;

    await User.create({
      username: `maint_admin_${suffix}`,
      email: adminEmail,
      password: "Password123!",
      role: "admin",
      isEmailVerified: true,
    });
    await User.create({
      username: `maint_user_${suffix}`,
      email: userEmail,
      password: "Password123!",
      role: "user",
      isEmailVerified: true,
    });

    adminToken = await login(adminEmail, "Password123!");
    userToken = await login(userEmail, "Password123!");
  });

  afterEach(() => {
    maintenanceService._resetMaintenanceCache();
  });

  const enable = (body = {}) =>
    request(app)
      .put("/api/v1/admin/settings/maintenance")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ enabled: true, ...body });

  it("returns 503 for customer endpoints when enabled", async () => {
    const res = await enable({
      title: "Down for upgrades",
      message: "Back shortly",
      reopenAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body.maintenance.enabled).toBe(true);

    const blocked = await request(app).get("/api/v1/wishlist");
    expect(blocked.statusCode).toEqual(503);
    expect(blocked.body.success).toBe(false);
    expect(blocked.body.maintenance.enabled).toBe(true);
    expect(blocked.body.maintenance.title).toBe("Down for upgrades");
    expect(blocked.headers["retry-after"]).toBeDefined();
  });

  it("keeps public settings and admin routes available while enabled", async () => {
    await enable();

    const publicState = await request(app).get("/api/v1/settings/maintenance");
    expect(publicState.statusCode).toEqual(200);
    expect(publicState.body.maintenance.enabled).toBe(true);

    const adminSettings = await request(app)
      .get("/api/v1/admin/settings")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(adminSettings.statusCode).toEqual(200);
  });

  it("allows read-only public content while enabled", async () => {
    await enable();
    const res = await request(app).get("/api/v1/cms/about");
    expect(res.statusCode).not.toEqual(503);
  });

  it("lets admins bypass enforcement", async () => {
    await enable();

    const bypass = await request(app)
      .get("/api/v1/wishlist")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(bypass.statusCode).not.toEqual(503);

    const stateRes = await request(app)
      .get("/api/v1/settings/maintenance")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(stateRes.body.maintenance.staffBypass).toBe(true);
  });

  it("does not let regular users bypass enforcement", async () => {
    await enable();

    const blocked = await request(app)
      .get("/api/v1/wishlist")
      .set("Authorization", `Bearer ${userToken}`);
    expect(blocked.statusCode).toEqual(503);
  });

  it("restores access when disabled", async () => {
    await enable();
    const disable = await request(app)
      .put("/api/v1/admin/settings/maintenance")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ enabled: false });
    expect(disable.statusCode).toEqual(200);

    const after = await request(app).get("/api/v1/wishlist");
    expect(after.statusCode).not.toEqual(503);
  });

  it("rejects invalid reopen dates", async () => {
    const res = await request(app)
      .put("/api/v1/admin/settings/maintenance")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ enabled: true, reopenAt: "not-a-date" });
    expect(res.statusCode).toEqual(422);
  });

  it("requires an admin to update maintenance settings", async () => {
    const res = await request(app)
      .put("/api/v1/admin/settings/maintenance")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ enabled: true });
    expect([401, 403]).toContain(res.statusCode);
  });

  it("auto-disables once the expected reopen time has passed", async () => {
    await enable({ reopenAt: new Date(Date.now() - 60_000).toISOString() });

    const state = await request(app).get("/api/v1/settings/maintenance");
    expect(state.body.maintenance.enabled).toBe(false);

    const after = await request(app).get("/api/v1/wishlist");
    expect(after.statusCode).not.toEqual(503);
  });

  it("persists title and message across cache resets", async () => {
    await enable({ title: "Scheduled work", message: "We are polishing things" });
    maintenanceService._resetMaintenanceCache();

    const fresh = await request(app).get("/api/v1/settings/maintenance");
    expect(fresh.body.maintenance.title).toBe("Scheduled work");
    expect(fresh.body.maintenance.message).toBe("We are polishing things");
  });
});
