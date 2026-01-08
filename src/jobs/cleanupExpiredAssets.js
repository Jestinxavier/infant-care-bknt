const cron = require("node-cron");
const Asset = require("../models/Asset");
const cloudinary = require("../config/cloudinary");

/**
 * Cleanup expired temporary assets
 * Runs daily at 2:00 AM
 *
 * Deletes assets where:
 * - status = "temp"
 * - expiresAt < NOW()
 * - usedBy.length === 0 (not in use)
 */
const cleanupExpiredAssets = () => {
  // Schedule: Run every day at 2 AM (0 2 * * *)
  cron.schedule("0 2 * * *", async () => {
    try {
      const now = new Date();
      // 1. Cleanup expired temp assets (24h default)
      const expiredTempAssets = await Asset.find({
        status: "temp",
        expiresAt: { $lt: now },
        usedBy: { $size: 0 },
      }).limit(100);

      // 2. Cleanup archived assets (Hard delete after 7 days)
      const archiveRetentionDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
      const expiredArchivedAssets = await Asset.find({
        status: "archived",
        archivedAt: { $lt: archiveRetentionDate },
      }).limit(100);

      const allAssetsToDelete = [
        ...expiredTempAssets,
        ...expiredArchivedAssets,
      ];

      if (allAssetsToDelete.length === 0) {
        console.log("🧹 [Asset Cleanup] No assets to clean up.");
        return;
      }

      console.log(
        `🧹 [Asset Cleanup] Found ${allAssetsToDelete.length} assets to delete (${expiredTempAssets.length} temp, ${expiredArchivedAssets.length} archived).`
      );

      let deletedCount = 0;
      let failedCount = 0;

      for (const asset of allAssetsToDelete) {
        try {
          // Physical Delete from Cloudinary
          await cloudinary.cloudinary.uploader.destroy(asset.publicId, {
            resource_type: "image",
          });

          // Delete from DB
          await Asset.findByIdAndDelete(asset._id);
          console.log(`  ✅ Deleted from DB: ${asset.publicId}`);

          deletedCount++;
        } catch (error) {
          console.error(
            `  ❌ Failed to delete ${asset.publicId}:`,
            error.message
          );
          failedCount++;
        }
      }

      console.log(
        `✅ Cleanup complete: ${deletedCount} deleted, ${failedCount} failed`
      );
    } catch (error) {
      console.error("❌ Cleanup job error:", error);
    }
  });

  console.log("✅ Asset cleanup cron job scheduled (daily at 2 AM)");
};

module.exports = cleanupExpiredAssets;
