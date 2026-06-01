/**
 * Run once to insert the invoice "from address" setting into the database.
 * Usage: node src/scripts/seedFromAddress.js
 * Edit the address fields below before running.
 */

require("dotenv").config();
const mongoose = require("mongoose");
const SiteSetting = require("../models/SiteSetting");
const { SITE_SETTING_KEYS } = require("../config/siteSettingRegistry");

const FROM_ADDRESS = {
  businessName: "Infants Care",
  houseName: "",
  street: "Vengola",
  landmark: "",
  city: "Perumbavoor",
  state: "Kerala",
  pincode: "683556",
  country: "India",
  phone: "",
  email: "support@infantscare.com",
  gstin: "",
};

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);

  const existing = await SiteSetting.findOne({
    key: SITE_SETTING_KEYS.ORDER_FROM_ADDRESS,
  });

  if (existing) {
    console.log("Setting already exists. To update it, use the dashboard Settings page.");
    await mongoose.disconnect();
    return;
  }

  await SiteSetting.create({
    key: SITE_SETTING_KEYS.ORDER_FROM_ADDRESS,
    value: FROM_ADDRESS,
    type: "json",
    scope: "order",
    description: "Store / seller address shown on invoices (PDF and email).",
    isPublic: true,
  });

  console.log(
    `Created ${SITE_SETTING_KEYS.ORDER_FROM_ADDRESS} setting. Edit the values in the dashboard Settings page.`,
  );
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
