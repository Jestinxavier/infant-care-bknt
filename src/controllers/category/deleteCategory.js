const Category = require("../../models/Category");
const Product = require("../../models/Product");

const deleteCategory = async (req, res) => {
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

    const category = await Category.findById(categoryId);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found"
      });
    }

    // Check if category has products
    const productsCount = await Product.countDocuments({ category: categoryId });

    if (productsCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete category. ${productsCount} product(s) are using this category. Please reassign products to another category first.`
      });
    }

    // Check if category has child categories
    const childCategoriesCount = await Category.countDocuments({ parentCategory: categoryId });

    if (childCategoriesCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete category. ${childCategoriesCount} sub-category(ies) exist. Please delete or reassign them first.`
      });
    }

    await Category.findByIdAndDelete(categoryId);

    res.status(200).json({
      success: true,
      message: "Category deleted successfully",
      deletedCategory: { id: category._id, name: category.name }
    });
  } catch (error) {
    console.error("❌ Error deleting category:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message
    });
  }
};

module.exports = deleteCategory;

