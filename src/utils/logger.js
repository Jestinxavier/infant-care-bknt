const fs = require('fs');
const path = require('path');

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

/**
 * Appends a log message to a specific file with a timestamp.
 * @param {string} filename - The name of the log file (e.g., 'phonepe-error.log')
 * @param {string} level - Log level ('INFO', 'ERROR', 'WARN')
 * @param {string} message - The main log message
 * @param {object|any} data - Additional data to stringify and log
 */
const logToFile = (filename, level, message, data = null) => {
  try {
    const timestamp = new Date().toISOString();
    const filePath = path.join(logsDir, filename);
    
    let logEntry = `[${timestamp}] [${level}] ${message}`;
    
    if (data) {
      if (data instanceof Error) {
        logEntry += `\nStack: ${data.stack}`;
      } else {
        logEntry += `\nData: ${JSON.stringify(data, null, 2)}`;
      }
    }
    
    logEntry += '\n------------------------------------------------------------\n';
    
    fs.appendFile(filePath, logEntry, (err) => {
      if (err) console.error(`Failed to write to log file ${filename}:`, err);
    });
  } catch (err) {
    console.error('Logging failed:', err);
  }
};

module.exports = {
  logPhonePeError: (message, data) => logToFile('phonepe-error.log', 'ERROR', message, data),
  logPhonePeInfo: (message, data) => logToFile('phonepe-info.log', 'INFO', message, data),
};
