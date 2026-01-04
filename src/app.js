const express = require("express");
const cors = require("cors");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./config/swagger");
const cookieParser = require("cookie-parser");
require("dotenv").config();
const app = express();
// ✅ CORS setup - Allow localhost from any port + production origins

console.log(process.env.FRONTEND_URL, " 😂");
console.log(process.env.DASHBOARD_URL, " 😂 ");
const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.DASHBOARD_URL,
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:3000",
  "http://localhost:3001",
]
  .filter(Boolean)
  .map((url) => url.trim().replace(/\/$/, ""));

const corsOptions = {
  origin(origin, callback) {
    // In development or if it's a known localhost/whitelisted origin, allow it
    if (!origin || process.env.NODE_ENV === "development") {
      return callback(null, true);
    }

    const normalizedOrigin = origin.trim().replace(/\/$/, "");
    const isLocalhost =
      normalizedOrigin.startsWith("http://localhost:") ||
      normalizedOrigin.startsWith("http://127.0.0.1:") ||
      normalizedOrigin === "http://localhost" ||
      normalizedOrigin === "http://127.0.0.1";

    if (isLocalhost || allowedOrigins.includes(normalizedOrigin)) {
      return callback(null, true);
    }

    console.error(`❌ CORS blocked: ${origin}`);
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
    "Origin",
    "x-cart-id",
    "x-guest-cart-id",
    "X-Client-Type",
    "X-Platform",
    "Access-Control-Allow-Origin",
    "idempotency-key",
  ],
  exposedHeaders: ["set-cookie"],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));

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
const faqRoutes = require("./routes/faqRoutes");
const faqCategoryRoutes = require("./routes/faqCategoryRoutes");
const siteSettingsRoutes = require("./routes/siteSettingsRoutes");

// New feature-based CMS routes
const cmsAdminRoutes = require("./features/cms/cms.admin.routes");
const cmsPublicRoutes = require("./features/cms/cms.routes");
const cmsProductRoutes = require("./features/product/product.cms.routes");

// Admin routes - using environment variable for prefix
const adminRoutes = require("./routes/adminRoutes");
const deliveryPartnerRoutes = require("./routes/deliveryPartnerRoutes");
const assetRoutes = require("./routes/asset");
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
app.use("/api/v1/faqs", faqRoutes);
app.use("/api/v1/stock-notify", require("./routes/stockNotificationRoutes"));
app.use("/api/v1/settings", siteSettingsRoutes); // Public settings endpoint
// CMS product routes (lightweight for widgets) - Must be before general /cms route
app.use("/api/v1/cms/products", cmsProductRoutes);
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

// FAQ Category Management (Admin only)
app.use(`/api/v1${ADMIN_PREFIX}/faq-categories`, faqCategoryRoutes);

// Site Settings Management (Admin only)
app.use(`/api/v1${ADMIN_PREFIX}/settings`, siteSettingsRoutes);

// CSV temp image routes under admin
const csvImageRoutes = require("./routes/csvImageRoutes");
app.use(`/api/v1${ADMIN_PREFIX}/csv-images`, csvImageRoutes);

// Asset management routes under admin
app.use(`/api/v1${ADMIN_PREFIX}/assets`, assetRoutes);

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
    "API is running 🚀\n\nAPI Documentation: <a href='/api-docs'>http://localhost:5001/api-docs</a>"
  )
);

const {
  checkOrderStatus,
  phonepeWebhook,
} = require("./controllers/payment/phonepeSDK");

app.get("/order-confirmation", checkOrderStatus);

app.post(
  "/api/webhooks/phonepe",
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf.toString();
    },
  }),
  phonepeWebhook
);

module.exports = app;
