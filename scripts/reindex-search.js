/**
 * One-time / manual full rebuild of the Meilisearch products index.
 *
 * Daily product uploads already sync automatically (createProduct,
 * updateProduct and bulkImport call searchIndexService.syncProductsByIds),
 * so this script is only needed when:
 *   1. Meilisearch is enabled for the first time on an existing DB, or
 *   2. Products changed directly in MongoDB (scripts / mongosh), or
 *   3. The index got corrupted / out of date.
 *
 * Only `published` products are indexed. Deleting the index content first,
 * then re-adding in batches of 500.
 *
 * Usage (run from `backend/`):
 *   node scripts/reindex-search.js            (live — rebuilds the index)
 *   node scripts/reindex-search.js --dry-run  (preview — no writes)
 *
 * Required env vars (read from backend/.env): MONGODB_URI, MEILISEARCH_HOST
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");
const Product = require("../src/models/Product");
const Category = require("../src/models/Category");
const {
  PRODUCTS_INDEX_NAME,
  isMeilisearchEnabled,
} = require("../src/config/meilisearch");
const { reindexAllProducts } = require("../src/services/searchIndexService");

const IS_DRY_RUN = process.argv.includes("--dry-run");

const log = (msg) => process.stdout.write(msg + "\n");

const run = async () => {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI not found in environment variables");
  }

  log(IS_DRY_RUN ? "🔍 DRY RUN — no writes will be made\n" : "🔌 Live reindex — the index will be rebuilt\n");
  log("🔌 Connecting to MongoDB...");
  await mongoose.connect(mongoUri);
  log("✅ Connected to MongoDB\n");

  const publishedCount = await Product.countDocuments({ status: "published" });
  log(`📦 Published products in MongoDB: ${publishedCount}`);
  log(`📁 Meilisearch index            : "${PRODUCTS_INDEX_NAME}"`);
  log(`🔌 Meilisearch configured       : ${isMeilisearchEnabled() ? "yes" : "NO — set MEILISEARCH_HOST"}`);

  if (!isMeilisearchEnabled()) {
    log("\n❌ Meilisearch is not configured — nothing to reindex.");
    await mongoose.disconnect();
    process.exit(1);
  }

  if (IS_DRY_RUN) {
    log("\n── DRY RUN SUMMARY ──");
    log(`   Would delete all documents from "${PRODUCTS_INDEX_NAME}"`);
    log(`   Would re-index ${publishedCount} published product(s) from MongoDB`);
    log(`   No writes were made.`);
    await mongoose.disconnect();
    return;
  }

  log("\n🧹 Clearing index and reindexing products...");
  const startedAt = Date.now();
  const indexed = await reindexAllProducts();
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);

  await mongoose.disconnect();

  log(`\n✅ Reindex complete — ${indexed} products indexed in ${seconds}s`);
  if (indexed !== publishedCount) {
    log(`⚠️  Expected ${publishedCount} (published), indexed ${indexed} — verify no query/duplicate mismatch.`);
  }
  log("\n🔁 Storefront suggest results are Redis-cached (120s), so refresh the index cache before checking the UI.");
};

run().catch((err) => {
  console.error("\n❌ Fatal:", err.message || err);
  process.exit(1);
});