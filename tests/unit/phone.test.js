const {
  normalizeIndianPhone,
  isValidIndianMobile,
  parseIndianPhone,
  formatIndianPhone,
  INVALID_PHONE_MESSAGE,
} = require("../../src/utils/phone");

describe("normalizeIndianPhone", () => {
  test.each([
    ["9876543210", "9876543210"],
    ["98765 43210", "9876543210"],
    ["98765-43210", "9876543210"],
    ["+91 98765 43210", "9876543210"],
    ["+919876543210", "9876543210"],
    ["919876543210", "9876543210"],
    ["0091 9876543210", "9876543210"],
    ["09876543210", "9876543210"],
    ["(+91) 98765-43210", "9876543210"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeIndianPhone(input)).toBe(expected);
  });

  test("leaves a short number as typed (so it fails validation, not mangled)", () => {
    expect(normalizeIndianPhone("91234")).toBe("91234");
  });

  test("empty values become empty string", () => {
    expect(normalizeIndianPhone(undefined)).toBe("");
    expect(normalizeIndianPhone(null)).toBe("");
    expect(normalizeIndianPhone("")).toBe("");
  });
});

describe("isValidIndianMobile", () => {
  test("accepts 10 digits starting with 6-9", () => {
    for (const n of ["6000000000", "7123456789", "8123456789", "9876543210"]) {
      expect(isValidIndianMobile(n)).toBe(true);
    }
  });

  test("rejects landline-style starts, wrong lengths and non-digits", () => {
    for (const n of ["5123456789", "0123456789", "987654321", "98765432101", "98765abcde", ""]) {
      expect(isValidIndianMobile(n)).toBe(false);
    }
  });
});

describe("parseIndianPhone", () => {
  test("normalizes a pasted Indian number", () => {
    expect(parseIndianPhone("+91 98765 43210")).toEqual({ ok: true, phone: "9876543210" });
  });

  test.each([
    ["+971 50 123 4567"], // UAE
    ["+1 415 555 2671"], // US
    ["+44 7911 123456"], // UK
    ["12345"],
  ])("rejects non-Indian / invalid %s", (input) => {
    expect(parseIndianPhone(input)).toEqual({ ok: false, message: INVALID_PHONE_MESSAGE });
  });

  test("empty is fine unless required", () => {
    expect(parseIndianPhone("")).toEqual({ ok: true, phone: "" });
    expect(parseIndianPhone("", { required: true })).toEqual({
      ok: false,
      message: "Phone number is required",
    });
  });
});

describe("formatIndianPhone", () => {
  test("formats with the +91 prefix", () => {
    expect(formatIndianPhone("9876543210")).toBe("+91 98765 43210");
    expect(formatIndianPhone("+919876543210")).toBe("+91 98765 43210");
  });

  test("returns unrecognized values unchanged", () => {
    expect(formatIndianPhone("12345")).toBe("12345");
    expect(formatIndianPhone("")).toBe("");
  });
});
