const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");
const Product = require("../models/Product");
const Category = require("../models/Category");
const Asset = require("../models/Asset");
const User = require("../models/User");
const {
  finalizeImages,
  extractImagePublicIds,
} = require("../utils/mediaFinalizer");
const { cloudinary } = require("../config/cloudinary");

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function ensureAssetExists(publicId, fallbackUserId) {
  let asset = await Asset.findOne({ publicId });
  if (asset) return asset;

  try {
    // Fetch from Cloudinary
    const res = await cloudinary.api.resource(publicId);

    // Create new Asset record
    asset = new Asset({
      publicId: res.public_id,
      secureUrl: res.secure_url,
      assetId: res.asset_id,
      hash: res.etag || `imported-${Date.now()}`,
      width: res.width,
      height: res.height,
      format: res.format,
      resourceType: res.resource_type,
      bytes: res.bytes,
      status: "temp", // will be promoted shortly
      origin: {
        source: "product",
        sourceContext: "recovery-script",
      },
      uploadedBy: fallbackUserId,
    });

    await asset.save();
    console.log(`  ✨ Imported Ghost Asset: ${publicId}`);
    return asset;
  } catch (error) {
    if (error.error && error.error.http_code === 404) {
      console.log(`  ⚠️ Asset missing in Cloudinary too: ${publicId}`);
    } else {
      console.error(
        `  ❌ Cloudinary API Error for ${publicId}:`,
        error.message
      );
    }
    return null;
  }
}

async function run() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is missing from .env");
    }

    console.log("🔍 Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    // Get a fallback user for 'uploadedBy'
    const adminUser = await User.findOne({});
    const fallbackUserId = adminUser
      ? adminUser._id
      : new mongoose.Types.ObjectId();
    console.log(`Using user ID for imports: ${fallbackUserId}`);

    // ==========================================
    // 1. Recover Product Assets
    // ==========================================
    console.log("\n📦 Scanning Products...");
    const products = await Product.find({});
    console.log(`Found ${products.length} products.`);

    for (const product of products) {
      try {
        const publicIds = extractImagePublicIds(product);

        if (publicIds.length > 0) {
          process.stdout.write(
            `  Syncing ${product.title} (${publicIds.length} images)... `
          );

          // Ensure all exist in DB first
          for (const pid of publicIds) {
            await ensureAssetExists(pid, fallbackUserId);
          }

          const result = await finalizeImages(
            publicIds,
            "product",
            product._id
          );

          if (result.failed.length > 0) {
            console.log(
              `✅ Success: ${result.success.length}, ❌ Failed: ${result.failed.length}`
            );
            console.log(
              "    Failures:",
              JSON.stringify(result.failed, null, 2)
            );
          } else {
            console.log(`✅ Success: ${result.success.length}`);
          }
        }
      } catch (err) {
        console.error(
          `  ❌ Error processing product ${product._id}:`,
          err.message
        );
      }
    }

    // ==========================================
    // 2. Recover Category Assets
    // ==========================================
    console.log("\n📂 Scanning Categories...");
    const categories = await Category.find({});
    console.log(`Found ${categories.length} categories.`);

    for (const category of categories) {
      try {
        if (category.image) {
          let publicId = null;
          const match = category.image.match(/\/v\d+\/(.+)\.[^.]+$/);

          if (match && match[1]) {
            publicId = match[1];
          }

          if (publicId) {
            process.stdout.write(`  Syncing Category: ${category.name}... `);

            // Ensure exists
            await ensureAssetExists(publicId, fallbackUserId);

            const result = await finalizeImages(
              [publicId],
              "category",
              category._id
            );
            console.log(`✅ Success: ${result.success.length}`);
          }
        }
      } catch (err) {
        console.error(
          `  ❌ Error processing category ${category._id}:`,
          err.message
        );
      }
    }

    console.log(
      "\n✨ Recovery Complete! All active assets are now marked as Permanent."
    );
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Critical Error:", error);
    process.exit(1);
  }
}

run();
