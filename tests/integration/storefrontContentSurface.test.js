const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../../src/app");
const Footer = require("../../src/models/Footer");
const Homepage = require("../../src/models/Homepage");
const Product = require("../../src/models/Product");
const StockNotification = require("../../src/models/StockNotification");

let counter = 0;
const uniqueSku = (prefix) => `${prefix}-${Date.now()}-${counter++}`;

const makeProduct = async (overrides = {}) => {
  const suffix = uniqueSku("CONTENT");
  return Product.create({
    title: `Content product ${suffix}`,
    category: new mongoose.Types.ObjectId(),
    status: "published",
    variants: [
      {
        id: `variant-${suffix}`,
        name: "Default",
        sku: `${suffix}-V`,
        price: 499,
        stock: 5,
        stockObj: { available: 5, isInStock: true },
        attributes: { size: "0-3M" },
      },
    ],
    stockObj: { available: 5, isInStock: true },
    ...overrides,
  });
};

describe("Storefront content surface", () => {
  describe("footer", () => {
    it("returns the stored footer content", async () => {
      await Footer.create({
        content: {
          features: [{ title: "Free shipping" }],
          footer: { sections: [], social: [], legal: {} },
        },
      });

      const response = await request(app).get("/api/v1/footer");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.features).toHaveLength(1);
      expect(response.body.data.footer).toBeDefined();
    });

    it("returns null data when no footer document exists", async () => {
      const response = await request(app).get("/api/v1/footer");

      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.objectContaining({
          success: true,
          message: "Footer data not found",
          data: null,
        }),
      );
    });
  });

  describe("homepage", () => {
    it("returns enabled widgets in display order and hides disabled widgets", async () => {
      await Homepage.create({ title: "Second", enabled: true, order: 2, content: [] });
      await Homepage.create({ title: "First", enabled: true, order: 1, content: [] });
      await Homepage.create({ title: "Hidden", enabled: false, order: 0, content: [] });

      const response = await request(app).get("/api/v1/homepage");

      expect(response.status).toBe(200);
      expect(response.body.count).toBe(2);
      expect(response.body.data.map((widget) => widget.title)).toEqual([
        "First",
        "Second",
      ]);
    });

    it("filters product slider entries down to published in-stock products", async () => {
      const inStock = await makeProduct();
      const outOfStock = await makeProduct({
        stockObj: { available: 0, isInStock: false },
        variants: [],
      });

      await Homepage.create({
        title: "Product slider",
        enabled: true,
        order: 1,
        block_type: "productSlider",
        content: [
          { productId: inStock._id.toString() },
          { productId: outOfStock._id.toString() },
        ],
      });

      const response = await request(app).get("/api/v1/homepage");

      expect(response.status).toBe(200);
      expect(response.body.data[0].content).toEqual([
        expect.objectContaining({ productId: inStock._id.toString() }),
      ]);
    });

    it("returns 404 when no enabled homepage widgets exist", async () => {
      await Homepage.create({ title: "Draft widget", enabled: false, order: 1 });

      const response = await request(app).get("/api/v1/homepage");

      expect(response.status).toBe(404);
      expect(response.body).toEqual(
        expect.objectContaining({ success: false, data: [] }),
      );
    });

    it("fetches a widget by id and rejects malformed ids", async () => {
      const widget = await Homepage.create({
        title: "By id",
        enabled: true,
        order: 1,
      });

      const found = await request(app).get(`/api/v1/homepage/${widget._id}`);
      expect(found.status).toBe(200);
      expect(found.body.data.title).toBe("By id");

      const invalid = await request(app).get("/api/v1/homepage/not-an-object-id");
      expect(invalid.status).toBe(400);
      expect(invalid.body.message).toBe("Invalid homepage ID format");

      const missing = await request(app).get(
        `/api/v1/homepage/${new mongoose.Types.ObjectId()}`,
      );
      expect(missing.status).toBe(404);
    });
  });

  describe("stock notifications", () => {
    it("validates required fields, email format, product and variant", async () => {
      const product = await makeProduct();
      const variantId = product.variants[0].id;

      const missing = await request(app)
        .post("/api/v1/stock-notify/register")
        .send({ productId: product._id.toString() });
      expect(missing.status).toBe(400);
      expect(missing.body.message).toContain("required");

      const badEmail = await request(app)
        .post("/api/v1/stock-notify/register")
        .send({
          productId: product._id.toString(),
          variantId,
          email: "not-an-email",
        });
      expect(badEmail.status).toBe(400);
      expect(badEmail.body.message).toBe("Invalid email format");

      const missingProduct = await request(app)
        .post("/api/v1/stock-notify/register")
        .send({
          productId: new mongoose.Types.ObjectId().toString(),
          variantId,
          email: "interest@example.com",
        });
      expect(missingProduct.status).toBe(404);
      expect(missingProduct.body.message).toBe("Product not found");

      const missingVariant = await request(app)
        .post("/api/v1/stock-notify/register")
        .send({
          productId: product._id.toString(),
          variantId: "missing-variant",
          email: "interest@example.com",
        });
      expect(missingVariant.status).toBe(404);
      expect(missingVariant.body.message).toBe("Variant not found");
    });

    it("registers one pending request per email and variant without duplicating", async () => {
      const product = await makeProduct();
      const variantId = product.variants[0].id;
      const payload = {
        productId: product._id.toString(),
        variantId,
        email: "Interest@Example.com",
        userId: new mongoose.Types.ObjectId().toString(),
      };

      const first = await request(app)
        .post("/api/v1/stock-notify/register")
        .send(payload);
      expect(first.status).toBe(200);
      expect(first.body.isNew).toBe(true);

      const second = await request(app)
        .post("/api/v1/stock-notify/register")
        .send(payload);
      expect(second.status).toBe(200);
      expect(second.body.isNew).toBe(false);

      const records = await StockNotification.find({});
      expect(records).toHaveLength(1);
      expect(records[0].email).toBe("interest@example.com");
      expect(records[0].productName).toBe(product.title);
      expect(records[0].variantName).toBeTruthy();
      expect(records[0].status).toBe("pending");
    });
  });
});
