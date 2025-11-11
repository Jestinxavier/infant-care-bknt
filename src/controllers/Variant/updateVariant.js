const Variant = require("../../models/Variant");
const { parser } = require("../../config/cloudinary");

const updateVariant = async (req, res) => {
  try {
    const { variantId, color, age, price, stock } = req.body;

    const variant = await Variant.findById(variantId);
    if (!variant) return res.status(404).json({ message: "Variant not found" });

    // Update basic fields
    if (color) variant.color = color;
    if (age) variant.age = age;
    if (price) variant.price = price;
    if (stock) variant.stock = stock;

    // Update images if uploaded
    if (req.files && req.files.length > 0) {
      const images = req.files.map((f) => f.path); // Cloudinary URLs
      variant.images = images; // replace previous images
    }

    await variant.save();

    // Handle response to ensure consistency
    const variantResponse = variant.toObject();
    // Remove size field from response if it exists (for backward compatibility)
    delete variantResponse.size;

    res.status(200).json({ message: "Variant updated successfully", variant: variantResponse });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

module.exports = updateVariant;