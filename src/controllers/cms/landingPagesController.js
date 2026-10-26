const LandingPage = require("../../models/LandingPage");
const asyncHandler = require("../../core/middleware/asyncHandler");

function normalizeSlug(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/^\/+/, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Match both clean slugs and legacy rows that were saved with a leading "/".
 */
function slugFilter(slug) {
  return { slug: { $in: [slug, `/${slug}`] } };
}

// Admin: List all landing pages
exports.listLandings = asyncHandler(async (req, res) => {
  const pages = await LandingPage.find({}).sort({ updatedAt: -1 }).lean();
  res.status(200).json({ success: true, data: pages });
});

// Admin: Create landing page
exports.createLanding = asyncHandler(async (req, res) => {
  const { title, enabled = true, seo = {} } = req.body;
  const slug = normalizeSlug(req.body.slug);
  if (!slug) {
    return res.status(400).json({ success: false, message: "Slug is required" });
  }
  const exists = await LandingPage.findOne(slugFilter(slug));
  if (exists) {
    return res.status(400).json({ success: false, message: "Slug already exists" });
  }
  const page = await LandingPage.create({
    slug,
    title: title || slug.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
    enabled,
    seo,
    content: [],
  });
  res.status(201).json({ success: true, data: page });
});

// Admin: Get landing page by slug
exports.getLanding = asyncHandler(async (req, res) => {
  const slug = normalizeSlug(req.params.slug);
  const page = await LandingPage.findOne(slugFilter(slug)).lean();
  if (!page) {
    return res.status(404).json({ success: false, message: "Landing page not found" });
  }
  res.status(200).json({ success: true, data: page });
});

// Admin: Update landing page
exports.updateLanding = asyncHandler(async (req, res) => {
  const slug = normalizeSlug(req.params.slug);
  const updates = { ...req.body };
  delete updates._id;
  delete updates.createdAt;
  delete updates.updatedAt;
  if (updates.slug !== undefined) {
    updates.slug = normalizeSlug(updates.slug);
  }
  const page = await LandingPage.findOneAndUpdate(slugFilter(slug), updates, {
    new: true,
    runValidators: true,
  });
  if (!page) {
    return res.status(404).json({ success: false, message: "Landing page not found" });
  }
  res.status(200).json({ success: true, data: page });
});

// Admin: Delete landing page
exports.deleteLanding = asyncHandler(async (req, res) => {
  const slug = normalizeSlug(req.params.slug);
  const page = await LandingPage.findOneAndDelete(slugFilter(slug));
  if (!page) {
    return res.status(404).json({ success: false, message: "Landing page not found" });
  }
  res.status(200).json({ success: true, message: "Landing page deleted" });
});

// Public: Get enabled landing page by slug
exports.getPublicLanding = asyncHandler(async (req, res) => {
  const slug = normalizeSlug(req.params.slug);
  const page = await LandingPage.findOne({
    ...slugFilter(slug),
    enabled: true,
  }).lean();
  if (!page) {
    return res.status(404).json({ success: false, message: "Landing page not found" });
  }
  res.status(200).json({ success: true, data: page });
});
