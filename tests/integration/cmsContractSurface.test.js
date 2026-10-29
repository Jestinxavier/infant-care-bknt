const fs = require("fs");
const path = require("path");
const request = require("supertest");
const app = require("../../src/app");
const registry = require("../../src/features/cms/content-types");
const { validateBlocks } = require("../../src/features/cms/pages/pages.validation");
const {
  createVerifiedUser,
  accessTokenFor,
} = require("../helpers/authFixtures");

const sharedSpec = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, "../../../shared/cms/content-types.json"),
    "utf8",
  ),
);

const auth = (token) => ({ Authorization: `Bearer ${token}` });
let counter = 0;
const uniqueToken = (prefix) => `${prefix}-${Date.now()}-${counter++}`;

function normalizeField(field) {
  return {
    key: field.key,
    label: field.label,
    type: field.type,
    required: Boolean(field.required),
    options: field.options || [],
    itemSchema: (field.itemSchema || [])
      .map(normalizeField)
      .sort((a, b) => a.key.localeCompare(b.key)),
  };
}

function normalizeContentType(contentType) {
  return {
    id: contentType.id,
    label: contentType.label,
    description: contentType.description,
    group: contentType.group,
    fields: (contentType.fields || [])
      .map(normalizeField)
      .sort((a, b) => a.key.localeCompare(b.key)),
  };
}

function sampleValue(field) {
  switch (field.type) {
    case "richText":
      return "<p>Contract sample</p>";
    case "textarea":
      return "Contract sample text";
    case "text":
      return `Sample ${field.key}`;
    case "image":
      return "https://example.com/contract.jpg";
    case "url":
      return "/contract-link";
    case "select":
      return field.options?.[0] || "";
    case "boolean":
      return true;
    case "category":
      return "sample-category";
    case "repeater":
      return [(field.itemSchema || []).reduce((item, subField) => {
        item[subField.key] = sampleValue(subField);
        return item;
      }, {})];
    default:
      return `Sample ${field.key}`;
  }
}

function sampleData(contentType) {
  return contentType.fields.reduce((data, field) => {
    data[field.key] = sampleValue(field);
    return data;
  }, {});
}

describe("Shared CMS contract surface", () => {
  it("keeps the backend registry semantically in sync with shared content types", () => {
    expect(registry.FIELD_TYPES).toEqual(sharedSpec.FIELD_TYPES);

    const backendTypes = registry.CONTENT_TYPES.map(normalizeContentType);
    const sharedTypes = sharedSpec.CONTENT_TYPES.map(normalizeContentType);
    expect(backendTypes).toEqual(sharedTypes);

    const ids = sharedSpec.CONTENT_TYPES.map((type) => type.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(registry.ALL_BLOCK_TYPES));

    for (const contentType of sharedSpec.CONTENT_TYPES) {
      const keys = (contentType.fields || []).map((field) => field.key);
      expect(new Set(keys).size).toBe(keys.length);
      for (const field of contentType.fields || []) {
        expect(sharedSpec.FIELD_TYPES).toContain(field.type);
        if (field.type === "select") {
          expect(field.options?.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("accepts and preserves every canonical block payload through draft and publish", async () => {
    const admin = await createVerifiedUser({ role: "admin" });
    const slug = uniqueToken("cms-contract");
    const created = await request(app)
      .post("/api/v1/admin/pages")
      .set(auth(accessTokenFor(admin)))
      .send({ slug, title: "CMS Contract Page" });
    expect(created.status).toBe(201);
    const pageId = created.body.data.id;

    const blocks = sharedSpec.CONTENT_TYPES.map((contentType, index) => ({
      type: contentType.id,
      enabled: true,
      order: index,
      data: sampleData(contentType),
    }));

    const saved = await request(app)
      .put(`/api/v1/admin/pages/${pageId}`)
      .set(auth(accessTokenFor(admin)))
      .send({ blocks });
    expect(saved.status).toBe(200);
    expect(saved.body.data.draft.blocks).toHaveLength(blocks.length);

    const published = await request(app)
      .post(`/api/v1/admin/pages/${pageId}/publish`)
      .set(auth(accessTokenFor(admin)));
    expect(published.status).toBe(200);

    const publicRead = await request(app).get(`/api/v1/cms/pages/${slug}`);
    expect(publicRead.status).toBe(200);
    expect(publicRead.body.data.blocks).toHaveLength(blocks.length);
    expect(publicRead.body.data.blocks.map((block) => block.type)).toEqual(
      sharedSpec.CONTENT_TYPES.map((contentType) => contentType.id),
    );

    for (const [index, contentType] of sharedSpec.CONTENT_TYPES.entries()) {
      expect(publicRead.body.data.blocks[index]).toMatchObject({
        type: contentType.id,
        enabled: true,
        order: index,
        data: sampleData(contentType),
      });
    }
  });

  it("reports required-field violations for every shared content type", () => {
    for (const contentType of sharedSpec.CONTENT_TYPES) {
      const requiredFields = (contentType.fields || []).filter(
        (field) => field.required,
      );
      if (requiredFields.length === 0) continue;
      const result = validateBlocks([
        { type: contentType.id, enabled: true, order: 0, data: {} },
      ]);
      expect(result.valid).toBe(false);
      for (const field of requiredFields) {
        expect(result.errors).toContain(`${field.key} is required`);
      }
    }
  });

  it("rejects unknown content types and malformed repeater payloads", () => {
    const unknown = validateBlocks([
      { type: "not-a-real-block", enabled: true, order: 0, data: {} },
    ]);
    expect(unknown.valid).toBe(false);
    expect(unknown.errors[0]).toMatch(/unknown block type/i);

    const malformed = validateBlocks([
      {
        type: "cards",
        enabled: true,
        order: 0,
        data: { items: [{ heading: 42 }, "not-an-object"] },
      },
    ]);
    expect(malformed.valid).toBe(false);
    expect(malformed.errors).toEqual(
      expect.arrayContaining([
        "items[0].heading must be a string",
        "items[1] must be an object",
      ]),
    );
  });
});
