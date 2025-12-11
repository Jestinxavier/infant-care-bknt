const Category = require("../../models/Category");

/**
 * Admin: Get all categories (including inactive)
 */
const getAllCategories = async (req, res) => {
  try {
    const requestData = req.method === 'POST' ? (req.body || {}) : req.query;
    const {
      includeInactive = true,
      page = 1,
      limit = 50,
      search,
    } = requestData;
    
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    const skip = (pageNum - 1) * limitNum;

    const filter = {};
    if (includeInactive !== true && includeInactive !== "true") {
      filter.isActive = true;
    }
    if (search) {
      filter.name = { $regex: search, $options: "i" };
    }

    const total = await Category.countDocuments(filter);

    const categories = await Category.find(filter)
      .populate("parentCategory", "name slug")
      .sort({ displayOrder: 1, name: 1 })
      .skip(skip)
      .limit(limitNum)
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
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.max(Math.ceil(total / limitNum), 1),
      },
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

