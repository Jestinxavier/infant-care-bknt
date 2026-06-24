require("dotenv").config();
const mongoose = require("mongoose");
const SiteSetting = require("../src/models/SiteSetting");

const setActiveGateway = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    const updated = await SiteSetting.findOneAndUpdate(
      { key: "payment.active_gateway" },
      { $set: { value: "razorpay" } },
      { new: true }
    );

    console.log("Updated active gateway in database:");
    console.log(JSON.stringify(updated, null, 2));

  } catch (error) {
    console.error("Error updating setting:", error);
  } finally {
    await mongoose.disconnect();
    process.exit();
  }
};

setActiveGateway();
