const Asset = require("../../models/Asset");
const mongoose = require("mongoose");

/**
 * Promote asset from temp to permanent and add usage tracking
 * POST /api/admin/assets/promote
 * Body: { publicId, entity, entityId }
 */
const promoteAsset = async (req, res) => {
  try {
    const { publicId, entity, entityId } = req.body;

    // Validation
    if (!publicId || !entity || !entityId) {
      return res.status(400).json({
        success: false,
        message: "publicId, entity, and entityId are required",
      });
    }

    // Find asset
    const asset = await Asset.findOne({ publicId });

    if (!asset) {
      return res.status(404).json({
        success: false,
        message: `Asset with publicId "${publicId}" not found`,
      });
    }

    // Check if entityId is a valid ObjectId
    const isValidObjectId = mongoose.Types.ObjectId.isValid(entityId);

    if (isValidObjectId) {
      // Promote using instance method with real entity
      await asset.promoteToPermanent(entity, entityId);
      console.log(
        `✅ Asset promoted: ${asset.publicId} → permanent, used by ${entity}:${entityId}`,
      );
    } else {
      // Manual promotion without real entity (e.g., from gallery)
      asset.status = "permanent";
      asset.expiresAt = null;
      await asset.save();
      console.log(
        `✅ Asset manually promoted: ${asset.publicId} → permanent (no entity link)`,
      );
    }

    res.status(200).json({
      success: true,
      message: "Asset promoted to permanent",
      asset,
    });
  } catch (error) {
    console.error("❌ Error promoting asset:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

module.exports = { promoteAsset };
