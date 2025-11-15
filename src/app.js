const express = require("express");
const cors = require("cors");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./config/swagger");
const cookieParser = require("cookie-parser");

const app = express();
// ✅ CORS setup
app.use(
  cors({
    origin: "http://localhost:3000", // frontend URLs (React, Vite, etc.)
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

// Cookie Parser Middleware
app.use(cookieParser());

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
const healthRoutes = require("./routes/healthRoutes");
const homepageRoutes = require("./routes/homepageRoutes");

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/product", productRoutes);
app.use("/api/v1/variants", variantRoutes);
app.use("/api/v1/orders", orderRoutes);
app.use("/api/v1/addresses", addressRoutes);
app.use("/api/v1/review", reviewRoutes);
app.use("/api/v1/payments", paymentRoutes);
app.use("/api/v1/health", healthRoutes);
app.use("/api/v1/homepage", homepageRoutes);

// Swagger API Documentation
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customCss: ".swagger-ui .topbar { display: none }",
    customSiteTitle: "Online Shopping API Docs",
  })
);

// Default route
app.get("/", (req, res) =>
  res.send(
    "API is running 🚀\n\nAPI Documentation: <a href='/api-docs'>http://localhost:5000/api-docs</a>"
  )
);

module.exports = app;
