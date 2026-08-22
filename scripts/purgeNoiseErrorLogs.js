// One-off maintenance: purge expected-workflow noise from system_error_logs.
// Removes sub-500 entries whose message matches the known-noise patterns
// (same defaults as utils/errorLogger.js).
//
// Usage:
//   node scripts/purgeNoiseErrorLogs.js            # dry run (default)
//   node scripts/purgeNoiseErrorLogs.js --live     # actually delete
//   node scripts/purgeNoiseErrorLogs.js --all-sub-500 [--live]
//                                                  # remove ALL sub-500 rows

require("dotenv").config();
const mongoose = require("mongoose");

const DEFAULT_NOISE_PATTERNS = [
  "No token provided",
  "Invalid token format",
  "Invalid token",
  "Invalid or expired token",
  "Token expired",
];

const args = new Set(process.argv.slice(2));
const live = args.has("--live");
const allSub500 = args.has("--all-sub-500");

const patterns = (
  process.env.ERROR_LOG_NOISE_PATTERNS ?? DEFAULT_NOISE_PATTERNS.join(",")
)
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);

const filter = allSub500
  ? { statusCode: { $lt: 500 } }
  : {
      statusCode: { $lt: 500 },
      $or: patterns.map((p) => ({
        message: { $regex: p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" },
      })),
    };

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("✅ Connected to MongoDB");

  const col = mongoose.connection.collection("system_error_logs");

  const breakdown = await col
    .aggregate([{ $match: filter }, { $group: { _id: "$message", count: { $sum: 1 } } }, { $sort: { count: -1 } }])
    .toArray();

  const total = breakdown.reduce((sum, r) => sum + r.count, 0);
  console.log(`\nMatched ${total} document(s):`);
  breakdown.forEach((r) => console.log(`  ${r.count}\t${r._id}`));

  if (!live) {
    console.log("\nDry run — re-run with --live to delete.");
  } else {
    const result = await col.deleteMany(filter);
    console.log(`\n🗑️  Deleted ${result.deletedCount} document(s).`);
  }

  await mongoose.disconnect();
  process.exit(0);
})().catch((err) => {
  console.error("❌", err.message);
  process.exit(1);
});
