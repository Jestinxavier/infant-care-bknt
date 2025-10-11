const Address = require("../../models/Address");

const createAddress = async (req, res) => {
  try {
    const { userId, fullName, phone, addressLine1, addressLine2, city, state, postalCode, country, isDefault } = req.body;

    const address = new Address({
      userId,
      fullName,
      phone,
      addressLine1,
      addressLine2,
      city,
      state,
      postalCode,
      country,
      isDefault
    });

    await address.save();

    res.status(201).json({
      message: "✅ Address saved successfully",
      address
    });
  } catch (err) {
    console.error("❌ Error saving address:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

module.exports = createAddress;