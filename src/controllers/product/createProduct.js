const Product = require("../../models/Product");
const Variant = require("../../models/Variant");

const createProduct = async (req, res) => {
  console.log("first555*******");
  try {
    const { name, description, category, variants } = req.body;
    const variantsArray = JSON.parse(variants); // parse JSON string

    // Create product
    const product = await Product.create({ name, description, category });

    // Map images to variants dynamically
    const variantData = variantsArray.map((v) => {
      // Match images whose fieldname ends with this variant SKU or size
      console.log(req.files, "file****"); // should show array of uploaded files
      const images = req.files
        .filter((f) => f.fieldname.includes(v.sku || v.size))
        .map((f) => f.path); // Cloudinary URL

      return {
        productId: product._id,
        color: v.color,
        size: v.size,
        price: v.price,
        stock: v.stock,
        sku: v.sku,
        images,
      };
    });

    await Variant.insertMany(variantData);

    res
      .status(201)
      .json({ message: "Product and variants created successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

module.exports = createProduct;
