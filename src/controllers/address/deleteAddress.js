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

    res.status(200).json({
      success: true,
      message: "✅ Address deleted successfully"
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

