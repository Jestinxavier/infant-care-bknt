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
