const request = require("supertest");
const app = require("../../src/app");
const Product = require("../../src/models/Product");
const Category = require("../../src/models/Category");
const User = require("../../src/models/user");
const AttributeDefinition = require("../../src/models/AttributeDefinition");

describe("Bulk Import (validate + commit)", () => {
  let adminToken;

  // The global afterEach wipes every collection, and requireAdmin re-fetches
  // the user from the DB on each request — so the admin must be re-seeded (and
  // logged in) before every test.
  beforeEach(async () => {
    await User.create({
      username: "bulkimportadmin",
      email: "bulkimportadmin@example.com",
      password: "Password123!",
      role: "admin",
      isEmailVerified: true,
    });

    const loginRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "bulkimportadmin@example.com", password: "Password123!" });

    expect(loginRes.status).toBe(200);
    // The API sets tokens in HttpOnly cookies rather than the response body.
    const accessCookie = (loginRes.headers["set-cookie"] || []).find((c) =>
      c.startsWith("access_token=")
    );
    adminToken = accessCookie
      ? accessCookie.split(";")[0].split("=")[1]
      : null;
    expect(adminToken).toBeTruthy();

    await Category.create({
      name: "Bulk Import Category",
      code: "bulk-import-cat",
      isActive: true,
    });

    await AttributeDefinition.create([
      {
        code: "color",
        label: "Color",
        uiType: "swatch",
        role: "variant",
        allowedValues: [
          { value: "red", label: "Red" },
          { value: "blue", label: "Blue" },
        ],
      },
      {
        code: "size",
        label: "Size",
        role: "variant",
        allowedValues: [
          { value: "0-3-months", label: "0-3 Months" },
          { value: "3-6-months", label: "3-6 Months" },
        ],
      },
      {
        code: "material",
        label: "Material",
        role: "metadata",
        allowedValues: [{ value: "cotton", label: "Cotton" }],
      },
    ]);
  });

  const auth = () => ({ Authorization: `Bearer ${adminToken}` });

  /** Base payload for a new configurable product with two blank-SKU variants. */
  const newConfigurable = (overrides = {}) => ({
    csvId: "TMP_new_1",
    isNewProduct: true,
    title: "Baby Romper",
    sku: "BABY-ROP-001",
    category: "Bulk Import Category",
    status: "draft",
    product_type: "CONFIGURABLE",
    price: 0,
    stock: 0,
    images: [],
    variants: [
      {
        csvId: "TMP_v1",
        isNewVariant: true,
        sku: "",
        price: 499,
        stock: 10,
        images: [],
        attributes: { color: "red", size: "0-3-months" },
      },
      {
        csvId: "TMP_v2",
        isNewVariant: true,
        sku: "",
        price: 599,
        stock: 5,
        images: [],
        attributes: { color: "blue", size: "3-6-months" },
      },
    ],
    ...overrides,
  });

  // ─── Create path ────────────────────────────────────────────────────────────

  describe("create (new product)", () => {
    it("honors the CSV-provided parent SKU and generates child SKUs on the same pattern", async () => {
      const res = await request(app)
        .post("/api/v1/admin/products/commit-import")
        .set(auth())
        .send({ products: [newConfigurable()] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const product = await Product.findOne({ title: "Baby Romper" }).lean();
      expect(product).not.toBeNull();
      expect(product.sku).toBe("BABY-ROP-001");

      expect(product.variants.length).toBe(2);
      for (const v of product.variants) {
        expect(String(v.sku)).toMatch(/^BABY-ROP-001-/);
      }
    });

    it("auto-generates the parent SKU from title + category when the CSV omits one", async () => {
      const payload = newConfigurable({ sku: "" });
      const res = await request(app)
        .post("/api/v1/admin/products/commit-import")
        .set(auth())
        .send({ products: [payload] });

      expect(res.status).toBe(200);

      const product = await Product.findOne({ title: "Baby Romper" }).lean();
      expect(product.sku).toBeTruthy();
      expect(product.sku.length).toBeGreaterThan(0);
    });
  });

  // ─── Update path: merge / image preservation ────────────────────────────────

  describe("update (existing product)", () => {
    /** Helper: commit a fresh configurable and return its DB document. */
    const createOnce = async () => {
      await request(app)
        .post("/api/v1/admin/products/commit-import")
        .set(auth())
        .send({ products: [newConfigurable()] });
      return Product.findOne({ title: "Baby Romper" }).lean();
    };

    it("keeps DB variants that are omitted from a re-import (non-destructive merge)", async () => {
      const product = await createOnce();
      const blue = product.variants.find(
        (v) => v.attributes.get?.("color") === "blue" || v.attributes?.color === "blue"
      );

      // Re-import with ONLY the red variant
      const red = product.variants.find(
        (v) => v.attributes.get?.("color") === "red" || v.attributes?.color === "red"
      );

      const updatePayload = {
        csvId: product._id.toString(),
        isNewProduct: false,
        title: product.title,
        sku: product.sku,
        category: "Bulk Import Category",
        status: "draft",
        product_type: "CONFIGURABLE",
        price: 0,
        stock: 0,
        images: [],
        variants: [
          {
            csvId: red.id,
            isNewVariant: false,
            sku: red.sku,
            price: 499,
            stock: 10,
            images: [],
            attributes: { color: "red", size: "0-3-months" },
          },
        ],
      };

      const res = await request(app)
        .post("/api/v1/admin/products/commit-import")
        .set(auth())
        .send({ products: [updatePayload] });

      expect(res.status).toBe(200);

      const updated = await Product.findById(product._id).lean();
      // Both variants must still be present
      expect(updated.variants.length).toBe(2);

      // The variantOptions must still include blue
      const colorOpt = updated.variantOptions.find(
        (o) => o.code === "color"
      );
      const hasBlue = colorOpt.values.some((v) => v.value === "blue");
      expect(hasBlue).toBe(true);
    });

    it("preserves existing variant images when the CSV row provides no images", async () => {
      // First commit: give the red variant an image
      const payload = newConfigurable();
      payload.variants[0].images = ["https://cdn.example.com/red.jpg"];

      await request(app)
        .post("/api/v1/admin/products/commit-import")
        .set(auth())
        .send({ products: [payload] });

      const product = await Product.findOne({ title: "Baby Romper" }).lean();
      const red = product.variants.find(
        (v) => v.attributes.get?.("color") === "red" || v.attributes?.color === "red"
      );
      expect(red.images).toEqual(["https://cdn.example.com/red.jpg"]);

      // Re-import WITHOUT images for the red variant
      const updatePayload = {
        csvId: product._id.toString(),
        isNewProduct: false,
        title: product.title,
        sku: product.sku,
        category: "Bulk Import Category",
        status: "draft",
        product_type: "CONFIGURABLE",
        price: 0,
        stock: 0,
        images: [],
        variants: [
          {
            csvId: red.id,
            isNewVariant: false,
            sku: red.sku,
            price: 499,
            stock: 10,
            images: [],
            attributes: { color: "red", size: "0-3-months" },
          },
        ],
      };

      await request(app)
        .post("/api/v1/admin/products/commit-import")
        .set(auth())
        .send({ products: [updatePayload] });

      const updated = await Product.findById(product._id).lean();
      const updatedRed = updated.variants.find(
        (v) => v.attributes.get?.("color") === "red" || v.attributes?.color === "red"
      );
      expect(updatedRed.images).toEqual(["https://cdn.example.com/red.jpg"]);
    });
  });

  // ─── Validate: update-path SKU collision guard ──────────────────────────────

  describe("validate", () => {
    it("rejects an update that would adopt a SKU owned by a different product", async () => {
      // Seed two products via commit
      const resA = await request(app)
        .post("/api/v1/admin/products/commit-import")
        .set(auth())
        .send({ products: [newConfigurable({ sku: "SKU-A", title: "Prod A" })] });
      const resB = await request(app)
        .post("/api/v1/admin/products/commit-import")
        .set(auth())
        .send({ products: [newConfigurable({ csvId: "TMP_new_2", sku: "SKU-B", title: "Prod B" })] });

      const prodA = await Product.findOne({ sku: "SKU-A" }).lean();
      expect(prodA).not.toBeNull();

      // Try to change A's SKU to B's SKU
      const updatePayload = {
        csvId: prodA._id.toString(),
        isNewProduct: false,
        title: "Prod A",
        sku: "SKU-B",
        category: "Bulk Import Category",
        status: "draft",
        product_type: "CONFIGURABLE",
        price: 0,
        stock: 0,
        images: [],
        variants: [
          {
            csvId: "TMP_v1",
            isNewVariant: true,
            sku: "",
            price: 499,
            stock: 10,
            images: [],
            attributes: { color: "red", size: "0-3-months" },
          },
        ],
      };

      const validateRes = await request(app)
        .post("/api/v1/admin/products/validate-import")
        .set(auth())
        .send({ products: [updatePayload] });

      expect(validateRes.status).toBe(200);
      expect(validateRes.body.data.valid).toBe(false);

      const skuError = validateRes.body.data.errors.find(
        (e) => e.field === "sku"
      );
      expect(skuError).toBeDefined();
      expect(skuError.message).toContain("already exists on another product");
    });
  });

  // ─── Global attribute registry validation ───────────────────────────────────

  describe("global attribute registry validation", () => {
    it("rejects a variant attribute value that is not in the registry", async () => {
      const payload = newConfigurable();
      payload.variants[0].attributes = { color: "red", size: "newborn" };

      const res = await request(app)
        .post("/api/v1/admin/products/validate-import")
        .set(auth())
        .send({ products: [payload] });

      expect(res.status).toBe(200);
      expect(res.body.data.valid).toBe(false);

      const err = res.body.data.errors.find(
        (e) => e.field === "attribute_size"
      );
      expect(err).toBeDefined();
      expect(err.message).toContain("global attribute registry");
      expect(err.message).toContain("Settings → Product Attributes");
      expect(err.message).toContain('"newborn"');
      expect(err.message).toContain('"0-3 Months"');
    });

    it("accepts a registered synonym and stores the registry canonical value", async () => {
      await AttributeDefinition.updateOne(
        { code: "size" },
        { $set: { "allowedValues.1.synonyms": ["newborn"] } }
      );

      const payload = newConfigurable();
      payload.variants[0].attributes = { color: "red", size: "newborn" };

      const res = await request(app)
        .post("/api/v1/admin/products/commit-import")
        .set(auth())
        .send({ products: [payload] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const product = await Product.findOne({ title: "Baby Romper" }).lean();
      const red = product.variants.find(
        (v) =>
          v.attributes.get?.("color") === "red" ||
          v.attributes?.color === "red"
      );
      const storedSize = red.attributes.get?.("size") ?? red.attributes?.size;
      expect(storedSize).toBe("3-6-months");
    });

    it("rejects a metadata attribute value that is not in the registry", async () => {
      const payload = newConfigurable({
        filterAttributes: { material: ["polyester"] },
      });

      const res = await request(app)
        .post("/api/v1/admin/products/validate-import")
        .set(auth())
        .send({ products: [payload] });

      expect(res.status).toBe(200);
      expect(res.body.data.valid).toBe(false);

      const err = res.body.data.errors.find(
        (e) => e.field === "filterAttributes.material"
      );
      expect(err).toBeDefined();
      expect(err.message).toContain("global attribute registry");
      expect(err.message).toContain("Settings → Product Attributes");
    });

    it("accepts a registered metadata value", async () => {
      const payload = newConfigurable({
        filterAttributes: { material: ["cotton"] },
      });

      const res = await request(app)
        .post("/api/v1/admin/products/validate-import")
        .set(auth())
        .send({ products: [payload] });

      expect(res.status).toBe(200);
      expect(res.body.data.valid).toBe(true);

      const materialErrors = res.body.data.errors.filter(
        (e) => e.field === "filterAttributes.material"
      );
      expect(materialErrors).toHaveLength(0);
    });
  });
});
