/**
 * Migrate the legacy `FAQs` collection into the new Static Pages CMS.
 *
 * The legacy FAQ page renders FAQs grouped into categories via a client-side
 * UI. The new CMS stores a single `cmsPages` doc (slug "faqs") with a single
 * `faqList` block containing every active FAQ (flat list).
 *
 * Usage:
 *   node scripts/migrate-cms-faq.js            (live — writes to DB)
 *   node scripts/migrate-cms-faq.js --dry-run  (preview — no writes)
 *   node scripts/migrate-cms-faq.js --force    (overwrite an existing page)
 *
 * Required env var (read from .env automatically): MONGODB_URI
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");
const FAQ = require("../src/models/FAQ");
const CmsPage = require("../src/features/cms/pages/cmsPage.model");
const { validateBlocks } = require("../src/features/cms/pages/pages.validation");

const IS_DRY_RUN = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");
const SLUG = "faqs";
const TITLE = "Frequently Asked Questions";

function log(msg) {
  process.stdout.write(msg + "\n");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

  const faqs = await FAQ.find({}).sort({ displayOrder: 1 }).lean();
  if (faqs.length === 0) {
    log("⚠️  No documents found in the `faqs` collection — nothing to migrate.");
    await mongoose.disconnect();
    process.exit(0);
  }
  log(`📂 Found ${faqs.length} FAQ(s)`);

  const active = faqs.filter((f) => f.isActive !== false && f.question && f.answer);
  log(`📦 Using ${active.length} enabled FAQ(s)\n`);

  const blocks = [
    {
      type: "faqList",
      enabled: true,
      order: 0,
      data: {
        title: TITLE,
        items: active.map((f, i) => ({
          question: f.question,
          answer: `<p>${escapeHtml(f.answer)}</p>`,
          // Ensure a stable key for the storefront list (not persisted).
          _order: i,
        })),
      },
    },
  ];
  // Strip the transient _order field before validation/persist.
  blocks[0].data.items.forEach((item) => delete item._order);

  const result = validateBlocks(blocks);
  if (!result.valid) {
    log("\n❌ Block validation failed against the CMS registry:");
    result.errors.forEach((e) => log(`   - ${e}`));
    await mongoose.disconnect();
    process.exit(1);
  }
  log(`🧪 Validated ${result.blocks[0].data.items.length} FAQ items ✅`);

  const existing = await CmsPage.findOne({ slug: SLUG });
  if (existing && !FORCE) {
    log(`\n⚠️  A page with slug "${SLUG}" already exists. Use --force to overwrite it.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const payload = {
    slug: SLUG,
    title: TITLE,
    seo: {
      metaTitle: `${TITLE} | Infants Care`,
      metaDescription: "Answers to the most common questions about products, ordering, shipping and returns.",
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
    log("\n── DRY RUN SUMMARY ──");
    log(`   Slug     : /${SLUG}`);
    log(`   Items    : ${result.blocks[0].data.items.length}`);
    log(`   Existing : ${existing ? `yes (v${existing.version}) — would be overwritten` : "no (would be created)"}`);
  } else {
    const saved = existing
      ? await CmsPage.findByIdAndUpdate(existing._id, payload, { new: true })
      : await CmsPage.create(payload);
    log(`\n✅ ${existing ? "Updated" : "Created"} CMS page "/${SLUG}" (v${saved.version})`);
  }

  await mongoose.disconnect();
  log("\n📊 Summary:");
  log(`   FAQs read      : ${faqs.length}`);
  log(`   FAQs migrated  : ${active.length}`);
  log(`   ${IS_DRY_RUN ? "Would be" : "Result"}: ${existing ? "updated page" : "created page"}`);
  log("─".repeat(50));

  if (!IS_DRY_RUN) {
    log("\n🔁 Remember to trigger storefront revalidation, or the page is served from the CMS cache.");
  }
};

run().catch((err) => {
  console.error("\n❌ Fatal:", err.message || err);
  process.exit(1);
});