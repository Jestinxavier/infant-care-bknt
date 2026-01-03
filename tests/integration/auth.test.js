const request = require("supertest");
const app = require("../../src/app");
const User = require("../../src/models/user");

describe("Auth API", () => {
  // Test user with known credentials - created during test setup
  const testUser = {
    username: "integration_test_user",
    email: "integration.test@example.com",
    password: "TestPassword123!",
    phone: "9876543210",
    otp: "123456", // Use the TEST_OTP from constants
  };

  // Clean up test user before running tests
  beforeAll(async () => {
    await User.deleteOne({ email: testUser.email });
  });

  // Clean up after tests
  afterAll(async () => {
    await User.deleteOne({ email: testUser.email });
  });

  describe("Registration Flow (OTP-based)", () => {
    it("should request an OTP successfully", async () => {
      const res = await request(app)
        .post("/api/v1/auth/request-otp")
        .send({ email: testUser.email });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
    });

    it("should verify OTP and register user successfully", async () => {
      // First request OTP
      await request(app)
        .post("/api/v1/auth/request-otp")
        .send({ email: testUser.email });

      // Then verify OTP to create user
      const res = await request(app).post("/api/v1/auth/verify-otp").send({
        email: testUser.email,
        username: testUser.username,
        password: testUser.password,
        otp: testUser.otp,
      });

      expect(res.statusCode).toEqual(201);
      expect(res.body.success).toBe(true);
      expect(res.body.user).toHaveProperty("email", testUser.email);
    });
  });

  describe("POST /api/v1/auth/login", () => {
    // Ensure test user exists before login tests
    beforeAll(async () => {
      // Check if user exists from registration test
      const existingUser = await User.findOne({ email: testUser.email });
      if (!existingUser) {
        // Create user via OTP flow
        await request(app)
          .post("/api/v1/auth/request-otp")
          .send({ email: testUser.email });
        await request(app).post("/api/v1/auth/verify-otp").send({
          email: testUser.email,
          username: testUser.username,
          password: testUser.password,
          otp: testUser.otp,
        });
      }
    });

    it("should login successfully with correct credentials", async () => {
      const res = await request(app).post("/api/v1/auth/login").send({
        email: testUser.email,
        password: testUser.password,
      });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty("accessToken");
    });

    it("should fail login with incorrect password", async () => {
      const res = await request(app).post("/api/v1/auth/login").send({
        email: testUser.email,
        password: "wrongpassword",
      });

      expect(res.statusCode).toEqual(401);
      expect(res.body.success).toBe(false);
    });
  });
});
