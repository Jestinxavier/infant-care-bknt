const dotenv = require("dotenv");
const path = require("path");
const cloudinary = require("cloudinary").v2;
const logger = require("../utils/logger");

/**
 * Cloudinary client, kept only to delete and clean up images that were
 * uploaded to Cloudinary before the move to the self-hosted media server.
 * All new uploads go through config/mediaServer.js (which exports the
 * parser / mediaParser / tempParser used by the routes).
 *
 * The multer-storage-cloudinary upload storages that used to live here were
 * unused, and that package pinned the SDK to the old 1.x line, so they were
 * removed with the upgrade to cloudinary 2.x.
 */

// ✅ Load environment from root .env file
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  timeout: 30000, // 30s — prevents requests hanging indefinitely
});

cloudinary.api
  .ping()
  .then(() => logger.info("Cloudinary connected"))
  .catch((err) => logger.error("Cloudinary ping failed", { error: err.message }));

module.exports = { cloudinary };
