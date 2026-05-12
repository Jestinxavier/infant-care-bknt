const { deleteFromMediaServer, isMediaServerUrl, filenameFromUrl } = require("../../config/mediaServer");
const Asset = require("../../models/Asset");
const logger = require("../../utils/logger");

async function deleteAssetFile(secureUrl, publicId) {
  if (isMediaServerUrl(secureUrl)) {
    const filename = filenameFromUrl(secureUrl);
    if (filename) await deleteFromMediaServer(filename);
  } else if (secureUrl && secureUrl.includes("cloudinary.com")) {
    try {
      const { cloudinary } = require("../../config/cloudinary");
      await cloudinary.uploader.destroy(publicId);
    } catch (err) {
      logger.warn(`[bulkDelete] Cloudinary delete failed for ${publicId}:`, err.message);
    }
  }
}

/**
 * Bulk Delete Assets
 * POST /api/admin/assets/bulk-delete
 * Body: { ids: string[], force: boolean }
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

    logger.info(
      `🗑️ Processing bulk delete for ${ids.length} assets (force=${force})`,
    );

    for (const id of ids) {
      try {
        let asset = null;
        const mongoose = require("mongoose");

        if (!id.includes("/") && mongoose.Types.ObjectId.isValid(id)) {
          asset = await Asset.findById(id);
        }

        if (!asset) {
          asset = await Asset.findOne({ publicId: id });
        }

        if (!asset) {
          // Try to delete untracked legacy asset by publicId heuristic
          if (id.includes("/")) {
            try {
              const { cloudinary } = require("../../config/cloudinary");
              await cloudinary.uploader.destroy(id);
              results.deleted.push({ id, status: "legacy_deleted" });
            } catch (e) {
              results.failed.push({
                id,
                error: "Asset not found and storage delete failed: " + e.message,
              });
            }
          } else {
            results.failed.push({ id, error: "Asset not found" });
          }
          continue;
        }

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

        if (asset.usedBy.length > 0) {
          results.failed.push({ id: asset.publicId, error: "Asset in use" });
          continue;
        }

        try {
          await deleteAssetFile(asset.secureUrl, asset.publicId);
        } catch (storageError) {
          logger.warn(
            `Storage delete failed for ${asset.publicId}: ${storageError.message}`,
          );
        }

        await Asset.findByIdAndDelete(asset._id);
        results.deleted.push(asset.publicId);
      } catch (error) {
        logger.error(`Error deleting ${id}:`, error);
        results.failed.push({ id, error: error.message });
      }
    }

    res.status(200).json({
      success: true,
      message: `Bulk deletion complete. Deleted: ${results.deleted.length}, Archived: ${results.archived.length}, Failed: ${results.failed.length}`,
      results,
    });
  } catch (error) {
    logger.error("❌ Error in bulk delete:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

module.exports = { bulkDeleteAssets };
