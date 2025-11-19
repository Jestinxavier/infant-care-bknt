const Product = require("../../models/Product");
const Variant = require("../../models/Variant");
const Category = require("../../models/Category");
const mongoose = require("mongoose");

const createProduct = async (req, res) => {
  console.log("first555*******");
  try {
    const { name, description, category, variants } = req.body;
    const variantsArray = JSON.parse(variants); // parse JSON string

    // Handle category - can be ObjectId or category name (for backward compatibility)
    let categoryId = category;
    let categoryName = null;

    // If category is not a valid ObjectId, try to find by name
    if (!mongoose.Types.ObjectId.isValid(category)) {
      const foundCategory = await Category.findOne({ 
        name: category.trim(),
        isActive: true 
      });
      if (foundCategory) {
        categoryId = foundCategory._id;
        categoryName = foundCategory.name;
      } else {
        return res.status(400).json({
          success: false,
          message: `Category "${category}" not found. Please create the category first.`
        });
      }
    } else {
      // Validate category exists
      const foundCategory = await Category.findById(category);
      if (!foundCategory || !foundCategory.isActive) {
        return res.status(400).json({
          success: false,
          message: "Category not found or inactive"
        });
      }
      categoryName = foundCategory.name;
    }

    // Create product
    const product = await Product.create({ 
      name, 
      description, 
      category: categoryId,
      categoryName // Store name for backward compatibility
    });

    // Map images to variants dynamically
    const variantData = variantsArray.map((v) => {
      // Match images whose fieldname ends with this variant SKU or age
      console.log(req.files, "file****"); // should show array of uploaded files
      const images = req.files
        .filter((f) => f.fieldname.includes(v.sku || v.age))
        .map((f) => f.path); // Cloudinary URL

      return {
        productId: product._id,
        color: v.color,
        age: v.age,
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
