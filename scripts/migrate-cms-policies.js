/**
 * Migrate the legacy `policy` collection into the new Static Pages CMS.
 *
 * Each policy document becomes its own `cmsPages` doc (slug = legacy slug,
 * e.g. "privacy-policy", "shipping-policy", "terms-and-conditions",
 * "returns-and-refunds") holding a single `richText` block with the full HTML.
 *
 * Usage:
 *   node scripts/migrate-cms-policies.js            (live — writes to DB)
 *   node scripts/migrate-cms-policies.js --dry-run  (preview — no writes)
 *   node scripts/migrate-cms-policies.js --force    (overwrite existing pages)
 *
 * Required env var (read from .env automatically): MONGODB_URI
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");
const Policy = require("../src/models/Policy");
const CmsPage = require("../src/features/cms/pages/cmsPage.model");
const { validateBlocks } = require("../src/features/cms/pages/pages.validation");

const IS_DRY_RUN = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");

function log(msg) {
  process.stdout.write(msg + "\n");
}

/* -------------------------------------------------------------------------- */
/*                                     Run                                    */
/* -------------------------------------------------------------------------- */

const run = async () => {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI not found in environment variables");

  log(IS_DRY_RUN ? "🔍 DRY RUN — no writes will be made\n" : "🔌 Live migration — writes will be made\n");
  log("🔌 Connecting to MongoDB...");
  await mongoose.connect(mongoUri);
  log("✅ Connected to MongoDB\n");

  const policies = await Policy.find({}).sort({ slug: 1 }).lean();
  if (policies.length === 0) {
    log("⚠️  No documents found in the `policy` collection — nothing to migrate.");
    await mongoose.disconnect();
    process.exit(0);
  }
  log(`📂 Found ${policies.length} policy document(s)`);

  let created = 0;
  let updated = 0;

  for (const policy of policies) {
    const slug = policy.slug;
    const title = policy.title || slug;
    const body = policy.content || "";

    if (!body) {
      log(`  ⏭️  [${slug}] — skipped (empty content)`);
      continue;
    }

    const blocks = [
      {
        type: "richText",
        enabled: true,
        order: 0,
        data: { body },
      },
    ];

    const result = validateBlocks(blocks);
    if (!result.valid) {
      log(`  ⏭️  [${slug}] — validation failed, skipped`);
      result.errors.forEach((e) => log(`        - ${e}`));
      continue;
    }

    const existing = await CmsPage.findOne({ slug });
    if (existing && !FORCE) {
      log(`  ⏭️  [${slug}] — already exists (use --force to overwrite)`);
      continue;
    }

    const payload = {
      slug,
      title,
      seo: {
        metaTitle: title,
        metaDescription: "",
        ogImage: "",
      },
      status: "published",
      version: (existing?.version || 0) + 1,
      publishedAt: new Date(),
      publishedBy: null,
      updatedBy: null,
      draft: { blocks: result.blocks },
      published: { blocks: result.blocks },
    };

    if (IS_DRY_RUN) {
      log(`  ✅ [${slug}] → richText (${body.length} chars) — would be ${existing ? "updated" : "created"}`);
    } else {
      if (existing) {
        await CmsPage.findByIdAndUpdate(existing._id, payload, { new: true });
        updated++;
      } else {
        await CmsPage.create(payload);
        created++;
      }
      log(`  ✅ [${slug}] → richText (${body.length} chars) — ${existing ? "updated" : "created"}`);
    }
  }

  await mongoose.disconnect();
  log("\n📊 Summary:");
  log(`   Policies read : ${policies.length}`);
  log(`   Created       : ${created}`);
  log(`   Updated       : ${updated}`);
  log("─".repeat(50));

  if (!IS_DRY_RUN) {
    log("\n🔁 Remember to trigger storefront revalidation, or pages are served from the CMS cache.");
  }
};

run().catch((err) => {
  console.error("\n❌ Fatal:", err.message || err);
  process.exit(1);
});