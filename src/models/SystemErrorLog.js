// models/SystemErrorLog.js
// Persists application errors to MongoDB with automatic 30-day expiry via TTL index.
// Use logError() from utils/errorLogger.js — do not call this model directly.

const mongoose = require("mongoose");

const systemErrorLogSchema = new mongoose.Schema(
  {
    // Short human-readable error label
    message: {
      type: String,
      required: true,
      trim: true,
    },

    // Full stack trace or detailed reason
    reason: {
      type: String,
      default: null,
    },

    // Where the error originated: controller name, service, middleware, etc.
    source: {
      type: String,
      required: true,
      trim: true,
    },

    // HTTP method: GET, POST, PUT, DELETE, PATCH
    method: {
      type: String,
      uppercase: true,
      default: null,
    },

    // Route/endpoint that triggered the error e.g. "/api/v1/cart/add-item"
    endpoint: {
      type: String,
      default: null,
    },

    // HTTP status code returned to the client
    statusCode: {
      type: Number,
      default: 500,
    },

    // Error type: Mongoose ValidationError, CastError, TypeError, etc.
    errorType: {
      type: String,
      default: "Error",
    },

    // Which user (if authenticated) triggered this error
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // Any extra key-value context (request body, query params, cart ID, etc.)
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Runtime environment — helps filter noise in dev logs
    environment: {
      type: String,
      enum: ["development", "staging", "production"],
      default: () => process.env.NODE_ENV || "development",
    },

    // TTL index is placed on this field — must be a Date
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    // We define createdAt manually above (required for TTL); disable auto timestamps
    timestamps: false,
    // Optimise storage — we don't need the __v field
    versionKey: false,
  }
);

// ─── TTL Index ───────────────────────────────────────────────────────────────
// MongoDB background task runs every ~60s and deletes documents where:
//   now - createdAt  >  expireAfterSeconds (30 days = 2,592,000 s)
systemErrorLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 30, name: "ttl_30days" }
);

// ─── Query Indexes ────────────────────────────────────────────────────────────
// Fast lookup by source + recency (most common dashboard query)
systemErrorLogSchema.index({ source: 1, createdAt: -1 }, { name: "idx_source_date" });

// Fast lookup by status code (e.g. find all 500s)
systemErrorLogSchema.index({ statusCode: 1 }, { name: "idx_status_code" });

// Fast lookup by user — useful for per-user error investigation
systemErrorLogSchema.index(
  { userId: 1, createdAt: -1 },
  { sparse: true, name: "idx_user_date" }
);

module.exports = mongoose.model("SystemErrorLog", systemErrorLogSchema);
