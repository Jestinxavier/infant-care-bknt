const IntegrationSecret = require("../../models/IntegrationSecret");
const { encryptSecret, isEncryptionConfigured } = require("../../utils/secretCrypto");
const {
  SECRET_NAME,
  checkGroqKey,
  invalidateAiKey,
  recordAiKeyCheck,
  getEnvKeyCheck,
} = require("../../services/aiKeyService");
const logger = require("../../utils/logger");

/**
 * Admin: the chat AI (Groq) key. Write-only — the key itself is never sent
 * back; responses only say where it comes from, its last 4 characters and
 * whether the provider accepted it last time.
 */

const describe = async () => {
  const doc = await IntegrationSecret.findOne({ name: SECRET_NAME })
    .select("last4 updatedByName updatedAt lastCheck")
    .lean();
  const envKey = process.env.GROQ_API_KEY;
  return {
    encryptionConfigured: isEncryptionConfigured(),
    source: doc ? "dashboard" : envKey ? "env" : "none",
    last4: doc ? doc.last4 : envKey ? envKey.slice(-4) : "",
    updatedAt: doc?.updatedAt ?? null,
    updatedBy: doc?.updatedByName || null,
    lastCheck: doc
      ? doc.lastCheck?.at
        ? doc.lastCheck
        : null
      : envKey
        ? getEnvKeyCheck()
        : null,
  };
};

// GET /api/v1/admin/integrations/ai/status — any admin. Only says whether
// the chat AI works (for the warning on the Chats page); no key details.
const getAiStatus = async (req, res) => {
  try {
    const ai = await describe();
    return res.status(200).json({
      success: true,
      status: {
        configured: ai.source !== "none",
        ok: ai.source === "none" ? false : ai.lastCheck?.ok ?? null,
        message: ai.source === "none" ? "No AI key configured" : ai.lastCheck?.message || "",
        at: ai.lastCheck?.at ?? null,
      },
    });
  } catch (err) {
    logger.error("getAiStatus error", { message: err.message });
    return res.status(500).json({ success: false, message: "Failed to load AI status" });
  }
};

// GET /api/v1/admin/integrations/ai
const getAiIntegration = async (req, res) => {
  try {
    return res.status(200).json({ success: true, ai: await describe() });
  } catch (err) {
    logger.error("getAiIntegration error", { message: err.message });
    return res.status(500).json({ success: false, message: "Failed to load AI settings" });
  }
};

// PUT /api/v1/admin/integrations/ai  { apiKey }
// Checks the key with the provider first; a rejected key is never saved.
const saveAiKey = async (req, res) => {
  try {
    if (!isEncryptionConfigured()) {
      return res.status(503).json({
        success: false,
        message:
          "Saving keys needs SETTINGS_ENCRYPTION_KEY in the server's .env. Ask your developer to add it.",
      });
    }
    const apiKey = typeof req.body?.apiKey === "string" ? req.body.apiKey.trim() : "";
    if (apiKey.length < 20 || /\s/.test(apiKey)) {
      return res.status(400).json({ success: false, message: "That doesn't look like an API key." });
    }

    const check = await checkGroqKey(apiKey);
    if (!check.ok) {
      return res.status(400).json({ success: false, message: check.message });
    }

    await IntegrationSecret.findOneAndUpdate(
      { name: SECRET_NAME },
      {
        $set: {
          ...encryptSecret(apiKey),
          last4: apiKey.slice(-4),
          updatedById: req.user?.id ?? null,
          updatedByName: req.user?.username || req.user?.email || "",
          lastCheck: { ok: true, message: check.message, at: new Date() },
        },
      },
      { upsert: true }
    );
    invalidateAiKey();
    logger.info("Chat AI key updated from dashboard", { by: req.user?.email });
    return res.status(200).json({ success: true, ai: await describe() });
  } catch (err) {
    logger.error("saveAiKey error", { message: err.message });
    return res.status(500).json({ success: false, message: "Failed to save the key" });
  }
};

// POST /api/v1/admin/integrations/ai/test — checks the key the chat uses now.
const testAiKey = async (req, res) => {
  try {
    const { getGroqClient } = require("../../services/aiKeyService");
    const client = await getGroqClient();
    if (!client) {
      return res.status(200).json({
        success: true,
        result: { ok: false, message: "No key configured" },
        ai: await describe(),
      });
    }
    const result = await checkGroqKey(client.apiKey);
    await recordAiKeyCheck(result);
    return res.status(200).json({ success: true, result, ai: await describe() });
  } catch (err) {
    logger.error("testAiKey error", { message: err.message });
    return res.status(500).json({ success: false, message: "Failed to test the key" });
  }
};

// DELETE /api/v1/admin/integrations/ai — back to GROQ_API_KEY from .env.
const removeAiKey = async (req, res) => {
  try {
    await IntegrationSecret.deleteOne({ name: SECRET_NAME });
    invalidateAiKey();
    logger.info("Chat AI key removed from dashboard", { by: req.user?.email });
    return res.status(200).json({ success: true, ai: await describe() });
  } catch (err) {
    logger.error("removeAiKey error", { message: err.message });
    return res.status(500).json({ success: false, message: "Failed to remove the key" });
  }
};

module.exports = { getAiStatus, getAiIntegration, saveAiKey, testAiKey, removeAiKey };
