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

function safeStringify(obj, space) {
  try {
    return JSON.stringify(obj, null, space);
  } catch {
    const seen = new WeakSet();
    return JSON.stringify(
      obj,
      (key, value) => {
        if (typeof value === "object" && value !== null) {
          if (seen.has(value)) return "[Circular]";
          seen.add(value);
        }
        return value;
      },
      space
    );
  }
}

function write(level, message, context = {}) {
  const safeContext =
    typeof context === "object" && context !== null
      ? context
      : { value: context };
  const entry = safeStringify({
    level,
    message,
    timestamp: timestamp(),
    ...safeContext,
  });

  // Always persist to files
  writeToFile(combinedLogPath, entry);
  if (level === "error") writeToFile(errorLogPath, entry);

  if (isProd) {
    // JSON lines — parseable by Datadog, Logtail, CloudWatch, etc.
    process.stdout.write(entry + "\n");
  } else {
    const prefix =
      {
        info: "ℹ️  [INFO]",
        warn: "⚠️  [WARN]",
        error: "❌ [ERROR]",
        debug: "🔍 [DEBUG]",
      }[level] || `[${level.toUpperCase()}]`;

    let ctxStr = "";
    if (Object.keys(safeContext).length) {
      try {
        ctxStr = "\n  " + safeStringify(safeContext, 2).split("\n").join("\n  ");
      } catch {
        ctxStr = `\n  [Context Serialization Error]`;
      }
    }
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
