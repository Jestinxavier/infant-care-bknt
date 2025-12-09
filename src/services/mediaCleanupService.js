/**
 * Media Cleanup Service
 * Handles cleanup of stale temporary images from Cloudinary and database
 */

const cron = require("node-cron");
const { cloudinary } = require("../config/cloudinary");
const Media = require("../models/Media");

/**
 * Cleanup stale temporary images older than 24 hours
 * Runs daily at 2 AM
 */
async function cleanupStaleTempImages() {
  try {
    console.log("🧹 [Media Cleanup] Starting cleanup of stale temp images...");

    // Find all temp images older than 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const staleTempImages = await Media.find({
      isTemp: true,
      uploadedAt: { $lt: twentyFourHoursAgo },
    });

    console.log(
      `📊 [Media Cleanup] Found ${staleTempImages.length} stale temp images`
    );

    if (staleTempImages.length === 0) {
      console.log("✅ [Media Cleanup] No stale images to clean up");
      return;
    }

    const results = {
      deleted: [],
      failed: [],
    };

    // Delete each stale image
    for (const media of staleTempImages) {
      try {
        // Delete from Cloudinary
        const result = await cloudinary.uploader.destroy(media.public_id, {
          resource_type: "image",
        });

        if (result.result === "ok" || result.result === "not found") {
          // Remove from database
          await Media.findByIdAndDelete(media._id);
          results.deleted.push(media.public_id);
          console.log(`✅ [Media Cleanup] Deleted: ${media.public_id}`);
        } else {
          throw new Error(`Cloudinary delete failed: ${result.result}`);
        }
      } catch (error) {
        console.error(
          `❌ [Media Cleanup] Failed to delete ${media.public_id}:`,
          error
        );
        results.failed.push({
          public_id: media.public_id,
          error: error.message,
        });
      }
    }

    // Also clean up any Cloudinary assets with temp-upload tag that are older than 24h
    // This catches any images that might not be in our DB
    try {
      const cloudinaryResources = await cloudinary.api.resources_by_tag(
        "temp-upload",
        {
          resource_type: "image",
          max_results: 500, // Cloudinary API limit
        }
      );

      const staleCloudinaryAssets = cloudinaryResources.resources.filter(
        (resource) => {
          const createdAt = new Date(resource.created_at);
          return createdAt < twentyFourHoursAgo;
        }
      );

      console.log(
        `📊 [Media Cleanup] Found ${staleCloudinaryAssets.length} stale assets in Cloudinary with temp-upload tag`
      );

      for (const asset of staleCloudinaryAssets) {
        try {
          // Check if already deleted from DB
          const existsInDb = await Media.findOne({
            public_id: asset.public_id,
          });

          if (!existsInDb) {
            // Not in DB, safe to delete
            const result = await cloudinary.uploader.destroy(asset.public_id, {
              resource_type: "image",
            });

            if (result.result === "ok") {
              console.log(
                `✅ [Media Cleanup] Deleted orphaned Cloudinary asset: ${asset.public_id}`
              );
            }
          }
        } catch (error) {
          console.error(
            `❌ [Media Cleanup] Failed to delete Cloudinary asset ${asset.public_id}:`,
            error
          );
        }
      }
    } catch (cloudinaryError) {
      console.warn(
        "⚠️ [Media Cleanup] Could not query Cloudinary by tag:",
        cloudinaryError
      );
    }

    console.log("✅ [Media Cleanup] Cleanup completed:", {
      deleted: results.deleted.length,
      failed: results.failed.length,
    });
  } catch (error) {
    console.error("❌ [Media Cleanup] Cleanup error:", error);
  }
}

/**
 * Start the cron job
 * Runs daily at 2 AM
 */
function startMediaCleanupCron() {
  // Schedule: 0 2 * * * = Every day at 2:00 AM
  const cronExpression = process.env.MEDIA_CLEANUP_CRON || "0 2 * * *";

  console.log(
    `⏰ [Media Cleanup] Scheduling cron job with expression: ${cronExpression}`
  );

  cron.schedule(cronExpression, async () => {
    console.log("⏰ [Media Cleanup] Cron job triggered");
    await cleanupStaleTempImages();
  });

  console.log("✅ [Media Cleanup] Cron job started");

  // Run immediately on startup if in development (for testing)
  if (
    process.env.NODE_ENV === "development" &&
    process.env.RUN_CLEANUP_ON_START === "true"
  ) {
    console.log(
      "🧪 [Media Cleanup] Running cleanup on startup (development mode)"
    );
    cleanupStaleTempImages();
  }
}

module.exports = {
  cleanupStaleTempImages,
  startMediaCleanupCron,
};
