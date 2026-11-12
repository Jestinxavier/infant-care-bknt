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

  // Regression: suggest showed the SKU's product, but "View all"
  // (/product/all?search=<sku>) returned nothing or unrelated products.
  describe("exact SKU: suggest and /search listing agree", () => {
    const listing = (search, extra = {}) =>
      request(app).get("/api/v1/product/all").query({ search, ...extra });
    const facets = (search) =>
      request(app).get("/api/v1/filter/all").query({ search });
    const suggest = (q) =>
      request(app).get("/api/v1/product/search/suggest").query({ q });

    it("finds a SIMPLE product by its root SKU (case-insensitive)", async () => {
      const sku = `${Date.now()}`.slice(-6) + "o2eag1ix-17872180";
      const product = await makeProduct({
        title: "Root Sku Cord Set",
        product_type: "SIMPLE",
        sku,
        price: 250,
      });

      const s = await suggest(sku.toUpperCase());
      expect(s.body.exactMatch).toBe(true);
      expect(s.body.products.map((p) => p.id)).toEqual([String(product._id)]);

      const res = await listing(sku.toUpperCase());
      expect(res.status).toBe(200);
      expect(res.body.items.map((i) => String(i.id))).toEqual([
        String(product._id),
      ]);

      const f = await facets(sku);
      expect(f.status).toBe(200);
    });

    it("shows a sold-out SKU unless a stock filter is chosen, and ignores near-miss SKUs", async () => {
      const base = `NEW--PRMM-${Date.now()}`.toUpperCase();
      const soldOut = await makeProduct({
        title: "Mosquito Net Bedding Set",
        product_type: "CONFIGURABLE",
        stockObj: { available: 0, isInStock: false },
        variants: [
          {
            id: unique("variant"),
            sku: base,
            price: 999,
            stock: 0,
            stockObj: { available: 0, isInStock: false },
          },
        ],
      });
      // One-char-off SKU on a different, in-stock product.
      await makeProduct({
        title: "Carry Nest Pink",
        product_type: "SIMPLE",
        sku: `${base}1`,
        price: 800,
      });

      const s = await suggest(base);
      expect(s.body.exactMatch).toBe(true);
      expect(s.body.products[0].id).toBe(String(soldOut._id));

      const res = await listing(base);
      expect(res.body.items.map((i) => String(i.id))).toEqual([
        String(soldOut._id),
      ]);

      const inStockOnly = await listing(base, { inStock: "true" });
      expect(inStockOnly.body.items).toHaveLength(0);

      // Non-existent SKU: no fuzzy title matches in suggest or listing.
      const missing = `${base}ZZ9`;
      expect((await suggest(missing)).body.products).toHaveLength(0);
      const lm = await listing(missing);
      expect(lm.status).toBe(200);
      expect(lm.body.items).toHaveLength(0);
    });
  });
});
