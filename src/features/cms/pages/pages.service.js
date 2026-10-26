/**
 * Static Pages CMS service.
 *
 * Handles draft editing, publishing, listing, deletion and public reads for
 * the unified `cmsPages` collection. Fully additive — does not touch the
 * legacy homepage/header/footer/policy collections.
 */

const CmsPage = require("./cmsPage.model");
const ApiError = require("../../../core/ApiError");
const logger = require("../../../utils/logger");
const { validateBlocks } = require("./pages.validation");
const { cacheGet, cacheSet, cacheDelPattern } = require("../../../utils/redisCache");
const escapeRegex = require("../../../utils/escapeRegex");
const { triggerRevalidation } = require("../../../services/revalidateService");

const PUBLIC_CACHE_TTL = 60 * 60; // 1 hour

function publicCacheKey(slug) {
  return `cms:page:${slug}`;
}

/* -------------------------------------------------------------------------- */
/*                                    Admin                                    */
/* -------------------------------------------------------------------------- */

async function createPage(payload, userId) {
  const { slug, title, seo = {} } = payload;

  const slugValue = String(slug).toLowerCase().trim();
  const existing = await CmsPage.findOne({ slug: slugValue });
  if (existing) {
    throw ApiError.conflict(`A page with slug "${slugValue}" already exists`);
  }

  const page = await CmsPage.create({
    slug: slugValue,
    title,
    seo: {
      metaTitle: seo.metaTitle || "",
      metaDescription: seo.metaDescription || "",
      ogImage: seo.ogImage || "",
    },
    status: "draft",
    draft: { blocks: [] },
    published: { blocks: [] },
    publishedBy: userId || null,
  });

  logger.info(`[Pages] Created page "${slugValue}" (${page._id})`);
  return page.toSafeJson();
}

async function listPages({ query = "" } = {}) {
  const filter = query
    ? {
        $or: [
          { slug: { $regex: escapeRegex(query), $options: "i" } },
          { title: { $regex: escapeRegex(query), $options: "i" } },
        ],
      }
    : {};

  const pages = await CmsPage.find(filter)
    .select(
      "slug title status version publishedAt createdAt updatedAt draft.blocks published.blocks"
    )
    .sort({ updatedAt: -1 });

  return pages.map((p) => {
    const obj = p.toObject();
    return {
      id: obj._id.toString(),
      slug: obj.slug,
      title: obj.title,
      status: obj.status,
      version: obj.version,
      publishedAt: obj.publishedAt,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
      draftBlockCount: Array.isArray(obj.draft?.blocks)
        ? obj.draft.blocks.filter((b) => b && b.enabled !== false).length
        : 0,
      publishedBlockCount: Array.isArray(obj.published?.blocks)
        ? obj.published.blocks.filter((b) => b && b.enabled !== false).length
        : 0,
      hasUnpublishedChanges:
        obj.status === "draft" ||
        (JSON.stringify(obj.draft?.blocks || []) !==
          JSON.stringify(obj.published?.blocks || [])),
    };
  });
}

async function getPageById(id) {
  const page = await CmsPage.findById(id);
  if (!page) throw ApiError.notFound("Page not found");
  return page.toSafeJson();
}

async function getPageBySlug(slug, options = {}) {
  const page = await CmsPage.findOne({ slug: String(slug).toLowerCase().trim() });
  if (!page) throw ApiError.notFound(`Page "${slug}" not found`);
  return options.raw ? page : page.toSafeJson();
}

/**
 * Save the draft. Never touches the live (published) content.
 */
async function saveDraft(id, payload, userId) {
  const page = await CmsPage.findById(id);
  if (!page) throw ApiError.notFound("Page not found");

  const updates = {};

  if (payload.title !== undefined && payload.title !== null) {
    if (String(payload.title).trim() === "") {
      throw ApiError.badRequest("Title cannot be empty");
    }
    updates.title = String(payload.title).trim();
  }

  if (payload.slug !== undefined && payload.slug !== null) {
    const newSlug = String(payload.slug).toLowerCase().trim();
    const dup = await CmsPage.findOne({
      _id: { $ne: page._id },
      $or: [{ slug: newSlug }, { "published.slug": newSlug }],
    });
    if (dup) throw ApiError.conflict(`Slug "${newSlug}" is already in use`);
    updates.slug = newSlug;
  }

  if (payload.seo !== undefined && payload.seo !== null) {
    updates.seo = {
      metaTitle: payload.seo.metaTitle || "",
      metaDescription: payload.seo.metaDescription || "",
      ogImage: payload.seo.ogImage || "",
    };
  }

  if (payload.blocks !== undefined) {
    const result = validateBlocks(payload.blocks);
    if (!result.valid) {
      throw ApiError.badRequest("Block validation failed", result.errors);
    }
    updates.draft = { blocks: result.blocks };
  }

  if (Object.keys(updates).length === 0) {
    return page.toSafeJson();
  }

  updates.updatedBy = userId || null;

  const saved = await CmsPage.findByIdAndUpdate(page._id, updates, {
    new: true,
  });
  if (!saved) throw ApiError.notFound("Page not found");

  logger.info(
    `[Pages] Saved draft for "${saved.slug}" (${saved.draft.blocks.length} blocks)${
      payload.blocks !== undefined ? " — draft only, live content unchanged" : ""
    }`
  );

  return saved.toSafeJson();
}

/**
 * Publish the current draft to live. Validates the draft first so a broken
 * page can never be pushed to visitors.
 */
async function publishPage(id, userId) {
  const page = await CmsPage.findById(id);
  if (!page) throw ApiError.notFound("Page not found");

  const draft = page.draft || { blocks: [] };
  const result = validateBlocks(draft.blocks);
  if (!result.valid) {
    throw ApiError.badRequest(
      "Cannot publish — draft has validation errors",
      result.errors
    );
  }

  const publishedBlocks = result.blocks.filter((b) => b.enabled !== false);
  const version = (page.version || 0) + 1;

  const prevLiveSlug = page.published?.slug || page.slug;

  page.published = {
    title: page.title,
    slug: page.slug,
    seo: page.seo || { metaTitle: "", metaDescription: "", ogImage: "" },
    blocks: result.blocks,
  };
  page.status = "published";
  page.version = version;
  page.publishedAt = new Date();
  page.publishedBy = userId || page.publishedBy;
  await page.save();

  logger.info(
    `[Pages] Published "${page.slug}" v${version} with ${publishedBlocks.length} enabled blocks + ${result.blocks.length} total`
  );

  // Bust backend cache for the previous live slug and the current slug, then
  // revalidate the storefront for the slug that visitors actually get.
  await cacheDelPattern(`${publicCacheKey(prevLiveSlug)}*`);
  await cacheDelPattern(`${publicCacheKey(page.slug)}*`);
  triggerRevalidation({ type: "cms", resource: prevLiveSlug });
  triggerRevalidation({ type: "cms", resource: page.slug });

  return page.toSafeJson();
}

async function deletePage(id) {
  const page = await CmsPage.findById(id);
  if (!page) throw ApiError.notFound("Page not found");

  await CmsPage.findByIdAndDelete(id);
  await cacheDelPattern(`${publicCacheKey(page.slug)}*`);
  if (page.published?.slug && page.published.slug !== page.slug) {
    await cacheDelPattern(`${publicCacheKey(page.published.slug)}*`);
  }
  triggerRevalidation({ type: "cms", resource: page.slug });

  logger.info(`[Pages] Deleted page "${page.slug}"`);
  return { success: true };
}

/* -------------------------------------------------------------------------- */
/*                                   Public                                    */
/* -------------------------------------------------------------------------- */

async function serializePublished(page) {
  const raw = page.published || { blocks: [] };
  const blocks = (Array.isArray(raw.blocks) ? raw.blocks : [])
    .filter((b) => b !== null && b.enabled !== false)
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((b) => {
      const data = {};
      for (const [key, value] of Object.entries(b.data || {})) {
        if (!key.startsWith("_")) data[key] = value;
      }
      return { type: b.type, enabled: b.enabled, order: b.order, data };
    });

  // Serve the last published snapshot so draft title/slug/seo edits never leak.
  // Fallbacks keep pages published before the snapshot existed working.
  const title =
    typeof raw.title === "string" && raw.title !== "" ? raw.title : page.title;
  const slug =
    typeof raw.slug === "string" && raw.slug !== "" ? raw.slug : page.slug;
  const seo =
    raw.seo && Object.keys(raw.seo).length > 0
      ? raw.seo
      : page.seo || { metaTitle: "", metaDescription: "", ogImage: "" };

  return {
    slug,
    title,
    seo,
    version: page.version,
    publishedAt: page.publishedAt,
    blocks,
  };
}

async function getPublishedBySlug(slug) {
  const normalizedSlug = String(slug).toLowerCase().trim();

  const cacheKey = publicCacheKey(normalizedSlug);
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  const page = await CmsPage.findOne({
    status: "published",
    $or: [{ slug: normalizedSlug }, { "published.slug": normalizedSlug }],
  });
  if (!page) return null;

  const response = await serializePublished(page);
  await cacheSet(cacheKey, response, PUBLIC_CACHE_TTL);
  return response;
}

module.exports = {
  createPage,
  listPages,
  getPageById,
  getPageBySlug,
  saveDraft,
  publishPage,
  deletePage,
  getPublishedBySlug,
  serializePublished,
};