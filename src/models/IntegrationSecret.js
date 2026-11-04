const mongoose = require("mongoose");

/**
 * Secrets for outside services set from the dashboard (currently only the
 * chat AI key). Stored encrypted (utils/secretCrypto); only the last 4
 * characters are kept in clear for display. Never returned by any API.
 */
const integrationSecretSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true }, // e.g. "groq"
    ciphertext: { type: String, required: true },
    iv: { type: String, required: true },
    tag: { type: String, required: true },
    last4: { type: String, default: "" },
    updatedById: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedByName: { type: String, default: "" },
    // Result of the most recent check against the provider.
    lastCheck: {
      ok: { type: Boolean, default: null },
      message: { type: String, default: "" },
      at: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("IntegrationSecret", integrationSecretSchema);
