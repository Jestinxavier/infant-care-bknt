const FAQCategory = require("../models/FAQCategory");
const FAQ = require("../models/FAQ");

// @desc    Get all FAQ Categories
// @route   GET /api/v1/admin/faq-categories
// @access  Public
exports.getAllCategories = async (req, res) => {
  try {
    const categories = await FAQCategory.find({}).sort({ displayOrder: 1 });
    res.status(200).json({
      success: true,
      count: categories.length,
      categories,
    });
  } catch (error) {
    console.error("Error fetching FAQ categories:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// @desc    Create a new FAQ Category
// @route   POST /api/v1/admin/faq-categories
// @access  Private/Admin
exports.createCategory = async (req, res) => {
  try {
    const { name, displayOrder, isActive } = req.body;

    // Auto-increment displayOrder if not provided
    let finalDisplayOrder = displayOrder;
    if (finalDisplayOrder === undefined) {
      const lastCategory = await FAQCategory.findOne().sort({
        displayOrder: -1,
      });
      finalDisplayOrder = lastCategory ? lastCategory.displayOrder + 1 : 0;
    }

    const category = await FAQCategory.create({
      name,
      displayOrder: finalDisplayOrder,
      isActive: isActive !== undefined ? isActive : true,
    });

    res.status(201).json({
      success: true,
      message: "Category created successfully",
      category,
    });
  } catch (error) {
    console.error("Error creating FAQ category:", error);
    if (error.code === 11000) {
      return res
        .status(400)
        .json({ success: false, message: "Category already exists" });
    }
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// @desc    Update an FAQ Category
// @route   PUT /api/v1/admin/faq-categories/:id
// @access  Private/Admin
exports.updateCategory = async (req, res) => {
  try {
    const category = await FAQCategory.findById(req.params.id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    const { name, displayOrder, isActive } = req.body;

    if (name) category.name = name;
    if (displayOrder !== undefined) category.displayOrder = displayOrder;
    if (isActive !== undefined) category.isActive = isActive;

    await category.save();

    res.status(200).json({
      success: true,
      message: "Category updated successfully",
      category,
    });
  } catch (error) {
    console.error("Error updating FAQ category:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// @desc    Delete an FAQ Category
// @route   DELETE /api/v1/admin/faq-categories/:id
// @access  Private/Admin
exports.deleteCategory = async (req, res) => {
  try {
    const category = await FAQCategory.findById(req.params.id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    // Check if there are FAQs in this category
    const count = await FAQ.countDocuments({ category: req.params.id });
    if (count > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete category containing ${count} questions. Move or delete them first.`,
      });
    }

    await category.deleteOne();

    res.status(200).json({
      success: true,
      message: "Category deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting FAQ category:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// @desc    Reorder FAQ Categories
// @route   PUT /api/v1/admin/faq-categories/reorder
// @access  Private/Admin
exports.reorderCategories = async (req, res) => {
  try {
    const { items } = req.body; // Array of { id, displayOrder }

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ success: false, message: "Invalid data" });
    }

    const updates = items.map((item) => ({
      updateOne: {
        filter: { _id: item.id },
        update: { $set: { displayOrder: item.displayOrder } },
      },
    }));

    await FAQCategory.bulkWrite(updates);

    res.status(200).json({
      success: true,
      message: "Categories reordered successfully",
    });
  } catch (error) {
    console.error("Error reordering categories:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};
