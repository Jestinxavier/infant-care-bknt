const {
  normalizeDesignId,
  MAX_DESIGN_ID_LENGTH,
} = require("../../src/utils/designId");

describe("normalizeDesignId", () => {
  it("collapses case, separators and spacing to one canonical slug", () => {
    const canonical = "cotton-air-bodysuit";
    expect(normalizeDesignId("Cotton Air Bodysuit")).toBe(canonical);
    expect(normalizeDesignId("cotton-air bodysuit")).toBe(canonical);
    expect(normalizeDesignId("Cotton__Air  Bodysuit!")).toBe(canonical);
    expect(normalizeDesignId("  Cotton Air Bodysuit  ")).toBe(canonical);
  });

  it("strips diacritics before slugifying", () => {
    expect(normalizeDesignId("Café Coton")).toBe("cafe-coton");
    expect(normalizeDesignId("Rōmpér Été")).toBe("romper-ete");
  });

  it("trims leading and trailing separators", () => {
    expect(normalizeDesignId("--cotton--air--")).toBe("cotton-air");
    expect(normalizeDesignId(".../cotton/air/...")).toBe("cotton-air");
  });

  it("returns null for empty or non-string input", () => {
    expect(normalizeDesignId("")).toBeNull();
    expect(normalizeDesignId("   ")).toBeNull();
    expect(normalizeDesignId("!!!")).toBeNull();
    expect(normalizeDesignId(null)).toBeNull();
    expect(normalizeDesignId(undefined)).toBeNull();
  });

  it("caps length at MAX_DESIGN_ID_LENGTH", () => {
    const long = "a".repeat(MAX_DESIGN_ID_LENGTH + 50);
    expect(normalizeDesignId(long)).toHaveLength(MAX_DESIGN_ID_LENGTH);
  });

  it("is idempotent", () => {
    const once = normalizeDesignId("Cotton Air Bodysuit");
    expect(normalizeDesignId(once)).toBe(once);
  });
});
