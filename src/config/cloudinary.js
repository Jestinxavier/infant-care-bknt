const dotenv = require("dotenv");
const path = require("path");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const multer = require("multer");
const logger = require("../utils/logger");

// ✅ Load environment from root .env file
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  timeout: 30000, // 30s — prevents upload requests hanging indefinitely
});

cloudinary.api
  .ping()
  .then(() => logger.info("Cloudinary connected"))
  .catch((err) => logger.error("Cloudinary ping failed", { error: err.message }));

// Valid folder names for security (prevent arbitrary folder creation)
const VALID_FOLDERS = [
  "products",
  "cms-home",
  "cms-about",
  "avatar",
  "temp",
  "temporary", // Alias for temp
  "assets", // For CSV imported images
  "category",
  "cms", // legacy fallback
];

// NOTE: Upload-time transformations have been REMOVED per design rules.
// All image optimization (format, quality, size) happens at DELIVERY time
// via frontend URL transformations in cloudinary-transform.ts

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

// Storage for product images - STRICT: NO TRANSFORMATIONS ALLOWED
// Uploads must store the original file bytes as-is.
// No resizing, no eager transformations, no format conversion.
// Format conversion happens ONLY at delivery time via frontend.
const productStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "products",
    allowed_formats: ["jpg", "jpeg", "png", "webp"], // Validation only
    // NO format conversion - preserve original
    // NO transformation - preserve original resolution
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

const imageFileFilter = (req, file, cb) => {
  if (!file.mimetype.startsWith("image/")) {
    return cb(new Error("Only image files are allowed"), false);
  }
  cb(null, true);
};

const parser = multer({
  storage: productStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: imageFileFilter,
});
const mediaParser = multer({
  storage: mediaStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: imageFileFilter,
});
const tempParser = multer({
  storage: tempStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: imageFileFilter,
});

module.exports = {
  cloudinary,
  parser,
  mediaParser,
  tempParser,
  createDynamicStorage,
  getValidFolder,
  VALID_FOLDERS,
};
