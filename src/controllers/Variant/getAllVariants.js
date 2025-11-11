const Variant = require("../../models/Variant");
const Product = require("../../models/Product");

/**
 * Get all variants with product information
 */
const getAllVariants = async (req, res) => {
  try {
    const { productId, color, minPrice, maxPrice, inStock, sortBy } = req.query;

    let ageParam = req.query.age;

    // Build filter
    let filter = {};

    if (productId) {
      filter.productId = productId;
    }

    if (color) {
      filter.color = color;
    }

    // ✅ ✅ AGE FILTER FIX
    if (ageParam) {
      const normalize = (str) => str.replace(/[–—]/g, "-").trim();

      let ages = [];

      if (Array.isArray(ageParam)) {
        ages = ageParam.map(normalize);
      } else if (ageParam.includes(",")) {
        ages = ageParam.split(",").map(normalize);
      } else {
        ages = [normalize(ageParam)];
      }

      // ✅ Convert 3-6_months → regex matching ALL dash types
      let regexArray = ages.map((age) => {
        const pattern = age.replace("-", "[-–—]");
        return new RegExp(`^${pattern}$`, "i");
      });

      filter.age = { $in: regexArray };
    }

    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = parseFloat(minPrice);
      if (maxPrice) filter.price.$lte = parseFloat(maxPrice);
    }

    if (inStock === "true") {
      filter.stock = { $gt: 0 };
    } else if (inStock === "false") {
      filter.stock = 0;
    }

    // Sorting logic
    let sort = {};
    switch (sortBy) {
      case "price-low-to-high":
        sort.price = 1;
        break;
      case "price-high-to-low":
        sort.price = -1;
        break;
      case "highest-rated":
        sort.averageRating = -1;
        break;
      case "most-popular":
        sort.totalReviews = -1;
        break;
      default:
        sort.createdAt = -1;
    }

    // Fetch and populate
    const variants = await Variant.find(filter)
      .populate("productId", "name description category averageRating totalReviews")
      .sort(sort);

    // Normalize output
    const processedVariants = variants.map((variant) => {
      const variantObj = variant.toObject();

      // Handle backward compatibility
      if (variantObj.size && !variantObj.age) {
        variantObj.age = variantObj.size;
      }

      // Normalize returned age
      if (variantObj.age) {
        variantObj.age = variantObj.age.replace(/[–—]/g, "-");
      }

      return variantObj;
    });

    res.status(200).json({
      success: true,
      totalVariants: processedVariants.length,
      variants: processedVariants,
    });
  } catch (err) {
    console.error("❌ Error fetching variants:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

module.exports = getAllVariants;
