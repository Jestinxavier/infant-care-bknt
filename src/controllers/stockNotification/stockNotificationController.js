const StockNotification = require("../../models/StockNotification");
const Product = require("../../models/Product");
const { STOCK_NOTIFICATION_STATUS } = require("../../../resources/constants");

/**
 * Register interest for a product variant
 * POST /api/v1/stock-notify/register
 */
const registerInterest = async (req, res) => {
  try {
    const { productId, variantId, email, userId } = req.body;

    if (!productId || !variantId || !email) {
      return res.status(400).json({
        success: false,
        message: "Product ID, Variant ID, and Email are required",
      });
    }

    // validate email format
    const emailRegex = /\S+@\S+\.\S+/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format",
      });
    }

    // Check if product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Check if variant exists
    const variant = product.variants.find((v) => v.id === variantId);
    if (!variant) {
      return res.status(404).json({
        success: false,
        message: "Variant not found",
      });
    }

    // Provide context names
    const productName = product.title;
    const variantName = variant.attributes
      ? Object.values(variant.attributes).join(" / ")
      : "Default";

    // Upsert notification request
    // We search for an existing PENDING request for this user/variant
    // If found, we update it (e.g. updatedAt). If not, we create it.
    // If a completed/expired request exists, we create a new PENDING one.

    // Using updateOne with upsert to handle race conditions cleanly
    const result = await StockNotification.updateOne(
      {
        productId,
        variantId,
        email,
        status: STOCK_NOTIFICATION_STATUS.PENDING,
      },
      {
        $setOnInsert: {
          userId: userId || null,
          productName,
          variantName,
        },
        $set: {
          updatedAt: new Date(), // Just touch the record if it exists
        },
      },
      { upsert: true }
    );

    return res.status(200).json({
      success: true,
      message: "Notification registered successfully",
      isNew: result.upsertedCount > 0,
    });
  } catch (error) {
    console.error("Error registering stock notification:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

module.exports = {
  registerInterest,
};
