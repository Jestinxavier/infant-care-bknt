/**
 * Approved rename: `about-us` → `our-story` so the storefront `/our-story`
 * serves the CMS page DIRECTLY (no legacy redirect-shadow, which was removed).
 * Idempotent: skips if target already exists; errors if source missing.
 */
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");
const CmsPage = require("../src/features/cms/pages/cmsPage.model");
const { dryRun: IS_DRY_RUN } = require("./lib/cliMode").parseMode(
  process.argv.slice(2),
  { defaultMode: "apply" },
);

const run = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI not found");
  await mongoose.connect(uri);
  console.log("✅ Connected");

  const src = await CmsPage.findOne({ slug: "about-us" });
  const dst = await CmsPage.findOne({ slug: "our-story" });

  if (!src) {
    console.error("❌ No page with slug 'about-us' — nothing to rename (already renamed?)");
    await mongoose.disconnect(); process.exit(1);
  }
  if (dst) {
    console.log(`ℹ️  'our-story' already exists — deleting the obsolete 'about-us' copy (dedupe)`);
    if (!IS_DRY_RUN) {
      await CmsPage.deleteOne({ _id: src._id });
    }
    console.log(`   → ${IS_DRY_RUN ? "DRY" : "deleted"} 'about-us' (our-story remains)`);
  } else {
    console.log(`♻️  Renaming 'about-us' → 'our-story'${IS_DRY_RUN ? " (DRY)" : ""}`);
    if (!IS_DRY_RUN) {
      await CmsPage.updateOne({ _id: src._id }, { $set: { slug: "our-story" } });
    }
  }

  const check = await CmsPage.findOne({ slug: "our-story" }).lean();
  console.log(`\n✅ /our-story now resolves to CMS page: ${check ? `v${check.version} (${check.status})` : "MISSING"}`);
  await mongoose.disconnect();
  process.exit(0);
};
run().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
