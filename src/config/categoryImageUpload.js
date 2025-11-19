const dotenv = require("dotenv");
const path = require("path");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const multer = require("multer");

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const categoryImageStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    return {
      folder: "categories", // Specific folder for category images
      format: "png", // Force PNG format
      public_id: `category_${Date.now()}_${Math.random().toString(36).substring(7)}`, // Unique ID
      transformation: [
        { width: 400, height: 400, crop: "fill", gravity: "center" }, // Square crop
        { quality: "auto:eco" } // Auto quality for smaller file size
      ],
    };
  },
});

const categoryImageUploader = multer({
  storage: categoryImageStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB file size limit
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
  },
});

module.exports = { categoryImageUploader };

