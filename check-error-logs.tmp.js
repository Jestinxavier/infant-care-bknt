const path = require("path");
process.chdir("/mnt/c/Users/eldho/Documents/MyWorks/infant_care/backend");
require("dotenv").config();
const mongoose = require("mongoose");

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const col = mongoose.connection.collection("system_error_logs");

  const byMsg = await col.aggregate([
    { $group: { _id: "$message", count: { $sum: 1 }, latest: { $max: "$createdAt" }, statusCodes: { $addToSet: "$statusCode" } } },
    { $sort: { count: -1 } },
    { $limit: 12 },
  ]).toArray();
  console.log("=== By message ===");
  byMsg.forEach(r => console.log(r.count, "|", r._id, "| latest:", r.latest?.toISOString(), "| codes:", r.statusCodes.join(",")));

  const recent401 = await col.find({ statusCode: { $lt: 500 } }).sort({ createdAt: -1 }).limit(3).toArray();
  console.log("\n=== Most recent sub-500 entries ===");
  recent401.forEach(r => console.log(r.createdAt?.toISOString(), "|", r.statusCode, "|", r.message, "|", r.source, "|", r.endpoint));

  const total = await col.countDocuments({});
  const lt500 = await col.countDocuments({ statusCode: { $lt: 500 } });
  console.log(`\nTotal: ${total}, sub-500: ${lt500}`);
  await mongoose.disconnect();
})().catch(e => { console.error(e.message); process.exit(1); });
