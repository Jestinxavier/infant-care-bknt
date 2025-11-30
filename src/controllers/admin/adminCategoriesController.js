const Category = require("../../models/Category");

/**
 * Admin: Get all categories (including inactive)
 */
const getAllCategories = async (req, res) => {
  try {
    const requestData = req.method === 'POST' ? (req.body || {}) : req.query;
    const { includeInactive = true } = requestData;
    
    const filter = {};
    if (includeInactive !== true && includeInactive !== "true") {
      filter.isActive = true;
    }

    const categories = await Category.find(filter)
      .populate("parentCategory", "name slug")
      .sort({ displayOrder: 1, name: 1 })
      .lean();

    // Format categories
    const formattedCategories = categories.map(cat => ({
      ...cat,
      _id: cat._id?.toString(),
    }));

    res.status(200).json({
      success: true,
      totalCategories: formattedCategories.length,
      categories: formattedCategories,
    });
  } catch (error) {
    console.error("❌ Admin Error fetching categories:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

/**
 * Admin: Get category by ID
 */
const getCategoryById = async (req, res) => {
  try {
    const { categoryId } = req.params;

    if (!categoryId || categoryId === 'undefined' || categoryId === 'null' || categoryId.trim() === '') {
      return res.status(400).json({
        success: false,
        message: "Category ID is required",
      });
    }

    const category = await Category.findById(categoryId)
      .populate("parentCategory", "name slug")
      .lean();

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    res.status(200).json({
      success: true,
      category: {
        ...category,
        _id: category._id?.toString(),
      },
    });
  } catch (error) {
    console.error("❌ Admin Error fetching category:", error);
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

