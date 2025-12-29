const request = require("supertest");
const app = require("../../src/app");
const mongoose = require("mongoose");

describe("Auth API", () => {
    const testUser = {
        username: "testuser",
        email: "test@example.com",
        password: "Password123!",
        phone: "1234567890",
        otp: "123456" // Use the TEST_OTP from constants
    };

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
            await request(app).post("/api/v1/auth/request-otp").send({ email: testUser.email });

            // Then verify OTP to create user
            const res = await request(app)
                .post("/api/v1/auth/verify-otp")
                .send({
                    email: testUser.email,
                    username: testUser.username,
                    password: testUser.password,
                    otp: testUser.otp
                });

            expect(res.statusCode).toEqual(201);
            expect(res.body.success).toBe(true);
            expect(res.body.user).toHaveProperty("email", testUser.email);
        });
    });

    describe("POST /api/v1/auth/login", () => {
        beforeEach(async () => {
            // Setup: Request OTP and verify to create the user
            await request(app).post("/api/v1/auth/request-otp").send({ email: testUser.email });
            await request(app).post("/api/v1/auth/verify-otp").send({
                email: testUser.email,
                username: testUser.username,
                password: testUser.password,
                otp: testUser.otp
            });
        });

        it("should login successfully with correct credentials", async () => {
            const res = await request(app)
                .post("/api/v1/auth/login")
                .send({
                    email: testUser.email,
                    password: testUser.password
                });

            expect(res.statusCode).toEqual(200);
            expect(res.body.success).toBe(true);
            expect(res.body).toHaveProperty("accessToken");
        });

        it("should fail login with incorrect password", async () => {
            const res = await request(app)
                .post("/api/v1/auth/login")
                .send({
                    email: testUser.email,
                    password: "wrongpassword"
                });

            expect(res.statusCode).toEqual(401);
            expect(res.body.success).toBe(false);
        });
    });
});
