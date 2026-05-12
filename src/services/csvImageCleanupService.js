/**
 * CSV Image Cleanup Service
 * Handles cleanup of stale temporary CSV images from Cloudinary and database
 * Follows the same pattern as mediaCleanupService.js
 */

const cron = require("node-cron");
const { deleteFromMediaServer, isMediaServerUrl, filenameFromUrl } = require("../config/mediaServer");
const CsvTempImage = require("../models/CsvTempImage");
const logger = require("../utils/logger");

async function deleteCsvImageFile(url, publicId) {
  if (isMediaServerUrl(url)) {
    const filename = filenameFromUrl(url);
    if (filename) await deleteFromMediaServer(filename);
  } else if (url && url.includes("cloudinary.com")) {
    try {
      const { cloudinary } = require("../config/cloudinary");
      const result = await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
      if (result.result !== "ok" && result.result !== "not found") {
        throw new Error(`Cloudinary delete failed: ${result.result}`);
      }
    } catch (err) {
      throw err;
    }
  }
}

/**
 * Cleanup stale CSV temp images older than 7 days
 */
async function cleanupStaleCsvTempImages() {
  try {
    logger.info(
      "🧹 [CSV Cleanup] Starting cleanup of stale CSV temp images..."
    );

    // Find all temp images older than 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const staleImages = await CsvTempImage.find({
      uploadedAt: { $lt: sevenDaysAgo },
    });

    logger.info(
      `📊 [CSV Cleanup] Found ${staleImages.length} stale CSV temp images`
    );

    if (staleImages.length === 0) {
      logger.info("✅ [CSV Cleanup] No stale images to clean up");
      return { deleted: 0, failed: 0 };
    }

    const results = {
      deleted: [],
      failed: [],
    };

    // Delete each stale image
    for (const image of staleImages) {
      try {
        await deleteCsvImageFile(image.url, image.public_id);
        await CsvTempImage.findByIdAndDelete(image._id);
        results.deleted.push(image.temp_key);
        logger.info(`✅ [CSV Cleanup] Deleted: ${image.temp_key}`);
      } catch (error) {
        logger.error(
          `❌ [CSV Cleanup] Failed to delete ${image.temp_key}:`,
          error.message
        );
        results.failed.push({
          temp_key: image.temp_key,
          error: error.message,
        });
      }
    }

    logger.info("✅ [CSV Cleanup] Cleanup completed:", {
      deleted: results.deleted.length,
      failed: results.failed.length,
    });

    return {
      deleted: results.deleted.length,
      failed: results.failed.length,
    };
  } catch (error) {
    logger.error("❌ [CSV Cleanup] Cleanup error:", error);
    return { deleted: 0, failed: 0, error: error.message };
  }
}

/**
 * Start the CSV cleanup cron job
 * Runs daily at 2:15 AM (offset from media cleanup which runs at 2 AM)
 */
function startCsvImageCleanupCron() {
  // Schedule: 15 2 * * * = Every day at 2:15 AM
  const cronExpression = process.env.CSV_IMAGE_CLEANUP_CRON || "15 2 * * *";

  logger.info(
    `⏰ [CSV Cleanup] Scheduling cron job with expression: ${cronExpression}`
  );

  cron.schedule(cronExpression, async () => {
    logger.info("⏰ [CSV Cleanup] Cron job triggered");
    await cleanupStaleCsvTempImages();
  });

  logger.info("✅ [CSV Cleanup] Cron job started");

  // Run immediately on startup if in development (for testing)
  if (
    process.env.NODE_ENV === "development" &&
    process.env.RUN_CSV_CLEANUP_ON_START === "true"
  ) {
    logger.info(
      "🧪 [CSV Cleanup] Running cleanup on startup (development mode)"
    );
    cleanupStaleCsvTempImages();
  }
}

module.exports = {
  cleanupStaleCsvTempImages,
  startCsvImageCleanupCron,
};
