const Product = require("../../models/Product");
const Variant = require("../../models/Variant");
const { parser } = require("../../config/cloudinary");

const updateProduct = async (req, res) => {
  try {
    const { productId, name, description, category, variants } = req.body;

    // 1️⃣ Update product basic info
    const product = await Product.findByIdAndUpdate(
      productId,
      { name, description, category },
      { new: true }
    );

    if (!product) return res.status(404).json({ message: "Product not found" });

    // 2️⃣ Update variants
    if (variants) {
      const variantsArray = JSON.parse(variants); // parse JSON string if sent
      for (const v of variantsArray) {
        // If variant exists, update; else create
        let variant = await Variant.findOne({ _id: v._id });
        if (variant) {
          variant.color = v.color || variant.color;
          variant.age = v.age || variant.age;
          variant.price = v.price || variant.price;
          variant.stock = v.stock || variant.stock;

          // Update images if new files uploaded
          if (req.files && req.files.length > 0) {
            const images = req.files
              .filter((f) => f.fieldname.includes(v.sku || v.age))
              .map((f) => f.path);
            if (images.length > 0) variant.images = images;
          }

          await variant.save();
        } else {
          // Create new variant
          const images = req.files
            .filter((f) => f.fieldname.includes(v.sku || v.age))
            .map((f) => f.path);

          await Variant.create({
            productId,
            color: v.color,
            age: v.age,
            price: v.price,
            stock: v.stock,
            sku: v.sku,
            images,
          });
        }
      }
    }

    res.status(200).json({ message: "Product updated successfully", product });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

module.exports = updateProduct;
