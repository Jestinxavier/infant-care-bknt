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

// Valid folder names for security (prevent arbitrary folder creation)
const VALID_FOLDERS = [
  "products",
  "cms-home",
  "cms-about",
  "avatar",
  "temp",
  "category",
  "cms", // legacy fallback
];

/**
 * Image transformation presets for different image types
 * All images are automatically converted to WebP for optimal compression
 */
const IMAGE_TRANSFORMATIONS = {
  product: {
    format: "webp",
    quality: "auto:good", // Cloudinary auto-quality optimization
    fetch_format: "auto", // Auto-select best format for browser
  },
  banner_desktop: {
    format: "webp",
    quality: "auto:good",
    width: 1920,
    crop: "limit", // Don't upscale, only downscale if needed
  },
  banner_mobile: {
    format: "webp",
    quality: "auto:good",
    width: 1200,
    crop: "limit",
  },
  category: {
    format: "webp",
    quality: "auto:good",
    width: 800,
    crop: "limit",
  },
  default: {
    format: "webp",
    quality: "auto:good",
  },
};

/**
 * Get a valid folder name or fallback to default
 * @param {string} folder - Requested folder name
 * @returns {string} - Valid folder name
 */
const getValidFolder = (folder) => {
  if (folder && VALID_FOLDERS.includes(folder)) {
    return folder;
  }
  return "uploads"; // Default fallback folder
};

/**
 * Get transformation preset for image type
 * @param {string} imageType - Type of image (product, banner_desktop, banner_mobile, category)
 * @returns {object} - Cloudinary transformation object
 */
const getImageTransformation = (imageType) => {
  return IMAGE_TRANSFORMATIONS[imageType] || IMAGE_TRANSFORMATIONS.default;
};

/**
 * Create a dynamic CloudinaryStorage for a specific folder
 * @param {string} folder - Target folder in Cloudinary
 */
const createDynamicStorage = (folder) => {
  return new CloudinaryStorage({
    cloudinary,
    params: {
      folder: getValidFolder(folder),
      allowed_formats: ["jpg", "jpeg", "png", "webp"],
    },
  });
};

// Storage for product images - no transformation (client-side compression handles sizing)
const productStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "products",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    // Note: Removed transformation - dashboard compresses to 1200px before upload
    // Cloudinary will serve optimized WebP on demand via URL transformations
  },
});

// Storage for CMS/media uploads (legacy - used when no folder specified)
const mediaStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "cms",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
  },
});

// Storage for temporary CSV uploads
const tempStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "temp",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
  },
});

const parser = multer({ storage: productStorage });
const mediaParser = multer({ storage: mediaStorage });
const tempParser = multer({ storage: tempStorage });

module.exports = {
  cloudinary,
  parser,
  mediaParser,
  tempParser,
  createDynamicStorage,
  getValidFolder,
  VALID_FOLDERS,
  IMAGE_TRANSFORMATIONS,
  getImageTransformation,
};
