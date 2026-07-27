/**
 * One-time migration: Set role = "variant" on Color and Size attributes.
 *
 * These are the only variant-option attributes in the system.
 * Run with: node src/scripts/set-variant-roles.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const AttributeDefinition = require("../models/AttributeDefinition");

async function setVariantRoles() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error("MongoDB URI not found in environment variables");
    }

    console.log("Connecting to MongoDB...");
    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB");

    const result = await AttributeDefinition.updateMany(
      { code: { $in: ["color", "size"] } },
      { $set: { role: "variant" } }
    );

    console.log(`Matched ${result.matchedCount} attribute(s), modified ${result.modifiedCount}`);

    // Verify
    const attrs = await AttributeDefinition.find(
      { code: { $in: ["color", "size"] } },
      { code: 1, label: 1, role: 1 }
    ).lean();

    attrs.forEach((a) => {
      console.log(`  ${a.code} (${a.label}) -> role: ${a.role}`);
    });

    console.log("Done.");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

setVariantRoles();
