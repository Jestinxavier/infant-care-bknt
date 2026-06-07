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
      logger.warn(`[deleteAsset] Cloudinary delete failed for ${publicId}:`, err.message);
    }
  }
}

/**
 * Delete asset (only if temp and not in use)
 * DELETE /api/admin/assets/:id
 * Query params:
 *   - force=true: Archive permanent assets for delayed deletion (7-day retention)
 */
const deleteAsset = async (req, res) => {
  try {
    const { id } = req.params;
    const { force } = req.query;
    const mongoose = require("mongoose");

    let asset = null;

    if (!id.includes("/") && mongoose.Types.ObjectId.isValid(id)) {
      try {
        asset = await Asset.findById(id);
      } catch (error) {
        logger.info(`ID ${id} is not a valid ObjectId, trying publicId`);
      }
    }

    if (!asset) {
      asset = await Asset.findOne({ publicId: id });
    }

    if (!asset) {
      return res.status(404).json({
        success: false,
        message: "Asset not found",
      });
    }

    if (asset.status === "permanent") {
      if (force === "true") {
        asset.status = "archived";
        asset.archivedAt = new Date();
        asset.usedBy = [];
        await asset.save();

        logger.info(`📦 Asset archived for delayed deletion: ${asset.publicId}`);

        return res.status(200).json({
          success: true,
          message: "Asset archived for deletion (will be removed in 7 days)",
          archivedAsset: {
            id: asset._id,
            publicId: asset.publicId,
            archivedAt: asset.archivedAt,
          },
        });
      }

      return res.status(403).json({
        success: false,
        message:
          "Cannot delete permanent assets. Use force=true to archive for delayed deletion.",
      });
    }

    if (asset.usedBy.length > 0) {
      return res.status(403).json({
        success: false,
        message: "Cannot delete asset in use",
        usedBy: asset.usedBy,
      });
    }

    if (!asset.isDeletable()) {
      return res.status(403).json({
        success: false,
        message: "Asset cannot be deleted",
      });
    }

    logger.info(`🗑️ Deleting asset: ${asset.publicId}`);

    try {
      await deleteAssetFile(asset.secureUrl, asset.publicId);
      logger.info(`✅ Deleted from storage: ${asset.publicId}`);
    } catch (storageError) {
      logger.error("❌ Storage deletion error:", storageError);
    }

    await Asset.findByIdAndDelete(asset._id);
    logger.info(`✅ Deleted from DB: ${asset.publicId}`);

    res.status(200).json({
      success: true,
      message: "Asset deleted successfully",
      deletedAsset: {
        id: asset._id,
        publicId: asset.publicId,
      },
    });
  } catch (error) {
    logger.error("❌ Error deleting asset:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

module.exports = { deleteAsset };
