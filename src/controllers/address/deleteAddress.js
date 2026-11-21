const Address = require("../../models/Address");
const logger = require("../../utils/logger");

const deleteAddress = async (req, res) => {
  try {
    const { addressId } = req.params;

    if (!addressId) {
      return res.status(400).json({ 
        success: false, 
        message: "Address ID is required" 
      });
    }

    // Find the address and verify ownership
    const existingAddress = await Address.findById(addressId);
    if (!existingAddress) {
      return res.status(404).json({
        success: false,
        message: "Address not found"
      });
    }

    if (existingAddress.userId.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    // Delete the address
    await Address.findByIdAndDelete(addressId);

    // Deleting the default used to leave the user with no default at all, so
    // checkout had nothing to preselect. Promote their most recently updated
    // remaining address instead (none left: nothing to do).
    let newDefaultId = null;
    if (existingAddress.isDefault) {
      const next = await Address.findOneAndUpdate(
        { userId: existingAddress.userId },
        { $set: { isDefault: true } },
        { sort: { updatedAt: -1 }, new: true },
      );
      newDefaultId = next?._id ?? null;
    }

    res.status(200).json({
      success: true,
      message: "✅ Address deleted successfully",
      newDefaultId,
    });
  } catch (err) {
    logger.error("❌ Error deleting address:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
          });
  }
};

module.exports = deleteAddress;

