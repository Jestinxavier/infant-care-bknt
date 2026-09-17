// routes/adminAiReportRoutes.js
// Admin-only AI daily report endpoints.
const express = require("express");
const router = express.Router();
const verifyToken = require("../middlewares/authMiddleware");
const requireAdmin = require("../middlewares/adminMiddleware");
const {
  listReports,
  getReport,
  generateReport,
} = require("../controllers/admin/adminAiReportController");

router.use(verifyToken, requireAdmin);

router.get("/", listReports);
router.get("/:date", getReport);
router.post("/generate", generateReport);

module.exports = router;