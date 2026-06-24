const mongoose = require("mongoose");
const dotenv = require("dotenv");
const SiteSetting = require("../src/models/SiteSetting");

dotenv.config();

const addDeliveryCodCost = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      console.error("Error: MONGODB_URI is not defined in .env");
      process.exit(1);
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB for updating...");

    const key = "payment_methods";

    // Find the existing payment_methods setting
    const existing = await SiteSetting.findOne({ key });

    if (!existing) {
      console.log(`Setting '${key}' not found. Please run seed script first.`);
    } else {
      const valueObj = existing.value || { methods: [] };
      const methods = valueObj.methods || [];

      // Find the COD method
      const codMethod = methods.find(m => m.code === "COD");

      if (!codMethod) {
        console.log("COD method not found in payment_methods. Skipping.");
      } else if (codMethod.deliveryCodCost !== undefined) {
        console.log("deliveryCodCost is already present in COD method. Skipping.");
      } else {
        // Add deliveryCodCost
        codMethod.deliveryCodCost = 0;

        // Save the updated document
        existing.value = { ...valueObj, methods };
        existing.markModified("value");
        await existing.save();
        console.log("Successfully added deliveryCodCost: 0 to COD in payment_methods.");
      }
    }

    process.exit(0);
  } catch (error) {
    console.error("Error adding deliveryCodCost to payment methods:", error);
    process.exit(1);
  }
};

addDeliveryCodCost();
