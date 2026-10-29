const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../../src/app");
const Category = require("../../src/models/Category");
const AttributeDefinition = require("../../src/models/AttributeDefinition");
const {
  createVerifiedUser,
  accessTokenFor,
} = require("../helpers/authFixtures");

let counter = 0;
const uniqueToken = (prefix) => `${prefix}-${Date.now()}-${counter++}`;
const uniqueCode = (prefix) => `${prefix}-${Date.now()}-${counter++}`;
const uniqueAttributeCode = (prefix = "attr") =>
  `${prefix}_${Date.now()}_${counter++}`;

const createCategory = (overrides = {}) => {
  const token = uniqueToken("category");
  return Category.create({
    name: `Category ${token}`,
    code: token,
    isActive: true,
    ...overrides,
  });
};

const createAttribute = (overrides = {}) => {
  const code = overrides.code || uniqueAttributeCode();
  return AttributeDefinition.create({
    code,
    label: `Attribute ${code}`,
    type: "enum",
    uiType: "dropdown",
    role: "variant",
    allowedValues: [
      { value: "red", label: "Red" },
      { value: "blue", label: "Blue" },
    ],
    ...overrides,
  });
};

const createSwatchAttribute = (overrides = {}) => {
  const code = overrides.code || uniqueAttributeCode("swatch");
  return AttributeDefinition.create({
    code,
    label: `Swatch ${code}`,
    type: "enum",
    uiType: "swatch",
    role: "variant",
    allowedValues: [{ value: "red", label: "Red", hex: "#ff0000" }],
    ...overrides,
  });
};

const auth = (token) => ({ Authorization: `Bearer ${token}` });
const missingId = () => new mongoose.Types.ObjectId().toString();

const createViaCategoryApi = (token, path, fields) => {
  let req = request(app).post(path).set(auth(token));
  Object.entries(fields).forEach(([key, value]) => {
    req = req.field(key, String(value));
  });
  return req;
};

const updateViaCategoryApi = (token, path, fields) => {
  let req = request(app).put(path).set(auth(token));
  Object.entries(fields).forEach(([key, value]) => {
    req = req.field(key, String(value));
  });
  return req;
};

describe("Catalog surface", () => {
  let admin;
  let adminToken;

  beforeEach(async () => {
    admin = await createVerifiedUser({ role: "admin" });
    adminToken = accessTokenFor(admin);
  });

  describe("categories", () => {
    it("lists active categories publicly and all categories for admins", async () => {
      const active = await createCategory();
      const inactive = await createCategory({ isActive: false });

      const publicList = await request(app).get("/api/v1/category");
      expect(publicList.status).toBe(200);
      expect(publicList.body.success).toBe(true);
      expect(publicList.body.categories.map((c) => c._id)).toContain(
        active._id.toString(),
      );
      expect(publicList.body.categories.map((c) => c._id)).not.toContain(
        inactive._id.toString(),
      );

      const publicAll = await request(app).get(
        "/api/v1/category?includeInactive=true",
      );
      expect(publicAll.status).toBe(200);
      expect(publicAll.body.categories.map((c) => c._id)).toEqual(
        expect.arrayContaining([active._id.toString(), inactive._id.toString()]),
      );

      const adminList = await request(app)
        .get("/api/v1/admin/categories?includeInactive=true")
        .set(auth(adminToken));
      expect(adminList.status).toBe(200);
      expect(adminList.body.categories.map((c) => c._id)).toEqual(
        expect.arrayContaining([active._id.toString(), inactive._id.toString()]),
      );
    });

    it("returns category details and validates ids", async () => {
      const category = await createCategory();

      const detail = await request(app).get(
        `/api/v1/category/${category._id}`,
      );
      expect(detail.status).toBe(200);
      expect(detail.body.category).toHaveProperty("name", category.name);

      const adminDetail = await request(app)
        .get(`/api/v1/admin/categories/${category._id}`)
        .set(auth(adminToken));
      expect(adminDetail.status).toBe(200);
      expect(adminDetail.body.category).toHaveProperty("name", category.name);

      const adminAlias = await request(app)
        .post(`/api/v1/admin/categories/${category._id}`)
        .set(auth(adminToken));
      expect(adminAlias.status).toBe(200);
      expect(adminAlias.body.category).toHaveProperty("name", category.name);

      const malformed = await request(app).get("/api/v1/category/not-an-id");
      expect(malformed.status).toBe(400);

      const missing = await request(app).get(
        `/api/v1/category/${missingId()}`,
      );
      expect(missing.status).toBe(404);
    });

    it("creates categories through both prefixes and enforces uniqueness", async () => {
      const adminCode = uniqueCode("admin-created");
      const adminCreate = await createViaCategoryApi(
        adminToken,
        "/api/v1/admin/categories",
        {
          name: `Admin Created ${adminCode}`,
          code: adminCode,
          displayOrder: 2,
        },
      );
      expect(adminCreate.status).toBe(201);
      expect(adminCreate.body.category).toHaveProperty("code", adminCode);
      expect(adminCreate.body.category.slug).toBe(`/category/${adminCode}`);

      const publicCode = uniqueCode("public-created");
      const publicCreate = await createViaCategoryApi(
        adminToken,
        "/api/v1/category",
        {
          name: `Public Created ${publicCode}`,
          code: publicCode,
        },
      );
      expect(publicCreate.status).toBe(201);
      expect(publicCreate.body.category).toHaveProperty("code", publicCode);

      const duplicate = await createViaCategoryApi(
        adminToken,
        "/api/v1/admin/categories",
        {
          name: `Duplicate ${adminCode}`,
          code: adminCode,
        },
      );
      expect(duplicate.status).toBe(400);

      const unauthenticated = await request(app)
        .post("/api/v1/category")
        .send({ name: "No Auth", code: uniqueCode("no-auth") });
      expect(unauthenticated.status).toBe(401);
    });

    it("updates categories through the storefront and admin prefixes", async () => {
      const category = await createCategory();
      const updatedName = `Updated ${uniqueToken("category")}`;

      const update = await updateViaCategoryApi(
        adminToken,
        `/api/v1/category/${category._id}`,
        { name: updatedName, isActive: "false", displayOrder: 4 },
      );
      expect(update.status).toBe(200);
      expect(update.body.category).toHaveProperty("name", updatedName);
      expect(update.body.category).toHaveProperty("isActive", false);
      expect(update.body.category).toHaveProperty("displayOrder", 4);

      const adminUpdate = await request(app)
        .patch(`/api/v1/admin/categories/${category._id}`)
        .set(auth(adminToken))
        .field("displayOrder", "7");
      expect(adminUpdate.status).toBe(200);
      expect(adminUpdate.body.category).toHaveProperty("displayOrder", 7);

      const malformed = await updateViaCategoryApi(
        adminToken,
        "/api/v1/category/not-an-id",
        { name: "Bad" },
      );
      expect(malformed.status).toBe(400);
    });

    it("deletes categories through both prefixes and blocks parents with children", async () => {
      const removable = await createCategory();
      const deletion = await request(app)
        .delete(`/api/v1/category/${removable._id}`)
        .set(auth(adminToken));
      expect(deletion.status).toBe(200);
      expect(await Category.findById(removable._id)).toBeNull();

      const adminRemovable = await createCategory();
      const adminDeletion = await request(app)
        .delete(`/api/v1/admin/categories/${adminRemovable._id}`)
        .set(auth(adminToken));
      expect(adminDeletion.status).toBe(200);
      expect(await Category.findById(adminRemovable._id)).toBeNull();

      const parent = await createCategory();
      await createCategory({ parentCategory: parent._id });
      const blocked = await request(app)
        .delete(`/api/v1/category/${parent._id}`)
        .set(auth(adminToken));
      expect(blocked.status).toBe(400);

      const missing = await request(app)
        .delete(`/api/v1/category/${missingId()}`)
        .set(auth(adminToken));
      expect(missing.status).toBe(404);
    });

    it("bulk deletes categories with partial success and validates payloads", async () => {
      const first = await createCategory();
      const second = await createCategory();

      const bulk = await request(app)
        .post("/api/v1/category/bulk-delete")
        .set(auth(adminToken))
        .send({ categoryIds: [first._id.toString(), second._id.toString()] });
      expect(bulk.status).toBe(200);
      expect(bulk.body.success).toBe(true);
      expect(bulk.body.results.successCount).toBe(2);

      const third = await createCategory();
      const partial = await request(app)
        .post("/api/v1/admin/categories/bulk-delete")
        .set(auth(adminToken))
        .send({ categoryIds: [third._id.toString(), missingId()] });
      expect(partial.status).toBe(200);
      expect(partial.body.success).toBe(false);
      expect(partial.body.partialSuccess).toBe(true);
      expect(partial.body.results.successCount).toBe(1);
      expect(partial.body.results.failureCount).toBe(1);

      const invalid = await request(app)
        .post("/api/v1/admin/categories/bulk-delete")
        .set(auth(adminToken))
        .send({ categoryIds: [] });
      expect(invalid.status).toBe(400);
    });
  });

  describe("attributes", () => {
    it("lists and reads attributes through public and admin prefixes", async () => {
      const attribute = await createAttribute();

      const publicList = await request(app).get("/api/v1/attributes");
      expect(publicList.status).toBe(200);
      expect(
        publicList.body.attributes.map((item) => item._id),
      ).toContain(attribute._id.toString());

      const adminList = await request(app)
        .get("/api/v1/admin/attributes")
        .set(auth(adminToken));
      expect(adminList.status).toBe(200);
      expect(
        adminList.body.attributes.map((item) => item._id),
      ).toContain(attribute._id.toString());

      const detail = await request(app).get(
        `/api/v1/attributes/${attribute._id}`,
      );
      expect(detail.status).toBe(200);
      expect(detail.body.attribute).toHaveProperty("code", attribute.code);

      const adminDetail = await request(app)
        .get(`/api/v1/admin/attributes/${attribute._id}`)
        .set(auth(adminToken));
      expect(adminDetail.status).toBe(200);
      expect(adminDetail.body.attribute).toHaveProperty("code", attribute.code);

      const missing = await request(app).get(
        `/api/v1/attributes/${missingId()}`,
      );
      expect(missing.status).toBe(404);
    });

    it("creates attributes, validates payloads, and enforces unique codes", async () => {
      const code = uniqueAttributeCode("created");
      const payload = {
        code,
        label: "Created Attribute",
        type: "enum",
        uiType: "swatch",
        role: "variant",
        allowedValues: [
          { value: "red", label: "Red", hex: "#ff0000" },
          { value: "blue", label: "Blue", hex: "#0000ff" },
        ],
      };

      const created = await request(app)
        .post("/api/v1/admin/attributes")
        .set(auth(adminToken))
        .send(payload);
      expect(created.status).toBe(201);
      expect(created.body.attribute).toHaveProperty("code", code);
      expect(created.body.attribute.allowedValues).toHaveLength(2);

      const duplicate = await request(app)
        .post("/api/v1/admin/attributes")
        .set(auth(adminToken))
        .send({ ...payload, label: "Duplicate Code" });
      expect(duplicate.status).toBe(400);
      expect(duplicate.body.errorCode).toBe("DUPLICATE_CODE");

      const missingCode = await request(app)
        .post("/api/v1/admin/attributes")
        .set(auth(adminToken))
        .send({ label: "Missing Code" });
      expect(missingCode.status).toBe(400);

      const unauthenticated = await request(app)
        .post("/api/v1/admin/attributes")
        .send({ ...payload, code: uniqueAttributeCode("unauth") });
      expect(unauthenticated.status).toBe(401);
    });

    it("updates attributes and rejects code changes", async () => {
      const attribute = await createAttribute();

      const update = await request(app)
        .patch(`/api/v1/admin/attributes/${attribute._id}`)
        .set(auth(adminToken))
        .send({ label: "Updated Label", role: "both", position: 5 });
      expect(update.status).toBe(200);
      expect(update.body.attribute).toHaveProperty("label", "Updated Label");
      expect(update.body.attribute).toHaveProperty("role", "both");
      expect(update.body.attribute).toHaveProperty("position", 5);

      const codeChange = await request(app)
        .patch(`/api/v1/admin/attributes/${attribute._id}`)
        .set(auth(adminToken))
        .send({ code: "new_code" });
      expect(codeChange.status).toBe(400);
      expect(codeChange.body.errorCode).toBe("CODE_IMMUTABLE");

      const missing = await request(app)
        .patch(`/api/v1/admin/attributes/${missingId()}`)
        .set(auth(adminToken))
        .send({ label: "Missing" });
      expect(missing.status).toBe(404);
    });

    it("blocks deletion of in-use attributes and deletes unused ones", async () => {
      const inUse = await createAttribute({ usageCount: 1 });
      const blocked = await request(app)
        .delete(`/api/v1/admin/attributes/${inUse._id}`)
        .set(auth(adminToken));
      expect(blocked.status).toBe(400);
      expect(blocked.body.errorCode).toBe("ATTRIBUTE_IN_USE");

      const unused = await createAttribute();
      const deleted = await request(app)
        .delete(`/api/v1/admin/attributes/${unused._id}`)
        .set(auth(adminToken));
      expect(deleted.status).toBe(200);
      expect(await AttributeDefinition.findById(unused._id)).toBeNull();

      const missing = await request(app)
        .delete(`/api/v1/admin/attributes/${missingId()}`)
        .set(auth(adminToken));
      expect(missing.status).toBe(404);
    });

    it("adds, updates, and removes allowed values", async () => {
      const attribute = await createSwatchAttribute();
      const valuesPath = `/api/v1/admin/attributes/${attribute._id}/values`;

      const added = await request(app)
        .post(valuesPath)
        .set(auth(adminToken))
        .send({ value: "blue", label: "Blue", hex: "#0000ff" });
      expect(added.status).toBe(201);
      expect(added.body.attribute.allowedValues.map((v) => v.value)).toEqual(
        expect.arrayContaining(["red", "blue"]),
      );

      const duplicate = await request(app)
        .post(valuesPath)
        .set(auth(adminToken))
        .send({ value: "red", label: "Red Again", hex: "#ff0000" });
      expect(duplicate.status).toBe(400);
      expect(duplicate.body.errorCode).toBe("DUPLICATE_VALUE");

      const invalid = await request(app)
        .post(valuesPath)
        .set(auth(adminToken))
        .send({ value: "green", label: "Green", hex: "not-a-hex" });
      expect(invalid.status).toBe(400);

      const missingFields = await request(app)
        .post(valuesPath)
        .set(auth(adminToken))
        .send({ value: "green" });
      expect(missingFields.status).toBe(400);

      const updated = await request(app)
        .patch(`${valuesPath}/blue`)
        .set(auth(adminToken))
        .send({ label: "Navy Blue", hex: "#000080" });
      expect(updated.status).toBe(200);
      expect(
        updated.body.attribute.allowedValues.find((v) => v.value === "blue"),
      ).toMatchObject({ label: "Navy Blue", hex: "#000080" });

      const missingValueUpdate = await request(app)
        .patch(`${valuesPath}/green`)
        .set(auth(adminToken))
        .send({ label: "Green" });
      expect(missingValueUpdate.status).toBe(404);

      const removed = await request(app)
        .delete(`${valuesPath}/blue`)
        .set(auth(adminToken));
      expect(removed.status).toBe(200);
      expect(removed.body.attribute.allowedValues.map((v) => v.value)).toEqual([
        "red",
      ]);

      const missingValueDelete = await request(app)
        .delete(`${valuesPath}/blue`)
        .set(auth(adminToken));
      expect(missingValueDelete.status).toBe(404);
    });

    it("merges allowed values into a canonical target", async () => {
      const attribute = await createAttribute();
      const mergePath = `/api/v1/admin/attributes/${attribute._id}/values/merge`;

      const merged = await request(app)
        .post(mergePath)
        .set(auth(adminToken))
        .send({ targetValue: "red", sourceValues: ["blue"] });
      expect(merged.status).toBe(200);
      expect(merged.body.attribute.allowedValues.map((v) => v.value)).toEqual([
        "red",
      ]);
      expect(merged.body.attribute.allowedValues[0].synonyms).toContain("blue");

      const selfMerge = await request(app)
        .post(mergePath)
        .set(auth(adminToken))
        .send({ targetValue: "red", sourceValues: ["red"] });
      expect(selfMerge.status).toBe(400);
      expect(selfMerge.body.errorCode).toBe("INVALID_MERGE");

      const missingSource = await request(app)
        .post(mergePath)
        .set(auth(adminToken))
        .send({ targetValue: "red", sourceValues: ["green"] });
      expect(missingSource.status).toBe(404);
      expect(missingSource.body.errorCode).toBe("VALUE_NOT_FOUND");
    });
  });

  describe("collections", () => {
    it("lists, reads, and deletes collections", async () => {
      const token = uniqueToken("collection");
      const created = await request(app)
        .post("/api/v1/admin/collections")
        .set(auth(adminToken))
        .send({ name: `Collection ${token}` });
      expect(created.status).toBe(201);
      const collection = created.body.item;

      const list = await request(app)
        .get(`/api/v1/admin/collections?q=${encodeURIComponent(collection.slug)}`)
        .set(auth(adminToken));
      expect(list.status).toBe(200);
      expect(list.body.items.map((item) => item._id)).toContain(collection._id);

      const publicRead = await request(app).get(
        `/api/v1/collection/${collection.slug}`,
      );
      expect(publicRead.status).toBe(200);
      expect(publicRead.body.collection.slug).toBe(collection.slug);

      const deletion = await request(app)
        .delete(`/api/v1/admin/collections/${collection._id}`)
        .set(auth(adminToken));
      expect(deletion.status).toBe(200);

      const missingRead = await request(app).get(
        `/api/v1/collection/${collection.slug}`,
      );
      expect(missingRead.status).toBe(404);

      const missingDelete = await request(app)
        .delete(`/api/v1/admin/collections/${missingId()}`)
        .set(auth(adminToken));
      expect(missingDelete.status).toBe(404);
    });
  });

  describe("filters", () => {
    it("returns filters for all products", async () => {
      const res = await request(app).get("/api/v1/filter/all");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.filters)).toBe(true);
    });

    it("returns filters for an existing category and 404s unknown categories", async () => {
      const category = await createCategory();
      const res = await request(app).get(`/api/v1/filter/${category.code}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.filters)).toBe(true);

      const missing = await request(app).get(
        `/api/v1/filter/${uniqueCode("missing")}`,
      );
      expect(missing.status).toBe(404);
    });
  });
});
