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
  "csv-temp",
  "cms", // legacy fallback
];

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

// Storage for product images (legacy - still used for product form)
const productStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "products",
    allowed_formats: ["jpg", "jpeg", "png"],
    transformation: [{ width: 800, height: 800, crop: "limit" }],
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

const parser = multer({ storage: productStorage });
const mediaParser = multer({ storage: mediaStorage });

module.exports = {
  cloudinary,
  parser,
  mediaParser,
  createDynamicStorage,
  getValidFolder,
  VALID_FOLDERS,
};
