/**
 * Restore a backup created by scripts/backup-database.js.
 *
 * Re-inserts the dumped documents into the target database. By default it
 * REPLACES collections (drops then re-inserts) so the DB returns to the exact
 * backed-up state. Pass --merge to upsert instead of dropping.
 *
 * Usage:
 *   node scripts/restore-database.js --dir ./backups/onlineshopping-<stamp>
 *   node scripts/restore-database.js --dir <path> --merge
 *   node scripts/restore-database.js --dir <path> --collections products,orders
 *   node scripts/restore-database.js --dir <path> --uri <url>
 *
 * ⚠️  Without --merge this DROPS each listed collection before restoring.
 */

const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { flagValue, parseMode, redactUri } = require("./lib/cliMode");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { dryRun } = parseMode(process.argv.slice(2), { defaultMode: "apply" });
const MONGO_URI_OVERRIDE = flagValue(process.argv, "--uri");
const DIR = flagValue(process.argv, "--dir");
const MERGE = process.argv.includes("--merge");
const ONLY = flagValue(process.argv, "--collections");

async function readJsonl(filePath) {
  const docs = [];
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (line.trim()) docs.push(JSON.parse(line));
  }
  return docs;
}

async function main() {
  if (!DIR) {
    console.error("❌ --dir <backup-folder> is required.");
    process.exit(1);
  }
  const dir = path.resolve(DIR);
  const manifestPath = path.join(dir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    console.error(`❌ No manifest.json in ${dir}`);
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  const mongoUri =
    MONGO_URI_OVERRIDE || process.env.MONGODB_URI || "mongodb://localhost:27017";

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 30000 });
  const db = mongoose.connection.db;

  const wanted = ONLY ? new Set(ONLY.split(",").map((s) => s.trim())) : null;
  const collections = manifest.collections.filter(
    (c) => !wanted || wanted.has(c.name),
  );

  console.log(
    `\n♻️  Restoring ${collections.length} collection(s) ${MERGE ? "(merge/upsert)" : "(REPLACE — drops first)"} → ${db.databaseName}\n`,
  );
  console.log(`   Source: ${dir}`);
  console.log(`   Mongo:  ${redactUri(mongoUri)}\n`);

  if (dryRun) {
    console.log(`🔍 DRY RUN — no writes. ${MERGE ? "Would upsert" : "Would REPLACE (drop first)"}:`);
    for (const { name, count } of collections) {
      const exists = fs.existsSync(path.join(dir, `${name}.jsonl`));
      console.log(
        `   ${exists ? "•" : "⚠️"} ${name.padEnd(32)} ${String(count ?? "?").padStart(7)} docs${exists ? "" : " (file missing)"}`,
      );
    }
    await mongoose.disconnect();
    return;
  }

  for (const { name } of collections) {
    const filePath = path.join(dir, `${name}.jsonl`);
    if (!fs.existsSync(filePath)) {
      console.warn(`  ⚠️  missing ${name}.jsonl — skipped`);
      continue;
    }
    const docs = await readJsonl(filePath);
    if (!MERGE) {
      await db.collection(name).deleteMany({});
    }
    if (docs.length) {
      const ops = docs.map((doc) => ({
        replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true },
      }));
      const chunk = 500;
      for (let i = 0; i < ops.length; i += chunk) {
        await db.collection(name).bulkWrite(ops.slice(i, i + chunk), {
          ordered: false,
        });
      }
    }
    console.log(`  ✓ ${name.padEnd(32)} ${String(docs.length).padStart(7)} docs`);
  }

  console.log("\n✅ Restore complete");
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error("❌ Restore failed:", error);
  process.exit(1);
});
