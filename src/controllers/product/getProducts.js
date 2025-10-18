const Product = require("../../models/Product");
const Variant = require("../../models/Variant");

/**
 * Get all products with rating information
 */
const getAllProducts = async (req, res) => {
  try {
    const { category, minRating, sortBy } = req.query;

    // Build filter
    let filter = {};
    if (category) {
      filter.category = category;
    }
    if (minRating) {
      filter.averageRating = { $gte: parseFloat(minRating) };
    }

    // Build sort
    let sort = {};
    if (sortBy === 'rating') {
      sort.averageRating = -1; // Highest rating first
    } else if (sortBy === 'reviews') {
      sort.totalReviews = -1; // Most reviewed first
    } else if (sortBy === 'newest') {
      sort.createdAt = -1;
    } else {
      sort.createdAt = -1; // Default: newest first
    }

    const products = await Product.find(filter).sort(sort);

    res.status(200).json({
      success: true,
      totalProducts: products.length,
      products
    });
  } catch (err) {
    console.error("❌ Error fetching products:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message
    });
  }
};

/**
 * Get single product by ID with variants and ratings
 */
const getProductById = async (req, res) => {
  try {
    const { productId } = req.params;

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    // Get all variants for this product
    const variants = await Variant.find({ productId });

    res.status(200).json({
      success: true,
      product,
      variants,
      totalVariants: variants.length
    });
  } catch (err) {
    console.error("❌ Error fetching product:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message
    });
  }
};

/**
 * Get variant by ID with rating information
 */
const getVariantById = async (req, res) => {
  try {
    const { variantId } = req.params;

    const variant = await Variant.findById(variantId)
      .populate("productId", "name description category averageRating totalReviews");

    if (!variant) {
      return res.status(404).json({
        success: false,
        message: "Variant not found"
      });
    }

    res.status(200).json({
      success: true,
      variant
    });
  } catch (err) {
    console.error("❌ Error fetching variant:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message
    });
  }
};

module.exports = {
  getAllProducts,
  getProductById,
  getVariantById
};
