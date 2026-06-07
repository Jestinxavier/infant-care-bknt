const mongoose = require("mongoose");

const knowledgeBaseSchema = new mongoose.Schema(
  {
    question: { type: String, required: true },
    answer: { type: String, required: true },
    tags: [{ type: String }],
    // Which staff member saved this
    savedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    // Which session this came from (for traceability)
    sourceSessionId: { type: String, default: null },
    usageCount: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Text index so the AI can search knowledge base efficiently
knowledgeBaseSchema.index({ question: "text", answer: "text", tags: "text" });

module.exports = mongoose.model("KnowledgeBase", knowledgeBaseSchema);
