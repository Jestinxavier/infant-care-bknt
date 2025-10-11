const Address = require("../../models/Address");

const updateAddress = async (req, res) => {
  try {
    const { addressId } = req.params;
    const updateData = req.body;

    if (!addressId) {
      return res.status(400).json({ success: false, message: "Address ID is required" });
    }

    const updatedAddress = await Address.findByIdAndUpdate(
      addressId,
      updateData,
      { new: true } // return the updated document
    );

    if (!updatedAddress) {
      return res.status(404).json({ success: false, message: "Address not found" });
    }

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
