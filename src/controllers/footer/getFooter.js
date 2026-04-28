const Footer = require("../../models/Footer");
const logger = require("../../utils/logger");
const { cacheGet, cacheSet } = require("../../utils/redisCache");

const CACHE_KEY = "footer";

/**
 * Get footer data from MongoDB
 * @route   GET /api/v1/footer
 * @desc    Fetch footer data
 * @access  Public
 */
const getFooter = async (req, res) => {
  try {
    const cached = await cacheGet(CACHE_KEY);
    if (cached) return res.status(200).json(cached);

    // Fetch footer document from MongoDB
    const footerDoc = await Footer.findOne({});

    if (!footerDoc) {
      return res.status(200).json({
        success: true,
        message: "Footer data not found",
        data: null,
      });
    }

    // Convert Mongoose document to plain object
    const footerData = footerDoc.toObject ? footerDoc.toObject() : footerDoc;

    // Extract content field if it exists, otherwise return the entire document
    let content = footerData;
    if (footerData.content && typeof footerData.content === "object" && !Array.isArray(footerData.content)) {
      // Footer has content field with features and footer structure
      content = footerData.content;
    } else {
      // Remove MongoDB internal fields
      const { _id, __v, createdAt, updatedAt, ...rest } = footerData;
      content = rest;
    }

    const response = {
      success: true,
      message: "Footer data fetched successfully",
      data: content,
    };

    await cacheSet(CACHE_KEY, response);

    res.status(200).json(response);
  } catch (err) {
    logger.error("❌ Error fetching footer data:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

module.exports = {
  getFooter,
};

