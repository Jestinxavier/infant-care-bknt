const Variant = require("../../models/Variant");
const Product = require("../../models/Product");

/**
 * Get all variants with product information
 */
const getAllVariants = async (req, res) => {
  try {
    const { productId, color, size, minPrice, maxPrice, inStock, sortBy } = req.query;

    // Build filter
    let filter = {};
    
    if (productId) {
      filter.productId = productId;
    }
    
    if (color) {
      filter.color = color;
    }
    
    if (size) {
      filter.size = size;
    }
    
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) {
        filter.price.$gte = parseFloat(minPrice);
      }
      if (maxPrice) {
        filter.price.$lte = parseFloat(maxPrice);
      }
    }
    
    if (inStock === 'true') {
      filter.stock = { $gt: 0 };
    } else if (inStock === 'false') {
      filter.stock = 0;
    }

    // Build sort object
    let sort = {};
    switch (sortBy) {
      case 'price-low-to-high':
        sort.price = 1;
        break;
      case 'price-high-to-low':
        sort.price = -1;
        break;
      case 'highest-rated':
        sort.averageRating = -1;
        break;
      case 'most-popular':
        sort.totalReviews = -1;
        break;
      default:
        // Default sorting by creation date (newest first)
        sort.createdAt = -1;
    }

    // Populate product information
    const variants = await Variant.find(filter)
      .populate("productId", "name description category averageRating totalReviews")
      .sort(sort);

    res.status(200).json({
      success: true,
      totalVariants: variants.length,
      variants
    });
  } catch (err) {
    console.error("❌ Error fetching variants:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message
    });
  }
};

module.exports = getAllVariants;