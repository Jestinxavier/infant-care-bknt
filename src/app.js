const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

// Load default .env
dotenv.config();
if (process.env.NODE_ENV === "production") {
  dotenv.config({ path: "config/production.env" });
} else {
  dotenv.config({ path: "config/development.env" });
}

const app = express();
// ✅ CORS setup
app.use(cors({
  origin: '*', // frontend URLs (React, Vite, etc.)
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));

// Middleware
app.use(express.json());

// Routes
const authRoutes = require("./routes/auth");
const productRoutes = require("./routes/product");
const variantRoutes = require("./routes/variantRoutes");
const orderRoutes = require("./routes/orderRoutes");
const addressRoutes = require("./routes/addressRoutes");
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/product", productRoutes);
app.use("/api/v1/variants", variantRoutes);
app.use("/api/v1/orders", orderRoutes);
app.use("/api/v1/addresses", addressRoutes);

// Default route
app.get("/", (req, res) => res.send("API is running 🚀"));

module.exports = app;
