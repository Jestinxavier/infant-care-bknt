// utils/errorLogger.js
// Persists errors to the system_error_logs MongoDB collection (SystemErrorLog model).
// Works alongside the file-based utils/logger.js — call both independently or use
// logError() which handles both at once.
//
// Usage:
//   const { logError } = require('../utils/errorLogger');
//
//   } catch (error) {
//     await logError(error, {
//       source: 'hybridCartController',
//       req,           // pass req to auto-extract method, endpoint, userId
//       statusCode: 500,
//       metadata: { cartId: req.cookies?.cart_id },
//     });
//   }

const SystemErrorLog = require("../models/SystemErrorLog");
const logger = require("./logger");

/**
 * Persist an error to the system_error_logs collection AND emit to the file logger.
 *
 * @param {Error}  error            - The caught Error object
 * @param {Object} [context={}]     - Additional context
 * @param {string}  context.source  - Controller/service name (required for useful logs)
 * @param {Object}  [context.req]   - Express request object — auto-extracts method, endpoint, userId
 * @param {number}  [context.statusCode=500]
 * @param {Object}  [context.metadata={}]  - Extra key-value data (avoid sensitive fields)
 */
const logError = async (error, context = {}) => {
  const { source = "unknown", req = null, statusCode, metadata = {} } = context;

  // ── Auto-extract from req ────────────────────────────────────────────────
  const method   = req?.method   ?? context.method   ?? null;
  const endpoint = req?.originalUrl ?? context.endpoint ?? null;
  const userId   = req?.user?._id   ?? context.userId   ?? null;
  const resolvedStatus = statusCode ?? error?.statusCode ?? 500;

  // ── Emit to the file logger first (never blocks) ─────────────────────────
  logger.error(error.message || "Unknown error", {
    source,
    method,
    endpoint,
    statusCode: resolvedStatus,
    ...(userId && { userId: userId.toString() }),
    stack: error.stack,
  });

  // ── Persist to MongoDB (non-blocking, fail-safe) ─────────────────────────
  try {
    await SystemErrorLog.create({
      message:     error.message || "Unknown error",
      reason:      error.stack   || error.message || null,
      source,
      method,
      endpoint,
      statusCode:  resolvedStatus,
      errorType:   error.name   || "Error",
      userId:      userId || null,
      metadata,
    });
  } catch (dbErr) {
    // Never crash the app because logging failed
    logger.warn("⚠️  errorLogger: failed to persist error to MongoDB", {
      dbError: dbErr.message,
    });
  }
};

/**
 * Lightweight wrapper — logs to file only (skips MongoDB write).
 * Useful for high-frequency warnings that don't need DB persistence.
 *
 * @param {Error|string} error
 * @param {Object}       context
 */
const logErrorFileOnly = (error, context = {}) => {
  const message = typeof error === "string" ? error : error?.message;
  logger.error(message || "Unknown error", context);
};

module.exports = { logError, logErrorFileOnly };
