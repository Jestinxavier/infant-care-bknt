require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");
const Category = require("../src/models/Category");

const defaultCategories = [
  { name: "Rompers", displayOrder: 1 },
  { name: "Bodysuits / Onesies", displayOrder: 2 },
  { name: "Jumpsuits", displayOrder: 3 },
  { name: "T-Shirts", displayOrder: 4 },
  { name: "Shirts", displayOrder: 5 },
  { name: "Frocks / Dresses", displayOrder: 6 },
  { name: "Dungarees / Overalls", displayOrder: 7 },
  { name: "Newborn Sets / Gift Sets", displayOrder: 8 },
  { name: "Daily Wear", displayOrder: 9 },
  { name: "Party Wear", displayOrder: 10 },
  { name: "Festive Wear", displayOrder: 11 },
  { name: "Casual Wear", displayOrder: 12 },
  { name: "Formal Wear", displayOrder: 13 },
  { name: "Shorts & Pants", displayOrder: 14 },
  { name: "Leggings & Jeggings", displayOrder: 15 },
  { name: "Skirts", displayOrder: 16 },
  { name: "Sleepwear / Night Suits", displayOrder: 17 },
  { name: "Ethnic Wear", displayOrder: 18 },
  { name: "Winter Wear", displayOrder: 19 },
  { name: "Cotton", displayOrder: 20 },
  { name: "Organic Cotton", displayOrder: 21 },
  { name: "Wool", displayOrder: 22 },
  { name: "Linen", displayOrder: 23 },
  { name: "Knitted Fabric", displayOrder: 24 },
  { name: "Caps & Hats", displayOrder: 25 },
  { name: "Socks", displayOrder: 26 },
  { name: "Mittens", displayOrder: 27 },
  { name: "Bibs", displayOrder: 28 },
  { name: "Booties", displayOrder: 29 },
  { name: "Headbands", displayOrder: 30 },
  { name: "Diapers / Diaper Covers", displayOrder: 31 },
];

const seedCategories = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error("MONGODB_URI or MONGO_URI not found in environment variables");
    }

    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB");

    console.log("\n📦 Seeding categories...");
    
    let createdCount = 0;
    let skippedCount = 0;

    for (const categoryData of defaultCategories) {
      const existingCategory = await Category.findOne({ name: categoryData.name });
      
      if (existingCategory) {
        console.log(`⏭️  Skipping "${categoryData.name}" - already exists`);
        skippedCount++;
      } else {
        await Category.create({
          name: categoryData.name,
          displayOrder: categoryData.displayOrder,
          isActive: true
        });
        console.log(`✅ Created category: "${categoryData.name}"`);
        createdCount++;
      }
    }

    console.log("\n📊 Summary:");
    console.log(`   ✅ Created: ${createdCount}`);
    console.log(`   ⏭️  Skipped: ${skippedCount}`);
    console.log(`   📦 Total: ${defaultCategories.length}`);

    // Display all categories
    const allCategories = await Category.find({ isActive: true }).sort({ displayOrder: 1 });
    console.log("\n📋 All Categories:");
    allCategories.forEach((cat, index) => {
      console.log(`   ${index + 1}. ${cat.name} (Order: ${cat.displayOrder})`);
    });

    await mongoose.disconnect();
    console.log("\n✅ Categories seeding completed successfully!");
  } catch (error) {
    console.error("\n❌ Error seeding categories:", error.message);
    console.error(error);
    await mongoose.disconnect();
    process.exit(1);
  }
};

if (require.main === module) {
  seedCategories();
}

module.exports = { seedCategories };

