// uuid@14 is ESM-only and cannot be parsed by Jest's CJS runtime (same
// constraint that setup.js handles for nanoid). Mock it for this suite.
jest.mock("uuid", () => ({ v4: () => "00000000-0000-4000-8000-000000000000" }));

const request = require("supertest");
const app = require("../../src/app");
const User = require("../../src/models/user");
const SiteSetting = require("../../src/models/SiteSetting");
const maintenanceService = require("../../src/services/maintenanceService");
const { accessTokenFor } = require("../helpers/authFixtures");

describe("Maintenance Mode", () => {
  let adminToken;
  let userToken;
  let userEmail;

  beforeEach(async () => {
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const adminEmail = `maint_admin_${suffix}@example.com`;
    userEmail = `maint_user_${suffix}@example.com`;

    const admin = await User.create({
      username: `maint_admin_${suffix}`,
      email: adminEmail,
      password: "Password123!",
      role: "admin",
      isEmailVerified: true,
    });
    const user = await User.create({
      username: `maint_user_${suffix}`,
      email: userEmail,
      password: "Password123!",
      role: "user",
      isEmailVerified: true,
    });

    // Mint tokens directly so the suite stays under the login rate limit.
    adminToken = accessTokenFor(admin);
    userToken = accessTokenFor(user);
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

  it("lets allowed testers bypass enforcement", async () => {
    const res = await enable({ allowedEmails: [userEmail.toUpperCase()] });
    expect(res.statusCode).toEqual(200);

    const bypass = await request(app)
      .get("/api/v1/wishlist")
      .set("Authorization", `Bearer ${userToken}`);
    expect(bypass.statusCode).not.toEqual(503);

    const stateRes = await request(app)
      .get("/api/v1/settings/maintenance")
      .set("Authorization", `Bearer ${userToken}`);
    expect(stateRes.body.maintenance.staffBypass).toBe(true);

    // Guests stay blocked.
    const guest = await request(app).get("/api/v1/wishlist");
    expect(guest.statusCode).toEqual(503);
  });

  it("blocks testers again once removed from the list", async () => {
    await enable({ allowedEmails: [userEmail] });
    await enable({ allowedEmails: [] });

    const blocked = await request(app)
      .get("/api/v1/wishlist")
      .set("Authorization", `Bearer ${userToken}`);
    expect(blocked.statusCode).toEqual(503);
  });

  it("does not expose the allowed tester list publicly", async () => {
    await enable({ allowedEmails: [userEmail] });

    const state = await request(app).get("/api/v1/settings/maintenance");
    expect(state.body.maintenance).not.toHaveProperty("allowedEmails");

    const publicSettings = await request(app).get(
      "/api/v1/settings/public?scope=maintenance"
    );
    expect(publicSettings.statusCode).toEqual(200);
    expect(publicSettings.body.settings).not.toHaveProperty(
      "maintenance.allowed_emails"
    );
  });

  it("keeps storefront login available while enabled", async () => {
    await enable();
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: userEmail, password: "Password123!" });
    expect(res.statusCode).not.toEqual(503);
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

  it("rejects enabling with a reopen time in the past", async () => {
    const res = await enable({
      reopenAt: new Date(Date.now() - 60_000).toISOString(),
    });
    expect(res.statusCode).toEqual(422);

    const state = await request(app).get("/api/v1/settings/maintenance");
    expect(state.body.maintenance.enabled).toBe(false);
  });

  it("rejects enabling when the stored reopen time has passed", async () => {
    await request(app)
      .put("/api/v1/admin/settings/maintenance")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ enabled: false, reopenAt: new Date(Date.now() + 3600_000).toISOString() });
    await SiteSetting.updateOne(
      { key: "maintenance.reopen_at" },
      { $set: { value: new Date(Date.now() - 60_000).toISOString() } }
    );
    await maintenanceService.invalidateMaintenanceCache();

    const res = await request(app)
      .put("/api/v1/admin/settings/maintenance")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ enabled: true });
    expect(res.statusCode).toEqual(422);
  });

  it("auto-disables once the expected reopen time has passed", async () => {
    await enable({ reopenAt: new Date(Date.now() + 3600_000).toISOString() });
    // Simulate the reopen time passing while maintenance is live.
    await SiteSetting.updateOne(
      { key: "maintenance.reopen_at" },
      { $set: { value: new Date(Date.now() - 60_000).toISOString() } }
    );
    await maintenanceService.invalidateMaintenanceCache();

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
