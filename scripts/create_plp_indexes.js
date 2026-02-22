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

    // PLP indexes: filter only on denormalized filterAttributes.*
    await Product.collection.createIndex(
      { status: 1, category: 1, "filterAttributes.color": 1 },
      { name: "plp_filter_color_idx" }
    );

    await Product.collection.createIndex(
      { status: 1, category: 1, "filterAttributes.size": 1 },
      { name: "plp_filter_size_idx" }
    );

    await Product.collection.createIndex(
      { status: 1, category: 1, "filterAttributes.material": 1 },
      { name: "plp_filter_material_idx" }
    );

    await Product.collection.createIndex(
      { status: 1, category: 1, "filterAttributes.season": 1 },
      { name: "plp_filter_season_idx" }
    );

    await Product.collection.createIndex(
      { status: 1, category: 1, "filterAttributes.gender": 1 },
      { name: "plp_filter_gender_idx" }
    );

    await Product.collection.createIndex(
      { status: 1, category: 1, "filterAttributes.sleeve": 1 },
      { name: "plp_filter_sleeve_idx" }
    );

    await Product.collection.createIndex(
      { status: 1, category: 1, "filterAttributes.occasion": 1 },
      { name: "plp_filter_occasion_idx" }
    );

    await Product.collection.createIndex(
      { status: 1, category: 1, "filterAttributes.pattern": 1 },
      { name: "plp_filter_pattern_idx" }
    );

    await Product.collection.createIndex(
      { status: 1, category: 1, "filterAttributes.pack": 1 },
      { name: "plp_filter_pack_idx" }
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
