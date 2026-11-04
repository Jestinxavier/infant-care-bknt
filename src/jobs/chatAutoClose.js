const cron = require("node-cron");
const ChatSession = require("../models/ChatSession");
const { emitEvent } = require("../services/socketService");
const logger = require("../utils/logger");

// Chats never closed themselves, so the Active and Live tabs grew forever.
// Idle ones move to Done (resolved); nothing is deleted.
const AI_CHAT_IDLE_MS = 24 * 60 * 60 * 1000; // AI-only chats: 24 hours
const LIVE_CHAT_IDLE_MS = 7 * 24 * 60 * 60 * 1000; // handed to staff: 7 days

const closeIdleChats = async (now = new Date()) => {
  const close = (status, idleMs) =>
    ChatSession.updateMany(
      { status, updatedAt: { $lte: new Date(now.getTime() - idleMs) } },
      { $set: { status: "resolved", resolvedAt: now, autoClosedAt: now } },
      // Keep updatedAt: closing isn't activity, and the list is sorted by it.
      { timestamps: false }
    );

  const [ai, live] = await Promise.all([
    close("active", AI_CHAT_IDLE_MS),
    close("escalated", LIVE_CHAT_IDLE_MS),
  ]);
  const closed = (ai.modifiedCount || 0) + (live.modifiedCount || 0);
  if (closed > 0) {
    logger.info("Closed idle chats", {
      aiOnly: ai.modifiedCount,
      live: live.modifiedCount,
    });
    emitEvent("chat:attention_changed", {});
  }
  return { aiOnly: ai.modifiedCount || 0, live: live.modifiedCount || 0 };
};

const startChatAutoCloseCron = () => {
  cron.schedule("*/30 * * * *", () => {
    closeIdleChats().catch((err) =>
      logger.error("Chat auto-close failed", { message: err.message })
    );
  });
  logger.info("Chat auto-close cron scheduled (every 30 min)");
};

module.exports = { closeIdleChats, startChatAutoCloseCron };
