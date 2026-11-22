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

// Groq retires models over time; when it does, every AI reply fails with
// "model_not_found" and the chat falls back to catalog replies (this is how
// llama-3.3-70b-versatile broke in Nov 2026). Set GROQ_MODEL in .env to
// switch models without a code change.
// Tested 2026-11-22 with the live key and the chat's JSON format:
//   openai/gpt-oss-120b — 3/3 valid, ~0.6 s (default: largest, best at
//     following the long system prompt)
//   qwen/qwen3.8-27b    — 3/3 valid, ~0.2 s (fastest fallback)
// Avoid reasoning_effort "low" on gpt-oss-120b: it sometimes returns invalid JSON.
const GROQ_CHAT_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

const isModelUnavailable = (err) =>
  err?.status === 404 || err?.error?.error?.code === "model_not_found";
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
 * A valid key isn't enough: the chat also needs its model to exist. Sends a
 * tiny test message to the chat model (a few tokens).
 */
const checkChatModel = async (key) => {
  try {
    await new Groq({ apiKey: key }).chat.completions.create({
      model: GROQ_CHAT_MODEL,
      messages: [{ role: "user", content: "Reply with the word ok." }],
      max_tokens: 64,
    });
    return { ok: true, message: "Key and chat model working" };
  } catch (err) {
    if (isModelUnavailable(err)) {
      return {
        ok: false,
        status: err?.status ?? null,
        message: `Key works, but the chat model "${GROQ_CHAT_MODEL}" isn't available (set GROQ_MODEL)`,
      };
    }
    // Rate limited: the key and model answered, just busy right now.
    if (err?.status === 429) {
      return { ok: true, message: "Key accepted (AI service busy right now)" };
    }
    return {
      ok: false,
      status: err?.status ?? null,
      message: `Key works, but a test chat failed (${err?.status || err?.message || "error"})`,
    };
  }
};

/** Full check for "Test now": the key first, then the chat model. */
const checkGroqSetup = async (key) => {
  const keyCheck = await checkGroqKey(key);
  if (!keyCheck.ok) return keyCheck;
  return checkChatModel(key);
};

/**
 * Record that the live chat was rejected by the provider, so the dashboard
 * shows it. Only for dashboard-saved keys (env keys have nowhere to show it).
 */
// Bell alert for a broken key: raised when the key starts failing, cleared
// when it works again. Tracks the last known state so it fires once per
// problem rather than on every rejected chat.
const AI_KEY_ALERT = "ai-key";
let alertState = null; // null = unknown (e.g. just restarted), true = ok, false = failing

const syncAiKeyAlert = async (ok, message) => {
  if (ok === alertState) return;
  alertState = ok;
  // Required lazily: the notification controller pulls in the socket service.
  const { createSystemAlert, clearSystemAlert } = require("../controllers/admin/notificationController");
  if (ok) {
    await clearSystemAlert(AI_KEY_ALERT);
  } else {
    await createSystemAlert({
      key: AI_KEY_ALERT,
      title: "Chat AI isn't working",
      // Not always the key: a retired chat model also lands here.
      message: `${message}. Infanta AI is only giving basic catalog replies until this is fixed.`,
      href: "/site-config",
    });
  }
};

const recordAiKeyCheck = async ({ ok, message }) => {
  const lastCheck = { ok, message, at: new Date() };
  syncAiKeyAlert(ok, message).catch(() => {});
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
  GROQ_CHAT_MODEL,
  isModelUnavailable,
  getGroqClient,
  checkGroqKey,
  checkChatModel,
  checkGroqSetup,
  invalidateAiKey,
  recordAiKeyCheck,
  recordAiKeyFailure,
  noteAiKeySuccess,
  getEnvKeyCheck,
};
