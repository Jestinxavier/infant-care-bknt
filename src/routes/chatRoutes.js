const express = require("express");
const router = express.Router();
const verifyToken = require("../middlewares/authMiddleware");
const { optionalVerifyToken } = require("../middlewares/authMiddleware");
const requireAdmin = require("../middlewares/adminMiddleware");
const {
  sendMessage,
  getOrCreateSession,
  getEscalatedSessions,
  getSessionById,
  staffReply,
  joinSession,
  resolveSession,
  getKnowledge,
  addKnowledge,
  deleteKnowledge,
  requestHuman,
  saveContact,
  endSession,
} = require("../controllers/chat/chatController");

// ── Customer routes (guest + auth) ─────────────────────────────────
router.post("/session", optionalVerifyToken, getOrCreateSession);
router.post("/message", optionalVerifyToken, sendMessage);
router.post("/session/:sessionId/request-human", optionalVerifyToken, requestHuman);
router.post("/session/:sessionId/contact", optionalVerifyToken, saveContact);
router.post("/session/:sessionId/end", optionalVerifyToken, endSession);

// ── Admin routes ────────────────────────────────────────────────────
router.get("/admin/sessions", verifyToken, requireAdmin, getEscalatedSessions);
router.get("/admin/sessions/:sessionId", verifyToken, requireAdmin, getSessionById);
router.post("/admin/sessions/:sessionId/reply", verifyToken, requireAdmin, staffReply);
router.post("/admin/sessions/:sessionId/join", verifyToken, requireAdmin, joinSession);
router.post("/admin/sessions/:sessionId/resolve", verifyToken, requireAdmin, resolveSession);
router.get("/admin/knowledge", verifyToken, requireAdmin, getKnowledge);
router.post("/admin/knowledge", verifyToken, requireAdmin, addKnowledge);
router.delete("/admin/knowledge/:id", verifyToken, requireAdmin, deleteKnowledge);

module.exports = router;
