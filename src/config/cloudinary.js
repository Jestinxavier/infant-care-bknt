const dotenv = require("dotenv");
const path = require("path");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const multer = require("multer");

// ✅ Load environment before configuring Cloudinary
const envFile =
  process.env.NODE_ENV === "production"
    ? "production.env"
    : "development.env";

dotenv.config({ path: path.resolve(__dirname, `../config/${envFile}`) });

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

cloudinary.api.ping()
  .then(res => console.log("✅ Cloudinary ping success:", res))
  .catch(err => console.error("❌ Cloudinary ping failed:", err));

// Debug log
console.log("🌩️ Cloudinary Config Check:", {
  name: process.env.CLOUDINARY_CLOUD_NAME,
  key: process.env.CLOUDINARY_API_KEY ? `✅,${process.env.CLOUDINARY_API_KEY}` : "❌ Missing",
  secret: process.env.CLOUDINARY_API_SECRET ? `✅,${process.env.CLOUDINARY_API_SECRET}` : "❌ Missing",
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "products",
    allowed_formats: ["jpg", "jpeg", "png"],
    transformation: [{ width: 800, height: 800, crop: "limit" }],
  },
});

const parser = multer({ storage });

module.exports = { cloudinary, parser };

