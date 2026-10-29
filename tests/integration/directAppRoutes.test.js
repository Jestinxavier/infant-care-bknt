const request = require("supertest");
const app = require("../../src/app");

describe("Direct app routes", () => {
  it("serves the API information route", async () => {
    const response = await request(app).get("/");

    expect(response.statusCode).toEqual(200);
    expect(response.text).toContain("API is running");
  });

  it("serves Swagger documentation outside production", async () => {
    const response = await request(app).get("/api-docs");

    expect([200, 301]).toContain(response.statusCode);
  });

  it("serves the public email logo as a PNG", async () => {
    const response = await request(app).get("/email-logo.png");

    expect(response.statusCode).toEqual(200);
    expect(response.headers["content-type"]).toContain("image/png");
    expect(response.body.length).toBeGreaterThan(0);
  });

  it("rejects PhonePe webhooks without authorization", async () => {
    for (const routePath of ["/api/webhooks/phonepe", "/api/webhook/phonepe"]) {
      const response = await request(app).post(routePath).send({});

      expect(response.statusCode).toEqual(400);
      expect(response.text).toContain("INVALID CALLBACK");
    }
  });

  it("rejects Razorpay webhooks without a signature", async () => {
    const response = await request(app).post("/api/webhooks/razorpay").send({});

    expect(response.statusCode).toEqual(400);
    expect(response.text).toContain("INVALID CALLBACK");
  });

  it("rejects a PhonePe confirmation without an order ID", async () => {
    const response = await request(app).get("/order-confirmation");

    expect(response.statusCode).toEqual(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toContain("Missing order ID");
  });

  it("redirects a Razorpay confirmation without an order ID", async () => {
    const response = await request(app).get("/razorpay-confirmation");

    expect(response.statusCode).toEqual(302);
    expect(response.headers.location).toContain(
      "/order-confirmation?status=failed&error=missing_order_id"
    );
  });

  it("protects the manual payment status endpoint", async () => {
    const response = await request(app).get(
      "/api/payments/check/000000000000000000000000"
    );

    expect(response.statusCode).toEqual(401);
  });
});
