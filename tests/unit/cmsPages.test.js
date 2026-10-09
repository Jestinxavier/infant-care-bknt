/**
 * Static Pages CMS — schema-driven block validation unit tests.
 * No DB required: validates the content-type registry + validateBlocks().
 */

const {
  validateBlocks,
  CONTENT_TYPES,
} = require("../../src/features/cms/pages/pages.validation");

describe("CMS Static Pages — content type registry", () => {
  test("exposes the expected block types", () => {
    const ids = CONTENT_TYPES.map((c) => c.id);
    expect(ids).toEqual(
      expect.arrayContaining(["richText", "hero", "textImage", "cards", "faqList", "productSlider", "categoryGrid", "editorPicks"])
    );
  });

  test("registry entries have unique ids and valid field types", () => {
    const ids = new Set();
    for (const ct of CONTENT_TYPES) {
      expect(ids.has(ct.id)).toBe(false);
      ids.add(ct.id);
      for (const f of ct.fields) {
        expect(["text", "textarea", "richText", "image", "url", "select", "boolean", "repeater", "category"])
          .toContain(f.type);
      }
    }
  });
});

describe("CMS Static Pages — block validation", () => {
  test("accepts a valid richText block", () => {
    const r = validateBlocks([{ type: "richText", data: { body: "<p>hi</p>" } }]);
    expect(r.valid).toBe(true);
    expect(r.blocks[0].enabled).toBe(true);
  });

  test("fills select defaults for missing optional fields", () => {
    const r = validateBlocks([{ type: "hero", data: { heading: "Hey" } }]);
    expect(r.valid).toBe(true);
    expect(r.blocks[0].data.align).toBe("left");
  });

  test("rejects a block missing a required field", () => {
    const r = validateBlocks([{ type: "richText", data: {} }]);
    expect(r.valid).toBe(false);
    expect(r.errors.join(" ")).toContain("body");
  });

  test("rejects an unknown block type", () => {
    const r = validateBlocks([{ type: "nope", data: {} }]);
    expect(r.valid).toBe(false);
    expect(r.errors.join(" ")).toContain('unknown block type "nope"');
  });

  test("rejects an invalid URL", () => {
    const r = validateBlocks([
      {
        type: "textImage",
        data: { imageUrl: "not-a-url", position: "right" },
      },
    ]);
    expect(r.valid).toBe(false);
  });

  test("accepts relative and hash URLs", () => {
    const r = validateBlocks([
      { type: "hero", data: { heading: "H", ctaHref: "/delivery-info" } },
    ]);
    expect(r.valid).toBe(true);
  });

  test("validates repeater items recursively", () => {
    const bad = validateBlocks([
      {
        type: "faqList",
        data: {
          title: "FAQs",
          items: [{ question: "Q", answer: "" }],
        },
      },
    ]);
    expect(bad.valid).toBe(false);

    const good = validateBlocks([
      {
        type: "faqList",
        data: {
          title: "FAQs",
          items: [{ question: "Q", answer: "<p>A</p>" }],
        },
      },
    ]);
    expect(good.valid).toBe(true);
    expect(good.blocks[0].data.items).toHaveLength(1);
  });

  test("rejects non-array blocks payloads", () => {
    expect(validateBlocks("nope").valid).toBe(false);
    expect(validateBlocks(123).valid).toBe(false);
  });
});