require("dotenv").config({ path: "../.env" }); // Adjust path to .env
const mongoose = require("mongoose");
const Category = require("../src/models/Category"); // Adjust path to Category model

const migrateCategories = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    const categories = await Category.find({});
    console.log(`Found ${categories.length} categories to migrate.`);

    for (const cat of categories) {
      // 1. Generate code if missing
      // Logic: Use existing code if valid, otherwise derive from slug or name
      let newCode = cat.code;

      if (!newCode) {
        // Fallback to slug (remove /category/ prefix) or name
        if (cat.slug) {
          newCode = cat.slug.replace("/category/", "").replace(/^\//, "");
        } else {
          newCode = cat.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "");
        }
      }

      // Ensure code is clean
      newCode = newCode.toLowerCase().trim();

      // Check validation regex manually to be safe before saving
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(newCode)) {
        // Fix potential issues: replace invalid chars with hyphens, remove duplicate hyphens
        newCode = newCode
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/-+/g, "-")
          .replace(/(^-|-$)/g, "");
      }

      console.log(
        `Migrating "${cat.name}": Description -> Code ("${newCode}")`
      );

      // 2. Update Category
      // We use updateOne to bypass schema validation temporarily if we wanted,
      // but here we want to save correctly.
      // However, since we modified schema to require Code, we just need to set it.
      // We also verify 'description' removal.

      const updateOp = {
        $set: { code: newCode },
        $unset: { description: "" },
      };

      await Category.updateOne({ _id: cat._id }, updateOp);
    }

    console.log("✅ Migration completed successfully.");
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
};

migrateCategories();
