const crypto = require("crypto");
const axios = require("axios");
const {
  hashField,
  normalizeEmail,
  normalizePhone,
  normalizeName,
  normalizeCity,
  normalizeState,
  normalizePostalCode,
  normalizeCountry,
  buildUserData,
  sendEvent,
  trackPurchase,
} = require("../../src/services/metaConversionService");
const Order = require("../../src/models/Order");

describe("Meta Conversions API (CAPI) Service", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("Normalization and Hashing", () => {
    it("should correctly hash normalized email with SHA-256", () => {
      const email = "  Test.User@Example.COM  ";
      const normalized = normalizeEmail(email);
      expect(normalized).toBe("test.user@example.com");

      const expectedHash = crypto
        .createHash("sha256")
        .update("test.user@example.com")
        .digest("hex");
      expect(hashField(normalized)).toBe(expectedHash);
    });

    it("should normalize Indian phone numbers to include country code 91", () => {
      const phone10 = "9876543210";
      expect(normalizePhone(phone10)).toBe("919876543210");

      const phoneWithSpaces = " +91 98765 43210 ";
      expect(normalizePhone(phoneWithSpaces)).toBe("919876543210");
    });

    it("should normalize names, city, state and pincode", () => {
      expect(normalizeName("  John-Doe  ")).toBe("john-doe");
      expect(normalizeCity("Mumbai, MH.")).toBe("mumbai mh");
      expect(normalizeState(" MAHARASHTRA ")).toBe("maharashtra");
      expect(normalizePostalCode(" 400 001 ")).toBe("400001");
      expect(normalizeCountry("India")).toBe("in");
      expect(normalizeCountry("US")).toBe("us");
    });

    it("should return null when hashing empty or non-string values", () => {
      expect(hashField(null)).toBeNull();
      expect(hashField("")).toBeNull();
      expect(hashField(undefined)).toBeNull();
    });
  });

  describe("buildUserData", () => {
    it("should build structured user_data with hashed PII and unhashed meta headers", () => {
      const userData = buildUserData({
        email: "alice@example.com",
        phone: "9876543210",
        fullName: "Alice Smith",
        city: "Bangalore",
        state: "Karnataka",
        pincode: "560001",
        country: "India",
        clientIp: "103.21.244.2",
        clientUserAgent: "Mozilla/5.0 Chrome",
        fbp: "fb.1.123456789.987654321",
        fbc: "fb.1.123456789.AbCdEf",
      });

      // Hashed arrays
      expect(userData.em).toBeDefined();
      expect(userData.em[0]).toBe(
        crypto.createHash("sha256").update("alice@example.com").digest("hex")
      );

      expect(userData.ph).toBeDefined();
      expect(userData.ph[0]).toBe(
        crypto.createHash("sha256").update("919876543210").digest("hex")
      );

      expect(userData.fn[0]).toBe(
        crypto.createHash("sha256").update("alice").digest("hex")
      );
      expect(userData.ln[0]).toBe(
        crypto.createHash("sha256").update("smith").digest("hex")
      );

      // Unhashed values
      expect(userData.client_ip_address).toBe("103.21.244.2");
      expect(userData.client_user_agent).toBe("Mozilla/5.0 Chrome");
      expect(userData.fbp).toBe("fb.1.123456789.987654321");
      expect(userData.fbc).toBe("fb.1.123456789.AbCdEf");
    });
  });

  describe("sendEvent & trackPurchase safety", () => {
    it("should fail-safe gracefully when META_ACCESS_TOKEN is not configured", async () => {
      const originalToken = process.env.META_ACCESS_TOKEN;
      delete process.env.META_ACCESS_TOKEN;

      const result = await sendEvent({
        eventName: "Purchase",
        eventId: "ORD-TEST-1",
        userData: {},
        customData: { value: 500, currency: "INR" },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("META_ACCESS_TOKEN_NOT_CONFIGURED");

      process.env.META_ACCESS_TOKEN = originalToken;
    });

    it("should use the selected variant SKU in CAPI Purchase content_ids", async () => {
      const originalToken = process.env.META_ACCESS_TOKEN;
      process.env.META_ACCESS_TOKEN = "test-token";

      jest.spyOn(Order, "findOne").mockResolvedValue({
        orderId: "ORD-VARIANT",
        totalAmount: 999,
        items: [
          {
            productId: "p1",
            sku: "PARENT-SKU",
            variantSku: "VARIANT-SKU",
            quantity: 1,
            price: 999,
          },
        ],
      });
      jest
        .spyOn(Order, "updateOne")
        .mockResolvedValue({ modifiedCount: 1 });
      const postSpy = jest
        .spyOn(axios, "post")
        .mockResolvedValue({ data: { events_received: 1 } });

      const result = await trackPurchase({
        order: { orderId: "ORD-VARIANT" },
      });

      expect(result).toBe(true);
      expect(postSpy).toHaveBeenCalledTimes(1);
      const body = postSpy.mock.calls[0][1];
      expect(body.data[0].custom_data.content_ids).toEqual(["VARIANT-SKU"]);
      expect(body.data[0].custom_data.contents[0].id).toBe("VARIANT-SKU");

      if (originalToken === undefined) {
        delete process.env.META_ACCESS_TOKEN;
      } else {
        process.env.META_ACCESS_TOKEN = originalToken;
      }
    });

    it("should skip duplicate trackPurchase calls when the order is already sent", async () => {
      const originalToken = process.env.META_ACCESS_TOKEN;
      delete process.env.META_ACCESS_TOKEN;

      const findOneSpy = jest
        .spyOn(Order, "findOne")
        .mockResolvedValueOnce({
          orderId: "ORD-12345",
          totalAmount: 1299,
          items: [{ productId: "p1", sku: "SKU-1", quantity: 1, price: 1299 }],
          shippingAddress: { fullName: "Test User", email: "test@test.com" },
        })
        .mockResolvedValueOnce(null); // Already marked metaPurchaseSent

      await trackPurchase({ order: { orderId: "ORD-12345" } });
      const secondCall = await trackPurchase({
        order: { orderId: "ORD-12345" },
      });

      expect(secondCall).toBe(false);
      expect(findOneSpy).toHaveBeenCalledWith({
        orderId: "ORD-12345",
        metaPurchaseSent: { $ne: true },
      });

      if (originalToken !== undefined) {
        process.env.META_ACCESS_TOKEN = originalToken;
      }
    });

    it("should not mark an order as sent when CAPI delivery fails", async () => {
      const originalToken = process.env.META_ACCESS_TOKEN;
      delete process.env.META_ACCESS_TOKEN;

      jest.spyOn(Order, "findOne").mockResolvedValue({
        orderId: "ORD-999",
        totalAmount: 500,
        items: [
          {
            productId: "p2",
            sku: "SKU-2",
            variantSku: "variant-2",
            quantity: 1,
            price: 500,
          },
        ],
      });
      const updateOneSpy = jest
        .spyOn(Order, "updateOne")
        .mockResolvedValue({ modifiedCount: 1 });

      const result = await trackPurchase({ order: { orderId: "ORD-999" } });

      expect(result).toBe(false);
      expect(updateOneSpy).not.toHaveBeenCalled();

      if (originalToken !== undefined) {
        process.env.META_ACCESS_TOKEN = originalToken;
      }
    });
  });
});
