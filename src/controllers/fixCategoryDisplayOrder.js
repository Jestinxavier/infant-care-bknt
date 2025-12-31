const FAQCategory = require("../models/FAQCategory");

// @desc    Fix displayOrder for all categories
// @route   PUT /api/v1/admin/faq-categories/fix-display-order
// @access  Private/Admin
exports.fixDisplayOrder = async (req, res) => {
  try {
    // Get all categories sorted by creation date
    const categories = await FAQCategory.find({}).sort({ createdAt: 1 });

    console.log(`Found ${categories.length} categories to fix`);

    const updates = [];

    // Update each category with incremental displayOrder
    for (let i = 0; i < categories.length; i++) {
      const category = categories[i];
      if (category.displayOrder !== i) {
        category.displayOrder = i;
        await category.save();
        updates.push({
          id: category._id,
          name: category.name,
          oldOrder: category.displayOrder,
          newOrder: i,
        });
        console.log(`Updated category "${category.name}" displayOrder to ${i}`);
      }
    }

    res.status(200).json({
      success: true,
      message: `Fixed displayOrder for ${updates.length} categories`,
      totalCategories: categories.length,
      updates,
    });
  } catch (error) {
    console.error("Error fixing category displayOrder:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};
