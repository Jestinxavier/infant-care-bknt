const Address = require("../../models/Address");

const getAddresses = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: "User ID is required" });
    }

    const addresses = await Address.find({ userId });

    res.status(200).json({
      success: true,
      message: "✅ Addresses fetched successfully",
      addresses,
    });
  } catch (err) {
    console.error("❌ Error fetching addresses:", err);
    res
      .status(500)
      .json({
        success: false,
        message: "Internal Server Error",
        error: err.message,
      });
  }
};

module.exports = getAddresses;
