const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../../src/app");
const Category = require("../../src/models/Category");
const Product = require("../../src/models/Product");
const Variant = require("../../src/models/Variant");
const {
  createVerifiedUser,
  accessTokenFor,
} = require("../helpers/authFixtures");

let counter = 0;
const uniqueToken = (prefix) => `${prefix}-${Date.now()}-${counter++}`;

const auth = (token) => ({ Authorization: `Bearer ${token}` });
const missingId = () => new mongoose.Types.ObjectId().toString();

const createPublishedProduct = async (overrides = {}) => {
  const token = uniqueToken("product");
  const category =
    overrides.category ||
    (await Category.create({
      name: `Product Category ${token}`,
      code: `product-category-${token}`,
      isActive: true,
    }));

  const product = await Product.create({
    title: `Published ${token}`,
    description: "A published product for surface tests",
    category: category._id,
    categoryName: category.name,
    categoryCode: category.code,
    url_key: `published-${token}`,
    sku: `SKU-${token}`.toUpperCase(),
    status: "published",
    product_type: "CONFIGURABLE",
    price: 100,
    stock: 5,
    stockObj: { available: 5, isInStock: true },
    images: ["https://example.com/product.jpg"],
    variants: [
      {
        id: "v1",
        sku: `VAR-${token}`.toUpperCase(),
        url_key: `published-${token}-v1`,
        price: 100,
        stock: 5,
        stockObj: { available: 5, isInStock: true },
        attributes: { color: "Red", size: "M" },
        images: ["https://example.com/variant.jpg"],
      },
    ],
    filterAttributes: { color: ["Red"], size: ["M"] },
    ...overrides,
  });

  return { product, category };
};

describe("Product surface", () => {
  let adminToken;

  beforeEach(async () => {
    const admin = await createVerifiedUser({ role: "admin" });
    adminToken = accessTokenFor(admin);
  });

  it("serves public product lists, detail, URL, and category reads", async () => {
    const { product, category } = await createPublishedProduct();

    const list = await request(app).get("/api/v1/product/all?limit=50");
    expect(list.status).toBe(200);
    expect(list.body.success).toBe(true);
    expect(
      list.body.items.some((item) => item.url_key === product.url_key),
    ).toBe(true);

    const detail = await request(app).get(`/api/v1/product/${product._id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.product._id).toBe(product._id.toString());

    const byUrl = await request(app).get(
      `/api/v1/product/url/${product.url_key}`,
    );
    expect(byUrl.status).toBe(200);
    expect(byUrl.body.id).toBe(product._id.toString());
    expect(byUrl.body.url_key).toBe(product.url_key);

    const byUrlPost = await request(app).post(
      `/api/v1/product/url/${product.url_key}`,
    );
    expect(byUrlPost.status).toBe(200);
    expect(byUrlPost.body.id).toBe(product._id.toString());
    expect(byUrlPost.body.url_key).toBe(product.url_key);

    const byIdPost = await request(app).post(`/api/v1/product/${product._id}`);
    expect(byIdPost.status).toBe(200);
    expect(byIdPost.body.product._id).toBe(product._id.toString());

    const byCategory = await request(app).get(
      `/api/v1/product/${category.code}`,
    );
    expect(byCategory.status).toBe(200);
    expect(byCategory.body.success).toBe(true);
  });

  it("serves product price, stock, suggestions, index, and recommendations", async () => {
    const { product, category } = await createPublishedProduct();

    const priceStock = await request(app).get(
      `/api/v1/product/price-stock/${product.url_key}`,
    );
    expect(priceStock.status).toBe(200);
    expect(priceStock.body).toMatchObject({
      success: true,
      price: 100,
      stock: 5,
      inStock: true,
      isVariant: false,
    });

    const suggest = await request(app).get(
      `/api/v1/product/search/suggest?q=${encodeURIComponent(product.title.slice(0, 8))}`,
    );
    expect(suggest.status).toBe(200);
    expect(suggest.body.success).toBe(true);

    const index = await request(app).get("/api/v1/product/search-index");
    expect(index.status).toBe(200);
    expect(index.body.success).toBe(true);

    const recommendations = await request(app).get(
      `/api/v1/product/recommendations?category=${category._id}`,
    );
    expect(recommendations.status).toBe(200);
    expect(recommendations.body.success).toBe(true);
    expect(Array.isArray(recommendations.body.products)).toBe(true);

    const available = await request(app)
      .post("/api/v1/product/check-stock")
      .send({ items: [{ productId: product._id.toString(), quantity: 2 }] });
    expect(available.status).toBe(200);
    expect(available.body.allAvailable).toBe(true);

    const insufficient = await request(app)
      .post("/api/v1/product/check-stock")
      .send({ items: [{ productId: product._id.toString(), quantity: 999 }] });
    expect(insufficient.status).toBe(200);
    expect(insufficient.body.allAvailable).toBe(false);

    const invalidStock = await request(app)
      .post("/api/v1/product/check-stock")
      .send({ items: [] });
    expect(invalidStock.status).toBe(400);
  });

  it("resolves variant URLs and reads legacy variants", async () => {
    const { product } = await createPublishedProduct();
    const variantUrl = product.variants[0].url_key;

    const byVariantUrl = await request(app).get(
      `/api/v1/product/url/${variantUrl}`,
    );
    expect(byVariantUrl.status).toBe(200);
    expect(byVariantUrl.body.id).toBe(product._id.toString());
    expect(byVariantUrl.body.url_key).toBe(product.url_key);

    const variantPrice = await request(app).get(
      `/api/v1/product/price-stock/${variantUrl}`,
    );
    expect(variantPrice.status).toBe(200);
    expect(variantPrice.body).toMatchObject({
      success: true,
      price: 100,
      stock: 5,
      isVariant: true,
    });

    const legacyVariant = await Variant.create({
      productId: product._id,
      price: 90,
      stock: 3,
      sku: `LEGACY-${Date.now()}`,
      attributes: { color: "Blue" },
    });

    const legacyRead = await request(app).get(
      `/api/v1/product/variant/${legacyVariant._id}`,
    );
    expect(legacyRead.status).toBe(200);
    expect(legacyRead.body.variant._id).toBe(legacyVariant._id.toString());

    const missing = await request(app).get(
      `/api/v1/product/variant/${missingId()}`,
    );
    expect(missing.status).toBe(404);
  });

  it("serves admin product lists, details, and detail aliases", async () => {
    const { product } = await createPublishedProduct();

    const list = await request(app)
      .get("/api/v1/admin/products?limit=50")
      .set(auth(adminToken));
    expect(list.status).toBe(200);
    expect(list.body.success).toBe(true);
    expect(
      list.body.items.some((item) => item._id === product._id.toString()),
    ).toBe(true);

    const detail = await request(app)
      .get(`/api/v1/admin/products/${product._id}`)
      .set(auth(adminToken));
    expect(detail.status).toBe(200);
    expect(detail.body.product._id).toBe(product._id.toString());

    const alias = await request(app)
      .post(`/api/v1/admin/products/${product._id}`)
      .set(auth(adminToken));
    expect(alias.status).toBe(200);
    expect(alias.body.product._id).toBe(product._id.toString());

    const missing = await request(app)
      .get(`/api/v1/admin/products/${missingId()}`)
      .set(auth(adminToken));
    expect(missing.status).toBe(404);
  });

  it("updates products through admin and legacy routes", async () => {
    const { product } = await createPublishedProduct();
    const patchedTitle = `Patched ${Date.now()}`;

    const patch = await request(app)
      .patch(`/api/v1/admin/products/${product._id}`)
      .set(auth(adminToken))
      .send({ title: patchedTitle, price: 150 });
    expect(patch.status).toBe(200);
    expect(patch.body.product.title).toBe(patchedTitle);

    const beforePut = await Product.findById(product._id);
    expect(beforePut.price).toBe(150);

    const legacyTitle = `Legacy ${Date.now()}`;
    const put = await request(app)
      .put("/api/v1/product/update")
      .set(auth(adminToken))
      .send({ productId: product._id.toString(), title: legacyTitle });
    expect(put.status).toBe(200);
    expect(put.body.product.title).toBe(legacyTitle);

    const missing = await request(app)
      .patch(`/api/v1/admin/products/${missingId()}`)
      .set(auth(adminToken))
      .send({ title: "Missing" });
    expect(missing.status).toBe(404);
  });

  it("bulk updates and exports product variants", async () => {
    const { product } = await createPublishedProduct();

    const stock = await request(app)
      .patch(`/api/v1/variants/${product._id}/bulk-stock`)
      .set(auth(adminToken))
      .send({ updates: [{ variantId: "v1", stock: 8 }] });
    expect(stock.status).toBe(200);
    expect(stock.body.updatedCount).toBe(1);

    const price = await request(app)
      .patch(`/api/v1/variants/${product._id}/bulk-price`)
      .set(auth(adminToken))
      .send({ updates: [{ variantId: "v1", price: 125, discountPrice: 115 }] });
    expect(price.status).toBe(200);
    expect(price.body.updatedCount).toBe(1);

    const refreshed = await Product.findById(product._id);
    expect(refreshed.variants[0].stock).toBe(8);
    expect(refreshed.variants[0].price).toBe(125);

    const exported = await request(app)
      .get(`/api/v1/variants/${product._id}/export`)
      .set(auth(adminToken));
    expect(exported.status).toBe(200);
    expect(exported.headers["content-type"]).toContain("text/csv");
    expect(exported.text).toContain("SKU");

    const invalid = await request(app)
      .patch(`/api/v1/variants/${product._id}/bulk-stock`)
      .set(auth(adminToken))
      .send({ updates: [] });
    expect(invalid.status).toBe(400);
  });

  it("deletes products individually and in bulk", async () => {
    const first = await createPublishedProduct();
    const second = await createPublishedProduct();

    const deletion = await request(app)
      .delete(`/api/v1/admin/products/${first.product._id}`)
      .set(auth(adminToken));
    expect(deletion.status).toBe(200);
    expect(await Product.findById(first.product._id)).toBeNull();

    const bulk = await request(app)
      .post("/api/v1/admin/products/bulk-delete")
      .set(auth(adminToken))
      .send({
        productIds: [second.product._id.toString(), missingId()],
      });
    expect(bulk.status).toBe(200);
    expect(bulk.body.success).toBe(false);
    expect(bulk.body.partialSuccess).toBe(true);
    expect(bulk.body.results.successCount).toBe(1);
    expect(bulk.body.results.failureCount).toBe(1);

    const missing = await request(app)
      .delete(`/api/v1/admin/products/${missingId()}`)
      .set(auth(adminToken));
    expect(missing.status).toBe(404);
  });
});
