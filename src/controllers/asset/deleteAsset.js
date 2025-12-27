const cloudinary = require("../../config/cloudinary");
const Asset = require("../../models/Asset");

/**
 * Delete asset (only if temp and not in use)
 * DELETE /api/admin/assets/:id
 */
const deleteAsset = async (req, res) => {
  try {
    const { id } = req.params;
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

    // Block deletion if permanent
    if (asset.status === "permanent") {
      return res.status(403).json({
        success: false,
        message: "Cannot delete permanent assets. Asset is protected.",
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
