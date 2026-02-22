const mongoose = require("mongoose");
require("dotenv").config();

const Product = require("../src/models/Product");
const { syncFilterAttributes } = require("../src/utils/filterAttributes");

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/infant_care";

const toStableJson = (value) => JSON.stringify(value || {});

async function backfillFilterAttributes() {
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB");

  const cursor = Product.find({})
    .select("_id product_type variants filterAttributes")
    .lean()
    .cursor();

  const bulkOps = [];
  let scanned = 0;
  let changed = 0;

  for await (const product of cursor) {
    scanned += 1;

    const nextFilterAttributes = syncFilterAttributes({
      productType: product.product_type,
      variants: product.variants,
      filterAttributes: product.filterAttributes,
    });

    if (toStableJson(product.filterAttributes) === toStableJson(nextFilterAttributes)) {
      continue;
    }

    changed += 1;
    bulkOps.push({
      updateOne: {
        filter: { _id: product._id },
        update: { $set: { filterAttributes: nextFilterAttributes } },
      },
    });

    if (bulkOps.length >= 500) {
      await Product.bulkWrite(bulkOps, { ordered: false });
      bulkOps.length = 0;
    }
  }

  if (bulkOps.length > 0) {
    await Product.bulkWrite(bulkOps, { ordered: false });
  }

  console.log(`Scanned: ${scanned}`);
  console.log(`Updated: ${changed}`);
}

backfillFilterAttributes()
  .then(() => {
    console.log("Backfill complete");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Backfill failed:", error);
    process.exit(1);
  });

