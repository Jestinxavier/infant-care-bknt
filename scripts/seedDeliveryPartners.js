require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");
const DeliveryPartner = require("../src/models/DeliveryPartner");
const indianDeliveryPartners = require("./data/indianDeliveryPartners.json");

const seedDeliveryPartners = async () => {
    try {
        const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
        if (!mongoUri) {
            throw new Error("MONGODB_URI or MONGO_URI not found in environment variables");
        }

        console.log("🔌 Connecting to MongoDB...");
        await mongoose.connect(mongoUri);
        console.log("✅ Connected to MongoDB");

        console.log("\n📦 Seeding delivery partners...");
        console.log(`📂 Found ${indianDeliveryPartners.length} partners in JSON file`);

        let createdCount = 0;
        let skippedCount = 0;
        let updatedCount = 0;

        for (const partnerData of indianDeliveryPartners) {
            const existingPartner = await DeliveryPartner.findOne({ name: partnerData.name });

            if (existingPartner) {
                // Update existing partner to match JSON (useful for updating URLs)
                existingPartner.trackingUrlTemplate = partnerData.trackingUrlTemplate;
                existingPartner.requiresTrackingUrl = partnerData.requiresTrackingUrl;
                existingPartner.isActive = partnerData.isActive;
                await existingPartner.save();

                console.log(`🔄 Updated "${partnerData.name}"`);
                updatedCount++;
            } else {
                await DeliveryPartner.create(partnerData);
                console.log(`✅ Created "${partnerData.name}"`);
                createdCount++;
            }
        }

        console.log("\n📊 Summary:");
        console.log(`   ✅ Created: ${createdCount}`);
        console.log(`   🔄 Updated: ${updatedCount}`);
        console.log(`   skipped: ${skippedCount}`);
        console.log(`   📦 Total Processed: ${indianDeliveryPartners.length}`);

        // Display all partners
        const allPartners = await DeliveryPartner.find({});
        console.log("\n📋 All Delivery Partners in DB:");
        allPartners.forEach((p, index) => {
            console.log(`   ${index + 1}. ${p.name}`);
            console.log(`      Tracking: ${p.requiresTrackingUrl ? "Required" : "Optional"}`);
            console.log(`      Template: ${p.trackingUrlTemplate || "(None)"}`);
        });

        await mongoose.disconnect();
        console.log("\n✅ Delivery partners seeding completed successfully!");
    } catch (error) {
        console.error("\n❌ Error seeding delivery partners:", error.message);
        console.error(error);
        await mongoose.disconnect();
        process.exit(1);
    }
};

if (require.main === module) {
    seedDeliveryPartners();
}

module.exports = { seedDeliveryPartners };
