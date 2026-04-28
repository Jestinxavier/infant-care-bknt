/**
 * One-time migration: replace console.log/error/warn with structured logger
 * Run with: node scripts/migrate-console-to-logger.js
 */

const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "../src");
const TARGETS = ["controllers", "routes", "services", "jobs", "features"];

// Relative path from a given file to utils/logger.js
function relativeLogger(filePath) {
  const rel = path.relative(path.dirname(filePath), path.join(SRC, "utils/logger"));
  return rel.replace(/\\/g, "/");
}

function needsLogger(content) {
  return /console\.(log|error|warn|info|debug)/.test(content);
}

function alreadyImportsLogger(content) {
  return /require.*logger/.test(content) || /from.*logger/.test(content);
}

function addLoggerImport(content, loggerPath) {
  // Insert after the last require/const block at top of file
  // Find first blank line after requires
  const lines = content.split("\n");
  let lastRequireLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^(const|let|var)\s+\w+\s*=\s*require\(/.test(lines[i])) {
      lastRequireLine = i;
    }
  }
  const importLine = `const logger = require("${loggerPath}");`;
  if (lastRequireLine >= 0) {
    lines.splice(lastRequireLine + 1, 0, importLine);
  } else {
    lines.unshift(importLine);
  }
  return lines.join("\n");
}

function replaceConsoleCalls(content) {
  return content
    .replace(/console\.error\(/g, "logger.error(")
    .replace(/console\.warn\(/g, "logger.warn(")
    .replace(/console\.info\(/g, "logger.info(")
    .replace(/console\.debug\(/g, "logger.debug(")
    // console.log → logger.info (most common usage is informational)
    .replace(/console\.log\(/g, "logger.info(");
}

function walkDir(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  fs.readdirSync(dir).forEach((file) => {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walkDir(fullPath, fileList);
    } else if (file.endsWith(".js") && !file.endsWith(".test.js")) {
      fileList.push(fullPath);
    }
  });
  return fileList;
}

let processed = 0;
let skipped = 0;

for (const target of TARGETS) {
  const dir = path.join(SRC, target);
  const files = walkDir(dir);

  for (const file of files) {
    let content = fs.readFileSync(file, "utf8");

    if (!needsLogger(content)) {
      skipped++;
      continue;
    }

    if (!alreadyImportsLogger(content)) {
      const logPath = relativeLogger(file);
      content = addLoggerImport(content, logPath);
    }

    content = replaceConsoleCalls(content);
    fs.writeFileSync(file, content, "utf8");
    console.log(`✅ ${path.relative(SRC, file)}`);
    processed++;
  }
}

console.log(`\nDone: ${processed} files updated, ${skipped} skipped (no console usage).`);
