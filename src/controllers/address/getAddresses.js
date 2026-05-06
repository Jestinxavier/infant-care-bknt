const Address = require("../../models/Address");
const logger = require("../../utils/logger");

const getAddresses = async (req, res) => {
  try {
    const userId = req.user.id;

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
    logger.error("❌ Error fetching addresses:", err);
    res
      .status(500)
      .json({
        success: false,
        message: "Internal Server Error",
              });
  }
};

module.exports = getAddresses;
