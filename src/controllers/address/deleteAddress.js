const Address = require("../../models/Address");

const deleteAddress = async (req, res) => {
  try {
    const { addressId } = req.params;

    if (!addressId) {
      return res.status(400).json({ 
        success: false, 
        message: "Address ID is required" 
      });
    }

    // Find the address first to verify it exists
    const existingAddress = await Address.findById(addressId);
    if (!existingAddress) {
      return res.status(404).json({ 
        success: false, 
        message: "Address not found" 
      });
    }

    // Delete the address
    await Address.findByIdAndDelete(addressId);

    res.status(200).json({
      success: true,
      message: "✅ Address deleted successfully"
    });
  } catch (err) {
    console.error("❌ Error deleting address:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message
    });
  }
};

module.exports = deleteAddress;

