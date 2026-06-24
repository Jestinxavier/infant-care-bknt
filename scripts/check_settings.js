require("dotenv").config();
const mongoose = require("mongoose");
const SiteSetting = require("../src/models/SiteSetting");

const checkSettings = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    const paymentMethods = await SiteSetting.findOne({ key: "payment_methods" });
    const activeGateway = await SiteSetting.findOne({ key: "payment.active_gateway" });

    console.log("\n--- payment_methods ---");
    console.log(JSON.stringify(paymentMethods, null, 2));

    console.log("\n--- payment.active_gateway ---");
    console.log(JSON.stringify(activeGateway, null, 2));

  } catch (error) {
    console.error("Error checking settings:", error);
  } finally {
    await mongoose.disconnect();
    process.exit();
  }
};

checkSettings();
