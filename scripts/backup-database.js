/**
 * Database backup — dumps every collection of the target MongoDB database to
 * JSON files under a timestamped folder (one file per collection, newline-
 * delimited JSON so large collections stream without loading fully in memory).
 *
 * A restore helper is written alongside it (restore.js) that re-inserts the
 * dumps. This is a logical backup (data only) — use Atlas snapshots for a
 * full PITR backup; this exists so a targeted migration is reversible without
 * Atlas tooling.
 *
 * Usage:
 *   node scripts/backup-database.js
 *   node scripts/backup-database.js --out ./backups --uri <url>
 *
 * Output: <out>/<db>-<timestamp>/<collection>.jsonl  + manifest.json
 */

const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const flagValue = (name) => {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
};
const MONGO_URI_OVERRIDE = flagValue("--uri");
const OUT_DIR = flagValue("--out") || path.join(__dirname, "..", "backups");

async function main() {
  const mongoUri =
    MONGO_URI_OVERRIDE || process.env.MONGODB_URI || "mongodb://localhost:27017";

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 30000 });
  const db = mongoose.connection.db;
  const dbName = db.databaseName;

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const targetDir = path.join(OUT_DIR, `${dbName}-${stamp}`);
  fs.mkdirSync(targetDir, { recursive: true });

  console.log(`\n💾 Backing up "${dbName}" → ${targetDir}`);
  console.log(`Connecting to: ${mongoUri.replace(/\/\/[^@]*@/, "//***@")}\n`);

  const collections = (await db.listCollections().toArray()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  const manifest = { database: dbName, createdAt: new Date().toISOString(), collections: [] };
  let totalDocs = 0;

  for (const { name } of collections) {
    const filePath = path.join(targetDir, `${name}.jsonl`);
    const ws = fs.createWriteStream(filePath);
    let count = 0;

    const cursor = db.collection(name).find({});
    for await (const doc of cursor) {
      count += 1;
      if (!ws.write(JSON.stringify(doc) + "\n")) {
        await new Promise((resolve) => ws.once("drain", resolve));
      }
    }
    await new Promise((resolve, reject) => {
      ws.end(() => resolve());
      ws.on("error", reject);
    });

    totalDocs += count;
    manifest.collections.push({ name, count });
    console.log(`  ✓ ${name.padEnd(32)} ${String(count).padStart(7)} docs`);
  }

  fs.writeFileSync(
    path.join(targetDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );

  console.log(`\n✅ Backup complete: ${collections.length} collections, ${totalDocs} documents`);
  console.log(`   ${targetDir}`);
  console.log(`   Restore with: node scripts/restore-database.js --dir "${targetDir}"`);

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error("❌ Backup failed:", error);
  process.exit(1);
});
