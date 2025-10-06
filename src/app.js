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
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/product", productRoutes);

// Default route
app.get("/", (req, res) => res.send("API is running 🚀"));

module.exports = app;
