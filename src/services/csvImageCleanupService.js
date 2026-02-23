/**
 * CSV Image Cleanup Service
 * Handles cleanup of stale temporary CSV images from Cloudinary and database
 * Follows the same pattern as mediaCleanupService.js
 */

const cron = require("node-cron");
const { cloudinary } = require("../config/cloudinary");
const CsvTempImage = require("../models/CsvTempImage");

/**
 * Cleanup stale CSV temp images older than 7 days
 */
async function cleanupStaleCsvTempImages() {
  try {
    console.log(
      "🧹 [CSV Cleanup] Starting cleanup of stale CSV temp images..."
    );

    // Find all temp images older than 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const staleImages = await CsvTempImage.find({
      uploadedAt: { $lt: sevenDaysAgo },
    });

    console.log(
      `📊 [CSV Cleanup] Found ${staleImages.length} stale CSV temp images`
    );

    if (staleImages.length === 0) {
      console.log("✅ [CSV Cleanup] No stale images to clean up");
      return { deleted: 0, failed: 0 };
    }

    const results = {
      deleted: [],
      failed: [],
    };

    // Delete each stale image
    for (const image of staleImages) {
      try {
        // Delete from Cloudinary
        const result = await cloudinary.uploader.destroy(image.public_id, {
          resource_type: "image",
        });

        if (result.result === "ok" || result.result === "not found") {
          // Remove from database
          await CsvTempImage.findByIdAndDelete(image._id);
          results.deleted.push(image.temp_key);
          console.log(`✅ [CSV Cleanup] Deleted: ${image.temp_key}`);
        } else {
          throw new Error(`Cloudinary delete failed: ${result.result}`);
        }
      } catch (error) {
        console.error(
          `❌ [CSV Cleanup] Failed to delete ${image.temp_key}:`,
          error.message
        );
        results.failed.push({
          temp_key: image.temp_key,
          error: error.message,
        });
      }
    }

    console.log("✅ [CSV Cleanup] Cleanup completed:", {
      deleted: results.deleted.length,
      failed: results.failed.length,
    });

    return {
      deleted: results.deleted.length,
      failed: results.failed.length,
    };
  } catch (error) {
    console.error("❌ [CSV Cleanup] Cleanup error:", error);
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

  console.log(
    `⏰ [CSV Cleanup] Scheduling cron job with expression: ${cronExpression}`
  );

  cron.schedule(cronExpression, async () => {
    console.log("⏰ [CSV Cleanup] Cron job triggered");
    await cleanupStaleCsvTempImages();
  });

  console.log("✅ [CSV Cleanup] Cron job started");

  // Run immediately on startup if in development (for testing)
  if (
    process.env.NODE_ENV === "development" &&
    process.env.RUN_CSV_CLEANUP_ON_START === "true"
  ) {
    console.log(
      "🧪 [CSV Cleanup] Running cleanup on startup (development mode)"
    );
    cleanupStaleCsvTempImages();
  }
}

module.exports = {
  cleanupStaleCsvTempImages,
  startCsvImageCleanupCron,
};
