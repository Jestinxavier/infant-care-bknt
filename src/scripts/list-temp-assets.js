const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");
const Asset = require("../models/Asset");
const Product = require("../models/Product");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to DB");

  const count = await Asset.countDocuments({});
  console.log(`Total Assets in DB: ${count}`);

  const tempCount = await Asset.countDocuments({ status: "temp" });
  console.log(`Total Temp Assets in DB: ${tempCount}`);

  // Check unique known ID
  const knownId = "products/1766214446704_gov4zn";
  const specific = await Asset.findOne({ publicId: knownId });
  console.log(`Specific Asset '${knownId}' found? ${!!specific}`);
  if (specific) {
    console.log("Status:", specific.status);
    console.log("UsedBy:", specific.usedBy);
  } else {
    // Try fuzzy search
    const fuzzy = await Asset.findOne({
      publicId: { $regex: "1766214446704" },
    });
    if (fuzzy) {
      console.log(`Found partial match: ${fuzzy.publicId}`);
    }
  }

  // List newest 5
  const assets = await Asset.find({}).sort({ createdAt: -1 }).limit(5);
  console.log("Newest 5 Assets:");
  assets.forEach((a) => {
    console.log(`- ${a.publicId} [${a.status}]`);
  });

  process.exit();
}
run();
