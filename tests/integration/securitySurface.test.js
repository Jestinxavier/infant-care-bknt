const request = require("supertest");
const app = require("../../src/app");
const User = require("../../src/models/user");
const { extractAccessToken } = require("../helpers/authHelpers");

const uniqueEmail = (prefix) =>
  `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}@example.com`;

const createUser = async (overrides = {}) => {
  const email = overrides.email || uniqueEmail("security");
  const user = await User.create({
    username: `security${Date.now()}${Math.floor(Math.random() * 1000)}`,
    email,
    password: "Password123!",
    role: "user",
    isEmailVerified: true,
    ...overrides,
    email,
  });
  return user;
};

const login = async (email, password = "Password123!") => {
  const response = await request(app)
    .post("/api/v1/auth/login")
    .send({ email, password });
  return { response, token: extractAccessToken(response) };
};

describe("Security surface", () => {
  it("sets baseline security headers and hides the framework banner", async () => {
    const response = await request(app).get("/");

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(response.headers["content-security-policy"]).toBeTruthy();
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });

  it("allows credentialed CORS preflight for configured request headers", async () => {
    const origin = "http://localhost:3000";
    const response = await request(app)
      .options("/api/v1/product/all")
      .set("Origin", origin)
      .set("Access-Control-Request-Method", "GET")
      .set("Access-Control-Request-Headers", "authorization,content-type");

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(origin);
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(response.headers["access-control-allow-headers"]).toMatch(/authorization/i);
    expect(response.headers["access-control-allow-methods"]).toMatch(/PATCH/);
  });

  it("does not treat Mongo operator objects as valid login credentials", async () => {
    await createUser({ email: uniqueEmail("injection") });

    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: { $gt: "" }, password: "Password123!" });

    expect(response.statusCode).toBe(400);
    expect(extractAccessToken(response)).toBeFalsy();
    expect(response.body.success).not.toBe(true);
  });

  it("ignores privileged fields when updating a profile", async () => {
    const user = await createUser();
    const { token } = await login(user.email);
    expect(token).toBeTruthy();

    const response = await request(app)
      .put("/api/v1/auth/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({
        username: "securityProfile",
        role: "admin",
        isEmailVerified: true,
        permissions: ["*"],
      });

    expect(response.statusCode).toBe(200);
    expect(response.body.user.role).toBe("user");
    expect(response.body.user.isEmailVerified).toBe(true);

    const persisted = await User.findById(user._id);
    expect(persisted.role).toBe("user");
  });

  it("forbids a regular user from reading the admin dashboard", async () => {
    const user = await createUser();
    const { token } = await login(user.email);

    const response = await request(app)
      .get("/api/v1/admin/dashboard")
      .set("Authorization", `Bearer ${token}`);

    expect(response.statusCode).toBe(403);
    expect(response.body.success).not.toBe(true);
  });

  it("rate limits repeated login attempts from the same client", async () => {
    const ip = "203.0.113.77";
    let limited;

    for (let attempt = 0; attempt < 21; attempt += 1) {
      limited = await request(app)
        .post("/api/v1/auth/login")
        .set("X-Forwarded-For", ip)
        .send({ email: "rate-limit@example.com", password: "wrong-password" });

      if (limited.statusCode === 429) break;
    }

    expect(limited.statusCode).toBe(429);
    expect(limited.body.success).toBe(false);
    expect(limited.body.message).toMatch(/too many login attempts/i);
  }, 30000);
});
