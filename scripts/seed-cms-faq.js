/**
 * Seed the legacy `faqcategories` + `faqs` collections with realistic
 * storefront content. The `faqs` collective was empty, so `/faqs` had nothing
 * to migrate into the new CMS Pages.
 *
 * This seed ONLY writes the legacy source collections. After it runs, build
 * the CMS page with:
 *   node backend/scripts/migrate-cms-faq.js          (double-dash → live)
 *   node backend/scripts/migrate-cms-faq.js --dry-run (preview)
 *
 * Usage:
 *   node backend/scripts/seed-cms-faq.js            (live — writes to DB)
 *   node backend/scripts/seed-cms-faq.js --dry-run  (preview — no writes)
 *
 * Required env var (read from .env automatically): MONGODB_URI
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");
const FAQCategory = require("../src/models/FAQCategory");
const FAQ = require("../src/models/FAQ");

const IS_DRY_RUN = process.argv.includes("--dry-run");

const log = (msg) => process.stdout.write(msg + "\n");

const CATEGORIES = [
  { name: "Orders & Delivery", displayOrder: 1 },
  { name: "Returns & Refunds", displayOrder: 2 },
  { name: "Product & Care", displayOrder: 3 },
  { name: "Account & Payments", displayOrder: 4 },
];

const FAQS = [
  // Orders & Delivery
  {
    category: "Orders & Delivery",
    question: "How long does delivery take?",
    answer:
      "Standard delivery takes 3–5 working days across India. Order before 2 PM and we dispatch the same day. You receive a tracking link by email once your order ships.",
    displayOrder: 1,
  },
  {
    category: "Orders & Delivery",
    question: "Can I track my order?",
    answer:
      "Yes. As soon as your order ships you get an email with a tracking number. You can also find live status under “My Orders” in your account.",
    displayOrder: 2,
  },
  {
    category: "Orders & Delivery",
    question: "Do you deliver outside India?",
    answer:
      "We currently deliver across India. International shipping is coming soon — join the newsletter to be the first to know.",
    displayOrder: 3,
  },
  // Returns & Refunds
  {
    category: "Returns & Refunds",
    question: "What is your return period?",
    answer:
      "You have 7 days from delivery to request a return. Items must be unused, unworn and in original packaging. Diapers and personal-care products are non-returnable for hygiene reasons.",
    displayOrder: 1,
  },
  {
    category: "Returns & Refunds",
    question: "How long do refunds take?",
    answer:
      "Once we receive and check your return, refunds are processed within 5–7 working days back to the original payment method.",
    displayOrder: 2,
  },
  {
    category: "Returns & Refunds",
    question: "Who pays for return shipping?",
    answer:
      "If the return is due to a defect or an error on our side, we pay the return shipping. For change-of-mind returns a small pickup fee is deducted from the refund.",
    displayOrder: 3,
  },
  // Product & Care
  {
    category: "Product & Care",
    question: "What materials do you use?",
    answer:
      "Our clothing is 100% certified organic cotton, and our plush toys use hypo-allergenic, OEKO-TEX® certified fill. All products are tested to be safe for newborn skin.",
    displayOrder: 1,
  },
  {
    category: "Product & Care",
    question: "How should I wash baby clothes?",
    answer:
      "Machine wash cold (below 30°C) inside-out with like colours)Skip mild detergent, and air-dry. Avoid bleach and fabric softener to keep the organic fibres soft.",
    displayOrder: 2,
  },
  {
    category: "Product & Care",
    question: "Are your toys safe for newborns?",
    answer:
      "Yes. All toys are BIS / ASTM F963 compliant, free from small detachable parts, and use non-toxic print‑safe dyesSkip. Always supervise playtime as recommended for your baby’s age.",
    displayOrder: 3,
  },
  // Account & Payments
  {
    category: "Account & Payments",
    question: "Which payment methods do you accept?",
    answer:
      "We accept UPI, all major credit/debit cards, net-banking and popular wallets. EMI is available on orders above a threshold for qualifying cards.",
    displayOrder: 1,
  },
  {
    category: "Account & Payments",
    question: "Can I change or cancel my order?",
    answer:
      "You can cancel an order anytime before it ships from “My Orders”. Once dispatched, cancellations aren’t possible — you can request a return after delivery instead.",
    displayOrder: 2,
  },
  {
    category: "Account & Payments",
    question: "How do I get an invoice?",
    answer:
      "A tax invoice is emailed to you at the time of delivery. You can also download it anytime from “My Orders” under your account.",
    displayOrder: 3,
  },
];

const run = async () => {
  log(IS_DRY_RUN ? "🔍 DRY RUN — no writes will be made\n" : "🔌 Live seed — writes will be made\n");
  log("🔌 Connecting to MongoDB...");
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI not found in environment variables");

  await mongoose.connect(mongoUri);
  log("✅ Connected to MongoDB\n");

  // 1. Upsert FAQCategories by name (idempotent).
  const categoryIds = {};
  for (const c of CATEGORIES) {
    let cat = await FAQCategory.findOne({ name: c.name });
    if (!cat) {
      if (!IS_DRY_RUN) {
        cat = await FAQCategory.create({ ...c, isActive: true });
      }
      categoryIds[c.name] = IS_DRY_RUN ? `dry:${c.name}` : cat._id.toString();
      log(`🆕 ${IS_DRY_RUN ? "[dry] would create" : "Created"} FAQCategory "${c.name}"`);
    } else {
      categoryIds[c.name] = cat._id.toString();
      log(`◽ Existing FAQCategory "${c.name}"`);
    }
  }

  // 2. Insert FAQs (skip an exact question that already exists).
  let created = 0;
  for (const f of FAQS) {
    const existing = await FAQ.findOne({ question: f.question });
    if (existing) {
      log(`◽ Existing FAQ "${f.question}"`);
      continue;
    }
    if (!IS_DRY_RUN) {
      await FAQ.create({
        question: f.question,
        answer: f.answer,
        category: new mongoose.Types.ObjectId(categoryIds[f.category]),
        displayOrder: f.displayOrder,
        isActive: true,
      });
    }
    created++;
    log(`🆕 ${IS_DRY_RUN ? "[dry] would create" : "Created"} FAQ "${f.question}"`);
  }

  const total = await FAQ.countDocuments({});
  log(`\n📊 Summary: ${IS_DRY_RUN ? "would add" : "added"} ${created} FAQ(s); ${total} total in collection`);
  await mongoose.disconnect();

  if (!IS_DRY_RUN) {
    log("\n🔁 Next step — build the CMS page:");
    log("   node backend/scripts/migrate-cms-faq.js");
  }
};

run().catch((err) => {
  console.error("\n❌ Fatal:", err.message || err);
  process.exit(1);
});
