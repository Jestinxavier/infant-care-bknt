const SiteSetting = require("../models/SiteSetting");
const Product = require("../models/Product");
const logger = require("../utils/logger");
const POPULAR_SEARCHES_KEY = "search.popular_terms";
const POPULAR_SEARCHES_DESCRIPTION =
  "Popular search keywords shown in the storefront search drawer.";
const POPULAR_SEARCHES_SCOPE = "product";
const POPULAR_SEARCHES_MAX_ITEMS = 4;
const POPULAR_SEARCH_TERM_MIN_LENGTH = 2;
const POPULAR_SEARCH_TERM_MAX_LENGTH = 50;

/**
 * GET /api/v1/admin/settings
 * Get all settings (optionally filtered by scope)
 */
const getAllSettings = async (req, res) => {
  try {
    const { scope } = req.query;
    const filter = scope ? { scope } : {};

    const settings = await SiteSetting.find(filter).sort({ key: 1 });

    res.json({
      success: true,
      settings,
    });
  } catch (error) {
    logger.error("Error fetching settings:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch settings",
      error: error.message,
    });
  }
};

/**
 * GET /api/v1/admin/settings/:key
 * Get single setting by key
 */
const getSetting = async (req, res) => {
  try {
    const { key } = req.params;

    const setting = await SiteSetting.findOne({ key });

    if (!setting) {
      return res.status(404).json({
        success: false,
        message: "Setting not found",
      });
    }

    res.json({
      success: true,
      setting,
    });
  } catch (error) {
    logger.error("Error fetching setting:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch setting",
      error: error.message,
    });
  }
};

/**
 * POST /api/v1/admin/settings
 * Create new setting
 */
const createSetting = async (req, res) => {
  try {
    const { key, value, type, scope, description, isPublic } = req.body;

    // Validate type matches value
    if (!validateType(value, type)) {
      return res.status(400).json({
        success: false,
        message: `Value type mismatch. Expected ${type}`,
      });
    }

    const setting = await SiteSetting.create({
      key,
      value,
      type,
      scope,
      description,
      isPublic,
    });

    res.status(201).json({
      success: true,
      setting,
    });
  } catch (error) {
    logger.error("Error creating setting:", error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Setting with this key already exists",
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to create setting",
      error: error.message,
    });
  }
};

/**
 * PUT /api/v1/admin/settings/:key
 * Update existing setting (developers can update scope)
 */
const updateSetting = async (req, res) => {
  try {
    const { key } = req.params;
    const { value, description, scope } = req.body;
    const userRole = req.user?.role;

    const setting = await SiteSetting.findOne({ key });

    if (!setting) {
      return res.status(404).json({
        success: false,
        message: "Setting not found",
      });
    }

    // Validate type matches
    if (value !== undefined && !validateType(value, setting.type)) {
      return res.status(400).json({
        success: false,
        message: `Value must be of type ${setting.type}`,
      });
    }

    // Only developers can change scope
    if (scope !== undefined && userRole !== "developer") {
      return res.status(403).json({
        success: false,
        message: "Only developers can change the scope",
      });
    }

    // If scope is being changed, use findOneAndUpdate to bypass immutable
    if (scope !== undefined && userRole === "developer") {
      const updatedSetting = await SiteSetting.findOneAndUpdate(
        { key },
        {
          value: value !== undefined ? value : setting.value,
          description:
            description !== undefined ? description : setting.description,
          scope,
        },
        { new: true, runValidators: true }
      );

      return res.json({
        success: true,
        setting: updatedSetting,
      });
    }

    // Normal update (no scope change)
    if (value !== undefined) setting.value = value;
    if (description !== undefined) setting.description = description;

    await setting.save();

    res.json({
      success: true,
      setting,
    });
  } catch (error) {
    logger.error("Error updating setting:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update setting",
      error: error.message,
    });
  }
};

/**
 * DELETE /api/v1/admin/settings/:key
 * Delete setting
 */
const deleteSetting = async (req, res) => {
  try {
    const { key } = req.params;

    const setting = await SiteSetting.findOneAndDelete({ key });

    if (!setting) {
      return res.status(404).json({
        success: false,
        message: "Setting not found",
      });
    }

    res.json({
      success: true,
      message: "Setting deleted successfully",
    });
  } catch (error) {
    logger.error("Error deleting setting:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete setting",
      error: error.message,
    });
  }
};

/**
 * GET /api/v1/settings/public
 * Get public settings (for frontend/storefront)
 */
const getPublicSettings = async (req, res) => {
  try {
    const { scope } = req.query;
    const filter = { isPublic: true };
    if (scope) filter.scope = scope;

    const settings = await SiteSetting.find(filter)
      .select({ _id: 0, key: 1, value: 1, type: 1, description: 1 })
      .lean();

    // Convert to key-value map; include description when present for frontend display
    const settingsMap = settings.reduce((acc, s) => {
      const hasDescription =
        s.description !== undefined &&
        s.description !== null &&
        String(s.description).trim() !== "";
      if (hasDescription) {
        acc[s.key] = { value: s.value, description: s.description };
      } else {
        acc[s.key] = s.value;
      }
      return acc;
    }, {});

    res.json({
      success: true,
      settings: settingsMap,
    });
  } catch (error) {
    logger.error("Error fetching public settings:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch settings",
      error: error.message,
    });
  }
};

/**
 * GET /api/v1/settings/popular-searches
 * Public endpoint for storefront popular search keywords
 */
const getPopularSearches = async (req, res) => {
  try {
    const setting = await SiteSetting.findOne({
      key: POPULAR_SEARCHES_KEY,
      isPublic: true,
    })
      .select({ _id: 0, value: 1, updatedAt: 1 })
      .lean();

    const searches = normalizePopularSearches(
      Array.isArray(setting?.value) ? setting.value : []
    );

    res.json({
      success: true,
      searches,
      updatedAt: setting?.updatedAt || null,
    });
  } catch (error) {
    logger.error("Error fetching popular searches:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch popular searches",
      error: error.message,
    });
  }
};

/**
 * GET /api/v1/admin/settings/popular-searches/admin
 * Admin endpoint to manage popular search keywords
 */
const getPopularSearchesAdmin = async (req, res) => {
  try {
    const setting = await SiteSetting.findOne({ key: POPULAR_SEARCHES_KEY })
      .select({
        key: 1,
        value: 1,
        type: 1,
        scope: 1,
        description: 1,
        isPublic: 1,
        updatedAt: 1,
      })
      .lean();

    res.json({
      success: true,
      setting: {
        key: POPULAR_SEARCHES_KEY,
        type: "json",
        scope: setting?.scope || POPULAR_SEARCHES_SCOPE,
        description: setting?.description || POPULAR_SEARCHES_DESCRIPTION,
        isPublic: setting?.isPublic ?? true,
        searches: normalizePopularSearches(
          Array.isArray(setting?.value) ? setting.value : []
        ),
        updatedAt: setting?.updatedAt || null,
      },
    });
  } catch (error) {
    logger.error("Error fetching admin popular searches:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch popular searches",
      error: error.message,
    });
  }
};

/**
 * PUT /api/v1/admin/settings/popular-searches/admin
 * Upsert popular search keywords
 */
const upsertPopularSearches = async (req, res) => {
  try {
    const { searches } = req.body || {};

    if (!Array.isArray(searches)) {
      return res.status(400).json({
        success: false,
        message: "searches must be an array of strings",
      });
    }

    const normalizedSearches = normalizePopularSearches(searches);

    if (searches.length > 0 && normalizedSearches.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          "No valid search terms found. Use 2-50 characters per term and avoid empty values.",
      });
    }

    const updatedSetting = await SiteSetting.findOneAndUpdate(
      { key: POPULAR_SEARCHES_KEY },
      {
        $set: {
          value: normalizedSearches,
          type: "json",
          scope: POPULAR_SEARCHES_SCOPE,
          description: POPULAR_SEARCHES_DESCRIPTION,
          isPublic: true,
        },
      },
      {
        upsert: true,
        new: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

    res.json({
      success: true,
      setting: {
        key: updatedSetting.key,
        type: updatedSetting.type,
        scope: updatedSetting.scope,
        description: updatedSetting.description,
        isPublic: updatedSetting.isPublic,
        searches: normalizePopularSearches(
          Array.isArray(updatedSetting.value) ? updatedSetting.value : []
        ),
        updatedAt: updatedSetting.updatedAt,
      },
    });
  } catch (error) {
    logger.error("Error updating popular searches:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update popular searches",
      error: error.message,
    });
  }
};

// ─── Suggested Products ────────────────────────────────────────────────────

const SUGGESTED_PRODUCTS_KEY = "search.suggested_products";
const SUGGESTED_PRODUCTS_DESCRIPTION =
  "Featured products shown in the storefront search drawer before the user types.";
const SUGGESTED_PRODUCTS_MAX = 4;
const SUGGESTED_VIEW_ALL_MAX_LENGTH = 200;

async function resolveProductSuggestions(productIds = []) {
  if (!productIds.length) return [];
  const docs = await Product.find({ _id: { $in: productIds }, status: "published" })
    .select("_id title url_key images pricing price category")
    .populate("category", "name")
    .lean();

  const map = Object.fromEntries(docs.map((p) => [String(p._id), p]));
  return productIds
    .map((id) => map[String(id)])
    .filter(Boolean)
    .map((p) => {
      const rawImage = p.images?.[0];
      const image = typeof rawImage === "string" ? rawImage : "";
      const price = p.pricing?.price || p.price || 0;
      return {
        id: String(p._id),
        title: p.title || "",
        url_key: p.url_key || "",
        price,
        image,
        category: p.category?.name || "",
      };
    });
}

/**
 * GET /api/v1/settings/suggested-products
 * Public endpoint for storefront suggested products
 */
const getSuggestedProducts = async (req, res) => {
  try {
    const setting = await SiteSetting.findOne({
      key: SUGGESTED_PRODUCTS_KEY,
      isPublic: true,
    })
      .select({ _id: 0, value: 1, updatedAt: 1 })
      .lean();

    const raw = setting?.value || {};
    const productIds = Array.isArray(raw.productIds) ? raw.productIds : [];
    const viewAllLink = typeof raw.viewAllLink === "string" ? raw.viewAllLink : "/search";

    const products = await resolveProductSuggestions(productIds);

    res.json({ success: true, products, viewAllLink, updatedAt: setting?.updatedAt || null });
  } catch (error) {
    logger.error("Error fetching suggested products:", error);
    res.status(500).json({ success: false, message: "Failed to fetch suggested products" });
  }
};

/**
 * GET /api/v1/admin/settings/suggested-products/admin
 * Admin endpoint to read & manage suggested products
 */
const getSuggestedProductsAdmin = async (req, res) => {
  try {
    const setting = await SiteSetting.findOne({ key: SUGGESTED_PRODUCTS_KEY }).lean();
    const raw = setting?.value || {};
    const productIds = Array.isArray(raw.productIds) ? raw.productIds : [];
    const viewAllLink = typeof raw.viewAllLink === "string" ? raw.viewAllLink : "/search";

    const products = await resolveProductSuggestions(productIds);

    res.json({
      success: true,
      setting: {
        key: SUGGESTED_PRODUCTS_KEY,
        description: setting?.description || SUGGESTED_PRODUCTS_DESCRIPTION,
        isPublic: setting?.isPublic ?? true,
        products,
        productIds: productIds.map(String),
        viewAllLink,
        updatedAt: setting?.updatedAt || null,
      },
    });
  } catch (error) {
    logger.error("Error fetching admin suggested products:", error);
    res.status(500).json({ success: false, message: "Failed to fetch suggested products" });
  }
};

/**
 * PUT /api/v1/admin/settings/suggested-products
 * Upsert suggested products (admin only)
 */
const upsertSuggestedProducts = async (req, res) => {
  try {
    const { productIds, viewAllLink } = req.body || {};

    if (!Array.isArray(productIds)) {
      return res.status(400).json({ success: false, message: "productIds must be an array" });
    }

    if (productIds.length > SUGGESTED_PRODUCTS_MAX) {
      return res.status(400).json({
        success: false,
        message: `Maximum ${SUGGESTED_PRODUCTS_MAX} suggested products allowed`,
      });
    }

    const cleanViewAllLink =
      typeof viewAllLink === "string"
        ? viewAllLink.trim().slice(0, SUGGESTED_VIEW_ALL_MAX_LENGTH)
        : "/search";

    const updatedSetting = await SiteSetting.findOneAndUpdate(
      { key: SUGGESTED_PRODUCTS_KEY },
      {
        $set: {
          value: { productIds, viewAllLink: cleanViewAllLink },
          type: "json",
          scope: "product",
          description: SUGGESTED_PRODUCTS_DESCRIPTION,
          isPublic: true,
        },
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );

    const savedRaw = updatedSetting.value || {};
    const savedIds = Array.isArray(savedRaw.productIds) ? savedRaw.productIds : [];
    const products = await resolveProductSuggestions(savedIds);

    res.json({
      success: true,
      setting: {
        key: updatedSetting.key,
        description: updatedSetting.description,
        isPublic: updatedSetting.isPublic,
        products,
        productIds: savedIds.map(String),
        viewAllLink: savedRaw.viewAllLink || "/search",
        updatedAt: updatedSetting.updatedAt,
      },
    });
  } catch (error) {
    logger.error("Error updating suggested products:", error);
    res.status(500).json({ success: false, message: "Failed to update suggested products" });
  }
};

// ──────────────────────────────────────────────────────────────────────────────

function normalizePopularSearches(rawSearches = []) {
  const normalized = [];
  const seen = new Set();

  for (const raw of rawSearches) {
    if (typeof raw !== "string") continue;

    const term = raw.replace(/\s+/g, " ").trim();
    if (term.length < POPULAR_SEARCH_TERM_MIN_LENGTH) continue;
    if (term.length > POPULAR_SEARCH_TERM_MAX_LENGTH) continue;

    const dedupeKey = term.toLowerCase();
    if (seen.has(dedupeKey)) continue;

    seen.add(dedupeKey);
    normalized.push(term);

    if (normalized.length >= POPULAR_SEARCHES_MAX_ITEMS) break;
  }

  return normalized;
}

/**
 * Helper function to validate value type
 */
function validateType(value, type) {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && !isNaN(value);
    case "boolean":
      return typeof value === "boolean";
    case "json":
      return typeof value === "object";
    default:
      return false;
  }
}

module.exports = {
  getAllSettings,
  getSetting,
  createSetting,
  updateSetting,
  deleteSetting,
  getPublicSettings,
  getPopularSearches,
  getPopularSearchesAdmin,
  upsertPopularSearches,
  getSuggestedProducts,
  getSuggestedProductsAdmin,
  upsertSuggestedProducts,
};
