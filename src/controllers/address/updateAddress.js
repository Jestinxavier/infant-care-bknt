const Address = require("../../models/Address");
const logger = require("../../utils/logger");
const { parseIndianPhone } = require("../../utils/phone");

const updateAddress = async (req, res) => {
  try {
    const { addressId } = req.params;
    const updateData = req.body;

    if (!addressId) {
      return res.status(400).json({ success: false, message: "Address ID is required" });
    }

    // Find the address first and verify ownership
    const existingAddress = await Address.findById(addressId);
    if (!existingAddress) {
      return res.status(404).json({ success: false, message: "Address not found" });
    }

    if (existingAddress.userId.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    // Strip userId from updateData to prevent mass assignment
    const { userId: _removed, ...safeUpdateData } = updateData;

    // Only when the phone is part of this update (e.g. not for "set default")
    if (Object.prototype.hasOwnProperty.call(safeUpdateData, "phone")) {
      const parsedPhone = parseIndianPhone(safeUpdateData.phone, { required: true });
      if (!parsedPhone.ok) {
        return res.status(400).json({ success: false, message: parsedPhone.message });
      }
      safeUpdateData.phone = parsedPhone.phone;
    }

    // If this address is being set as default, unset all other default addresses for this user
    if (safeUpdateData.isDefault === true) {
      await Address.updateMany(
        { userId: existingAddress.userId, _id: { $ne: addressId }, isDefault: true },
        { $set: { isDefault: false } }
      );
    }

    const updatedAddress = await Address.findByIdAndUpdate(
      addressId,
      safeUpdateData,
      { new: true }
    );

    res.status(200).json({
      success: true,
      message: "✅ Address updated successfully",
      address: updatedAddress
    });
  } catch (err) {
    logger.error("❌ Error updating address:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
          });
  }
};

module.exports =  updateAddress ;
