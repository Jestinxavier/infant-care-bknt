const cron = require("node-cron");
const Asset = require("../models/Asset");
const cloudinary = require("../config/cloudinary");
const logger = require("../utils/logger");

/**
 * Cleanup expired temporary assets
 * Runs daily at 2:00 AM (cron) or can be called manually
 *
 * Deletes assets where:
 * - status = "temp" and expiresAt < NOW() and usedBy.length === 0
 * - status = "archived" and archivedAt < 7 days ago
 */

/**
 * Execute the cleanup logic (shared by cron and manual trigger)
 * @param {Object} options - Cleanup options
 * @param {boolean} options.dryRun - If true, only report what would be deleted
 * @returns {Object} - Cleanup results
 */
const executeCleanup = async (options = {}) => {
  const { dryRun = false } = options;
  const now = new Date();
  const results = {
    tempAssetsFound: 0,
    archivedAssetsFound: 0,
    deletedCount: 0,
    failedCount: 0,
    errors: [],
    deletedAssets: [],
  };

  try {
    // 1. Find expired temp assets (7-day default)
    const expiredTempAssets = await Asset.find({
      status: "temp",
      expiresAt: { $lt: now },
      usedBy: { $size: 0 },
    }).limit(500); // Increased limit for backlog

    results.tempAssetsFound = expiredTempAssets.length;

    // 2. Find archived assets for hard delete (older than 7 days)
    const archiveRetentionDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const expiredArchivedAssets = await Asset.find({
      status: "archived",
      archivedAt: { $lt: archiveRetentionDate },
    }).limit(100);

    results.archivedAssetsFound = expiredArchivedAssets.length;

    const allAssetsToDelete = [...expiredTempAssets, ...expiredArchivedAssets];

    if (allAssetsToDelete.length === 0) {
      logger.info("🧹 [Asset Cleanup] No assets to clean up.");
      return results;
    }

    logger.info(
      `🧹 [Asset Cleanup] Found ${allAssetsToDelete.length} assets to delete (${expiredTempAssets.length} temp, ${expiredArchivedAssets.length} archived).`
    );

    if (dryRun) {
      logger.info("🔍 [Dry Run] Would delete the following assets:");
      allAssetsToDelete.forEach((asset) => {
        logger.info(`  - ${asset.publicId} (${asset.status})`);
        results.deletedAssets.push({
          publicId: asset.publicId,
          status: asset.status,
          expiresAt: asset.expiresAt,
          archivedAt: asset.archivedAt,
        });
      });
      return results;
    }

    // Process deletions
    for (const asset of allAssetsToDelete) {
      try {
        // Physical Delete from Cloudinary (use asset's resourceType when stored)
        const resourceType = asset.resourceType || "image";
        await cloudinary.cloudinary.uploader.destroy(asset.publicId, {
          resource_type: resourceType,
        });

        // Delete from DB
        await Asset.findByIdAndDelete(asset._id);
        logger.info(`  ✅ Deleted: ${asset.publicId}`);

        results.deletedCount++;
        results.deletedAssets.push({
          publicId: asset.publicId,
          status: asset.status,
        });
      } catch (error) {
        logger.error(
          `  ❌ Failed to delete ${asset.publicId}:`,
          error.message
        );
        results.failedCount++;
        results.errors.push({
          publicId: asset.publicId,
          error: error.message,
        });
      }
    }

    logger.info(
      `✅ Cleanup complete: ${results.deletedCount} deleted, ${results.failedCount} failed`
    );

    return results;
  } catch (error) {
    logger.error("❌ Cleanup execution error:", error);
    results.errors.push({ error: error.message });
    throw error;
  }
};

/**
 * Start the cron job for scheduled cleanup
 */
const startCleanupCron = () => {
  // Schedule: Run every day at 2 AM (0 2 * * *)
  cron.schedule("0 2 * * *", async () => {
    logger.info("🕐 [Asset Cleanup] Cron job triggered at 2 AM");
    try {
      await executeCleanup();
    } catch (error) {
      logger.error("❌ Cron cleanup job error:", error);
    }
  });

  logger.info("✅ Asset cleanup cron job scheduled (daily at 2 AM)");
};

/**
 * Run cleanup once (e.g. on server startup) so expired temp assets are removed
 * even if the 2 AM cron has not run yet.
 */
const runCleanupOnStartup = () => {
  const delayMs = 30 * 1000; // 30 seconds after startup
  setTimeout(async () => {
    try {
      logger.info("🧹 [Asset Cleanup] Running startup cleanup...");
      await executeCleanup();
      logger.info("🧹 [Asset Cleanup] Startup cleanup finished.");
    } catch (error) {
      logger.error("❌ [Asset Cleanup] Startup cleanup error:", error.message);
    }
  }, delayMs);
};

// Default export for backward compatibility (starts cron)
module.exports = startCleanupCron;

// Named exports for manual triggering and startup
module.exports.executeCleanup = executeCleanup;
module.exports.startCleanupCron = startCleanupCron;
module.exports.runCleanupOnStartup = runCleanupOnStartup;
