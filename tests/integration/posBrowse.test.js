const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../../src/app");
const Product = require("../../src/models/Product");
const { createVerifiedUser, accessTokenFor } = require("../helpers/authFixtures");

let counter = 0;
const key = () => `pos-browse-${Date.now()}-${counter++}`;
const auth = (t) => ({ Authorization: `Bearer ${t}` });

const make = (category, categoryName, extra = {}) => {
  const k = key();
  return Product.create({
    title: `Browse ${k}`,
    category,
    categoryName,
    url_key: k,
    sku: k.toUpperCase(),
    status: "published",
    product_type: "SIMPLE",
    price: 100,
    stock: 3,
    stockObj: { available: 3, isInStock: true },
    ...extra,
  });
};

describe("POS browsing", () => {
  let adminToken;
  const towels = new mongoose.Types.ObjectId();
  const soaps = new mongoose.Types.ObjectId();

  beforeEach(async () => {
    adminToken = accessTokenFor(await createVerifiedUser({ role: "admin" }));
    await make(towels, "Towels");
    await make(towels, "Towels");
    await make(soaps, "Soaps");
    await make(soaps, "Soaps", { status: "draft" }); // not sellable
  });

  it("lists categories with the most sellable products first", async () => {
    const res = await request(app).get("/api/v1/admin/pos/config").set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.categories.map((c) => [c.name, c.count])).toEqual([
      ["Towels", 2],
      ["Soaps", 1],
    ]);
  });

  it("shows products without a search in browse mode, by category", async () => {
    const all = await request(app).get("/api/v1/admin/pos/items").query({ browse: "1" }).set(auth(adminToken));
    expect(all.status).toBe(200);
    expect(all.body.items).toHaveLength(3);

    const one = await request(app)
      .get("/api/v1/admin/pos/items")
      .query({ browse: "1", category: String(soaps) })
      .set(auth(adminToken));
    expect(one.body.items).toHaveLength(1);
  });

  it("pages through every product, with all variants of each product kept together", async () => {
    // A product with many sizes used to eat the whole quota and hide others
    const k = key();
    await Product.create({
      title: `Browse many sizes ${k}`,
      category: towels,
      categoryName: "Towels",
      url_key: k,
      sku: k.toUpperCase(),
      status: "published",
      product_type: "CONFIGURABLE",
      variants: Array.from({ length: 6 }, (_, i) => ({
        id: `${k}-v${i}`,
        sku: `${k}-V${i}`.toUpperCase(),
        price: 100,
        stock: 2,
        stockObj: { available: 2, isInStock: true },
      })),
    });

    const page = (n) =>
      request(app)
        .get("/api/v1/admin/pos/items")
        .query({ browse: "1", limit: "2", page: String(n) })
        .set(auth(adminToken));

    const seenProducts = new Set();
    let lines = 0;
    let n = 1;
    for (;;) {
      const res = await page(n);
      expect(res.status).toBe(200);
      for (const item of res.body.items) seenProducts.add(item.productId);
      lines += res.body.items.length;
      if (!res.body.hasMore) break;
      n += 1;
      expect(n).toBeLessThan(10);
    }
    // 3 simple + 1 configurable with 6 variants = 4 products, 9 lines
    expect(seenProducts.size).toBe(4);
    expect(lines).toBe(9);
    expect(n).toBe(2);
  });

  it("still returns nothing for an empty search outside browse mode", async () => {
    const res = await request(app).get("/api/v1/admin/pos/items").query({ q: "" }).set(auth(adminToken));
    expect(res.body.items).toEqual([]);
  });

  it("ignores a malformed category id", async () => {
    const res = await request(app)
      .get("/api/v1/admin/pos/items")
      .query({ browse: "1", category: "{$ne:null}" })
      .set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(3);
  });
});
