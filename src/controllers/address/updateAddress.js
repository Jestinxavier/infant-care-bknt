const Address = require("../../models/Address");

const updateAddress = async (req, res) => {
  try {
    const { addressId } = req.params;
    const updateData = req.body;

    if (!addressId) {
      return res.status(400).json({ success: false, message: "Address ID is required" });
    }

    // Find the address first to get userId
    const existingAddress = await Address.findById(addressId);
    if (!existingAddress) {
      return res.status(404).json({ success: false, message: "Address not found" });
    }

    // If this address is being set as default, unset all other default addresses for this user
    if (updateData.isDefault === true) {
      await Address.updateMany(
        { userId: existingAddress.userId, _id: { $ne: addressId }, isDefault: true },
        { $set: { isDefault: false } }
      );
    }

    const updatedAddress = await Address.findByIdAndUpdate(
      addressId,
      updateData,
      { new: true } // return the updated document
    );

    res.status(200).json({
      success: true,
      message: "✅ Address updated successfully",
      address: updatedAddress
    });
  } catch (err) {
    console.error("❌ Error updating address:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message
    });
  }
};

module.exports =  updateAddress ;
