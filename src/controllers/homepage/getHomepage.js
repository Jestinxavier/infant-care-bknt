const Homepage = require("../../models/Homepage");
const logger = require("../../utils/logger");
const { cacheGet, cacheSet } = require("../../utils/redisCache");
const { buildInStockQuery } = require("../../utils/stockQuery");

const CACHE_KEY = "homepage";
// Hand-picked products are stock-checked when the response is built, and the
// cache is only cleared on CMS edits — so keep it short, or a product that
// sells out stays on the homepage for the whole cache lifetime (was 1 hour).
const CACHE_TTL_SECONDS = 5 * 60;

// Widgets whose `content` is a hand-picked product list. (Category-backed
// ones fetch from the listing, which already hides sold-out products.)
const PRODUCT_LIST_BLOCKS = new Set(["productSlider", "editorPicks"]);

/**
 * Get homepage data from MongoDB
 * @route   GET /api/v1/homepage
 * @desc    Fetch all homepage data
 * @access  Public
 */
const getHomepage = async (req, res) => {
  try {
    const cached = await cacheGet(CACHE_KEY);
    if (cached) {
      return res.status(200).json(cached);
    }

    // Fetch only enabled widgets from homepage collection, sorted by order
    // This ensures disabled widgets are not shown on the frontend
    const homepageData = await Homepage.find({ enabled: true })
      .sort({ order: 1 })
      .lean();

    const mongoose = require("mongoose");

    // Filter out-of-stock (and unpublished) products from hand-picked product
    // widgets: product sliders and editor's picks.
    const productSliderWidgets = homepageData.filter(
      (w) => PRODUCT_LIST_BLOCKS.has(w.block_type) && Array.isArray(w.content)
    );

    if (productSliderWidgets.length > 0) {
      const productIds = [];
      productSliderWidgets.forEach((widget) => {
        widget.content.forEach((item) => {
          if (item) {
            const id = item._id || item.id || item.productId;
            if (id && mongoose.Types.ObjectId.isValid(id.toString())) {
              productIds.push(new mongoose.Types.ObjectId(id.toString()));
            }
          }
        });
      });

      if (productIds.length > 0) {
        const Product = require("../../models/Product");
        // Same stock rule as the listing (shared with the filter counts and
        // search suggestions). The old inline query read the product-level
        // stockObj first, which configurable products never keep up to date.
        const inStockProducts = await Product.find({
          _id: { $in: productIds },
          status: "published",
          ...buildInStockQuery(true),
        }).select("_id");

        const inStockSet = new Set(inStockProducts.map((p) => p._id.toString()));

        homepageData.forEach((widget) => {
          if (PRODUCT_LIST_BLOCKS.has(widget.block_type) && Array.isArray(widget.content)) {
            widget.content = widget.content.filter((item) => {
              if (!item) return false;
              const id = item._id || item.id || item.productId;
              return id && inStockSet.has(id.toString());
            });
          }
        });
      }
    }

    if (!homepageData || homepageData.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Homepage data not found",
        data: [],
      });
    }

    const response = {
      success: true,
      message: "Homepage data fetched successfully",
      data: homepageData,
      count: homepageData.length,
    };

    await cacheSet(CACHE_KEY, response, CACHE_TTL_SECONDS);

    res.status(200).json(response);
  } catch (err) {
    logger.error("❌ Error fetching homepage data:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
          });
  }
};

/**
 * Get single homepage document by ID
 * @route   GET /api/v1/homepage/:id
 * @desc    Fetch homepage data by ID
 * @access  Public
 */
const getHomepageById = async (req, res) => {
  try {
    const { id } = req.params;

    const homepageData = await Homepage.findById(id);

    if (!homepageData) {
      return res.status(404).json({
        success: false,
        message: "Homepage data not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Homepage data fetched successfully",
      data: homepageData,
    });
  } catch (err) {
    logger.error("❌ Error fetching homepage data:", err);

    // Handle invalid ObjectId
    if (err.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid homepage ID format",
      });
    }

    res.status(500).json({
      success: false,
      message: "Internal Server Error",
          });
  }
};

module.exports = {
  getHomepage,
  getHomepageById,
};
