const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');

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
const reviewRoutes = require("./routes/reviewRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/product", productRoutes);
app.use("/api/v1/variants", variantRoutes);
app.use("/api/v1/orders", orderRoutes);
app.use("/api/v1/addresses", addressRoutes);
app.use("/api/v1/review", reviewRoutes);
app.use("/api/v1/payments", paymentRoutes);

// Swagger API Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Online Shopping API Docs',
}));

// Default route
app.get("/", (req, res) => res.send("API is running 🚀\n\nAPI Documentation: <a href='/api-docs'>http://localhost:5000/api-docs</a>"));

module.exports = app;
