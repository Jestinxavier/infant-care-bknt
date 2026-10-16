/**
 * One-off data cleanup: normalise `stockObj.isInStock` so it always agrees with
 * `stockObj.available` (isInStock = available > 0) across all products and
 * variants. Some products were saved with `isInStock: true` while `available: 0`,
 * which made storefront UI render 0-stock variants inconsistently.
 *
 * Usage (run from `backend/`):
 *   node scripts/normalize-stock-flags.js --dry-run  (preview — no writes)
 *   node scripts/normalize-stock-flags.js            (live)
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");
const Product = require("../src/models/Product");

const IS_DRY_RUN = process.argv.includes("--dry-run");
const log = (msg) => process.stdout.write(msg + "\n");

const run = async () => {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI not found in environment variables");

  log(IS_DRY_RUN ? "🔍 DRY RUN — no writes will be made\n" : "🛠  Live — documents will be updated\n");
  log("🔌 Connecting to MongoDB...");
  await mongoose.connect(mongoUri);
  log("✅ Connected\n");

  const products = await Product.find({}).lean();
  let fixedProducts = 0;
  let fixedVariants = 0;
  let changedDocs = 0;

  for (const p of products) {
    const variants = Array.isArray(p.variants) ? p.variants : [];
    if (variants.length > 0) {
      let docChanged = false;
      for (const v of variants) {
        const s = v.stockObj;
        if (s && typeof s.available === "number") {
          const wanted = s.available > 0;
          if (s.isInStock !== wanted) {
            if (!IS_DRY_RUN) {
              const path = `variants.${variants.indexOf(v)}.stockObj.isInStock`;
              await Product.updateOne({ _id: p._id }, { $set: { [path]: wanted } });
            }
            fixedVariants++;
            docChanged = true;
          }
        }
      }
      if (docChanged) changedDocs++;
    } else if (p.stockObj && typeof p.stockObj.available === "number" && p.stockObj.isInStock !== (p.stockObj.available > 0)) {
      if (!IS_DRY_RUN) {
        await Product.updateOne({ _id: p._id }, { $set: { "stockObj.isInStock": p.stockObj.available > 0 } });
      }
      fixedProducts++;
      changedDocs++;
    }
  }

  await mongoose.disconnect();

  log(IS_DRY_RUN ? "\n── DRY RUN SUMMARY ──" : "\n── RESULT ──");
  log(`   Product documents touched      : ${changedDocs}`);
  log(`   Simple products isInStock fixed: ${fixedProducts}`);
  log(`   Variants isInStock fixed       : ${fixedVariants}`);
  if (IS_DRY_RUN) log("   No writes were made.");
  log("\n🎯 Re-run without --dry-run to apply, then reindex search.");
  log("   (node scripts/reindex-search.js)");
};

run().catch((err) => {
  console.error("\n❌ Fatal:", err.message || err);
  process.exit(1);
});