const mongoose = require("mongoose");
require("dotenv").config();

const Product = require("../src/models/Product");

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/infant_care";

async function createIndexes() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to MongoDB");

    console.log("Creating PLP indexes...");

    // Main PLP Index for filtering and grouping
    await Product.collection.createIndex(
      {
        status: 1,
        category: 1,
        "variants.attributes.color": 1,
        "variants.attributes.size": 1,
        "variants.stockObj.isInStock": 1,
        createdAt: -1,
        averageRating: -1,
      },
      { name: "plp_filter_group_idx" }
    );

    // Price sorting index
    await Product.collection.createIndex(
      {
        "variants.pricing.discountPrice": 1,
      },
      { name: "plp_price_sort_idx" }
    );

    console.log("Indexes created successfully:");
    const indexes = await Product.collection.indexes();
    console.log(indexes);

    process.exit(0);
  } catch (error) {
    console.error("Error creating indexes:", error);
    process.exit(1);
  }
}

createIndexes();
