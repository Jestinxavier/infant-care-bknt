const cron = require("node-cron");
const ChatSession = require("../models/ChatSession");
const { emitEvent } = require("../services/socketService");
const { createChatNotification } = require("../controllers/admin/notificationController");
const logger = require("../utils/logger");

// A handed-over chat nobody has joined after this long rings the dashboard
// and the bell again, once per chat.
const WAITING_THRESHOLD_MS = 10 * 60 * 1000;

const remindWaitingChats = async () => {
  const cutoff = new Date(Date.now() - WAITING_THRESHOLD_MS);
  const waiting = await ChatSession.find({
    status: "escalated",
    staffJoinedAt: null,
    assignedStaffId: null,
    waitingReminderAt: null,
    escalatedAt: { $ne: null, $lte: cutoff },
  })
    .select("sessionId customerName customerEmail customerPhone escalatedAt createdAt")
    .limit(50)
    .lean();

  for (const chat of waiting) {
    // Claim first so two server instances can't both remind for one chat.
    const claimed = await ChatSession.updateOne(
      { _id: chat._id, waitingReminderAt: null },
      { $set: { waitingReminderAt: new Date() } }
    );
    if (claimed.modifiedCount === 0) continue;

    const minutes = Math.round((Date.now() - new Date(chat.escalatedAt).getTime()) / 60000);
    const reason = `Still waiting for a reply (${minutes} min)`;
    emitEvent("chat:new_escalation", {
      sessionId: chat.sessionId,
      customerName: chat.customerName,
      customerEmail: chat.customerEmail,
      customerPhone: chat.customerPhone,
      escalationReason: reason,
      createdAt: chat.createdAt,
    });
    await createChatNotification({
      sessionId: chat.sessionId,
      customerName: chat.customerName,
      reason,
    });
  }
  return waiting.length;
};

const startChatWaitingReminderCron = () => {
  cron.schedule("*/5 * * * *", () => {
    remindWaitingChats().catch((err) =>
      logger.error("Chat waiting reminder failed", { message: err.message })
    );
  });
  logger.info("Chat waiting reminder cron scheduled (every 5 min)");
};

module.exports = { remindWaitingChats, startChatWaitingReminderCron };
