const mongoose = require("mongoose");
const dotenv = require("dotenv");
const SiteSetting = require("../src/models/SiteSetting");

dotenv.config();

const addRazorpayToPaymentMethods = async () => {
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
      console.log(`Setting '${key}' not found. Seeding default settings...`);
      // Fallback: seed from scratch
      await SiteSetting.create({
        key,
        value: {
          methods: [
            {
              code: "COD",
              label: "Cash on Delivery (COD)",
              description: "Pay when you receive",
              isEnabled: true,
              iconText: "C",
              iconBg: "#0b9d41",
            },
            {
              code: "PHONEPE",
              label: "PhonePe",
              description: "UPI, PhonePe Wallet, Credit/Debit Card, Net Banking",
              isEnabled: true,
              iconText: "P",
              iconBg: "#ae00ff",
            },
            {
              code: "RAZORPAY",
              label: "Razorpay",
              description: "UPI, Credit/Debit Cards, Net Banking, Wallets",
              isEnabled: true,
              iconText: "R",
              iconBg: "#005eff",
            }
          ]
        },
        type: "json",
        scope: "cart",
        description: "Available payment methods configuration",
        isPublic: true,
      });
      console.log("Seeded payment methods successfully.");
    } else {
      const valueObj = existing.value || { methods: [] };
      const methods = valueObj.methods || [];

      // Check if RAZORPAY already exists in the methods array
      const hasRazorpay = methods.some(m => m.code === "RAZORPAY");

      if (hasRazorpay) {
        console.log("Razorpay is already present in payment_methods. Skipping.");
      } else {
        // Append RAZORPAY configuration
        methods.push({
          code: "RAZORPAY",
          label: "Razorpay",
          description: "UPI, Credit/Debit Cards, Net Banking, Wallets",
          isEnabled: true,
          iconText: "R",
          iconBg: "#005eff",
        });

        // Save the updated document
        existing.value = { ...valueObj, methods };
        existing.markModified("value");
        await existing.save();
        console.log("Successfully added Razorpay to payment_methods in MongoDB.");
      }
    }

    process.exit(0);
  } catch (error) {
    console.error("Error adding Razorpay to payment methods:", error);
    process.exit(1);
  }
};

addRazorpayToPaymentMethods();
