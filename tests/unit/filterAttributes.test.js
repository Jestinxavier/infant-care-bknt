const {
  normalizeFilterValue,
  normalizeFilterAttributes,
  sanitizeIncomingFilterAttributes,
  getFilterAttributeCardinalityViolations,
  syncFilterAttributes,
  buildFilterAttributesQuery,
} = require("../../src/utils/filterAttributes");
const { parseQueryFilters } = require("../../src/utils/parseQueryFilters");

describe("filterAttributes governance", () => {
  it("normalizes aliases to canonical tokens", () => {
    expect(normalizeFilterValue("Solid", "pattern")).toBe("solid");
    expect(normalizeFilterValue("plane", "pattern")).toBe("solid");
    expect(normalizeFilterValue("grey", "color")).toBe("gray");
    expect(normalizeFilterValue("packof2", "pack")).toBe("pack-of-2");
  });

  it("normalizes but does not silently truncate values", () => {
    const normalized = normalizeFilterAttributes(
      {
        size: ["free-size", "0-3m"],
        pattern: ["solid", "striped"],
      }
    );

    expect(normalized.size).toEqual(["free-size", "0-3m"]);
    expect(normalized.pattern).toEqual(["solid", "striped"]);
  });

  it("normalizes mongoose-like nested objects via toObject", () => {
    const mongooseLike = {
      toObject: () => ({
        color: ["Orange"],
        material: ["Cotton"],
      }),
    };

    const normalized = normalizeFilterAttributes(mongooseLike);

    expect(normalized.color).toEqual(["orange"]);
    expect(normalized.material).toEqual(["cotton"]);
  });

  it("detects cardinality violations for single-value facets", () => {
    const violations = getFilterAttributeCardinalityViolations(
      {
        size: ["0-3m", "3-6m"],
        pattern: ["solid", "striped"],
        color: ["red", "blue"],
      },
      { productType: "SIMPLE" }
    );

    expect(violations).toEqual([
      { key: "size", values: ["0-3m", "3-6m"] },
      { key: "pattern", values: ["solid", "striped"] },
    ]);
  });

  it("syncs configurable color/size from variants and keeps other attributes", () => {
    const synced = syncFilterAttributes({
      productType: "CONFIGURABLE",
      filterAttributes: {
        material: ["Cotton", "cotton"],
        color: ["manual-color"],
        size: ["manual-size"],
      },
      variants: [
        { attributes: { color: "Red", size: "0-3m" } },
        { attributes: { color: "Blue", size: "3-6m" } },
        { attributes: { color: "red", size: "0-3m" } },
      ],
    });

    expect(synced.color).toEqual(["red", "blue"]);
    expect(synced.size).toEqual(["0-3m", "3-6m"]);
    expect(synced.material).toEqual(["cotton"]);
  });

  it("sanitizes only allowed keys and keeps normalized arrays", () => {
    const sanitized = sanitizeIncomingFilterAttributes(
      {
        pattern: ["solid", "striped"],
        color: ["red", "blue"],
        unsupported: ["x"],
      },
      { allowOnly: ["pattern", "color"] }
    );

    expect(Object.keys(sanitized)).toEqual(["pattern", "color"]);
    expect(sanitized.pattern).toEqual(["solid", "striped"]);
    expect(sanitized.color).toEqual(["red", "blue"]);
  });

  it("builds canonical filter query values", () => {
    const query = buildFilterAttributesQuery({
      pattern: ["plane", "solid"],
      color: ["grey", "red"],
    });

    expect(query["filterAttributes.pattern"]).toBe("solid");
    expect(query["filterAttributes.color"]).toEqual({ $in: ["gray", "red"] });
  });

  it("parses query params into normalized filter arrays", () => {
    const parsed = parseQueryFilters({
      material: "Organic Cotton, cotton",
      pattern: "Plane",
      size: "0-3m,3-6m",
    });

    expect(parsed.material).toEqual(["organic-cotton", "cotton"]);
    expect(parsed.pattern).toEqual(["solid"]);
    expect(parsed.size).toEqual(["0-3m", "3-6m"]);
  });
});
