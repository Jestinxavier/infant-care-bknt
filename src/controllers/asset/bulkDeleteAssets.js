const cloudinary = require("../../config/cloudinary");
const Asset = require("../../models/Asset");

/**
 * Bulk Delete Assets
 * POST /api/admin/assets/bulk-delete
 * Body: { ids: string[], force: boolean }
 * ids can be ObjectIds or publicIds
 */
const bulkDeleteAssets = async (req, res) => {
  try {
    const { ids, force } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No IDs provided for deletion",
      });
    }

    const results = {
      deleted: [],
      archived: [],
      failed: [],
    };

    console.log(
      `🗑️ Processing bulk delete for ${ids.length} assets (force=${force})`,
    );

    for (const id of ids) {
      try {
        let asset = null;
        const mongoose = require("mongoose");

        // Try finding by ObjectId
        if (!id.includes("/") && mongoose.Types.ObjectId.isValid(id)) {
          asset = await Asset.findById(id);
        }

        // If not found by ID, try finding by publicId
        if (!asset) {
          asset = await Asset.findOne({ publicId: id });
        }

        if (!asset) {
          // If asset not in DB, try to force delete from Cloudinary if it looks like a publicId
          // This handles legacy/untracked assets
          try {
            if (id.includes("/")) {
              // Basic heuristic for publicId
              await cloudinary.cloudinary.uploader.destroy(id);
              results.deleted.push({ id, status: "legacy_deleted" });
            } else {
              results.failed.push({ id, error: "Asset not found" });
            }
          } catch (e) {
            results.failed.push({
              id,
              error: "Asset not found and cloudinary failed: " + e.message,
            });
          }
          continue;
        }

        // Handle permanent assets
        if (asset.status === "permanent") {
          if (force) {
            asset.status = "archived";
            asset.archivedAt = new Date();
            asset.usedBy = [];
            await asset.save();
            results.archived.push(asset.publicId);
          } else {
            results.failed.push({
              id: asset.publicId,
              error: "Permanent asset (use force=true)",
            });
          }
          continue;
        }

        // Block if in use
        if (asset.usedBy.length > 0) {
          results.failed.push({ id: asset.publicId, error: "Asset in use" });
          continue;
        }

        // Delete from Cloudinary
        try {
          await cloudinary.cloudinary.uploader.destroy(asset.publicId);
        } catch (cloudError) {
          console.warn(
            `Cloudinary delete failed for ${asset.publicId}: ${cloudError.message}`,
          );
          // Continue to DB delete
        }

        // Delete from DB
        await Asset.findByIdAndDelete(asset._id);
        results.deleted.push(asset.publicId);
      } catch (error) {
        console.error(`Error deleting ${id}:`, error);
        results.failed.push({ id, error: error.message });
      }
    }

    res.status(200).json({
      success: true,
      message: `Bulk deletion complete. Deleted: ${results.deleted.length}, Archived: ${results.archived.length}, Failed: ${results.failed.length}`,
      results,
    });
  } catch (error) {
    console.error("❌ Error in bulk delete:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

module.exports = { bulkDeleteAssets };
