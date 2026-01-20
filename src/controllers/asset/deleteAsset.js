const cloudinary = require("../../config/cloudinary");
const Asset = require("../../models/Asset");

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

    // Try finding by ObjectId first (wrapped in try-catch for invalid IDs)
    // Also skip if ID contains slashes (likely a publicId with folder)
    if (!id.includes("/") && mongoose.Types.ObjectId.isValid(id)) {
      try {
        asset = await Asset.findById(id);
      } catch (error) {
        // If findById fails (e.g., id looks valid but causes cast error), try publicId
        console.log(`ID ${id} is not a valid ObjectId, trying publicId`);
      }
    }

    // If not found by ID, try finding by publicId
    if (!asset) {
      asset = await Asset.findOne({ publicId: id });
    }

    if (!asset) {
      return res.status(404).json({
        success: false,
        message: "Asset not found",
      });
    }

    // Handle permanent assets
    if (asset.status === "permanent") {
      // If force flag is set, archive the asset for delayed deletion
      if (force === "true") {
        asset.status = "archived";
        asset.archivedAt = new Date();
        asset.usedBy = []; // Clear usage references
        await asset.save();

        console.log(
          `📦 Asset archived for delayed deletion: ${asset.publicId}`
        );

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

      // Without force flag, block deletion
      return res.status(403).json({
        success: false,
        message:
          "Cannot delete permanent assets. Use force=true to archive for delayed deletion.",
      });
    }

    // Block deletion if in use
    if (asset.usedBy.length > 0) {
      return res.status(403).json({
        success: false,
        message: "Cannot delete asset in use",
        usedBy: asset.usedBy,
      });
    }

    // Alternative: use helper method
    if (!asset.isDeletable()) {
      return res.status(403).json({
        success: false,
        message: "Asset cannot be deleted",
      });
    }

    console.log(`🗑️ Deleting asset: ${asset.publicId}`);

    // Delete from Cloudinary
    try {
      await cloudinary.cloudinary.uploader.destroy(asset.publicId);
      console.log(`✅ Deleted from Cloudinary: ${asset.publicId}`);
    } catch (cloudinaryError) {
      console.error("❌ Cloudinary deletion error:", cloudinaryError);
      // Continue with DB deletion even if Cloudinary fails
    }

    // Delete from database - use asset._id (ObjectId) not the raw param (which might be string)
    await Asset.findByIdAndDelete(asset._id);

    console.log(`✅ Deleted from DB: ${asset.publicId}`);

    res.status(200).json({
      success: true,
      message: "Asset deleted successfully",
      deletedAsset: {
        id: asset._id,
        publicId: asset.publicId,
      },
    });
  } catch (error) {
    console.error("❌ Error deleting asset:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

module.exports = { deleteAsset };
