const Category = require("../../models/Category");
const Product = require("../../models/Product");

/**
 * Bulk delete categories
 * Checks for dependencies (products, sub-categories) before deleting each.
 * Returns partial success if some can be deleted and others cannot.
 */
const bulkDeleteCategories = async (req, res) => {
  try {
    const { categoryIds } = req.body;

    if (
      !categoryIds ||
      !Array.isArray(categoryIds) ||
      categoryIds.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "No category IDs provided",
      });
    }

    const results = {
      successCount: 0,
      failureCount: 0,
      failed: [],
      deletedIds: [],
    };

    // Process each category
    for (const id of categoryIds) {
      try {
        if (!/^[0-9a-fA-F]{24}$/.test(id)) {
          results.failureCount++;
          results.failed.push({ id, reason: "Invalid ID format" });
          continue;
        }

        const category = await Category.findById(id);
        if (!category) {
          results.failureCount++;
          results.failed.push({ id, reason: "Category not found" });
          continue;
        }

        // Check dependencies
        const productsCount = await Product.countDocuments({ category: id });
        if (productsCount > 0) {
          results.failureCount++;
          results.failed.push({
            id,
            name: category.name,
            reason: `Has ${productsCount} associated products`,
          });
          continue;
        }

        const childCategoriesCount = await Category.countDocuments({
          parentCategory: id,
        });
        if (childCategoriesCount > 0) {
          results.failureCount++;
          results.failed.push({
            id,
            name: category.name,
            reason: `Has ${childCategoriesCount} sub-categories`,
          });
          continue;
        }

        // Safe to delete
        await Category.findByIdAndDelete(id);
        results.successCount++;
        results.deletedIds.push(id);
      } catch (err) {
        console.error(`Error deleting category ${id}:`, err);
        results.failureCount++;
        results.failed.push({ id, reason: err.message });
      }
    }

    // Determine overall success status
    const overallSuccess = results.failureCount === 0;
    const partialSuccess = results.successCount > 0 && results.failureCount > 0;

    res.status(200).json({
      success: overallSuccess,
      partialSuccess,
      message: overallSuccess
        ? `Successfully deleted ${results.successCount} categories`
        : `Deleted ${results.successCount} categories, failed to delete ${results.failureCount}`,
      results,
    });
  } catch (error) {
    console.error("❌ Error in bulk delete categories:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

module.exports = bulkDeleteCategories;
