const request = require("supertest");
const app = require("../../src/app");
const User = require("../../src/models/user");
const { extractAccessToken } = require("../helpers/authHelpers");

describe("Health API", () => {
    it("should return 200 OK for protected health check", async () => {
        // /api/v1/health/status is admin-only — authenticate as an admin.
        const email = `health_admin_${Date.now()}@example.com`;
        await User.create({
            username: "healthadmin",
            email,
            password: "Password123!",
            role: "admin",
            isEmailVerified: true
        });
        const loginRes = await request(app).post("/api/v1/auth/login").send({
            email,
            password: "Password123!",
        });
        const token = extractAccessToken(loginRes);
        expect(token).toBeTruthy();

        const res = await request(app)
            .get("/api/v1/health/status")
            .set("Authorization", `Bearer ${token}`);
        expect(res.statusCode).toEqual(200);
        expect(res.body.success).toBe(true);
        expect(res.body.server).toHaveProperty("status", "running");
    });

    it("should return API info on root route", async () => {
        const res = await request(app).get("/");
        expect(res.statusCode).toEqual(200);
        expect(res.text).toContain("API is running");
    });
});