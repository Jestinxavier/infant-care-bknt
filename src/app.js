const express = require("express");
const cors = require("cors");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./config/swagger");
const cookieParser = require("cookie-parser");

const app = express();
// ✅ CORS setup - Allow multiple origins for frontend and dashboard
const allowedOrigins = [
  "http://localhost:3000", // Next.js frontend
  "http://localhost:3001", // Backend API port
  "http://localhost:5173", // Vite default port
  "http://localhost:5174", // Vite alternate port
  "http://localhost:4173", // Vite preview port
  "https://infant-care.vercel.app", // Production frontend (Vercel)
  process.env.FRONTEND_URL,
  process.env.DASHBOARD_URL,
].filter(Boolean); // Remove undefined values

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      // Check if origin is in allowed list
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        // In development, allow all origins for easier testing
        if (process.env.NODE_ENV === "development") {
          console.log(`⚠️  Allowing CORS from: ${origin} (development mode)`);
          callback(null, true);
        } else {
          callback(new Error("Not allowed by CORS"));
        }
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    credentials: true,
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "x-cart-id",
      "X-Client-Type",
      "Access-Control-Allow-Origin",
    ],
  })
);

// Cookie Parser Middleware
app.use(cookieParser());

// Middleware
app.use(express.json());

// Routes
const authRoutes = require("./routes/auth");
const productRoutes = require("./routes/product");
const categoryRoutes = require("./routes/categoryRoutes");
const variantRoutes = require("./routes/variantRoutes");
const filterRoutes = require("./routes/filterRoutes");
const hybridCartRoutes = require("./routes/hybridCartRoutes");
const orderRoutes = require("./routes/orderRoutes");
const addressRoutes = require("./routes/addressRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const healthRoutes = require("./routes/healthRoutes");
const homepageRoutes = require("./routes/homepageRoutes");
const footerRoutes = require("./routes/footerRoutes");
// Old CMS routes (keeping for backward compatibility if needed)
// const cmsRoutes = require("./routes/cmsRoutes");

// New feature-based CMS routes
const cmsAdminRoutes = require("./features/cms/cms.admin.routes");
const cmsPublicRoutes = require("./features/cms/cms.routes");

// Admin routes - using environment variable for prefix
const adminRoutes = require("./routes/adminRoutes");
const deliveryPartnerRoutes = require("./routes/deliveryPartnerRoutes");
const ADMIN_PREFIX = process.env.ADMIN_API_PREFIX || "/admin";

// Storefront routes (unchanged)
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/product", productRoutes);
app.use("/api/v1/category", categoryRoutes);
app.use("/api/v1/variants", variantRoutes);
app.use("/api/v1/filter", filterRoutes);
app.use("/api/v1/cart", hybridCartRoutes);
app.use("/api/v1/orders", orderRoutes);
app.use("/api/v1/addresses", addressRoutes);
app.use("/api/v1/review", reviewRoutes);
app.use("/api/v1/payments", paymentRoutes);
app.use("/api/v1/health", healthRoutes);
app.use("/api/v1/homepage", homepageRoutes);
app.use("/api/v1/footer", footerRoutes);
// Public CMS routes (for frontend)
app.use("/api/v1/cms", cmsPublicRoutes);

// Admin routes - mounted with configurable prefix
app.use(`/api/v1${ADMIN_PREFIX}`, adminRoutes);
app.use(`/api/v1${ADMIN_PREFIX}/delivery-partners`, deliveryPartnerRoutes);
// CMS routes under admin (using new feature-based routes)
app.use(`/api/v1${ADMIN_PREFIX}/cms`, cmsAdminRoutes);
// Media routes under admin
const mediaRoutes = require("./routes/mediaRoutes");
app.use(`/api/v1${ADMIN_PREFIX}/media`, mediaRoutes);

// CSV temp image routes under admin
const csvImageRoutes = require("./routes/csvImageRoutes");
app.use(`/api/v1${ADMIN_PREFIX}/csv-images`, csvImageRoutes);

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
