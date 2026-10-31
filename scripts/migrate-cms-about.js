/**
 * Migrate the legacy `about` CMS collection into the new Static Pages CMS.
 *
 * The legacy About page is a collection of widget documents (one per section)
 * rendered by the Our Story page builder. The new CMS stores a single
 * `cmsPages` document with embedded, ordered blocks of 5 content types.
 *
 * Component → block type mapping:
 *   StoryBanner / hero              → hero       (heading, imageUrl)
 *   ContentWithImage/WhyWeAre/Beginning/Commitment → textImage (heading, body, imageUrl, imageAlt)
 *   Values / values-grid            → cards      (title, items → heading/body)
 *   Community / badge-section       → richText   (description + badges as HTML)
 *   BabyGallery / gallery           → cards      (each image → item with imageUrl)
 *
 * Usage:
 *   node scripts/migrate-cms-about.js                 (live — writes to DB)
 *   node scripts/migrate-cms-about.js --dry-run       (preview — no writes)
 *   node scripts/migrate-cms-about.js --slug <slug>     (custom slug, default "our-story")
 *   node scripts/migrate-cms-about.js --force         (overwrite an existing page)
 *
 * Required env var (read from .env automatically): MONGODB_URI
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");
const About = require("../src/models/About");
const CmsPage = require("../src/features/cms/pages/cmsPage.model");
const { validateBlocks } = require("../src/features/cms/pages/pages.validation");

const { dryRun: IS_DRY_RUN } = require("./lib/cliMode").parseMode(process.argv.slice(2), { defaultMode: "apply" });
const FORCE = process.argv.includes("--force");
const SLUG = (() => {
  const idx = process.argv.indexOf("--slug");
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : "our-story";
})();

const stats = {
  sections: 0,
  mapped: 0,
  skipped: 0,
  pageCreated: false,
  pageUpdated: false,
};

/** Running count of content-with-image sections (drives image-side alternation). */
let contentImageCount = 0;

function log(msg) {
  process.stdout.write(msg + "\n");
}

/* -------------------------------------------------------------------------- */
/*                             Section normalisation                          */
/* -------------------------------------------------------------------------- */

/**
 * The legacy service may surface About content in several shapes:
 *  - single doc with `content: [{ sections: [...] }]`
 *  - single doc with `content: [...]` (flat sections)
 *  - single doc with `sections: [...]`
 *  - multiple docs, one per widget (each with block_type/component)
 */
function extractSections(docs) {
  if (!Array.isArray(docs) || docs.length === 0) return [];

  // Multiple docs → each document is a section/widget.
  if (docs.length > 1) {
    return docs
      .map((d) => (d.toObject ? d.toObject() : d))
      .map((d) => {
        const { _id, __v, createdAt, updatedAt, ...rest } = d;
        return { ...rest, id: String(_id || "") };
      });
  }

  const doc = docs[0].toObject ? docs[0].toObject() : docs[0];

  if (Array.isArray(doc.content)) {
    const inner = doc.content;
    // Legacy wrapper shape: [{ sections: [...] }]
    if (
      inner.length === 1 &&
      inner[0] &&
      typeof inner[0] === "object" &&
      Array.isArray(inner[0].sections)
    ) {
      return inner[0].sections;
    }
    return inner;
  }

  if (Array.isArray(doc.sections)) return doc.sections;

  // Single-section doc stored flat.
  if (doc.component || doc.block_type) return [doc];

  return [];
}

/** Escape a string for safe inline HTML. */
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Join a legacy `content: string[]` into sanitized <p> paragraphs.
 * Elements may themselves contain newlines (legacy textareas) — split those
 * into separate paragraphs so spacing matches the original storefront.
 */
function paragraphsToHtml(lines) {
  if (!Array.isArray(lines) || lines.length === 0) return "";
  const paragraphs = [];
  for (const entry of lines) {
    const parts = String(entry ?? "")
      .split(/\n+/)
      .map((p) => p.trim())
      .filter(Boolean);
    paragraphs.push(...parts);
  }
  return paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("");
}

function getImageUrl(image) {
  return image && typeof image.url === "string" && image.url.trim() ? image.url : "";
}

function getImageAlt(image, fallback) {
  return image && typeof image.alt === "string" && image.alt.trim()
    ? image.alt
    : fallback || "";
}

/** Turn a raw upload filename into a reader-friendly label (no extension). */
function humanizeImageAlt(value, fallback) {
  const cleaned = getImageAlt(
    { alt: value },
    fallback
  )
    .replace(/\.[a-z0-9]+$/i, "") // strip extension
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
  return cleaned || fallback || "";
}

/* -------------------------------------------------------------------------- */
/*                         Component → CMS block mapper                        */
/* -------------------------------------------------------------------------- */

/**
 * Map a legacy Our Story section to a new CMS block.
 * Returns the block payload or null when the section cannot be mapped.
 */
function mapSectionToBlock(section, index) {
  const component = section?.component || section?.block_type;

  switch (component) {
    // ── hero ──────────────────────────────────────────────────────────────
    case "StoryBanner": {
      if (!section.title && !getImageUrl(section.image)) {
        stats.skipped++;
        return null;
      }
      stats.mapped++;
      return {
        type: "hero",
        enabled: section.enabled !== false,
        order: index,
        data: {
          heading: section.title || "",
          subheading: "",
          imageUrl: getImageUrl(section.image),
          ctaLabel: "",
          ctaHref: "",
          align: "center",
        },
      };
    }

    // ── Content with image ────────────────────────────────────────────────
    case "ContentWithImage":
    case "WhyWeAre":
    case "Beginning":
    case "Commitment": {
      if (!section.title && !getImageUrl(section.image) && !section.content?.length) {
        stats.skipped++;
        return null;
      }
      const imageUrl = getImageUrl(section.image);
      // The legacy storefront alternated the image side across these sections.
      const position = contentImageCount++ % 2 === 0 ? "right" : "left";
      stats.mapped++;
      return {
        type: "textImage",
        enabled: section.enabled !== false,
        order: index,
        data: {
          heading: section.title || "",
          body: paragraphsToHtml(section.content),
          imageUrl,
          imageAlt: imageUrl ? getImageAlt(section.image, section.title) : "",
          position,
        },
      };
    }

    // ── Values grid → cards ───────────────────────────────────────────────
    case "Values": {
      const values = Array.isArray(section.values) ? section.values : [];
      if (!section.title && values.length === 0) {
        stats.skipped++;
        return null;
      }
      stats.mapped++;
      return {
        type: "cards",
        enabled: section.enabled !== false,
        order: index,
        data: {
          title: section.title || "",
          items: values
            .filter((v) => v && (v.title || v.description))
            .map((v) => ({
              heading: v.title || "",
              body: v.description || "",
              imageUrl: "",
              imageAlt: "",
              icon: v.icon || "",
              link: "",
            })),
        },
      };
    }

    // ── Community badges → richText (keeps title + description + badges) ──
    case "Community": {
      if (!section.description && !section.title && !section.badges?.length) {
        stats.skipped++;
        return null;
      }
      const badges = (Array.isArray(section.badges) ? section.badges : [])
        .filter((b) => b && String(b).trim() !== "");
      let body = `<section class="cms-banner">`;
      if (section.title) body += `<h2>${escapeHtml(section.title)}</h2>`;
      if (section.description) body += `<p>${escapeHtml(section.description)}</p>`;
      if (badges.length) {
        body += `<ul class="cms-badges">${badges.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>`;
      }
      body += `</section>`;
      stats.mapped++;
      return {
        type: "richText",
        enabled: section.enabled !== false,
        order: index,
        data: { body },
      };
    }

    // ── Baby gallery → cards (one clean image cell per photo, no captions) ─
    case "BabyGallery": {
      const images = Array.isArray(section.images) ? section.images : [];
      if (images.length === 0 && !section.quote) {
        stats.skipped++;
        return null;
      }
      stats.mapped++;
      return {
        type: "cards",
        enabled: section.enabled !== false,
        order: index,
        data: {
          title: section.quote || "",
          items: images
            .map((img, i) => ({
              heading: "",
              body: "",
              imageUrl: getImageUrl(img),
              imageAlt: img && img.alt ? humanizeImageAlt(img.alt, `Gallery image ${i + 1}`) : `Gallery image ${i + 1}`,
              icon: "",
              link: "",
            }))
            .filter((item) => item.imageUrl),
        },
      };
    }

    default:
      stats.skipped++;
      return null;
  }
}

/* -------------------------------------------------------------------------- */
/*                                     Run                                    */
/* -------------------------------------------------------------------------- */

const run = async () => {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI not found in environment variables");
  }

  log(IS_DRY_RUN ? "🔍 DRY RUN — no writes will be made\n" : "🔌 Live migration — writes will be made\n");
  log(`🔌 Connecting to MongoDB...`);
  await mongoose.connect(mongoUri);
  log(`✅ Connected to MongoDB\n`);

  // 1. Read the legacy About content (all widget documents, ordered).
  const aboutDocs = await About.find({}).sort({ order: 1 }).lean();
  if (aboutDocs.length === 0) {
    log("⚠️  No documents found in the `about` collection — nothing to migrate.");
    await mongoose.disconnect();
    process.exit(0);
  }
  log(`📂 Found ${aboutDocs.length} document(s) in the 'about' collection`);

  const sections = extractSections(aboutDocs)
    .filter((s) => s?.enabled !== false)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  stats.sections = sections.length;
  log(`📦 Resolved ${sections.length} enabled section(s)\n`);

  // 2. Map sections → CMS blocks.
  const blocks = [];
  sections.forEach((section, i) => {
    const block = mapSectionToBlock(section, i);
    if (block) {
      log(`  ✅ [${i}] ${section.component || section.block_type} → ${block.type}`);
      blocks.push(block);
    } else {
      log(`  ⏭️  [${i}] ${section.component || section.block_type} — skipped (no mappable content)`);
    }
  });

  if (blocks.length === 0) {
    log("\n⚠️  No blocks could be mapped from the About content.");
    await mongoose.disconnect();
    process.exit(0);
  }

  // 3. Validate against the new CMS registry (guarantees publishability).
  const result = validateBlocks(blocks);
  if (!result.valid) {
    log("\n❌ Block validation failed against the CMS registry:");
    result.errors.forEach((e) => log(`   - ${e}`));
    await mongoose.disconnect();
    process.exit(1);
  }
  log(`\n🧪 Validated ${result.blocks.length} blocks against the CMS registry ✅`);

  // 4. Upsert the cmsPages document.
  const existing = await CmsPage.findOne({ slug: SLUG });
  if (existing && !FORCE) {
    log(`\n⚠️  A page with slug "${SLUG}" already exists.`);
    log(`   Use --force to overwrite it, or --slug <other> for a new page.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const publishedBlocks = result.blocks.filter((b) => b.enabled !== false);
  const payload = {
    slug: SLUG,
    title: "About Us",
    seo: {
      metaTitle: "About Us | Infants Care",
      metaDescription: "Learn about our story, values and the people behind Infants Care.",
      ogImage: "",
    },
    status: "published",
    version: (existing?.version || 0) + 1,
    publishedAt: new Date(),
    publishedBy: null,
    updatedBy: null,
    draft: { blocks: result.blocks },
    published: { blocks: publishedBlocks },
  };

  if (IS_DRY_RUN) {
    log("\n── DRY RUN SUMMARY ──");
    log(`   Slug     : /${SLUG}`);
    log(`   Block(s) : ${publishedBlocks.length} published / ${result.blocks.length} total`);
    log(`   Existing : ${existing ? `yes (v${existing.version}) — would be overwritten` : "no (would be created)"}`);
    log("\n   Preview blocks:");
    result.blocks.forEach((b) => log(`   - ${b.type} (order ${b.order}, enabled ${b.enabled})`));
  } else {
    const saved = existing
      ? await CmsPage.findByIdAndUpdate(existing._id, payload, { new: true })
      : await CmsPage.create(payload);
    stats.pageUpdated = !!existing;
    stats.pageCreated = !existing;
    log(`\n✅ ${existing ? "Updated" : "Created"} CMS page "/${SLUG}"`);
    log(`   Status    : published`);
    log(`   Version   : v${saved.version}`);
    log(`   Blocks    : ${publishedBlocks.length} published / ${result.blocks.length} total`);
  }

  await mongoose.disconnect();

  log("\n📊 Summary:");
  log(`   Sections read  : ${stats.sections}`);
  log(`   Mapped         : ${stats.mapped}`);
  log(`   Skipped        : ${stats.skipped}`);
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
