const Product = require("../../models/Product");
const Variant = require("../../models/Variant");

/**
 * Get all products with rating information and variant summary
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

    const products = await Product.find(filter)
      .populate("category", "name slug")
      .sort(sort);

    // Get variant summary for each product (count, total stock, min price, first image)
    const productsWithVariants = await Promise.all(
      products.map(async (product) => {
        const variants = await Variant.find({ productId: product._id });
        
        const productObj = product.toObject();
        
        // Ensure category is properly formatted
        if (productObj.category && typeof productObj.category === 'object') {
          productObj.categoryId = productObj.category._id?.toString() || productObj.category._id;
          productObj.categoryName = productObj.category.name || productObj.categoryName;
        } else if (!productObj.categoryName && productObj.category) {
          productObj.categoryName = productObj.category;
        }
        
        // Calculate summary from variants
        const variantCount = variants.length;
        const totalStock = variants.reduce((sum, v) => sum + (v.stock || 0), 0);
        const prices = variants.map(v => v.price).filter(p => p > 0);
        const minPrice = prices.length > 0 ? Math.min(...prices) : null;
        
        // Get first image from variants
        let firstImage = null;
        for (const variant of variants) {
          if (variant.images && variant.images.length > 0) {
            firstImage = variant.images[0];
            break;
          }
        }
        
        return {
          ...productObj,
          _id: productObj._id?.toString() || productObj._id, // Ensure _id is a string
          variantCount,
          totalStock,
          minPrice,
          thumbnail: firstImage, // Add thumbnail for easy access
          variants: variants.map(v => ({
            _id: v._id?.toString() || v._id, // Ensure variant _id is a string
            color: v.color,
            age: v.age,
            price: v.price,
            stock: v.stock,
            images: v.images,
          })),
        };
      })
    );

    res.status(200).json({
      success: true,
      totalProducts: productsWithVariants.length,
      products: productsWithVariants
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

    // Validate productId
    if (!productId || productId === 'undefined' || productId === 'null') {
      return res.status(400).json({
        success: false,
        message: "Product ID is required"
      });
    }

    // Validate ObjectId format
    if (!/^[0-9a-fA-F]{24}$/.test(productId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID format"
      });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    // Get all variants for this product
    const variants = await Variant.find({ productId });

    // Ensure _id is a string
    const productObj = product.toObject();
    productObj._id = productObj._id?.toString() || productObj._id;
    
    // Populate category if it's an ObjectId reference
    if (productObj.category && typeof productObj.category === 'object') {
      productObj.categoryId = productObj.category._id?.toString() || productObj.category._id;
      productObj.categoryName = productObj.category.name || productObj.categoryName;
    } else if (!productObj.categoryName && productObj.category) {
      productObj.categoryName = productObj.category;
    }
    
    const variantsWithStringIds = variants.map(v => {
      const variantObj = v.toObject();
      variantObj._id = variantObj._id?.toString() || variantObj._id;
      return variantObj;
    });

    res.status(200).json({
      success: true,
      product: productObj,
      variants: variantsWithStringIds,
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
