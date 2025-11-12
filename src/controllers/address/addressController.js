const Address = require("../../models/Address");

const createAddress = async (req, res) => {
  try {
    const { 
      userId, 
      fullName, 
      phone, 
      houseName,
      street,
      landmark,
      addressLine1, // Keep for backward compatibility
      addressLine2, // Keep for backward compatibility
      city, 
      state, 
      postalCode,
      pincode, // Keep for backward compatibility
      country = "India", // Default to India
      isDefault,
      nickname = "Home" // Default nickname
    } = req.body;

    // Use street if provided, otherwise fallback to addressLine1
    const finalStreet = street || addressLine1;
    // Use landmark if provided, otherwise fallback to addressLine2
    const finalLandmark = landmark || addressLine2;
    // Use pincode if provided, otherwise fallback to postalCode
    const finalPincode = pincode || postalCode;

    // If this address is set as default, unset all other default addresses for this user
    if (isDefault) {
      await Address.updateMany(
        { userId, isDefault: true },
        { $set: { isDefault: false } }
      );
    }

    const address = new Address({
      userId,
      fullName,
      phone,
      houseName,
      street: finalStreet,
      landmark: finalLandmark,
      addressLine1: finalStreet, // Keep for backward compatibility
      addressLine2: finalLandmark, // Keep for backward compatibility
      city,
      state,
      postalCode: finalPincode,
      pincode: finalPincode, // Keep for backward compatibility
      country: country || "India", // Default to India
      isDefault: isDefault || false,
      nickname: nickname || "Home"
    });

    await address.save();

    res.status(201).json({
      success: true,
      message: "✅ Address saved successfully",
      address
    });
  } catch (err) {
    console.error("❌ Error saving address:", err);
    res.status(500).json({ 
      success: false,
      message: "Internal Server Error",
      error: err.message 
    });
  }
};

module.exports = createAddress;