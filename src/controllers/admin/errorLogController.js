// controllers/admin/errorLogController.js
// Admin-only controller to query the system_error_logs collection.

const SystemErrorLog = require("../../models/SystemErrorLog");
const logger = require("../../utils/logger");
const { hasPermission } = require("../../../resources/permissions");
const escapeRegex = require("../../utils/escapeRegex");
const { cacheGetOrSet, TTL } = require("../../utils/redisCache");

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

    if (source)     filter.source     = { $regex: escapeRegex(source), $options: "i" };
    if (statusCode) filter.statusCode = parseInt(statusCode, 10);

    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to)   filter.createdAt.$lte = new Date(to);
    }

    if (search) {
      const safeSearch = escapeRegex(search);
      filter.$or = [
        { message:  { $regex: safeSearch, $options: "i" } },
        { endpoint: { $regex: safeSearch, $options: "i" } },
        { source:   { $regex: safeSearch, $options: "i" } },
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
    // Cached briefly — the set of distinct sources changes slowly and this ran
    // a full distinct() scan on every list request.
    const sources = await cacheGetOrSet("errorlogs:sources", TTL.DASHBOARD, () =>
      SystemErrorLog.distinct("source"),
    );

    // Read-only admins (no manage:error_logs) get rows without raw internals:
    // strip stack trace, request metadata and the linked userId server-side.
    const canManage = hasPermission(req.user?.role, "manage:error_logs");
    const sanitized = canManage
      ? logs
      : logs.map(({ reason, metadata, userId, ...safe }) => safe);

    return res.status(200).json({
      success: true,
      data: sanitized,
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
