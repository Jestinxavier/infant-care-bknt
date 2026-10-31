/**
 * Rename the policy `cmsPages` rows to their INDIVIDUAL names.
 *
 * The legacy migrate (`migrate-cms-policies`) wrote `title = policy.title || slug`,
 * and every legacy `Policy` doc bore the generic title "Policies" — so every
 * policy row in the dashboard Pages list displayed the SAME generic name.
 *
 * This script gives each policy row its own name, keyed by its canonical slug
 * (the exact labels the storefront account/checkout/footer links use):
 *
 *   privacy-policy        → Privacy Policy
 *   return&refund-policy  → Return & Refund Policy
 *   shipping-policy       → Shipping Policy
 *   terms&conditions      → Terms and Conditions
 *
 * It also fixes the SEO metaTitle/metadata so page names + SEO stay consistent.
 *
 * Usage:
 *   node scripts/rename-cms-policy-pages.js            (live — writes to DB)
 *   node scripts/rename-cms-policy-pages.js --dry-run  (preview — no writes)
 *
 * Required env var (read from .env automatically): MONGODB_URI
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");
const CmsPage = require("../src/features/cms/pages/cmsPage.model");

const { dryRun: IS_DRY_RUN } = require("./lib/cliMode").parseMode(process.argv.slice(2), { defaultMode: "apply" });

const POLICY_NAMES = {
  "privacy-policy": "Privacy Policy",
  "returns-and-refunds": "Returns and Refunds Policy",
  "shipping-policy": "Shipping Policy",
  "terms-and-conditions": "Terms and Conditions",
};

function log(msg) {
  process.stdout.write(msg + "\n");
}

const run = async () => {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI not found in environment variables");

  log(IS_DRY_RUN ? "🔍 DRY RUN — no writes will be made\n" : "🔌 Live rename — writes will be made\n");
  log("🔌 Connecting to MongoDB...");
  await mongoose.connect(mongoUri);
  log("✅ Connected to MongoDB\n");

  let renamed = 0;

  for (const [slug, individualName] of Object.entries(POLICY_NAMES)) {
    const page = await CmsPage.findOne({ slug }).lean();
    if (!page) {
      log(`  ⏭️  [${slug}] — no cmsPages row with this slug, skipped`);
      continue;
    }

    const currentTitle = page.title;
    if (currentTitle === individualName) {
      log(`  ✅ [${slug}] — already named "${individualName}"`);
      continue;
    }

    if (IS_DRY_RUN) {
      log(`  ⏭️  [${slug}] — would rename "${currentTitle}" → "${individualName}"`);
      continue;
    }

    await CmsPage.updateOne(
      { _id: page._id },
      {
        title: individualName,
        "seo.metaTitle": individualName,
      }
    );
    log(`  ✅ [${slug}] — renamed "${currentTitle}" → "${individualName}"`);
    renamed++;
  }

  await mongoose.disconnect();
  log("\n📊 Summary:");
  log(`   Renamed ${renamed} policy page(s)`);
  log("─".repeat(50));

  if (!IS_DRY_RUN) {
    log("\n🔁 Remember to trigger storefront revalidation, or pages are served from the CMS cache.");
  }
};

run().catch((err) => {
  console.error("\n❌ Fatal:", err.message || err);
  process.exit(1);
});
