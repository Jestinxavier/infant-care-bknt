const dotenv = require("dotenv");
const path = require("path");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const multer = require("multer");

// ✅ Load environment from root .env file
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

cloudinary.api
  .ping()
  .then((res) => console.log("✅ Cloudinary ping success:", res))
  .catch((err) => console.error("❌ Cloudinary ping failed:", err));

// Debug log
console.log("🌩️ Cloudinary Config Check:", {
  name: process.env.CLOUDINARY_CLOUD_NAME,
  key: process.env.CLOUDINARY_API_KEY
    ? `✅,${process.env.CLOUDINARY_API_KEY}`
    : "❌ Missing",
  secret: process.env.CLOUDINARY_API_SECRET
    ? `✅,${process.env.CLOUDINARY_API_SECRET}`
    : "❌ Missing",
});

// Storage for product images
const productStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "products",
    allowed_formats: ["jpg", "jpeg", "png"],
    transformation: [{ width: 800, height: 800, crop: "limit" }],
  },
});

// Storage for CMS/media uploads (supports more formats including webp)
const mediaStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "cms",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    // No transformation - preserve original dimensions for CMS
  },
});

const parser = multer({ storage: productStorage });
const mediaParser = multer({ storage: mediaStorage });

module.exports = { cloudinary, parser, mediaParser };
