// controllers/admin/errorLogController.js
// Admin-only controller to query the system_error_logs collection.

const SystemErrorLog = require("../../models/SystemErrorLog");
const logger = require("../../utils/logger");

/**
 * GET /api/v1/admin/error-logs
 * Query params:
 *   page        - page number (default 1)
 *   limit       - results per page (default 30, max 100)
 *   source      - filter by controller/service name
 *   statusCode  - filter by HTTP status code
 *   from        - ISO date string (createdAt >=)
 *   to          - ISO date string (createdAt <=)
 *   search      - search in message or endpoint
 */
const getErrorLogs = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 30,
      source,
      statusCode,
      from,
      to,
      search,
    } = req.query;

    const pageNum  = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip     = (pageNum - 1) * limitNum;

    // ── Build filter ─────────────────────────────────────────────────────────
    const filter = {};

    if (source)     filter.source     = { $regex: source, $options: "i" };
    if (statusCode) filter.statusCode = parseInt(statusCode, 10);

    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to)   filter.createdAt.$lte = new Date(to);
    }

    if (search) {
      filter.$or = [
        { message:  { $regex: search, $options: "i" } },
        { endpoint: { $regex: search, $options: "i" } },
        { source:   { $regex: search, $options: "i" } },
      ];
    }

    // ── Query ─────────────────────────────────────────────────────────────────
    const [logs, total] = await Promise.all([
      SystemErrorLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .select("-__v")
        .lean(),
      SystemErrorLog.countDocuments(filter),
    ]);

    // ── Source list for filter dropdown ──────────────────────────────────────
    const sources = await SystemErrorLog.distinct("source");

    return res.status(200).json({
      success: true,
      data: logs,
      pagination: {
        page:       pageNum,
        limit:      limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
      meta: { sources },
    });
  } catch (error) {
    logger.error("getErrorLogs failed", { message: error.message });
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch error logs",
    });
  }
};

/**
 * DELETE /api/v1/admin/error-logs/:id
 * Manually delete a single error log entry.
 */
const deleteErrorLog = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await SystemErrorLog.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: "Log not found" });
    }
    return res.status(200).json({ success: true, message: "Log deleted" });
  } catch (error) {
    logger.error("deleteErrorLog failed", { message: error.message });
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete log",
    });
  }
};

/**
 * DELETE /api/v1/admin/error-logs
 * Clear all error logs (manual purge).
 */
const clearAllErrorLogs = async (req, res) => {
  try {
    const result = await SystemErrorLog.deleteMany({});
    return res.status(200).json({
      success: true,
      message: `Cleared ${result.deletedCount} error log(s)`,
    });
  } catch (error) {
    logger.error("clearAllErrorLogs failed", { message: error.message });
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to clear logs",
    });
  }
};

module.exports = { getErrorLogs, deleteErrorLog, clearAllErrorLogs };
