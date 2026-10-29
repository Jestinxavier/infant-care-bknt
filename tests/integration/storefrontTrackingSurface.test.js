const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../../src/app");
const AnalyticsEvent = require("../../src/models/AnalyticsEvent");

jest.mock("../../src/services/metaConversionService", () => {
  const actual = jest.requireActual("../../src/services/metaConversionService");
  return {
    ...actual,
    sendEvent: jest.fn().mockResolvedValue({ success: true }),
  };
});

const { sendEvent } = require("../../src/services/metaConversionService");

describe("Storefront tracking surface", () => {
  beforeEach(() => {
    sendEvent.mockClear();
    sendEvent.mockResolvedValue({ success: true });
  });

  describe("analytics", () => {
    it("accepts a single event shorthand and stores normalized metadata", async () => {
      const productId = new mongoose.Types.ObjectId().toString();

      const response = await request(app)
        .post("/api/v1/analytics/track")
        .set("user-agent", "TrackTest/1.0")
        .send({
          eventType: "product_view",
          visitorId: "visitor-1",
          sessionId: "session-1",
          path: "/product/cotton-bodysuit",
          referrer: "https://example.com",
          productId,
          productSlug: "cotton-bodysuit",
          productName: "Cotton Bodysuit",
          pageLanguage: "en",
        });

      expect(response.status).toBe(204);

      const events = await AnalyticsEvent.find({});
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual(
        expect.objectContaining({
          eventType: "product_view",
          visitorId: "visitor-1",
          sessionId: "session-1",
          path: "/product/cotton-bodysuit",
          productId: expect.anything(),
          productSlug: "cotton-bodysuit",
          productName: "Cotton Bodysuit",
          ua: "TrackTest/1.0",
          pageLanguage: "en",
        }),
      );
      expect(String(events[0].productId)).toBe(productId);
    });

    it("caps batches at 20 events and silently drops invalid event types", async () => {
      const validEvents = Array.from({ length: 25 }, (_, index) => ({
        eventType: "page_view",
        visitorId: `visitor-${index}`,
        path: `/page-${index}`,
      }));

      const response = await request(app)
        .post("/api/v1/analytics/track")
        .send({
          events: [
            ...validEvents,
            { eventType: "not_allowed", visitorId: "ignored" },
            null,
            "invalid",
          ],
        });

      expect(response.status).toBe(204);
      expect(await AnalyticsEvent.countDocuments()).toBe(20);
      expect(
        await AnalyticsEvent.countDocuments({ eventType: "not_allowed" }),
      ).toBe(0);
    });

    it("returns 204 without writing when no valid events are supplied", async () => {
      const response = await request(app)
        .post("/api/v1/analytics/track")
        .send({ events: [{ eventType: "unknown" }, {}] });

      expect(response.status).toBe(204);
      expect(await AnalyticsEvent.countDocuments()).toBe(0);
    });
  });

  describe("meta conversions", () => {
    it("requires an event name", async () => {
      const response = await request(app)
        .post("/api/v1/meta/event")
        .send({ customData: { value: 100 } });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe("eventName is required");
      expect(sendEvent).not.toHaveBeenCalled();
    });

    it("queues a normalized Meta event with enriched client data", async () => {
      const response = await request(app)
        .post("/api/v1/meta/event")
        .set("user-agent", "MetaTest/2.0")
        .set("x-forwarded-for", "203.0.113.10, 10.0.0.1")
        .send({
          eventName: "AddToCart",
          eventId: "event-123",
          eventSourceUrl: "https://shop.example.com/product/one",
          customData: { value: 499, currency: "INR" },
          userData: {
            email: "Parent@Example.com ",
            phone: "9876543210",
            firstName: "Asha",
            city: "Kochi",
            country: "India",
            fbp: "fb.1.123",
            fbc: "fb.1.456",
          },
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.objectContaining({
          success: true,
          message: 'Meta CAPI event "AddToCart" queued',
        }),
      );

      expect(sendEvent).toHaveBeenCalledTimes(1);
      const payload = sendEvent.mock.calls[0][0];
      expect(payload).toEqual(
        expect.objectContaining({
          eventName: "AddToCart",
          eventId: "event-123",
          eventSourceUrl: "https://shop.example.com/product/one",
          actionSource: "website",
          customData: { value: 499, currency: "INR" },
        }),
      );
      expect(payload.userData.client_ip_address).toBe("203.0.113.10");
      expect(payload.userData.client_user_agent).toBe("MetaTest/2.0");
      expect(payload.userData.fbp).toBe("fb.1.123");
      expect(payload.userData.fbc).toBe("fb.1.456");
      expect(payload.userData.em).toHaveLength(1);
      expect(payload.userData.ph).toHaveLength(1);
      expect(payload.userData.fn).toHaveLength(1);
      expect(payload.userData.ct).toHaveLength(1);
      expect(payload.userData.st).toBeUndefined();
      expect(payload.userData.country).toHaveLength(1);
    });
  });
});
