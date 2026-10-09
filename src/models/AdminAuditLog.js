// models/AdminAuditLog.js
// Audit trail for admin user management changes (create / role change /
// suspend / activate / delete). Written by adminUserController.

const mongoose = require("mongoose");

const adminAuditLogSchema = new mongoose.Schema(
  {
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    actorUsername: { type: String, required: true },
    actorRole: { type: String, required: true },
    action: {
      type: String,
      enum: [
        "create",
        "update_role",
        "suspend",
        "activate",
        "delete",
      ],
      required: true,
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    targetUsername: { type: String, required: true },
    targetRole: { type: String, default: null },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

adminAuditLogSchema.index({ createdAt: -1 });
adminAuditLogSchema.index({ actorId: 1, createdAt: -1 });
adminAuditLogSchema.index({ targetId: 1, createdAt: -1 });

module.exports = mongoose.model("AdminAuditLog", adminAuditLogSchema);