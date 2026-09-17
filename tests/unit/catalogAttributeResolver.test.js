const {
  resolveCatalogValue,
  resolveSizeLabel,
  resolveAttributeLabel,
  normalizeImportProducts,
  toSlugKey,
} = require("../../src/utils/catalogAttributeResolver");

const SIZE_VALUES = [
  { value: "0-3-month", label: "0-3 Month", synonyms: [] },
  { value: "3-6-month", label: "3-6 Month", synonyms: [] },
  { value: "6-9-month", label: "6-9 Month", synonyms: [] },
  { value: "9-12-month", label: "9-12 Month", synonyms: [] },
  { value: "0-6-month", label: "0-6 Month", synonyms: [] },
  { value: "6-12-month", label: "6-12 Month", synonyms: [] },
  { value: "s", label: "S", synonyms: [] },
  { value: "m", label: "M", synonyms: [] },
  { value: "l", label: "L", synonyms: [] },
  { value: "new-born", label: "New Born", synonyms: ["nb", "newborn"] },
  { value: "premature", label: "Premature", synonyms: ["preemie"] },
  { value: "18-24-month", label: "18-24 Month", synonyms: [] },
  { value: "12-18-month", label: "12-18 Month", synonyms: [] },
  { value: "free-size", label: "Free Size", synonyms: ["one size", "freesize"] },
  { value: "90x90cm", label: "90x90cm", synonyms: [] },
  { value: "25x30inches", label: "25x30inches", synonyms: [] },
  { value: "80x80cm", label: "80x80cm", synonyms: [] },
];

const COLOR_VALUES = [
  { value: "blue", label: "Blue", hex: "#0464e9", synonyms: ["sky-blue"] },
  { value: "pink", label: "Pink", hex: "#ffc0cb", synonyms: [] },
];

describe("catalogAttributeResolver", () => {
  describe("resolveSizeLabel", () => {
    const cases = [
      ["0-3-months", "0-3 Month"],
      ["3-6-months", "3-6 Month"],
      ["0-3 months", "0-3 Month"],
      ["3 6 months", "3-6 Month"],
      ["0-3m", "0-3 Month"],
      ["03m", "0-3 Month"],
      ["0-3", "0-3 Month"],
      ["6-9-MONTHS", "6-9 Month"],
      ["S", "S"],
      ["small", "S"],
      ["M", "M"],
      ["medium", "M"],
      ["L", "L"],
      ["New Born", "New Born"],
      ["newborn", "New Born"],
      ["NB", "New Born"],
      ["Premature", "Premature"],
      ["preemie", "Premature"],
      ["Free Size", "Free Size"],
      ["one size", "Free Size"],
      ["90x90cm", "90x90cm"],
      ["90 x 90 cm", "90x90cm"],
      ["25x30inches", "25x30inches"],
      ["25x30in", "25x30inches"],
      ["80 x 80 cm", "80x80cm"],
      ["0-6-months", "0-6 Month"],
      ["6-12-months", "6-12 Month"],
      ["12-18-months", "12-18 Month"],
      ["18-24-months", "18-24 Month"],
    ];

    it.each(cases)("maps %p -> %p", (input, expected) => {
      expect(resolveSizeLabel(input, SIZE_VALUES)).toBe(expected);
    });

    it("returns empty string for unknown sizes", () => {
      expect(resolveSizeLabel("XL", SIZE_VALUES)).toBe("");
      expect(resolveSizeLabel("", SIZE_VALUES)).toBe("");
      expect(resolveSizeLabel(null, SIZE_VALUES)).toBe("");
    });
  });

  describe("resolveCatalogValue", () => {
    it("ignores Excel leading apostrophes", () => {
      const av = resolveCatalogValue("'0-6 Month", SIZE_VALUES, "size");
      expect(av).not.toBeNull();
      expect(av.label).toBe("0-6 Month");
    });

    it("resolves filter-alias slugs", () => {
      const av = resolveCatalogValue("nb", SIZE_VALUES, "size");
      expect(av.label).toBe("New Born");
    });

    it("resolves spelling variants covered only by the training map, even when the knowledge base has no synonyms", () => {
      const bareValues = SIZE_VALUES.map((v) => ({ ...v, synonyms: [] }));
      const expectations = [
        ["premature", "Premature"],
        ["preemie", "Premature"],
        ["premie", "Premature"],
        ["pre-term", "Premature"],
        ["0-3-months", "0-3 Month"],
        ["0-3m", "0-3 Month"],
        ["0-3months", "0-3 Month"],
        ["03m", "0-3 Month"],
        ["one size fits all", "Free Size"],
        ["one-size-fits-all", "Free Size"],
        ["adjustable", "Free Size"],
        ["2yr", "18-24 Month"],
        ["0-1months", "New Born"],
      ];
      for (const [input, expected] of expectations) {
        expect(resolveSizeLabel(input, bareValues)).toBe(expected);
      }
    });

    it("maps age ranges numerically even when no entry matches the index", () => {
      const av = resolveCatalogValue("9 to 12", SIZE_VALUES, "size");
      expect(av).not.toBeNull();
      expect(av.label).toBe("9-12 Month");
    });
  });

  describe("resolveAttributeLabel (color)", () => {
    it("resolves color synonyms to canonical label", () => {
      expect(resolveAttributeLabel("sky-blue", COLOR_VALUES, "color")).toBe("Blue");
      expect(resolveAttributeLabel("BluE", COLOR_VALUES, "color")).toBe("Blue");
    });
  });

  describe("toSlugKey", () => {
    it("normalizes separators and strips apostrophes", () => {
      expect(toSlugKey("'0 - 3 Month")).toBe("0-3-month");
      expect(toSlugKey("  90 x 90 cm  ")).toBe("90-x-90-cm");
    });
  });

  describe("normalizeImportProducts", () => {
    const kb = {
      attributes: [
        { code: "size", allowedValues: SIZE_VALUES },
        { code: "color", allowedValues: COLOR_VALUES },
      ],
    };

    it("writes canonical size/color into variant.attributes and variant_size", () => {
      const products = [
        {
          csvId: "TMP_1",
          title: "P",
          variants: [
            {
              csvId: "TMP_1_1",
              attributes: { size: "0-3-months", color: "Blue" },
              variant_size: "0-3-months",
            },
            { csvId: "TMP_1_2", attributes: { size: "'0-6 Month" } },
            { csvId: "TMP_1_3", attributes: { size: "small" } },
          ],
        },
      ];
      normalizeImportProducts(products, kb);
      expect(products[0].variants[0].attributes.size).toBe("0-3 Month");
      expect(products[0].variants[0].variant_size).toBe("0-3 Month");
      expect(products[0].variants[1].attributes.size).toBe("0-6 Month");
      expect(products[0].variants[2].attributes.size).toBe("S");
    });

    it("leaves unresolved values intact but strips apostrophes", () => {
      const products = [
        {
          csvId: "TMP_1",
          title: "P",
          variants: [
            { csvId: "TMP_1_1", attributes: { size: "'03-Jan" } },
          ],
        },
      ];
      normalizeImportProducts(products, kb);
      expect(products[0].variants[0].attributes.size).toBe("03-Jan");
    });
  });
});