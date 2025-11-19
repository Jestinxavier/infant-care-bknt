const Variant = require("../../models/Variant");
const Product = require("../../models/Product");
const Category = require("../../models/Category");

/**
 * Get variants filtered by category slug with all filters
 */
const getVariantsByCategory = async (req, res) => {
  try {
    const { slug } = req.params;
    const { color, minPrice, maxPrice, inStock, sortBy } = req.query;

    let ageParam = req.query.age;

    // Find category by slug
    let categoryFilter = {};
    if (slug && slug !== 'all') {
      const category = await Category.findOne({ slug, isActive: true });
      if (!category) {
        return res.status(404).json({
          success: false,
          message: "Category not found"
        });
      }
      categoryFilter.category = category._id;
    }

    // Build product filter
    let productFilter = {};
    if (Object.keys(categoryFilter).length > 0) {
      productFilter = categoryFilter;
    }

    // Find products matching category
    const products = await Product.find(productFilter).select('_id');
    const productIds = products.map(p => p._id);

    if (productIds.length === 0) {
      return res.status(200).json({
        success: true,
        totalVariants: 0,
        variants: [],
      });
    }

    // Build variant filter
    let filter = {
      productId: { $in: productIds }
    };

    if (color) {
      filter.color = color;
    }

    // Age filter
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

      // Convert 3-6_months → regex matching ALL dash types
      let regexArray = ages.map((age) => {
        const pattern = age.replace("-", "[-–—]");
        return new RegExp(`^${pattern}$`, "i");
      });

      filter.age = { $in: regexArray };
    }

    // Price filter
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = parseFloat(minPrice);
      if (maxPrice) filter.price.$lte = parseFloat(maxPrice);
    }

    // Stock filter
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

    // Fetch and populate variants
    // Use .lean() to get plain JavaScript objects instead of Mongoose documents
    const variants = await Variant.find(filter)
      .populate("productId", "name description category averageRating totalReviews")
      .lean()
      .sort(sort);

    // Normalize output
    // Since we're using .lean(), variants are already plain objects
    const processedVariants = variants.map((variant) => {
      // variant is already a plain object from .lean()
      const variantObj = { ...variant };

      // Debug: Log the raw variant to see what we have
      console.log(`🔍 Processing variant ${variant._id}:`, {
        hasPrice: 'price' in variantObj,
        priceValue: variantObj.price,
        priceType: typeof variantObj.price,
        allKeys: Object.keys(variantObj),
      });

      // Explicitly ensure price is included and converted to number
      let priceValue = variantObj.price;
      
      if (priceValue != null && priceValue !== undefined) {
        const numPrice = Number(priceValue);
        if (!isNaN(numPrice)) {
          variantObj.price = numPrice;
          console.log(`✅ Set price for variant ${variant._id}: ${numPrice}`);
        } else {
          console.warn(`⚠️ Variant ${variant._id} has invalid price value:`, priceValue);
          variantObj.price = 0;
        }
      } else {
        // Log warning if price is missing
        console.warn(`⚠️ Variant ${variant._id} is missing price field completely`);
        console.warn(`   variantObj keys:`, Object.keys(variantObj));
        console.warn(`   variantObj:`, JSON.stringify(variantObj, null, 2));
        variantObj.price = 0; // Default to 0 if missing
      }

      // Handle backward compatibility
      if (variantObj.size && !variantObj.age) {
        variantObj.age = variantObj.size;
      }

      // Normalize returned age
      if (variantObj.age) {
        variantObj.age = variantObj.age.replace(/[–—]/g, "-");
      }

      // Ensure _id is a string
      variantObj._id = variantObj._id?.toString() || variant._id?.toString();

      // Ensure stock is a number
      if (variantObj.stock != null) {
        variantObj.stock = Number(variantObj.stock);
      }

      // Handle productId
      if (variantObj.productId && typeof variantObj.productId === 'object') {
        variantObj.productId._id = variantObj.productId._id?.toString() || variantObj.productId._id;
        
        // Handle category in product
        if (variantObj.productId.category && typeof variantObj.productId.category === 'object') {
          variantObj.productId.categoryId = variantObj.productId.category._id?.toString();
          variantObj.productId.categoryName = variantObj.productId.category.name;
        }
      }

      return variantObj;
    });

    res.status(200).json({
      success: true,
      totalVariants: processedVariants.length,
      variants: processedVariants,
    });
  } catch (err) {
    console.error("❌ Error fetching variants by category:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

module.exports = getVariantsByCategory;

