const Category = require("../../models/Category");
const logger = require("../../utils/logger");
const { toCloudinaryUrl } = require("../../utils/cloudinaryUrlUtils");
const { cacheGet, cacheSet } = require("../../utils/redisCache");

const getAllCategories = async (req, res) => {
  try {
    const { includeInactive } = req.query;

    // Only cache the default active-only listing
    const cacheKey = includeInactive === "true" ? null : "categories";

    if (cacheKey) {
      const cached = await cacheGet(cacheKey);
      if (cached) return res.status(200).json(cached);
    }

    const filter = {};
    if (includeInactive !== "true") {
      filter.isActive = true;
    }

    const categories = await Category.find(filter)
      .populate("parentCategory", "name slug")
      .sort({ displayOrder: 1, name: 1 });

    const categoriesWithUrls = categories.map((cat) => {
      const doc = cat.toObject ? cat.toObject() : cat;
      if (doc.image && typeof doc.image === "string") {
        doc.image = toCloudinaryUrl(doc.image) || doc.image;
      }
      return doc;
    });

    const response = {
      success: true,
      totalCategories: categoriesWithUrls.length,
      categories: categoriesWithUrls,
    };

    if (cacheKey) await cacheSet(cacheKey, response);

    res.status(200).json(response);
  } catch (error) {
    logger.error("❌ Error fetching categories:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const getCategoryById = async (req, res) => {
  try {
    const { categoryId } = req.params;

    if (
      !categoryId ||
      categoryId === "undefined" ||
      categoryId === "null" ||
      categoryId.trim() === ""
    ) {
      return res.status(400).json({
        success: false,
        message: "Category ID is required",
      });
    }

    if (!/^[0-9a-fA-F]{24}$/.test(categoryId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid category ID format",
      });
    }

    const category = await Category.findById(categoryId).populate(
      "parentCategory",
      "name slug"
    );

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    const categoryObj = category.toObject ? category.toObject() : category;
    if (categoryObj.image && typeof categoryObj.image === "string") {
      categoryObj.image =
        toCloudinaryUrl(categoryObj.image) || categoryObj.image;
    }

    res.status(200).json({
      success: true,
      category: categoryObj,
    });
  } catch (error) {
    logger.error("❌ Error fetching category:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

module.exports = {
  getAllCategories,
  getCategoryById,
};
