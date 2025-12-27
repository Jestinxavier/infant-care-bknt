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
      console.log("🧹 Starting expired asset cleanup job...");

      // Find expired temp assets that are not in use
      const expiredAssets = await Asset.find({
        status: "temp",
        expiresAt: { $lt: new Date() },
        usedBy: { $size: 0 },
      });

      console.log(`Found ${expiredAssets.length} expired assets to clean up`);

      let deletedCount = 0;
      let failedCount = 0;

      for (const asset of expiredAssets) {
        try {
          console.log(`🗑️ Deleting expired asset: ${asset.publicId}`);

          // Delete from Cloudinary
          try {
            await cloudinary.cloudinary.uploader.destroy(asset.publicId);
            console.log(`  ✅ Deleted from Cloudinary: ${asset.publicId}`);
          } catch (cloudinaryError) {
            console.error(
              `  ⚠️ Cloudinary deletion failed for ${asset.publicId}:`,
              cloudinaryError.message
            );
            // Continue with DB deletion even if Cloudinary fails
          }

          // Delete from database
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
