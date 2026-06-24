const mongoose = require("mongoose");
const dotenv = require("dotenv");
const SiteSetting = require("../src/models/SiteSetting");

dotenv.config();

const seedActiveGateway = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      console.error("Error: MONGODB_URI is not defined in .env");
      process.exit(1);
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB for seeding...");

    const key = "payment.active_gateway";

    // Check if key already exists in SiteSetting collection
    const existing = await SiteSetting.findOne({ key });

    if (existing) {
      console.log(`Setting '${key}' already exists in database. Skipping.`);
    } else {
      await SiteSetting.create({
        key,
        value: "phonepe",
        type: "string",
        scope: "payment",
        description: "Select which online payment gateway to use (phonepe or razorpay).",
        isPublic: true,
      });
      console.log(`Setting '${key}' seeded successfully with default value 'phonepe'.`);
    }

    process.exit(0);
  } catch (error) {
    console.error("Error seeding active payment gateway setting:", error);
    process.exit(1);
  }
};

seedActiveGateway();
