const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../../src/app");
const Product = require("../../src/models/Product");

let counter = 0;
const unique = (prefix) => `${prefix}-${Date.now()}-${counter++}`;

const makeProduct = async (overrides = {}) =>
  Product.create({
    title: `Search product ${unique("SEARCH")}`,
    category: new mongoose.Types.ObjectId(),
    status: "published",
    stockObj: { available: 5, isInStock: true },
    variants: [],
    ...overrides,
  });

describe("Product search surface", () => {
  beforeAll(async () => {
    await Product.init();
  });

  it("requires a non-empty search term", async () => {
    const missing = await request(app).get("/api/v1/product/search");
    expect(missing.status).toBe(400);
    expect(missing.body.message).toBe("Search term is required");

    const blank = await request(app).get("/api/v1/product/search").query({ q: "   " });
    expect(blank.status).toBe(400);
  });

  it("searches published in-stock products by title text and excludes drafts/out-of-stock items", async () => {
    await makeProduct({
      title: "Cotton Air Romper",
      variants: [],
    });
    await makeProduct({
      title: "Cotton Air Romper Draft",
      status: "draft",
      variants: [],
    });
    await makeProduct({
      title: "Cotton Air Romper Sold Out",
      stockObj: { available: 0, isInStock: false },
      variants: [],
    });

    const response = await request(app)
      .get("/api/v1/product/search")
      .query({ q: "Cotton Air Romper", limit: 10 });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].title).toBe("Cotton Air Romper");
    expect(response.body.pagination).toEqual(
      expect.objectContaining({ page: 1, total: 1 }),
    );
  });

  it("supports SKU-prefix matches and product-type filtering with pagination", async () => {
    const sku = unique("PFX").toUpperCase();
    await makeProduct({
      title: "Variant Search Product",
      product_type: "CONFIGURABLE",
      variants: [
        {
          id: unique("variant"),
          sku,
          price: 599,
          stock: 3,
          stockObj: { available: 3, isInStock: true },
        },
      ],
    });
    await makeProduct({
      title: "Bundle Search Product",
      product_type: "BUNDLE",
      variants: [],
    });
    await makeProduct({
      title: "Simple Search Product",
      product_type: "SIMPLE",
      variants: [],
    });

    const prefix = sku.slice(0, 8);
    const skuSearch = await request(app)
      .get("/api/v1/product/search")
      .query({ q: prefix });
    expect(skuSearch.status).toBe(200);
    expect(skuSearch.body.data).toHaveLength(1);
    expect(skuSearch.body.data[0].title).toBe("Variant Search Product");

    const bundleSearch = await request(app)
      .get("/api/v1/product/search")
      .query({ q: "Search Product", product_type: "BUNDLE", limit: 1 });
    expect(bundleSearch.status).toBe(200);
    expect(bundleSearch.body.data).toHaveLength(1);
    expect(bundleSearch.body.data[0].product_type).toBe("BUNDLE");
    expect(bundleSearch.body.pagination).toEqual(
      expect.objectContaining({ limit: 1 }),
    );
  });
});
