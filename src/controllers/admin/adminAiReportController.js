// controllers/admin/adminAiReportController.js
// Admin API for the AI daily business reports.
const AiDailyReport = require("../../models/AiDailyReport");
const { generateReportForDate } = require("../../services/aiReportService");
const logger = require("../../utils/logger");

// ISO yyyy-mm-dd validator
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/v1/admin/ai-reports?page=&limit=&from=&to=
 * Lists generated reports, newest first.
 */
const listReports = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const filter = {};
    if (DATE_RE.test(req.query.from || "")) filter.date = { $gte: req.query.from };
    if (DATE_RE.test(req.query.to || "")) {
      filter.date = { ...(filter.date || {}), $lte: req.query.to };
    }

    const [total, reports] = await Promise.all([
      AiDailyReport.countDocuments(filter),
      AiDailyReport.find(filter)
        .select("date status provider metrics.traffic metrics.sales content")
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    return res.status(200).json({
      success: true,
      reports,
      pagination: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) },
    });
  } catch (err) {
    logger.error("[AiReport] list error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

/**
 * GET /api/v1/admin/ai-reports/:date
 * Returns the full report (including full metrics) for one day.
 */
const getReport = async (req, res) => {
  try {
    const { date } = req.params;
    if (!DATE_RE.test(date || "")) {
      return res.status(400).json({ success: false, message: "Invalid date format (use yyyy-mm-dd)." });
    }
    const report = await AiDailyReport.findOne({ date }).lean();
    if (!report) {
      return res.status(404).json({ success: false, message: `No report found for ${date}.` });
    }
    return res.status(200).json({ success: true, report });
  } catch (err) {
    logger.error("[AiReport] get error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

/**
 * POST /api/v1/admin/ai-reports/generate
 * Body: { date?: "yyyy-mm-dd" } — regenerates a report for the given day
 * (defaults to yesterday). Upserts.
 */
const generateReport = async (req, res) => {
  try {
    const { date } = req.body || {};
    const { getYesterdayDateStr } = require("../../services/aiReportService");
    const targetDate = DATE_RE.test(date || "") ? date : getYesterdayDateStr();

    const result = await generateReportForDate(targetDate);
    if (result?.error) {
      return res.status(500).json({ success: false, message: "Failed to generate report." });
    }
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    logger.error("[AiReport] generate error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

module.exports = { listReports, getReport, generateReport };