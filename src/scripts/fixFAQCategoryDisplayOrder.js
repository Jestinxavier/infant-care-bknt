const mongoose = require("mongoose");
const FAQCategory = require("../models/FAQCategory");

/**
 * Migration script to fix FAQ categories with duplicate displayOrder values
 * Sets them to incremental values: 0, 1, 2, 3...
 */
async function fixCategoryDisplayOrder() {
  try {
    // Get all categories sorted by creation date
    const categories = await FAQCategory.find({}).sort({ createdAt: 1 });

    console.log(`Found ${categories.length} categories`);

    // Update each category with incremental displayOrder
    for (let i = 0; i < categories.length; i++) {
      const category = categories[i];
      if (category.displayOrder !== i) {
        category.displayOrder = i;
        await category.save();
        console.log(`Updated category "${category.name}" displayOrder to ${i}`);
      } else {
        console.log(
          `Category "${category.name}" already has correct displayOrder ${i}`
        );
      }
    }

    console.log("✅ Migration completed successfully");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  const dbURI = process.env.MONGO_URI || "mongodb://localhost:27017/infantcare";

  mongoose
    .connect(dbURI)
    .then(() => {
      console.log("📦 Connected to MongoDB");
      return fixCategoryDisplayOrder();
    })
    .then(() => {
      console.log("🎉 All done!");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Error:", err);
      process.exit(1);
    });
}

module.exports = fixCategoryDisplayOrder;
