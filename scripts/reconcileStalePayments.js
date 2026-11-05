/**
 * Preview (default) or run the stale-payment reconciler by hand.
 *
 *   node scripts/reconcileStalePayments.js                 # preview, last 3 days
 *   node scripts/reconcileStalePayments.js --days 60       # preview older orders too
 *   node scripts/reconcileStalePayments.js --days 60 --apply
 *
 * The preview asks PhonePe/Razorpay for each stuck order's real status and
 * prints what would happen, changing nothing. The scheduled job only looks at
 * the last 3 days; use --days to review older stuck orders, but check their
 * stock by hand first (an admin may already have corrected it).
 */
const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config();

const { parseMode } = require("./lib/cliMode");
const { dryRun, argv } = parseMode(process.argv.slice(2), { defaultMode: "dry" });
const daysArg = argv.indexOf("--days");
const days = daysArg >= 0 ? Number(argv[daysArg + 1]) : 3;

(async () => {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not defined in .env");
    process.exit(1);
  }
  if (!Number.isFinite(days) || days <= 0) {
    console.error("--days must be a positive number");
    process.exit(2);
  }
  await mongoose.connect(process.env.MONGODB_URI);
  const { reconcileStalePayments } = require("../src/services/paymentReconciler");

  console.log(dryRun ? "🔍 PREVIEW — nothing will change" : "✍️  APPLY — orders will be updated");
  const { results } = await reconcileStalePayments({
    dryRun,
    maxAgeMs: days * 24 * 60 * 60 * 1000,
  });
  if (results.length === 0) console.log("No stuck online-payment orders found.");
  for (const r of results) console.log(`${r.orderId}  ${r.paymentMethod}  →  ${r.outcome}`);

  await mongoose.disconnect();
  process.exit(0);
})().catch(async (err) => {
  console.error("Failed:", err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
