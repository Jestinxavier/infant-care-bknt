const {
  validateMaintenanceInput,
  computeRetryAfter,
  toPublicPayload,
} = require("../../src/services/maintenanceService");

describe("maintenanceService helpers", () => {
  describe("validateMaintenanceInput", () => {
    it("accepts a valid payload and trims strings", () => {
      const { errors, value } = validateMaintenanceInput({
        enabled: true,
        title: "  Hello  ",
        message: "  World  ",
        reopenAt: "2030-01-01T10:00:00.000Z",
      });
      expect(errors).toHaveLength(0);
      expect(value).toEqual({
        enabled: true,
        title: "Hello",
        message: "World",
        reopenAt: "2030-01-01T10:00:00.000Z",
      });
    });

    it("rejects a non-boolean enabled flag", () => {
      const { errors } = validateMaintenanceInput({ enabled: "yes" });
      expect(errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: "enabled" })])
      );
    });

    it("rejects an invalid reopen date", () => {
      const { errors } = validateMaintenanceInput({ reopenAt: "soon" });
      expect(errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: "reopenAt" })])
      );
    });

    it("treats empty reopenAt as cleared", () => {
      const { errors, value } = validateMaintenanceInput({ reopenAt: "" });
      expect(errors).toHaveLength(0);
      expect(value.reopenAt).toEqual("");
    });

    it("rejects message beyond the max length", () => {
      const { errors } = validateMaintenanceInput({ message: "x".repeat(1001) });
      expect(errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: "message" })])
      );
    });

    it("normalizes and dedupes allowed tester emails", () => {
      const { errors, value } = validateMaintenanceInput({
        allowedEmails: [" Tester@Example.com ", "tester@example.com", ""],
      });
      expect(errors).toHaveLength(0);
      expect(value.allowedEmails).toEqual(["tester@example.com"]);
    });

    it("accepts an empty allowed tester list", () => {
      const { errors, value } = validateMaintenanceInput({ allowedEmails: [] });
      expect(errors).toHaveLength(0);
      expect(value.allowedEmails).toEqual([]);
    });

    it("rejects invalid allowed tester emails", () => {
      const notArray = validateMaintenanceInput({ allowedEmails: "a@b.com" });
      expect(notArray.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: "allowedEmails" }),
        ])
      );

      const badEmail = validateMaintenanceInput({
        allowedEmails: ["not-an-email"],
      });
      expect(badEmail.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: "allowedEmails" }),
        ])
      );
    });

    it("flags an empty payload", () => {
      const { errors } = validateMaintenanceInput({});
      expect(errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: "body" })])
      );
    });
  });

  describe("computeRetryAfter", () => {
    it("falls back when no reopen date is set", () => {
      expect(computeRetryAfter(null)).toBe(3600);
    });

    it("returns at least 60 seconds for the past", () => {
      expect(
        computeRetryAfter(new Date(Date.now() - 10_000).toISOString())
      ).toBe(3600);
    });

    it("returns seconds until a future reopen date", () => {
      const value = computeRetryAfter(
        new Date(Date.now() + 120_000).toISOString()
      );
      expect(value).toBeGreaterThanOrEqual(60);
      expect(value).toBeLessThanOrEqual(121);
    });
  });

  describe("toPublicPayload", () => {
    it("normalizes missing values", () => {
      const payload = toPublicPayload({ enabled: false });
      expect(payload).toMatchObject({
        enabled: false,
        reopenAt: null,
        staffBypass: false,
      });
    });

    it("never exposes the allowed tester list", () => {
      const payload = toPublicPayload({
        enabled: true,
        allowedEmails: ["tester@example.com"],
      });
      expect(payload).not.toHaveProperty("allowedEmails");
    });
  });
});
