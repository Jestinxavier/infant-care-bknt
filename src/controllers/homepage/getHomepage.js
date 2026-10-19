const Homepage = require("../../models/Homepage");
const logger = require("../../utils/logger");
const { cacheGet, cacheSet } = require("../../utils/redisCache");

const CACHE_KEY = "homepage";

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

    // Filter out-of-stock products from productSlider widgets
    const productSliderWidgets = homepageData.filter(
      (w) => w.block_type === "productSlider" && Array.isArray(w.content)
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
        const inStockProducts = await Product.find({
          _id: { $in: productIds },
          status: "published",
          $or: [
            { "stockObj.available": { $gt: 0 } },
            { "stockObj.available": { $exists: false }, "stockObj.isInStock": true },
            { "stockObj": { $exists: false }, "stock": { $gt: 0 } },
            { "variants.stockObj.available": { $gt: 0 } },
            { "variants.stockObj.available": { $exists: false }, "variants.stockObj.isInStock": true },
            { "variants.stockObj": { $exists: false }, "variants.stock": { $gt: 0 } }
          ],
        }).select("_id");

        const inStockSet = new Set(inStockProducts.map((p) => p._id.toString()));

        homepageData.forEach((widget) => {
          if (widget.block_type === "productSlider" && Array.isArray(widget.content)) {
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

    await cacheSet(CACHE_KEY, response);

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
