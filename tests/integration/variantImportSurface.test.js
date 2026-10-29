const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../../src/app");
const Product = require("../../src/models/Product");
const {
  createVerifiedUser,
  accessTokenFor,
} = require("../helpers/authFixtures");

let counter = 0;
const unique = (prefix) => `${prefix}-${Date.now()}-${counter++}`;
const auth = (token) => ({ Authorization: `Bearer ${token}` });

const makeProduct = async (overrides = {}) =>
  Product.create({
    title: `Import product ${unique("IMP")}`,
    category: new mongoose.Types.ObjectId(),
    status: "published",
    sku: unique("IMP-PRODUCT"),
    variants: [],
    ...overrides,
  });

describe("Variant import surface", () => {
  let token;

  beforeEach(async () => {
    const user = await createVerifiedUser();
    token = accessTokenFor(user);
  });

  it("requires authentication and a CSV file", async () => {
    const product = await makeProduct();

    expect(
      (
        await request(app)
          .post(`/api/v1/variants/${product._id}/import`)
          .attach("file", Buffer.from("Price,Stock,SKU\n899,7,IMP-1\n"), "variants.csv")
      ).status,
    ).toBe(401);

    const noFile = await request(app)
      .post(`/api/v1/variants/${product._id}/import`)
      .set(auth(token))
      .field("updateExisting", "true");
    expect(noFile.status).toBe(400);
    expect(noFile.body.message).toBe("No CSV file uploaded");
  });

  it("validates a CSV without persisting when validateOnly is true", async () => {
    const product = await makeProduct();
    const csv = [
      "Price,Stock,SKU,Image 1",
      "899,7,IMP-VALIDATE,https://cdn.example.com/one.jpg",
      "not-a-price,2,IMP-INVALID,",
    ].join("\n");

    const response = await request(app)
      .post(`/api/v1/variants/${product._id}/import`)
      .set(auth(token))
      .field("validateOnly", "true")
      .attach("file", Buffer.from(csv), "variants.csv");

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Validation complete");
    expect(response.body.results).toEqual(
      expect.objectContaining({
        total: 2,
        created: 0,
        updated: 0,
        skipped: 1,
      }),
    );
    expect(response.body.results.errors[0].row).toBe(3);
    expect((await Product.findById(product._id)).variants).toHaveLength(0);
  });

  it("creates a variant from CSV with pricing, stock, SKU, and images", async () => {
    const product = await makeProduct();
    const csv = [
      "Price,Stock,SKU,Image 1",
      "899,7,IMP-ONE,https://cdn.example.com/one.jpg",
    ].join("\n");

    const created = await request(app)
      .post(`/api/v1/variants/${product._id}/import`)
      .set(auth(token))
      .field("updateExisting", "true")
      .attach("file", Buffer.from(csv), "variants.csv");

    expect(created.status).toBe(200);
    expect(created.body.message).toBe("Import complete");
    expect(created.body.results).toEqual(
      expect.objectContaining({ total: 1, created: 1, updated: 0, skipped: 0 }),
    );

    const afterCreate = await Product.findById(product._id);
    expect(afterCreate.variants).toHaveLength(1);
    expect(afterCreate.variants[0]).toEqual(
      expect.objectContaining({
        sku: "IMP-ONE",
        price: 899,
        stock: 7,
        images: ["https://cdn.example.com/one.jpg"],
      }),
    );
    expect(afterCreate.variants[0].id).toBeTruthy();
  });

  it("preserves the embedded variant id when re-importing by SKU", async () => {
    const product = await makeProduct({
      variants: [
        {
          id: "KEEP-VARIANT-ID",
          sku: "IMP-KEEP",
          price: 100,
          stock: 3,
        },
      ],
    });
    const csv = ["Price,Stock,SKU", "250,9,IMP-KEEP"].join("\n");

    const response = await request(app)
      .post(`/api/v1/variants/${product._id}/import`)
      .set(auth(token))
      .field("updateExisting", "true")
      .attach("file", Buffer.from(csv), "variants.csv");

    expect(response.status).toBe(200);
    expect(response.body.results).toEqual(
      expect.objectContaining({ total: 1, created: 0, updated: 1, skipped: 0 }),
    );

    const updated = await Product.findById(product._id);
    expect(updated.variants).toHaveLength(1);
    expect(updated.variants[0].id).toBe("KEEP-VARIANT-ID");
    expect(updated.variants[0]).toEqual(
      expect.objectContaining({ sku: "IMP-KEEP", price: 250, stock: 9 }),
    );
  });

  it("returns a generic failure when the product does not exist", async () => {
    const response = await request(app)
      .post(`/api/v1/variants/${new mongoose.Types.ObjectId()}/import`)
      .set(auth(token))
      .attach("file", Buffer.from("Price,Stock,SKU\n899,7,IMP-X\n"), "variants.csv");

    expect(response.status).toBe(500);
    expect(response.body.message).toBe("Failed to import variants");
  });
});
