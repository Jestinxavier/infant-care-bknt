const {
  formatVariantName,
  hasLegacyMonthRange,
  monthLabelFromSizeValue,
  applySizeLabelToVariantName,
} = require("../../src/utils/formatVariantName");

describe("formatVariantName", () => {
  it("canonicalizes every historical month spelling", () => {
    expect(formatVariantName("Sleep Suit - 0-3m")).toBe("Sleep Suit - 0-3M");
    expect(formatVariantName("Sleep Suit - 0-3 m")).toBe("Sleep Suit - 0-3M");
    expect(formatVariantName("Sleep Suit - 0-3 M")).toBe("Sleep Suit - 0-3M");
    expect(formatVariantName("Sleep Suit - 0 - 3 Months")).toBe(
      "Sleep Suit - 0-3M",
    );
    expect(formatVariantName("Sleep Suit - 0-3M")).toBe("Sleep Suit - 0-3M");
  });

  it("drops the redundant trailing M from old generated names", () => {
    expect(formatVariantName("Muslin Jenna Frock - 0-6 m M")).toBe(
      "Muslin Jenna Frock - 0-6M",
    );
    expect(formatVariantName("Muslin Jenna Frock - 0-6m M")).toBe(
      "Muslin Jenna Frock - 0-6M",
    );
  });

  it("is idempotent", () => {
    const once = formatVariantName("Sleep Suit - White Print - 3-6m");
    expect(formatVariantName(once)).toBe(once);
  });

  it("leaves colours, dimensions and unrelated ranges alone", () => {
    expect(formatVariantName("Sleep Suit - Blue White Star")).toBe(
      "Sleep Suit - Blue White Star",
    );
    expect(formatVariantName("Blanket 110x110cm")).toBe("Blanket 110x110cm");
    expect(formatVariantName("Sleep Suit 2-3 years")).toBe(
      "Sleep Suit 2-3 years",
    );
  });

  it("does not rewrite implausible month ranges", () => {
    expect(formatVariantName("Batch 12-18 months")).toBe("Batch 12-18M");
    expect(formatVariantName("Range 40-50 months")).toBe("Range 40-50 months");
  });

  it("reports legacy month text", () => {
    expect(hasLegacyMonthRange("Sleep Suit - 0-3 m M")).toBe(true);
    expect(hasLegacyMonthRange("Sleep Suit - 0-3M")).toBe(true);
    expect(hasLegacyMonthRange("Sleep Suit - Blue")).toBe(false);
    expect(hasLegacyMonthRange(null)).toBe(false);
  });
});

describe("monthLabelFromSizeValue", () => {
  it("maps registry month identities to display labels", () => {
    expect(monthLabelFromSizeValue("0-3-months")).toBe("0-3M");
    expect(monthLabelFromSizeValue("12-18-months")).toBe("12-18M");
    expect(monthLabelFromSizeValue(" 6-12-months ")).toBe("6-12M");
  });

  it("ignores non-month and implausible values", () => {
    expect(monthLabelFromSizeValue("newborn")).toBeNull();
    expect(monthLabelFromSizeValue("110x110cm")).toBeNull();
    expect(monthLabelFromSizeValue("S")).toBeNull();
    expect(monthLabelFromSizeValue("0-3M")).toBeNull();
    expect(monthLabelFromSizeValue("0-0-months")).toBeNull();
    expect(monthLabelFromSizeValue("40-50-months")).toBeNull();
    expect(monthLabelFromSizeValue(null)).toBeNull();
  });
});

describe("applySizeLabelToVariantName", () => {
  it("replaces a stale trailing month token with the attribute label", () => {
    expect(
      applySizeLabelToVariantName("Cord Set -Peacock Green Print - 0-6M", "0-3M"),
    ).toBe("Cord Set -Peacock Green Print - 0-3M");
    expect(applySizeLabelToVariantName("Frock - 0-6 m", "0-3M")).toBe(
      "Frock - 0-3M",
    );
  });

  it("keeps the last separator when the name has several", () => {
    expect(
      applySizeLabelToVariantName("Frock - White - 0-6M", "0-3M"),
    ).toBe("Frock - White - 0-3M");
  });

  it("leaves non-month suffixes and unexpected shapes alone", () => {
    expect(applySizeLabelToVariantName("Frock - Newborn", "0-3M")).toBe(
      "Frock - Newborn",
    );
    expect(applySizeLabelToVariantName("Frock-0-6M", "0-3M")).toBe(
      "Frock-0-6M",
    );
    expect(applySizeLabelToVariantName("Frock - 0-6M", "")).toBe(
      "Frock - 0-6M",
    );
  });

  it("is idempotent", () => {
    const once = applySizeLabelToVariantName("Frock - 0-6M", "0-3M");
    expect(applySizeLabelToVariantName(once, "0-3M")).toBe(once);
  });
});
