// models/AiDailyReport.js
// Stores each generated end-of-day AI business report so reports are auditable,
// reproducible and viewable in the dashboard without revisiting the LLM.
const mongoose = require("mongoose");

const aiDailyReportSchema = new mongoose.Schema(
  {
    // Report date in Asia/Kolkata (yyyy-mm-dd). Unique per day.
    date: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    // Actual period boundaries used (same day, IST)
    period: {
      from: { type: Date, required: true },
      to: { type: Date, required: true },
    },
    // Aggregated numbers that the narrative was generated from
    metrics: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    // Human-readable narrative produced by the LLM (or template fallback).
    content: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    provider: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["generated", "fallback", "failed"],
      default: "generated",
    },
    aiError: {
      type: String,
      default: "",
    },
  },
  { timestamps: true },
);

aiDailyReportSchema.index({ date: -1 });

module.exports = mongoose.model("AiDailyReport", aiDailyReportSchema);