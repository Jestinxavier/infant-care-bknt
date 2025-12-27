const Asset = require("../../models/Asset");

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

    // Promote using instance method
    await asset.promoteToPermanent(entity, entityId);

    console.log(
      `✅ Asset promoted: ${asset.publicId} → permanent, used by ${entity}:${entityId}`
    );

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
