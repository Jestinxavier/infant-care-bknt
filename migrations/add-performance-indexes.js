/**
 * Migration: Add performance indexes
 *
 * Run once in production:
 *   node migrations/add-performance-indexes.js
 *
 * createIndex() is idempotent — safe to re-run.
 */

require("dotenv").config();
const mongoose = require("mongoose");

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB");

  const db = mongoose.connection.db;

  // ─── Products ───────────────────────────────────────────────────
  const products = db.collection("products");

  await products.createIndex(
    { category: 1, status: 1, createdAt: -1 },
    { background: true, name: "cat_status_created" }
  );
  await products.createIndex(
    { category: 1, status: 1, averageRating: -1 },
    { background: true, name: "cat_status_rating" }
  );
  await products.createIndex(
    { category: 1, status: 1, price: 1 },
    { background: true, name: "cat_status_price" }
  );
  await products.createIndex(
    { status: 1, averageRating: -1 },
    { background: true, name: "status_rating" }
  );
  await products.createIndex(
    {
      title: "text",
      description: "text",
      categoryName: "text",
      "variants.name": "text",
      collections: "text",
    },
    {
      weights: { title: 10, "variants.name": 5, categoryName: 3, description: 1 },
      background: true,
      name: "product_text_search",
    }
  );

  console.log("✅  Product indexes created");

  // ─── Orders ─────────────────────────────────────────────────────
  const orders = db.collection("orders");

  await orders.createIndex(
    { userId: 1, orderStatus: 1, placedAt: -1 },
    { background: true, name: "user_status_placed" }
  );
  await orders.createIndex(
    { createdAt: -1, orderStatus: 1 },
    { background: true, name: "created_status" }
  );

  console.log("✅  Order indexes created");

  // ─── Users ──────────────────────────────────────────────────────
  const users = db.collection("users");

  await users.createIndex(
    { role: 1 },
    { background: true, name: "role" }
  );
  await users.createIndex(
    { email: 1, emailOTPExpires: 1 },
    { background: true, name: "email_otp_expires" }
  );

  console.log("✅  User indexes created");

  // ─── Reviews ────────────────────────────────────────────────────
  const reviews = db.collection("reviews");

  await reviews.createIndex(
    { userId: 1, productId: 1, orderId: 1 },
    { unique: true, background: true, name: "user_product_order_unique" }
  );

  console.log("✅  Review indexes created");

  await mongoose.disconnect();
  console.log("\nMigration complete.");
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
