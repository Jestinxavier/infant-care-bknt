const request = require("supertest");
const app = require("../../src/app");
const Product = require("../../src/models/Product");
const Category = require("../../src/models/Category");
const SiteSetting = require("../../src/models/SiteSetting");
const {
  createVerifiedUser,
  accessTokenFor,
} = require("../helpers/authFixtures");

let counter = 0;
const uniqueToken = (prefix) => `${prefix}-${Date.now()}-${counter++}`;

const auth = (token) => ({ Authorization: `Bearer ${token}` });

const createAdmin = async () =>
  createVerifiedUser({ role: "admin", isEmailVerified: true });

const createPublishedProduct = async () => {
  const token = uniqueToken("setting-product");
  const category = await Category.create({
    name: `Settings Category ${token}`,
    code: `settings-category-${token}`,
    isActive: true,
  });
  return Product.create({
    title: `Settings product ${token}`,
    description: "Published product for settings tests",
    category: category._id,
    categoryName: category.name,
    categoryCode: category.code,
    url_key: `settings-product-${token}`,
    sku: `SET-${token}`.toUpperCase(),
    status: "published",
    product_type: "SIMPLE",
    price: 100,
    stock: 5,
    stockObj: { available: 5, isInStock: true },
    images: ["https://example.com/settings.jpg"],
  });
};

describe("Site settings surface", () => {
  let adminToken;

  beforeEach(async () => {
    const admin = await createAdmin();
    adminToken = accessTokenFor(admin);
  });

  it("lists settings with and without a scope through both prefixes", async () => {
    await request(app)
      .post("/api/v1/settings")
      .set(auth(adminToken))
      .send({ key: "order.contact", value: "9999999999" });

    for (const prefix of ["/api/v1/settings", "/api/v1/admin/settings"]) {
      const all = await request(app).get(prefix).set(auth(adminToken));
      expect(all.status).toBe(200);
      expect(all.body.success).toBe(true);
      expect(Array.isArray(all.body.settings)).toBe(true);
      expect(all.body.settings.map((item) => item.key)).toContain(
        "order.contact",
      );

      const scoped = await request(app)
        .get(`${prefix}?scope=order`)
        .set(auth(adminToken));
      expect(scoped.status).toBe(200);
      expect(
        scoped.body.settings.every((item) => item.scope === "order"),
      ).toBe(true);
    }
  });

  it("creates registered settings and validates unregistered keys and value types", async () => {
    for (const prefix of ["/api/v1/settings", "/api/v1/admin/settings"]) {
      const token = uniqueToken("contact");
      const created = await request(app)
        .post(prefix)
        .set(auth(adminToken))
        .send({ key: "order.contact", value: token });
      expect(created.status).toBe(201);
      expect(created.body.setting.key).toBe("order.contact");
      expect(created.body.setting.value).toBe(token);

      const duplicate = await request(app)
        .post(prefix)
        .set(auth(adminToken))
        .send({ key: "order.contact", value: token });
      expect(duplicate.status).toBe(400);

      const unknown = await request(app)
        .post(prefix)
        .set(auth(adminToken))
        .send({ key: "unregistered.key", value: "x" });
      expect(unknown.status).toBe(400);
      expect(unknown.body.message).toMatch(/not registered/i);

      await request(app)
        .delete(`${prefix}/order.contact`)
        .set(auth(adminToken));
    }

    const mismatch = await request(app)
      .post("/api/v1/settings")
      .set(auth(adminToken))
      .send({ key: "maintenance.enabled", value: "yes" });
    expect(mismatch.status).toBe(400);
    expect(mismatch.body.message).toMatch(/type/i);
  });

  it("reads settings by key and 404s missing keys", async () => {
    await request(app)
      .post("/api/v1/settings")
      .set(auth(adminToken))
      .send({ key: "order.contact", value: "8888888888" });

    for (const prefix of ["/api/v1/settings", "/api/v1/admin/settings"]) {
      const found = await request(app)
        .get(`${prefix}/order.contact`)
        .set(auth(adminToken));
      expect(found.status).toBe(200);
      expect(found.body.setting.value).toBe("8888888888");

      const missing = await request(app)
        .get(`${prefix}/${uniqueToken("missing-key")}`)
        .set(auth(adminToken));
      expect(missing.status).toBe(404);
    }
  });

  it("updates settings, validates types, and protects scope changes", async () => {
    await request(app)
      .post("/api/v1/settings")
      .set(auth(adminToken))
      .send({ key: "order.contact", value: "1111111111" });

    for (const prefix of ["/api/v1/settings", "/api/v1/admin/settings"]) {
      const updated = await request(app)
        .put(`${prefix}/order.contact`)
        .set(auth(adminToken))
        .send({ value: "2222222222", description: "Support number" });
      expect(updated.status).toBe(200);
      expect(updated.body.setting.value).toBe("2222222222");
      expect(updated.body.setting.description).toBe("Support number");

      const mismatch = await request(app)
        .put(`${prefix}/order.contact`)
        .set(auth(adminToken))
        .send({ value: 42 });
      expect(mismatch.status).toBe(400);

      const scopeChange = await request(app)
        .put(`${prefix}/order.contact`)
        .set(auth(adminToken))
        .send({ scope: "search" });
      expect(scopeChange.status).toBe(403);
    }

    const missing = await request(app)
      .put(`/api/v1/settings/${uniqueToken("missing")}`)
      .set(auth(adminToken))
      .send({ value: "x" });
    expect(missing.status).toBe(404);
  });

  it("deletes settings through both prefixes and 404s missing keys", async () => {
    for (const prefix of ["/api/v1/settings", "/api/v1/admin/settings"]) {
      await request(app)
        .post(prefix)
        .set(auth(adminToken))
        .send({ key: "order.contact", value: "7777777777" });

      const removed = await request(app)
        .delete(`${prefix}/order.contact`)
        .set(auth(adminToken));
      expect(removed.status).toBe(200);

      const missing = await request(app)
        .delete(`${prefix}/order.contact`)
        .set(auth(adminToken));
      expect(missing.status).toBe(404);
    }
  });

  it("serves public settings with scope filtering", async () => {
    await request(app)
      .post("/api/v1/settings")
      .set(auth(adminToken))
      .send({ key: "order.contact", value: "6666666666" });

    const all = await request(app).get("/api/v1/settings/public");
    expect(all.status).toBe(200);
    expect(all.body.settings["order.contact"]).toMatchObject({
      value: "6666666666",
    });

    const scoped = await request(app).get(
      "/api/v1/settings/public?scope=order",
    );
    expect(scoped.status).toBe(200);
    expect(scoped.body.settings["order.contact"]).toBeTruthy();
  });

  it("reads and upserts popular searches through both prefixes", async () => {
    for (const prefix of ["/api/v1/settings", "/api/v1/admin/settings"]) {
      await SiteSetting.deleteMany({ key: "search.popular_terms" });
      const empty = await request(app).get(`${prefix}/popular-searches`);
      expect(empty.status).toBe(200);
      expect(empty.body.searches).toEqual([]);

      const saved = await request(app)
        .put(`${prefix}/popular-searches`)
        .set(auth(adminToken))
        .send({ searches: ["baby", "  onesie  ", "", "x"] });
      expect(saved.status).toBe(200);
      expect(saved.body.setting.searches).toEqual(["baby", "onesie"]);

      const publicRead = await request(app).get(
        `${prefix}/popular-searches`,
      );
      expect(publicRead.status).toBe(200);
      expect(publicRead.body.searches).toEqual(["baby", "onesie"]);

      const adminRead = await request(app)
        .get(`${prefix}/popular-searches/admin`)
        .set(auth(adminToken));
      expect(adminRead.status).toBe(200);
      expect(adminRead.body.setting.searches).toEqual(["baby", "onesie"]);

      const adminAliasWrite = await request(app)
        .put(`${prefix}/popular-searches/admin`)
        .set(auth(adminToken))
        .send({ searches: ["cot"] });
      expect(adminAliasWrite.status).toBe(200);
      expect(adminAliasWrite.body.setting.searches).toEqual(["cot"]);
    }

    const invalid = await request(app)
      .put("/api/v1/settings/popular-searches")
      .set(auth(adminToken))
      .send({ searches: "baby" });
    expect(invalid.status).toBe(400);

    const allInvalid = await request(app)
      .put("/api/v1/settings/popular-searches")
      .set(auth(adminToken))
      .send({ searches: ["", "x"] });
    expect(allInvalid.status).toBe(400);
  });

  it("reads and upserts suggested products and validates limits", async () => {
    const product = await createPublishedProduct();
    const productId = product._id.toString();

    for (const prefix of ["/api/v1/settings", "/api/v1/admin/settings"]) {
      await SiteSetting.deleteMany({ key: "search.suggested_products" });
      const empty = await request(app).get(`${prefix}/suggested-products`);
      expect(empty.status).toBe(200);
      expect(empty.body.products).toEqual([]);
      expect(empty.body.viewAllLink).toBe("/search");

      const saved = await request(app)
        .put(`${prefix}/suggested-products`)
        .set(auth(adminToken))
        .send({ productIds: [productId], viewAllLink: "/collections/all" });
      expect(saved.status).toBe(200);
      expect(saved.body.setting.productIds).toEqual([productId]);
      expect(saved.body.setting.products[0].id).toBe(productId);
      expect(saved.body.setting.viewAllLink).toBe("/collections/all");

      const publicRead = await request(app).get(
        `${prefix}/suggested-products`,
      );
      expect(publicRead.status).toBe(200);
      expect(publicRead.body.products[0].id).toBe(productId);

      const adminRead = await request(app)
        .get(`${prefix}/suggested-products/admin`)
        .set(auth(adminToken));
      expect(adminRead.status).toBe(200);
      expect(adminRead.body.setting.productIds).toEqual([productId]);
    }

    const invalid = await request(app)
      .put("/api/v1/settings/suggested-products")
      .set(auth(adminToken))
      .send({ productIds: "not-an-array" });
    expect(invalid.status).toBe(400);

    const tooMany = await request(app)
      .put("/api/v1/settings/suggested-products")
      .set(auth(adminToken))
      .send({ productIds: [productId, productId, productId, productId, productId] });
    expect(tooMany.status).toBe(400);
  });

  it("reads and updates maintenance mode through both prefixes", async () => {
    const initial = await request(app).get("/api/v1/settings/maintenance");
    expect(initial.status).toBe(200);
    expect(initial.body.maintenance).toBeTruthy();

    const adminInitial = await request(app)
      .get("/api/v1/settings/maintenance")
      .set(auth(adminToken));
    expect(adminInitial.status).toBe(200);
    expect(adminInitial.body.maintenance.staffBypass).toBe(true);

    for (const prefix of ["/api/v1/settings", "/api/v1/admin/settings"]) {
      const updated = await request(app)
        .put(`${prefix}/maintenance`)
        .set(auth(adminToken))
        .send({
          enabled: false,
          title: "Short break",
          message: "Back soon",
          reopenAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        });
      expect(updated.status).toBe(200);
      expect(updated.body.maintenance.enabled).toBe(false);
      expect(updated.body.maintenance.title).toBe("Short break");

      const invalid = await request(app)
        .put(`${prefix}/maintenance`)
        .set(auth(adminToken))
        .send({ enabled: "yes" });
      expect(invalid.status).toBe(422);
    }
  });
});
