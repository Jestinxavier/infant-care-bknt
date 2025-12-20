require("dotenv").config({ path: "../.env" });
const mongoose = require("mongoose");
const Product = require("../src/models/Product");

// Status options: 'draft', 'published', 'archived'
const TARGET_STATUS = process.argv[2] || "published";

const updateProductStatus = async () => {
  try {
    console.log("🔄 Connecting to Database...");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to Database");

    console.log(`\n📊 Updating products to status: '${TARGET_STATUS}'...`);

    // Verify valid status
    const validStatuses = ["draft", "published", "archived"];
    if (!validStatuses.includes(TARGET_STATUS)) {
      throw new Error(
        `Invalid status '${TARGET_STATUS}'. Must be one of: ${validStatuses.join(
          ", "
        )}`
      );
    }

    // Find products that don't have this status
    const productsToUpdate = await Product.find({
      status: { $ne: TARGET_STATUS },
    });

    console.log(`Found ${productsToUpdate.length} products to update.`);

    if (productsToUpdate.length === 0) {
      console.log("✨ All products are already up to date.");
      process.exit(0);
    }

    const result = await Product.updateMany(
      { status: { $ne: TARGET_STATUS } },
      { $set: { status: TARGET_STATUS } }
    );

    console.log(`\n✅ Successfully updated ${result.modifiedCount} products.`);
    console.log(`✨ Status set to: ${TARGET_STATUS}`);

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error updating products:", error);
    process.exit(1);
  }
};

updateProductStatus();
