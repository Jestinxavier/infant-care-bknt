const request = require("supertest");
const app = require("../../src/app");
const Category = require("../../src/models/Category");
const Product = require("../../src/models/Product");
const bundleService = require("../../src/features/product/bundle.service");
const {
  createVerifiedUser,
  accessTokenFor,
} = require("../helpers/authFixtures");

let counter = 0;
const uniqueToken = (prefix) => `${prefix}-${Date.now()}-${counter++}`;
const auth = (token) => ({ Authorization: `Bearer ${token}` });

async function makeCategory() {
  const token = uniqueToken("bundle-category");
  return Category.create({
    name: `Bundle Category ${token}`,
    code: token,
    isActive: true,
  });
}

async function makeSimpleProduct({
  category,
  stock = 10,
  status = "published",
  price = 100,
} = {}) {
  const token = uniqueToken("child");
  return Product.create({
    title: `Bundle Child ${token}`,
    description: "Bundle child fixture",
    category: category._id,
    categoryName: category.name,
    categoryCode: category.code,
    url_key: token,
    sku: token.toUpperCase(),
    status,
    product_type: "SIMPLE",
    price,
    stock,
    stockObj: { available: stock, isInStock: stock > 0 },
    images: ["https://example.com/child.jpg"],
  });
}

async function makeConfigurableProduct({ category, variantStock = 8 } = {}) {
  const token = uniqueToken("variant-child");
  return Product.create({
    title: `Variant Child ${token}`,
    description: "Configurable bundle child fixture",
    category: category._id,
    categoryName: category.name,
    categoryCode: category.code,
    url_key: token,
    sku: token.toUpperCase(),
    status: "published",
    product_type: "CONFIGURABLE",
    price: 200,
    stock: variantStock,
    stockObj: { available: variantStock, isInStock: variantStock > 0 },
    images: ["https://example.com/variant-child.jpg"],
    variants: [
      {
        id: "v1",
        sku: `${token.toUpperCase()}-V1`,
        url_key: `${token}-v1`,
        price: 200,
        stock: variantStock,
        stockObj: {
          available: variantStock,
          isInStock: variantStock > 0,
        },
        attributes: { color: "Red", size: "M" },
        images: ["https://example.com/variant.jpg"],
      },
    ],
  });
}

async function makeBundle({ category, items, price = 899, stock = 5 }) {
  const token = uniqueToken("bundle");
  return Product.create({
    title: `Bundle Product ${token}`,
    description: "Bundle fixture",
    category: category._id,
    categoryName: category.name,
    categoryCode: category.code,
    url_key: token,
    sku: token.toUpperCase(),
    status: "published",
    product_type: "BUNDLE",
    price,
    stock,
    stockObj: { available: stock, isInStock: stock > 0 },
    images: ["https://example.com/bundle.jpg"],
    bundle_config: { items },
  });
}

describe("Bundle product surface", () => {
  let category;

  beforeEach(async () => {
    category = await makeCategory();
  });

  it("validates bundle configs and calculates per-bundle stock deductions", async () => {
    const simple = await makeSimpleProduct({ category });
    const configurable = await makeConfigurableProduct({ category });
    const variantSku = configurable.variants[0].sku;

    const missing = await bundleService.validateBundleConfig(null);
    expect(missing.valid).toBe(false);
    expect(missing.errors).toContain(
      "bundle_config is required for BUNDLE products",
    );

    const empty = await bundleService.validateBundleConfig({ items: [] });
    expect(empty.valid).toBe(false);
    expect(empty.errors).toContain(
      "bundle_config.items must have at least one item",
    );

    const malformed = await bundleService.validateBundleConfig({
      items: [{ sku: "", qty: 0 }, { qty: -1 }],
    });
    expect(malformed.valid).toBe(false);
    expect(malformed.errors).toEqual(
      expect.arrayContaining([
        "Item 1: sku is required",
        "Item 1: qty must be a positive number",
        "Item 2: sku is required",
        "Item 2: qty must be a positive number",
      ]),
    );

    const unknown = await bundleService.validateBundleConfig({
      items: [{ sku: "MISSING-SKU", qty: 1 }],
    });
    expect(unknown.valid).toBe(false);
    expect(unknown.errors).toContain('SKU "MISSING-SKU" not found');

    const validConfig = {
      items: [
        { sku: simple.sku, qty: 2 },
        { sku: variantSku, qty: 1 },
      ],
    };
    const valid = await bundleService.validateBundleConfig(validConfig);
    expect(valid).toEqual({ valid: true, errors: [] });

    expect(
      bundleService.calculateBundleStockDeductions(validConfig, 3),
    ).toEqual([
      { sku: simple.sku, qty: 6 },
      { sku: variantSku, qty: 3 },
    ]);
    expect(
      bundleService.calculateBundleStockDeductions(null, 2),
    ).toEqual([]);
  });

  it("resolves availability from simple and variant child stock", async () => {
    const simple = await makeSimpleProduct({ category, stock: 10 });
    const variantChild = await makeConfigurableProduct({
      category,
      variantStock: 8,
    });
    const variantSku = variantChild.variants[0].sku;

    const config = {
      items: [
        { sku: simple.sku, qty: 2 },
        { sku: variantSku, qty: 3 },
      ],
    };
    const available = await bundleService.getBundleAvailability(config);
    expect(available).toEqual({ isInStock: true, availableQty: 2 });

    const missing = await bundleService.getBundleAvailability({
      items: [{ sku: "MISSING-SKU", qty: 1 }],
    });
    expect(missing).toEqual({ isInStock: false, availableQty: 0 });

    const empty = await bundleService.getBundleAvailability(null);
    expect(empty).toEqual({ isInStock: false, availableQty: 0 });
  });

  it("publishes bundles with derived stock, pricing, and enriched children", async () => {
    const first = await makeSimpleProduct({ category, stock: 10, price: 100 });
    const second = await makeSimpleProduct({ category, stock: 6, price: 150 });
    const bundle = await makeBundle({
      category,
      price: 899,
      items: [
        { sku: first.sku, qty: 2 },
        { sku: second.sku, qty: 3 },
      ],
    });

    const detail = await request(app).get(
      `/api/v1/product/url/${bundle.url_key}`,
    );
    expect(detail.status).toBe(200);
    expect(Number(detail.body.pricing.price)).toBe(899);
    expect(detail.body.stock).toMatchObject({
      available: 2,
      isInStock: true,
    });
    expect(detail.body.bundle_config.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sku: first.sku, qty: 2, title: first.title }),
        expect.objectContaining({
          sku: second.sku,
          qty: 3,
          title: second.title,
        }),
      ]),
    );
  });

  it("marks bundles unavailable when a child is unpublished or out of stock", async () => {
    const availableChild = await makeSimpleProduct({
      category,
      stock: 10,
    });
    const draftChild = await makeSimpleProduct({
      category,
      stock: 10,
      status: "draft",
    });
    const draftBundle = await makeBundle({
      category,
      items: [
        { sku: availableChild.sku, qty: 1 },
        { sku: draftChild.sku, qty: 1 },
      ],
    });

    const findDetail = async () => {
      const detail = await request(app).get(
        `/api/v1/product/url/${draftBundle.url_key}`,
      );
      expect(detail.status).toBe(200);
      return detail.body;
    };

    const draftDetail = await findDetail();
    expect(draftDetail.stock).toMatchObject({
      available: 0,
      isInStock: false,
    });

    await Product.updateOne(
      { _id: draftChild._id },
      {
        $set: {
          status: "published",
          stock: 0,
          "stockObj.available": 0,
          "stockObj.isInStock": false,
        },
      },
    );

    const noStockDetail = await findDetail();
    expect(noStockDetail.stock).toMatchObject({
      available: 0,
      isInStock: false,
    });
  });

  it("edits bundle composition and pricing through the admin product route", async () => {
    const admin = await createVerifiedUser({ role: "admin" });
    const first = await makeSimpleProduct({ category, stock: 12 });
    const second = await makeSimpleProduct({ category, stock: 3 });
    const bundle = await makeBundle({
      category,
      price: 899,
      items: [{ sku: first.sku, qty: 2 }],
    });

    const invalid = await request(app)
      .patch(`/api/v1/admin/products/${bundle._id}`)
      .set(auth(accessTokenFor(admin)))
      .send({
        bundle_config: { items: [{ sku: "MISSING-SKU", qty: 1 }] },
      });
    expect(invalid.status).toBe(400);
    expect(invalid.body.errorCode).toBe("INVALID_BUNDLE_CONFIG");
    expect(invalid.body.errors).toContain('SKU "MISSING-SKU" not found');

    const response = await request(app)
      .patch(`/api/v1/admin/products/${bundle._id}`)
      .set(auth(accessTokenFor(admin)))
      .send({
        price: 999,
        bundle_config: { items: [{ sku: second.sku, qty: 3 }] },
      });
    expect(response.status).toBe(200);

    const updated = await Product.findById(bundle._id).lean();
    expect(updated.price).toBe(999);
    expect(updated.bundle_config.items).toEqual([
      expect.objectContaining({ sku: second.sku, qty: 3 }),
    ]);

    const detail = await request(app).get(
      `/api/v1/product/url/${bundle.url_key}`,
    );
    expect(detail.status).toBe(200);
    expect(Number(detail.body.pricing.price)).toBe(999);
    expect(detail.body.stock).toMatchObject({
      available: 1,
      isInStock: true,
    });
  });
});
