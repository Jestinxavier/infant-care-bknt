// Structured logger — JSON in production, readable in development.
// Replace all console.log/warn/error calls with this module.
// Fields: level, message, timestamp, context (arbitrary key-value data).
// All levels → logs/combined.log; errors → logs/error.log (always, both envs).

const fs = require("fs");
const path = require("path");

const isProd = process.env.NODE_ENV === "production";

const logsDir = path.resolve(__dirname, "../../logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const combinedLogPath = path.join(logsDir, "combined.log");
const errorLogPath    = path.join(logsDir, "error.log");

function timestamp() {
  return new Date().toISOString();
}

function writeToFile(filePath, entry) {
  try {
    fs.appendFileSync(filePath, entry + "\n", "utf8");
  } catch {
    // never crash the app because of a logging failure
  }
}

function write(level, message, context = {}) {
  const entry = JSON.stringify({ level, message, timestamp: timestamp(), ...context });

  // Always persist to files
  writeToFile(combinedLogPath, entry);
  if (level === "error") writeToFile(errorLogPath, entry);

  if (isProd) {
    // JSON lines — parseable by Datadog, Logtail, CloudWatch, etc.
    process.stdout.write(entry + "\n");
  } else {
    const prefix = {
      info:  "ℹ️  [INFO]",
      warn:  "⚠️  [WARN]",
      error: "❌ [ERROR]",
      debug: "🔍 [DEBUG]",
    }[level] || `[${level.toUpperCase()}]`;

    const ctxStr = Object.keys(context).length
      ? "\n  " + JSON.stringify(context, null, 2).split("\n").join("\n  ")
      : "";
    console.log(`${prefix} ${message}${ctxStr}`);
  }
}

const logger = {
  info:  (message, context = {}) => write("info",  message, context),
  warn:  (message, context = {}) => write("warn",  message, context),
  error: (message, context = {}) => write("error", message, context),
  debug: (message, context = {}) => {
    if (process.env.LOG_LEVEL === "debug") write("debug", message, context);
  },

  // Convenience: request-scoped logger (attaches path + method)
  forRequest: (req) => ({
    info:  (msg, ctx = {}) => logger.info(msg,  { path: req.path, method: req.method, ...ctx }),
    warn:  (msg, ctx = {}) => logger.warn(msg,  { path: req.path, method: req.method, ...ctx }),
    error: (msg, ctx = {}) => logger.error(msg, { path: req.path, method: req.method, ...ctx }),
  }),

  // Backward-compat wrappers for PhonePe logger usage
  logPhonePeError: (message, data) => logger.error(message, { domain: "phonepe", data }),
  logPhonePeInfo:  (message, data) => logger.info(message,  { domain: "phonepe", data }),
};

module.exports = logger;
