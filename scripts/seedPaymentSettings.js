const mongoose = require("mongoose");
const dotenv = require("dotenv");
const SiteSetting = require("../src/models/SiteSetting");

dotenv.config();

const PAYMENT_METHODS_DEFAULT = {
  methods: [
    {
      code: "COD",
      label: "Cash on Delivery (COD)",
      description: "Pay when you receive",
      isEnabled: true,
      iconText: "C",
      iconBg: "bg-green-600",
    },
    {
      code: "PHONEPE",
      label: "PhonePe",
      description: "UPI, PhonePe Wallet, Credit/Debit Card, Net Banking",
      isEnabled: true,
      iconText: "P",
      iconBg: "bg-purple-600",
    },
  ],
};

const seedPaymentSettings = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB for seeding...");

    const key = "payment_methods";

    // Check if exists
    const existing = await SiteSetting.findOne({ key });

    if (existing) {
      console.log(
        "Payment settings already exist. Skipping overwrite to preserve developer edits.",
      );
      // Option: Update structure if needed, but requirements say "edited only by developers", so we respect existing data.
    } else {
      await SiteSetting.create({
        key,
        value: PAYMENT_METHODS_DEFAULT,
        type: "json",
        scope: "cart", // Scoped to cart/checkout
        description: "Available payment methods configuration",
        isPublic: true,
      });
      console.log("Payment settings seeded successfully.");
    }

    process.exit(0);
  } catch (error) {
    console.error("Error seeding payment settings:", error);
    process.exit(1);
  }
};

seedPaymentSettings();
