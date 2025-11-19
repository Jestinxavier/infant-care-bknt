const Category = require("../../models/Category");

const getAllCategories = async (req, res) => {
  try {
    const { includeInactive } = req.query;
    
    const filter = {};
    if (includeInactive !== "true") {
      filter.isActive = true;
    }

    const categories = await Category.find(filter)
      .populate("parentCategory", "name slug")
      .sort({ displayOrder: 1, name: 1 });

    res.status(200).json({
      success: true,
      totalCategories: categories.length,
      categories
    });
  } catch (error) {
    console.error("❌ Error fetching categories:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message
    });
  }
};

const getCategoryById = async (req, res) => {
  try {
    const { categoryId } = req.params;

    if (!categoryId || categoryId === 'undefined' || categoryId === 'null' || categoryId.trim() === '') {
      return res.status(400).json({
        success: false,
        message: "Category ID is required"
      });
    }

    if (!/^[0-9a-fA-F]{24}$/.test(categoryId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid category ID format"
      });
    }

    const category = await Category.findById(categoryId)
      .populate("parentCategory", "name slug");

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found"
      });
    }

    res.status(200).json({
      success: true,
      category
    });
  } catch (error) {
    console.error("❌ Error fetching category:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message
    });
  }
};

module.exports = {
  getAllCategories,
  getCategoryById
};

