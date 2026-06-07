/**
 * Media Cleanup Service
 * Handles cleanup of stale temporary images from the media server and database.
 */

const cron = require("node-cron");
const { deleteFromMediaServer, isMediaServerUrl, filenameFromUrl } = require("../config/mediaServer");
const Media = require("../models/Media");
const logger = require("../utils/logger");

async function deleteMediaFile(url, publicId) {
  if (isMediaServerUrl(url)) {
    const filename = filenameFromUrl(url);
    if (filename) await deleteFromMediaServer(filename);
  } else if (url && url.includes("cloudinary.com")) {
    try {
      const { cloudinary } = require("../config/cloudinary");
      await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
    } catch (err) {
      logger.warn(`[MediaCleanup] Cloudinary delete failed for ${publicId}:`, err.message);
    }
  }
}

/**
 * Cleanup stale temporary images older than 7 days.
 * Runs daily at 2 AM.
 */
async function cleanupStaleTempImages() {
  try {
    logger.info("🧹 [Media Cleanup] Starting cleanup of stale temp images...");

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const staleTempImages = await Media.find({
      isTemp: true,
      uploadedAt: { $lt: sevenDaysAgo },
    });

    logger.info(
      `📊 [Media Cleanup] Found ${staleTempImages.length} stale temp images`
    );

    if (staleTempImages.length === 0) {
      logger.info("✅ [Media Cleanup] No stale images to clean up");
      return;
    }

    const results = { deleted: [], failed: [] };

    for (const media of staleTempImages) {
      try {
        await deleteMediaFile(media.url, media.public_id);
        await Media.findByIdAndDelete(media._id);
        results.deleted.push(media.public_id);
        logger.info(`✅ [Media Cleanup] Deleted: ${media.public_id}`);
      } catch (error) {
        logger.error(
          `❌ [Media Cleanup] Failed to delete ${media.public_id}:`,
          error
        );
        results.failed.push({
          public_id: media.public_id,
          error: error.message,
        });
      }
    }

    logger.info("✅ [Media Cleanup] Cleanup completed:", {
      deleted: results.deleted.length,
      failed: results.failed.length,
    });
  } catch (error) {
    logger.error("❌ [Media Cleanup] Cleanup error:", error);
  }
}

/**
 * Start the cron job.
 * Runs daily at 2 AM.
 */
function startMediaCleanupCron() {
  const cronExpression = process.env.MEDIA_CLEANUP_CRON || "0 2 * * *";

  logger.info(
    `⏰ [Media Cleanup] Scheduling cron job with expression: ${cronExpression}`
  );

  cron.schedule(cronExpression, async () => {
    logger.info("⏰ [Media Cleanup] Cron job triggered");
    await cleanupStaleTempImages();
  });

  logger.info("✅ [Media Cleanup] Cron job started");

  if (
    process.env.NODE_ENV === "development" &&
    process.env.RUN_CLEANUP_ON_START === "true"
  ) {
    logger.info(
      "🧪 [Media Cleanup] Running cleanup on startup (development mode)"
    );
    cleanupStaleTempImages();
  }
}

module.exports = {
  cleanupStaleTempImages,
  startMediaCleanupCron,
};
