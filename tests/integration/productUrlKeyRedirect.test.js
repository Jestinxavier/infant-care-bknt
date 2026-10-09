const request = require("supertest");
const app = require("../../src/app");
const Category = require("../../src/models/Category");
const Product = require("../../src/features/product/product.model");

/**
 * Products resolve their storefront URL through `url_key`. When a key is
 * retired by a rename, getProductByUrlKey used to fall back to a *prefix*
 * regex over product titles, which could serve a different product entirely.
 *
 * These tests pin the correct behaviour: a retired key must resolve to the
 * product that actually owned it, flagged so the storefront can 301.
 */
describe("Product url_key redirects", () => {
  let category;

  beforeAll(async () => {
    category = await Category.create({
      name: "Wipes",
      code: "wipes-test",
      isActive: true,
    });
  });

  beforeEach(async () => {
    await Product.deleteMany({});
  });

  const makeProduct = (overrides) =>
    Product.create({
      title: "Cotton Baby Wipes",
      category: category._id,
      status: "published",
      ...overrides,
    });

  const getByUrlKey = (key) => request(app).get(`/api/v1/product/url/${key}`);

  it("serves the owning product for its own url_key", async () => {
    const p = await makeProduct({ title: "Cotton Baby Wipes", url_key: "cotton-baby-wipes" });

    const res = await getByUrlKey("cotton-baby-wipes");
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(p._id.toString());
  });

  it("resolves a retired url_key to the product that owned it, not a similar title", async () => {
    const target = await makeProduct({
      title: "Cotton Baby Wipes",
      url_key: "cotton-baby-wipes",
    });
    // A different product whose title also starts with "cotton baby wipes".
    await makeProduct({
      title: "Cotton Baby Wipes Refill Pack",
      url_key: "cotton-baby-wipes-refill",
    });

    // Admin renames the first product's URL key.
    target.url_key = "eco-cotton-wipes";
    target.urlKeyHistory = [{ urlKey: "cotton-baby-wipes", createdAt: new Date() }];
    await target.save();

    const res = await getByUrlKey("cotton-baby-wipes");

    expect(res.status).toBe(200);
    // Must be the renamed product, not the "Refill Pack".
    expect(res.body.id).toBe(target._id.toString());
    expect(res.body.redirectedTo).toBe("eco-cotton-wipes");
  });

  it("404s an unknown url_key instead of guessing from a title prefix", async () => {
    await makeProduct({ title: "Cotton Baby Wipes", url_key: "cotton-baby-wipes" });

    // "cotton" is only a prefix of the title; it is not a real url_key.
    const res = await getByUrlKey("cotton");

    expect(res.status).toBe(404);
  });

  it("404s a retired url_key whose product no longer exists", async () => {
    await makeProduct({ title: "Cotton Baby Wipes", url_key: "cotton-baby-wipes" });
    const res = await getByUrlKey("never-used-key");
    expect(res.status).toBe(404);
  });
});