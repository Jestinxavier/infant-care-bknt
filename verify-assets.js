require("dotenv").config({ path: "./.env" });
const mongoose = require("mongoose");
const Asset = require("./src/models/Asset");

const verifyAssets = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to DB");

    // Mimic the controller query
    const status = "permanent";
    const query = { status };

    // Check total count
    const count = await Asset.countDocuments(query);
    console.log(`\n📊 Total Permanent Assets: ${count}`);

    // Fetch first page (limit 20, sort _id: 1 like controller)
    const assets = await Asset.find(query).sort({ _id: 1 }).limit(20).lean();

    console.log(`\n📋 First 20 Assets (Sorted by Oldest First - _id: 1):`);
    assets.forEach((a) => {
      console.log(`[${a._id}] ${a.publicId} (Origin: ${a.origin?.source})`);
    });

    // Fetch first page (limit 20, sort _id: -1 like we probably want)
    const assetsNewest = await Asset.find(query)
      .sort({ _id: -1 })
      .limit(20)
      .lean();

    console.log(`\n📋 First 20 Assets (Sorted by Newest First - _id: -1):`);
    assetsNewest.forEach((a) => {
      console.log(`[${a._id}] ${a.publicId} (Origin: ${a.origin?.source})`);
    });

    // Check specific asset
    const targetId =
      "assets/f253991b70e990235d74d751c219bacaf6a4a12466cc7fb1c9518b48fb3e1988";
    const target = await Asset.findOne({ publicId: targetId });
    if (target) {
      console.log(`\n🎯 Target Asset Status: ${target.status}`);
      console.log(`   ID: ${target._id}`);
      console.log(`   Origin: ${JSON.stringify(target.origin)}`);
    } else {
      console.log(`\n❌ Target asset not found`);
    }
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
};

verifyAssets();
