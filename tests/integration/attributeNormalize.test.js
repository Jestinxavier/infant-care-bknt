const request = require("supertest");
const app = require("../../src/app");
const Category = require("../../src/models/Category");
const Product = require("../../src/models/Product");
const AttributeDefinition = require("../../src/models/AttributeDefinition");
const {
  createVerifiedUser,
  accessTokenFor,
} = require("../helpers/authFixtures");

let counter = 0;
const unique = (prefix) => `${prefix}-${Date.now()}-${counter++}`;
const auth = (token) => ({ Authorization: `Bearer ${token}` });

const createProduct = async () => {
  const token = unique("norm");
  const category = await Category.create({
    name: `Normalize Category ${token}`,
    code: `normalize-category-${token}`,
    isActive: true,
  });
  return Product.create({
    title: `Normalize product ${token}`,
    description: "Product for normalize tests",
    category: category._id,
    categoryName: category.name,
    categoryCode: category.code,
    url_key: `normalize-product-${token}`,
    sku: `NRM-${token}`.toUpperCase(),
    status: "published",
    product_type: "SIMPLE",
    price: 250,
    stock: 4,
    stockObj: { available: 4, isInStock: true },
    images: ["https://example.com/normalize.jpg"],
  });
};

/**
 * Writes a raw filter value straight to the collection, bypassing the
 * pre-save canonicalizer, to simulate legacy data saved before it existed.
 */
const setRawMaterial = (productId, values) =>
  Product.collection.updateOne(
    { _id: productId },
    { $set: { "filterAttributes.material": values } },
  );

const readMaterial = async (productId) =>
  (await Product.findById(productId).lean()).filterAttributes?.material;

describe("Attribute value normalize (apply to products)", () => {
  let adminToken;

  beforeEach(async () => {
    const admin = await createVerifiedUser({ role: "admin" });
    adminToken = accessTokenFor(admin);
  });

  it("previews, rewrites alias spellings to the canonical value, and clears aliases", async () => {
    const attribute = await AttributeDefinition.create({
      code: "material",
      label: "Material",
      type: "enum",
      uiType: "dropdown",
      role: "metadata",
      allowedValues: [
        { value: "cotton", label: "Cotton", synonyms: ["100-cotton"] },
        { value: "linen", label: "Linen" },
      ],
    });
    const stale = await createProduct();
    const clean = await createProduct();
    const unknown = await createProduct();
    await setRawMaterial(stale._id, ["100-cotton"]);
    await setRawMaterial(clean._id, ["cotton"]);
    await setRawMaterial(unknown._id, ["bamboo-silk"]);
    const path = `/api/v1/admin/attributes/${attribute._id}/values/normalize`;

    // Preview: counts the stale product, reports the unknown value, saves nothing
    const preview = await request(app)
      .post(path)
      .set(auth(adminToken))
      .send({ dryRun: true });
    expect(preview.status).toBe(200);
    expect(preview.body.dryRun).toBe(true);
    expect(preview.body.productsChanged).toBe(1);
    expect(preview.body.results).toEqual([
      { value: "cotton", label: "Cotton", products: 1, from: ["100-cotton"] },
    ]);
    expect(preview.body.unresolved).toEqual([
      { value: "bamboo-silk", products: 1 },
    ]);
    expect(await readMaterial(stale._id)).toEqual(["100-cotton"]);

    // Apply: rewrites the stale product and clears the alias
    const applied = await request(app)
      .post(path)
      .set(auth(adminToken))
      .send({ clearAliases: true });
    expect(applied.status).toBe(200);
    expect(applied.body.productsChanged).toBe(1);
    expect(applied.body.failed).toBe(0);
    expect(applied.body.aliasesCleared).toBe(1);
    expect(await readMaterial(stale._id)).toEqual(["cotton"]);
    expect(await readMaterial(clean._id)).toEqual(["cotton"]);
    // Values matching nothing are reported, never guessed
    expect(await readMaterial(unknown._id)).toEqual(["bamboo-silk"]);

    const saved = await AttributeDefinition.findById(attribute._id).lean();
    expect(saved.allowedValues.find((v) => v.value === "cotton").synonyms).toEqual([]);

    // Nothing left to rewrite
    const again = await request(app)
      .post(path)
      .set(auth(adminToken))
      .send({ dryRun: true });
    expect(again.body.productsChanged).toBe(0);
    expect(again.body.results).toEqual([]);
  });

  it("returns 404 for an unknown attribute", async () => {
    const res = await request(app)
      .post("/api/v1/admin/attributes/64b7f0000000000000000000/values/normalize")
      .set(auth(adminToken))
      .send({ dryRun: true });
    expect(res.status).toBe(404);
  });
});
