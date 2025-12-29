const request = require("supertest");
const app = require("../../src/app");

describe("Health API", () => {
    it("should return 200 OK for health check", async () => {
        const res = await request(app).get("/api/v1/health/status");
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
