const Groq = require("groq-sdk");
const IntegrationSecret = require("../models/IntegrationSecret");
const { decryptSecret } = require("../utils/secretCrypto");
const logger = require("../utils/logger");

/**
 * The chat AI (Groq) key: a key saved from the dashboard wins, otherwise
 * GROQ_API_KEY from the environment. The resolved key and its client are
 * cached and dropped whenever the dashboard key changes, so a new key takes
 * effect without a restart.
 */

const SECRET_NAME = "groq";
const CACHE_MS = 60 * 1000; // re-read the DB at most once a minute

let cached = null; // { key, source, client, at }
// Last check of the .env key: it has no DB record, so it's kept in memory
// (resets on restart) for the dashboard to show.
let envKeyCheck = null;

const invalidateAiKey = () => {
  cached = null;
};

const resolveKey = async () => {
  try {
    const doc = await IntegrationSecret.findOne({ name: SECRET_NAME }).lean();
    if (doc) return { key: decryptSecret(doc), source: "dashboard" };
  } catch (err) {
    // Unreadable (e.g. SETTINGS_ENCRYPTION_KEY changed): fall back to env.
    logger.error("Saved AI key could not be read; using GROQ_API_KEY", {
      message: err.message,
    });
  }
  const envKey = process.env.GROQ_API_KEY;
  return envKey ? { key: envKey, source: "env" } : { key: null, source: "none" };
};

/** Groq client for the current key, or null when no key is configured. */
const getGroqClient = async () => {
  if (!cached || Date.now() - cached.at > CACHE_MS) {
    const { key, source } = await resolveKey();
    cached = {
      key,
      source,
      client: key ? new Groq({ apiKey: key }) : null,
      at: Date.now(),
    };
  }
  return cached.client;
};

/** Check a key with the provider without using any tokens. */
const checkGroqKey = async (key) => {
  try {
    await new Groq({ apiKey: key }).models.list();
    return { ok: true, message: "Key accepted" };
  } catch (err) {
    const code = err?.error?.error?.code || err?.code;
    const message =
      err?.status === 401
        ? code === "expired_api_key"
          ? "Key rejected: expired"
          : "Key rejected: invalid"
        : `Couldn't reach the AI service (${err?.status || err?.message || "error"})`;
    return { ok: false, status: err?.status ?? null, message };
  }
};

/**
 * Record that the live chat was rejected by the provider, so the dashboard
 * shows it. Only for dashboard-saved keys (env keys have nowhere to show it).
 */
const recordAiKeyCheck = async ({ ok, message }) => {
  const lastCheck = { ok, message, at: new Date() };
  try {
    const res = await IntegrationSecret.updateOne(
      { name: SECRET_NAME },
      { $set: { lastCheck } }
    );
    if (res.matchedCount === 0) envKeyCheck = lastCheck;
  } catch {
    envKeyCheck = lastCheck; // best effort
  }
};

// Live chat results flip the status only when it changes, so a busy chat
// doesn't write on every message and a fixed key turns green by itself.
let lastLiveOk = null;

const recordAiKeyFailure = (message) => {
  lastLiveOk = false;
  return recordAiKeyCheck({ ok: false, message });
};

const noteAiKeySuccess = () => {
  if (lastLiveOk === true) return;
  lastLiveOk = true;
  recordAiKeyCheck({ ok: true, message: "Key accepted" });
};

const getEnvKeyCheck = () => envKeyCheck;

module.exports = {
  SECRET_NAME,
  getGroqClient,
  checkGroqKey,
  invalidateAiKey,
  recordAiKeyCheck,
  recordAiKeyFailure,
  noteAiKeySuccess,
  getEnvKeyCheck,
};
