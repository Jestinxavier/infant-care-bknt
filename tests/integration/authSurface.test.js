const crypto = require("crypto");
const request = require("supertest");
const app = require("../../src/app");
const User = require("../../src/models/user");
const PendingUser = require("../../src/models/PendingUser");
const Token = require("../../src/models/token");
const { TEST_OTP } = require("../../resources/constants");
const {
  createVerifiedUser,
  createPendingUser,
  accessTokenFor,
  createRefreshSession,
  extractCookieValue,
  uniqueEmail,
  uniqueUsername,
} = require("../helpers/authFixtures");

const PASSWORD = "Password123!";
const NEW_PASSWORD = "NewPassword123!";

describe("Auth API functional surface", () => {
  describe("POST /api/v1/auth/check-user", () => {
    it("reports whether an account exists", async () => {
      const user = await createVerifiedUser();

      const existing = await request(app)
        .post("/api/v1/auth/check-user")
        .send({ email: user.email });

      expect(existing.statusCode).toBe(200);
      expect(existing.body).toMatchObject({ success: true, exists: true });

      const missing = await request(app)
        .post("/api/v1/auth/check-user")
        .send({ email: uniqueEmail("missing") });

      expect(missing.statusCode).toBe(200);
      expect(missing.body).toMatchObject({ success: true, exists: false });
    });
  });

  describe("registration OTP", () => {
    it("registers a user and sets auth cookies", async () => {
      const email = uniqueEmail("register");
      const username = uniqueUsername("register");

      const requested = await request(app)
        .post("/api/v1/auth/request-otp")
        .send({ email });

      expect(requested.statusCode).toBe(200);
      expect(requested.body).toMatchObject({
        success: true,
        email,
      });

      const pending = await PendingUser.findOne({ email });
      expect(pending).toBeTruthy();
      expect(pending.otp).toBe(TEST_OTP);

      const verified = await request(app)
        .post("/api/v1/auth/verify-otp")
        .send({ email, username, password: PASSWORD, otp: TEST_OTP });

      expect(verified.statusCode).toBe(201);
      expect(verified.body.success).toBe(true);
      expect(verified.body.user).toMatchObject({
        email,
        isEmailVerified: true,
      });
      expect(extractCookieValue(verified, "access_token")).toBeTruthy();
      expect(extractCookieValue(verified, "refresh_token")).toBeTruthy();

      const saved = await User.findOne({ email });
      expect(saved).toBeTruthy();
      expect(saved.isEmailVerified).toBe(true);
      expect(await Token.countDocuments({ userId: saved._id })).toBe(1);
    });

    it("rejects request-otp for an existing account", async () => {
      const user = await createVerifiedUser();

      const res = await request(app)
        .post("/api/v1/auth/request-otp")
        .send({ email: user.email });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toMatch(/already registered/i);
    });

    it("rejects verify-otp with a wrong code", async () => {
      const pending = await createPendingUser();

      const res = await request(app)
        .post("/api/v1/auth/verify-otp")
        .send({
          email: pending.email,
          username: uniqueUsername("wrong-otp"),
          password: PASSWORD,
          otp: "000000",
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toMatch(/Invalid OTP/i);

      const updated = await PendingUser.findById(pending._id);
      expect(updated.attempts).toBe(1);
    });
  });

  describe("login OTP", () => {
    it("sends and verifies a login OTP", async () => {
      const user = await createVerifiedUser();

      const requested = await request(app)
        .post("/api/v1/auth/request-login-otp")
        .send({ email: user.email });

      expect(requested.statusCode).toBe(200);

      const pending = await PendingUser.findOne({ email: user.email });
      expect(pending).toBeTruthy();
      expect(pending.isLoginOTP).toBe(true);

      const verified = await request(app)
        .post("/api/v1/auth/verify-login-otp")
        .send({ email: user.email, otp: TEST_OTP });

      expect(verified.statusCode).toBe(200);
      expect(verified.body.success).toBe(true);
      expect(verified.body.user).toMatchObject({ id: String(user._id) });
      expect(extractCookieValue(verified, "access_token")).toBeTruthy();
      expect(extractCookieValue(verified, "refresh_token")).toBeTruthy();
      expect(await Token.countDocuments({ userId: user._id })).toBe(1);
    });

    it("returns 404 when requesting a login OTP for an unknown email", async () => {
      const res = await request(app)
        .post("/api/v1/auth/request-login-otp")
        .send({ email: uniqueEmail("unknown") });

      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it("rejects an invalid login OTP", async () => {
      const user = await createVerifiedUser();
      const pending = await createPendingUser({
        email: user.email,
        isLoginOTP: true,
      });

      const res = await request(app)
        .post("/api/v1/auth/verify-login-otp")
        .send({ email: user.email, otp: "000000" });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toMatch(/Invalid OTP/i);

      const updated = await PendingUser.findById(pending._id);
      expect(updated.attempts).toBe(1);
    });
  });

  describe("POST /api/v1/auth/login", () => {
    it("logs in with valid credentials", async () => {
      const user = await createVerifiedUser();

      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: user.email, password: PASSWORD });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user).toMatchObject({ email: user.email });
      expect(extractCookieValue(res, "access_token")).toBeTruthy();
      expect(extractCookieValue(res, "refresh_token")).toBeTruthy();
      expect(await Token.countDocuments({ userId: user._id })).toBe(1);
    });

    it("rejects invalid credentials", async () => {
      const user = await createVerifiedUser();

      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: user.email, password: "wrong-password" });

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("rejects non-admin dashboard login", async () => {
      const user = await createVerifiedUser();

      const res = await request(app)
        .post("/api/v1/auth/login")
        .set("x-client-type", "dashboard")
        .send({ email: user.email, password: PASSWORD });

      expect(res.statusCode).toBe(403);
      expect(res.body.message).toMatch(/Admin role required/i);
      expect(await Token.countDocuments({ userId: user._id })).toBe(0);
    });
  });

  describe("refresh and logout", () => {
    it("rotates the refresh token and issues a new access token", async () => {
      const user = await createVerifiedUser();
      const refreshToken = await createRefreshSession(user);

      const res = await request(app)
        .post("/api/v1/auth/refresh")
        .set("Cookie", `refresh_token=${refreshToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(extractCookieValue(res, "access_token")).toBeTruthy();

      const nextRefreshToken = extractCookieValue(res, "refresh_token");
      expect(nextRefreshToken).toBeTruthy();
      expect(nextRefreshToken).not.toBe(refreshToken);
      expect(await Token.findOne({ refreshToken })).toBeNull();
      expect(
        await Token.findOne({ refreshToken: nextRefreshToken })
      ).toBeTruthy();
    });

    it("requires a refresh cookie", async () => {
      const res = await request(app).post("/api/v1/auth/refresh");

      expect(res.statusCode).toBe(401);
    });

    it("logs out, clears cookies, and revokes the refresh token", async () => {
      const user = await createVerifiedUser();
      const refreshToken = await createRefreshSession(user);

      const res = await request(app)
        .post("/api/v1/auth/logout")
        .set("Cookie", `refresh_token=${refreshToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toMatch(/Logged out/i);

      const cookies = res.headers["set-cookie"] || [];
      expect(cookies.some((cookie) => cookie.startsWith("access_token=;"))).toBe(
        true
      );
      expect(
        cookies.some((cookie) => cookie.startsWith("refresh_token=;"))
      ).toBe(true);
      expect(await Token.findOne({ refreshToken })).toBeNull();
    });
  });

  describe("profile", () => {
    it("returns the authenticated profile", async () => {
      const user = await createVerifiedUser();

      const res = await request(app)
        .get("/api/v1/auth/profile")
        .set("Authorization", `Bearer ${accessTokenFor(user)}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.user).toMatchObject({
        id: String(user._id),
        email: user.email,
      });
      expect(res.body.user).not.toHaveProperty("password");
    });

    it("rejects unauthenticated profile access", async () => {
      const res = await request(app).get("/api/v1/auth/profile");

      expect(res.statusCode).toBe(401);
    });

    it("rejects dashboard profile access for non-admin users", async () => {
      const user = await createVerifiedUser();

      const res = await request(app)
        .get("/api/v1/auth/profile")
        .set("x-client-type", "dashboard")
        .set("Authorization", `Bearer ${accessTokenFor(user)}`);

      expect(res.statusCode).toBe(403);
      expect(res.body.message).toMatch(/Admin role required/i);
    });

    it("updates username and phone", async () => {
      const user = await createVerifiedUser();

      const res = await request(app)
        .put("/api/v1/auth/profile")
        .set("Authorization", `Bearer ${accessTokenFor(user)}`)
        .field("username", "Profile Updated")
        .field("phone", "9998887776");

      expect(res.statusCode).toBe(200);
      expect(res.body.user).toMatchObject({
        username: "profileUpdated",
        phone: "9998887776",
      });
    });
  });

  describe("password reset link", () => {
    it("stores a reset token for known accounts and stays generic for unknown accounts", async () => {
      const user = await createVerifiedUser();

      const known = await request(app)
        .post("/api/v1/auth/request-password-reset")
        .send({ email: user.email });

      expect(known.statusCode).toBe(200);
      const updated = await User.findById(user._id);
      expect(updated.resetPasswordToken).toBeTruthy();
      expect(updated.resetPasswordExpires.getTime()).toBeGreaterThan(Date.now());

      const unknown = await request(app)
        .post("/api/v1/auth/request-password-reset")
        .send({ email: uniqueEmail("unknown-reset") });

      expect(unknown.statusCode).toBe(200);
      expect(unknown.body.message).toBe(known.body.message);
    });

    it("resets the password with a valid token", async () => {
      const user = await createVerifiedUser();
      const token = crypto.randomBytes(32).toString("hex");
      user.resetPasswordToken = token;
      user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000);
      await user.save();

      const res = await request(app)
        .post("/api/v1/auth/reset-password")
        .send({ token, newPassword: NEW_PASSWORD });

      expect(res.statusCode).toBe(200);
      const updated = await User.findById(user._id);
      expect(await updated.comparePassword(NEW_PASSWORD)).toBe(true);
      expect(updated.resetPasswordToken).toBeFalsy();
    });

    it("rejects an invalid reset token", async () => {
      const res = await request(app)
        .post("/api/v1/auth/reset-password")
        .send({ token: "not-a-real-token", newPassword: NEW_PASSWORD });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toMatch(/Invalid or expired/i);
    });

    it("rejects a too-short new password", async () => {
      const res = await request(app)
        .post("/api/v1/auth/reset-password")
        .send({ token: "not-a-real-token", newPassword: "short" });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toMatch(/at least 6/i);
    });
  });

  describe("password reset OTP", () => {
    it("resets the password with a valid email OTP", async () => {
      const user = await createVerifiedUser();

      const requested = await request(app)
        .post("/api/v1/auth/request-password-reset-otp")
        .send({ email: user.email });

      expect(requested.statusCode).toBe(200);
      const pending = await PendingUser.findOne({ email: user.email });
      expect(pending).toBeTruthy();
      expect(pending.isPasswordResetOTP).toBe(true);

      const res = await request(app)
        .post("/api/v1/auth/verify-password-reset-otp")
        .send({
          email: user.email,
          otp: TEST_OTP,
          newPassword: NEW_PASSWORD,
        });

      expect(res.statusCode).toBe(200);
      const updated = await User.findById(user._id);
      expect(await updated.comparePassword(NEW_PASSWORD)).toBe(true);
      expect(await PendingUser.findById(pending._id)).toBeNull();
    });

    it("rejects an invalid password reset OTP", async () => {
      const user = await createVerifiedUser();
      const pending = await createPendingUser({
        email: user.email,
        isPasswordResetOTP: true,
      });

      const res = await request(app)
        .post("/api/v1/auth/verify-password-reset-otp")
        .send({
          email: user.email,
          otp: "000000",
          newPassword: NEW_PASSWORD,
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toMatch(/Invalid OTP/i);

      const updated = await PendingUser.findById(pending._id);
      expect(updated.attempts).toBe(1);
    });
  });

  describe("POST /api/v1/auth/resend-otp", () => {
    it("issues a new OTP for a pending registration", async () => {
      const pending = await createPendingUser({ attempts: 4 });

      const res = await request(app)
        .post("/api/v1/auth/resend-otp")
        .send({ email: pending.email });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);

      const updated = await PendingUser.findById(pending._id);
      expect(updated.otp).toBe(TEST_OTP);
      expect(updated.attempts).toBe(0);
      expect(updated.otpExpires.getTime()).toBeGreaterThan(Date.now());
    });

    it("rejects resend for an existing account", async () => {
      const user = await createVerifiedUser();

      const res = await request(app)
        .post("/api/v1/auth/resend-otp")
        .send({ email: user.email });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toMatch(/already registered/i);
    });
  });

  describe("POST /api/v1/auth/change-password", () => {
    it("changes the password when the current password is valid", async () => {
      const user = await createVerifiedUser();

      const res = await request(app)
        .post("/api/v1/auth/change-password")
        .set("Authorization", `Bearer ${accessTokenFor(user)}`)
        .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });

      expect(res.statusCode).toBe(200);
      const updated = await User.findById(user._id);
      expect(await updated.comparePassword(NEW_PASSWORD)).toBe(true);
    });

    it("rejects an incorrect current password", async () => {
      const user = await createVerifiedUser();

      const res = await request(app)
        .post("/api/v1/auth/change-password")
        .set("Authorization", `Bearer ${accessTokenFor(user)}`)
        .send({ currentPassword: "wrong-password", newPassword: NEW_PASSWORD });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toMatch(/Current password is incorrect/i);
    });
  });

  describe("POST /api/v1/auth/google", () => {
    it("rejects a request without a Google credential", async () => {
      const res = await request(app).post("/api/v1/auth/google").send({});

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });
});
