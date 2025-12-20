const Product = require("../../models/Product");
const Variant = require("../../models/Variant");
const { formatProductResponse } = require("../../utils/formatProductResponse");

/**
 * Get all products - returns variants as separate items if inStock, otherwise parent product
 * Supports pagination and filtering
 */
const getAllProducts = async (req, res) => {
  try {
    // Support both GET (query params) and POST (body) requests
    const requestData = req.method === "POST" ? req.body || {} : req.query;

    // Parse query filters (handles new URL structure)
    const { parseQueryFilters } = require("../../utils/parseQueryFilters");
    const filters = parseQueryFilters(requestData);

    const {
      category,
      minRating,
      sortBy,
      page = filters.page,
      limit = filters.limit,
      // Filters - prioritize parsed filters over raw query params
      color = filters.color,
      size = filters.size || filters.age,
      minPrice = filters.minPrice,
      maxPrice = filters.maxPrice,
      inStock = filters.inStock || requestData.inStock,
    } = { ...requestData, ...filters };

    // Delegate to ProductService (which now handles Aggregation & Grouping)
    const productService = require("../../features/product/product.service");

    // Prepare filters for service
    const serviceFilters = {
      page,
      limit,
      category, // code or ID will be handled
      status: "published",
      minPrice,
      maxPrice,
      inStock,
      sortBy: sortBy || "createdAt",
      sortOrder: "desc", // Default, could be extracted from sortBy
      color,
      size,
      search: requestData.search || requestData.q,
    };

    // If category is provided as code (e.g. "clothing"), resolve it to ID first
    // because service expects ObjectId for category filter
    if (category && category !== "all") {
      const Category = require("../../models/Category");
      // Try to find by code first, then slug
      // (New system uses 'code', old might use 'slug')
      let categoryDoc = await Category.findOne({
        $or: [{ code: category }, { slug: category }],
        isActive: true,
      });

      if (categoryDoc) {
        serviceFilters.category = categoryDoc._id.toString();
        // We also need categoryTitle for response
        res.locals.categoryTitle = categoryDoc.name;
      } else {
        // If 24 char hex, assume it's an ID
        if (/^[0-9a-fA-F]{24}$/.test(category)) {
          serviceFilters.category = category;
          // Title defaults to "All Products" or we'd fetch it...
          // Let's settle for "Propducts" if ID provided.
        } else {
          // Category not found
          return res.status(200).json({
            success: true,
            categoryTitle: "Category not found",
            items: [],
            pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
          });
        }
      }
    }

    // Call Service
    const result = await productService.getAllProducts(serviceFilters, {
      isAdmin: false,
    });

    res.status(200).json({
      success: true,
      categoryTitle: res.locals.categoryTitle || "All Products",
      items: result.items,
      pagination: result.pagination,
    });
  } catch (err) {
    console.error("❌ Error fetching products:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

/**
 * Get single product by url_key with variants and ratings
 * Supports backward compatibility with _id lookup
 */
const getProductByUrlKey = async (req, res) => {
  try {
    // Support both GET (params) and POST (body or params) requests
    const url_key = req.params.url_key || req.body?.url_key;

    // Validate url_key
    if (!url_key || url_key === "undefined" || url_key === "null") {
      return res.status(400).json({
        success: false,
        message: "Product url_key is required",
      });
    }

    // Use MongoDB $or query to find product by either parent url_key or variant url_key
    // This is more efficient and explicit - no guesswork needed
    let product = await Product.findOne({
      $or: [
        { url_key: url_key }, // Parent product
        { "variants.url_key": url_key }, // Variant
      ],
    }).populate("category", "name slug");

    // Find the specific variant if slug matches a variant url_key
    let variantFromUrl = null;
    if (product && product.variants && product.variants.length > 0) {
      variantFromUrl =
        product.variants.find((v) => v.url_key === url_key) || null;
    }

    // Backward compatibility: if not found by url_key, try _id
    if (!product) {
      // Check if it's a valid ObjectId format
      if (/^[0-9a-fA-F]{24}$/.test(url_key)) {
        product = await Product.findById(url_key).populate(
          "category",
          "name slug"
        );
      }
    }

    // Additional fallback: try to find by slugified name/title
    // This helps with products that don't have url_key yet
    if (!product) {
      // Try to find by matching slugified title or name
      product = await Product.findOne({
        $or: [
          {
            title: {
              $regex: new RegExp(`^${url_key.replace(/-/g, " ")}`, "i"),
            },
          },
          {
            name: { $regex: new RegExp(`^${url_key.replace(/-/g, " ")}`, "i") },
          },
        ],
      }).populate("category", "name slug");
    }

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Only return published products on frontend
    if (product.status !== "published") {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // If product doesn't have url_key, generate one now
    if (!product.url_key) {
      const { generateUniqueUrlKey } = require("../../utils/slugGenerator");
      const checkUrlKeyExists = async (key) => {
        const existing = await Product.findOne({
          url_key: key,
          _id: { $ne: product._id },
        });
        return !!existing;
      };
      product.url_key = await generateUniqueUrlKey(
        product.title || product.name,
        checkUrlKeyExists
      );
      await product.save();
    }

    // Convert product to object
    const productObj = product.toObject();
    productObj._id = productObj._id?.toString() || productObj._id;

    // Populate category if it's an ObjectId reference
    if (productObj.category && typeof productObj.category === "object") {
      productObj.categoryId =
        productObj.category._id?.toString() || productObj.category._id;
      productObj.categoryName =
        productObj.category.name || productObj.categoryName;
    } else if (!productObj.categoryName && productObj.category) {
      productObj.categoryName = productObj.category;
    }

    // Legacy support: also check Variant collection for backward compatibility
    const legacyVariants = await Variant.find({ productId: product._id });
    if (
      legacyVariants.length > 0 &&
      (!productObj.variants || productObj.variants.length === 0)
    ) {
      productObj.variants = legacyVariants.map((v) => ({
        id: v._id.toString(),
        sku: v.sku,
        price: v.price,
        stock: v.stock,
        images: v.images || [],
        options: {
          color: v.color,
          age: v.age,
        },
      }));
    }

    // Format response in new structure
    const formattedProduct = formatProductResponse(product);

    res.status(200).json({
      success: true,
      ...formattedProduct,
    });
  } catch (err) {
    console.error("❌ Error fetching product:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

/**
 * Get single product by ID (legacy support)
 * @deprecated Use getProductByUrlKey instead
 */
const getProductById = async (req, res) => {
  try {
    // Support both GET (params) and POST (body or params) requests
    const productId = req.params.productId || req.body?.productId;

    // Validate productId
    if (!productId || productId === "undefined" || productId === "null") {
      return res.status(400).json({
        success: false,
        message: "Product ID is required",
      });
    }

    // Validate ObjectId format
    if (!/^[0-9a-fA-F]{24}$/.test(productId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID format",
      });
    }

    const product = await Product.findById(productId).populate(
      "category",
      "name slug"
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Get all variants for this product (legacy)
    const variants = await Variant.find({ productId });

    // Ensure _id is a string
    const productObj = product.toObject();
    productObj._id = productObj._id?.toString() || productObj._id;

    // Populate category if it's an ObjectId reference
    if (productObj.category && typeof productObj.category === "object") {
      productObj.categoryId =
        productObj.category._id?.toString() || productObj.category._id;
      productObj.categoryName =
        productObj.category.name || productObj.categoryName;
    } else if (!productObj.categoryName && productObj.category) {
      productObj.categoryName = productObj.category;
    }

    const variantsWithStringIds = variants.map((v) => {
      const variantObj = v.toObject();
      variantObj._id = variantObj._id?.toString() || variantObj._id;
      return variantObj;
    });

    res.status(200).json({
      success: true,
      product: productObj,
      variants: variantsWithStringIds,
      totalVariants: variants.length,
    });
  } catch (err) {
    console.error("❌ Error fetching product:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

/**
 * Get variant by ID with rating information
 */
const getVariantById = async (req, res) => {
  try {
    const { variantId } = req.params;

    const variant = await Variant.findById(variantId).populate(
      "productId",
      "name description category averageRating totalReviews"
    );

    if (!variant) {
      return res.status(404).json({
        success: false,
        message: "Variant not found",
      });
    }

    res.status(200).json({
      success: true,
      variant,
    });
  } catch (err) {
    console.error("❌ Error fetching variant:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

const getSearchIndex = async (req, res) => {
  console.log("🔍 Search Index API called");
  try {
    // Fetch all published products with minimal fields
    const products = await Product.find({ status: { $ne: "rejected" } })
      .select(
        "title name url_key images pricing price category status variants"
      )
      .populate("category", "name slug")
      .lean();

    console.log(`✅ Found ${products.length} products for index`);

    const searchIndex = products.map((product) => {
      // Get effective price
      const parentPrice = product.pricing?.price || product.price || 0;

      // Calculate min price from variants if any
      let minPrice = parentPrice;
      if (product.variants && product.variants.length > 0) {
        const variantPrices = product.variants
          .map((v) => v.pricing?.price || v.price || 0)
          .filter((p) => p > 0);
        if (variantPrices.length > 0) minPrice = Math.min(...variantPrices);
      } else if (parentPrice === 0 && product.price) {
        minPrice = product.price;
      }

      // Image
      const image = (product.images && product.images[0]) || "";

      return {
        id: product._id,
        title: product.title || product.name,
        url_key: product.url_key,
        price: minPrice,
        image: image,
        category: product.category?.name || "Uncategorized",
        status: product.status,
      };
    });

    res.status(200).json({
      success: true,
      products: searchIndex,
    });
  } catch (error) {
    console.error("❌ Error fetching search index:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

module.exports = {
  getAllProducts,
  getProductById,
  getProductByUrlKey,
  getVariantById,
  getSearchIndex,
};
