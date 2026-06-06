const fs = require("fs");
const path = require("path");

const logsDir = path.resolve(__dirname, "../../logs");
const webhookLogPath = path.join(logsDir, "phonepe-webhook.log");

function wlog(event, data = {}) {
  const line = JSON.stringify({
    t: new Date().toISOString(),
    event,
    ...data,
  });
  try {
    fs.appendFileSync(webhookLogPath, line + "\n", "utf8");
  } catch {
    // never crash the app
  }
  // also print to console so it shows in server stdout
  console.log(`[PHONEPE-WEBHOOK] ${event}`, data);
}

module.exports = { wlog };
