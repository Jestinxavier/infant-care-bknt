const {
  parseColorHexInput,
  extractColorHexFromVariantOptions,
  mergeColorHexUiMeta,
} = require("../../src/utils/colorHexMeta");
const { normalizeFilterValue } = require("../../src/utils/filterAttributes");

const normalizeColorToken = (value) => normalizeFilterValue(value, "color");

describe("color hex meta", () => {
  it("parses comma-separated color hex input", () => {
    const parsed = parseColorHexInput(
      "Red:#FF0000, sky blue:#87ceeb, invalid:#zzzzzz",
      normalizeColorToken
    );

    expect(parsed).toEqual({
      red: { hex: "#ff0000" },
      "sky-blue": { hex: "#87ceeb" },
    });
  });

  it("extracts color hex values from variant options", () => {
    const extracted = extractColorHexFromVariantOptions(
      [
        {
          code: "color",
          values: [
            { value: "Red", hex: "#FF0000" },
            { value: "Blue", hex: "#0000FF" },
            { value: "NoHex" },
          ],
        },
      ],
      normalizeColorToken
    );

    expect(extracted).toEqual({
      red: { hex: "#ff0000" },
      blue: { hex: "#0000ff" },
    });
  });

  it("merges existing, variant, and manual maps with manual priority", () => {
    const merged = mergeColorHexUiMeta({
      existingUiMeta: {
        color: {
          red: { hex: "#111111" },
        },
      },
      variantOptions: [
        {
          code: "color",
          values: [
            { value: "Red", hex: "#222222" },
            { value: "Blue", hex: "#333333" },
          ],
        },
      ],
      colorHexInput: "red:#ff0000",
      normalizeColorToken,
      colorAllowList: ["red", "blue"],
    });

    expect(merged).toEqual({
      color: {
        red: { hex: "#ff0000" },
        blue: { hex: "#333333" },
      },
    });
  });
});
