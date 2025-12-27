const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");
const Product = require("../models/Product");
const Asset = require("../models/Asset");
const { extractImagePublicIds } = require("../utils/mediaFinalizer");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to DB");

  const product = await Product.findOne({
    title: "Softwear Essential Baby T-Shirt",
  });
  if (!product) {
    console.log("No product with images found");
    process.exit();
  }

  console.log(`Checking Product: ${product.title} (${product._id})`);
  console.log("Product Images:", JSON.stringify(product.images, null, 2));

  const extractedIds = extractImagePublicIds(product);
  console.log("Extracted IDs:", extractedIds);

  for (const id of extractedIds) {
    const asset = await Asset.findOne({ publicId: id });
    console.log(`ID: "${id}" -> Found in DB? ${!!asset}`);
    if (!asset) {
      // Try fuzzy search
      const fuzzy = await Asset.findOne({ publicId: { $regex: id } });
      if (fuzzy) {
        console.log(`   -> Did you mean: "${fuzzy.publicId}"?`);
      }
    }
  }

  process.exit();
}
run();
