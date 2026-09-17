// models/AnalyticsEvent.js
// Lightweight, write-once behavioral event store fed by the storefront.
// Events power the end-of-day AI business report (visitors, product views,
// cart -> checkout funnel). Kept intentionally small and denormalized so the
// daily aggregation job needs no joins.
const mongoose = require("mongoose");

const analyticsEventSchema = new mongoose.Schema(
  {
    eventType: {
      type: String,
      enum: [
        "page_view",
        "product_view",
        "add_to_cart",
        "begin_checkout",
        "purchase",
      ],
      required: true,
      index: true,
    },
    // Anonymous visitor id (random UUID stored in the browser)
    visitorId: {
      type: String,
      default: null,
      index: true,
    },
    // Server-generated or client-generated session id (a UUID per page session)
    sessionId: {
      type: String,
      default: null,
      index: true,
    },
    // Full browser path e.g. /product/cotton-bodysuit
    path: {
      type: String,
      default: "",
    },
    // Referrer (trimmed to origin+path, no query strings)
    referrer: {
      type: String,
      default: "",
    },
    // Denormalized product reference so reports don't need to populate refs
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      default: null,
      index: true,
    },
    productSlug: {
      type: String,
      default: "",
    },
    productName: {
      type: String,
      default: "",
    },
    // Lightweight client metadata
    ua: {
      type: String,
      default: "",
    },
    pageLanguage: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
    // Mongo TTL index is added below — events auto-expire after retention.
  },
);

analyticsEventSchema.index({ createdAt: 1, eventType: 1 });
analyticsEventSchema.index({ visitorId: 1, createdAt: -1 });

// Auto-expire raw events 90 days after creation (retention for reporting).
analyticsEventSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60, name: "ttl_analytics_events" },
);

module.exports = mongoose.model("AnalyticsEvent", analyticsEventSchema);