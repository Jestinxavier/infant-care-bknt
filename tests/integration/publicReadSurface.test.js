const request = require("supertest");
const app = require("../../src/app");
const Product = require("../../src/models/Product");

const publicReads = [
  { path: "/api/v1/attributes", allowed: [200] },
  { path: "/api/v1/admin/attributes", allowed: [200] },
  { path: "/api/v1/admin/faq-categories", allowed: [200] },
  { path: "/api/v1/admin/settings/maintenance", allowed: [200] },
  { path: "/api/v1/admin/settings/popular-searches", allowed: [200] },
  { path: "/api/v1/admin/settings/public", allowed: [200] },
  { path: "/api/v1/admin/settings/suggested-products", allowed: [200] },
  { path: "/api/v1/cart/count", allowed: [200] },
  { path: "/api/v1/cart/coupons", allowed: [200] },
  { path: "/api/v1/cart/items", allowed: [200] },
  { path: "/api/v1/cart/price-summary", allowed: [200] },
  { path: "/api/v1/cart/summary", allowed: [200] },
  { path: "/api/v1/category", allowed: [200] },
  { path: "/api/v1/cms/products", allowed: [200] },
  { path: "/api/v1/faqs", allowed: [200] },
  { path: "/api/v1/footer", allowed: [200] },
  { path: "/api/v1/homepage", allowed: [200, 404] },
  { path: "/api/v1/product/all", allowed: [200] },
  { path: "/api/v1/product/search?q=test", allowed: [200] },
  { path: "/api/v1/product/search-index", allowed: [200] },
  { path: "/api/v1/product/search/suggest?q=test", allowed: [200] },
  { path: "/api/v1/review/top", allowed: [200] },
  { path: "/api/v1/settings/maintenance", allowed: [200] },
  { path: "/api/v1/settings/popular-searches", allowed: [200] },
  { path: "/api/v1/settings/public", allowed: [200] },
  { path: "/api/v1/settings/suggested-products", allowed: [200] },
];

describe("Public read surface", () => {
  beforeAll(async () => {
    await Product.init();
  });

  it("serves every public read route without authentication", async () => {
    const failures = [];

    for (const route of publicReads) {
      const response = await request(app).get(route.path);

      if (!route.allowed.includes(response.statusCode)) {
        failures.push(
          `${route.path} -> ${response.statusCode} ${response.body?.message || ""}`
        );
      }
    }

    expect(failures).toEqual([]);
  }, 120000);

  it("validates payment options without a cart", async () => {
    const response = await request(app).get("/api/v1/payments/options");

    expect(response.statusCode).toEqual(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toContain("Cart ID is required");
  });

  it("returns 404 for payment options with an unknown cart", async () => {
    const response = await request(app)
      .get("/api/v1/payments/options")
      .set("x-cart-id", "missing-cart");

    expect(response.statusCode).toEqual(404);
    expect(response.body.success).toBe(false);
  });
});
