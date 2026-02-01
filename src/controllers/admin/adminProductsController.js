const Product = require("../../models/Product");
const Variant = require("../../models/Variant");
const { formatProductResponse } = require("../../utils/formatProductResponse");
const { transformForDashboard } = require("../../utils/transformForDashboard");

/**
 * Admin: Get all products with full details (including drafts, all variants)
 * Supports filtering and pagination
 */
const getAllProducts = async (req, res) => {
  try {
    // Support both GET (query params) and POST (body) requests
    // If POST, check for nested filters object first, then use body directly
    let requestData = req.method === "POST" ? req.body || {} : req.query;

    // If body has a filters property, extract from there (for backward compatibility)
    // Otherwise, use body directly (new format)
    if (req.method === "POST" && req.body) {
      if (req.body.filters) {
        requestData = { ...req.body.filters };
      } else {
        // Body is already the filters object
        requestData = req.body;
      }
    }

    const {
      category,
      page = 1,
      limit = 20,
      sortBy = "createdAt",
      sortOrder = -1,
      search,
      status,
      includeInactive = false,
    } = requestData;

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    // Build filter for admin (can include inactive/draft products)
    let filter = {};

    if (category && category !== "all") {
      const Category = require("../../models/Category");
      const categoryDoc = await Category.findOne({
        $or: [{ slug: category }, { _id: category }],
      });
      if (categoryDoc) {
        filter.category = categoryDoc._id;
      }
    }

    // Admin can filter by status
    if (status) {
      filter.status = status;
    }

    // Search filter - search by name/title, description, or SKU
    // SKU is typically made from product name, so we search in variants too
    if (search) {
      const searchRegex = { $regex: search, $options: "i" };
      filter.$or = [
        { title: searchRegex },
        { name: searchRegex },
        { description: searchRegex },
        { "variants.sku": searchRegex }, // Search in variant SKUs
        { sku: searchRegex }, // Search in parent SKU if exists
      ];
    }

    // Build sort
    const sort = {};
    sort[sortBy] = parseInt(sortOrder, 10);

    // Get total count
    const total = await Product.countDocuments(filter);

    // Fetch products with full details
    const products = await Product.find(filter)
      .populate("category", "name slug")
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Transform products for admin dashboard using utility function
    const formattedProducts = products.map((product) =>
      transformForDashboard(product)
    );

    res.status(200).json({
      success: true,
      items: formattedProducts, // Use 'items' as the standard field name
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    console.error("❌ Admin Error fetching products:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

/**
 * Admin: Get single product by ID with full details
 */
const getProductById = async (req, res) => {
  try {
    const productId = req.params.productId || req.body?.productId;

    if (!productId || productId === "undefined" || productId === "null") {
      return res.status(400).json({
        success: false,
        message: "Product ID is required",
      });
    }

    const product = await Product.findById(productId)
      .populate("category", "name slug")
      .lean();

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Debug: Log raw product details from database
    if (product.details) {
      console.log("[getProductById] Raw product details from DB:", JSON.stringify(product.details, null, 2));
    }

    // Format product for admin
    const productObj = { ...product };
    productObj._id = productObj._id?.toString();

    // Fix categoryName - prefer populated category, fallback to categoryName field
    if (!productObj.categoryName && productObj.category) {
      if (typeof productObj.category === "object" && productObj.category.name) {
        productObj.categoryName = productObj.category.name;
      } else if (typeof productObj.category === "string") {
        productObj.categoryName = productObj.category;
      }
    }

    // Fix thumbnail - convert asset ID to full Cloudinary URL
    if (productObj.thumbnail && typeof productObj.thumbnail === "string") {
      if (productObj.thumbnail.startsWith("assets/")) {
        // Keep assets/ as-is since CSV images are stored in assets folder
        const publicId = productObj.thumbnail;
        const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
        if (cloudName) {
          productObj.thumbnail = `https://res.cloudinary.com/${cloudName}/image/upload/${publicId}`;
        }
      }
    }

    // Fix images - convert asset IDs to full Cloudinary URLs
    if (productObj.images && Array.isArray(productObj.images)) {
      productObj.images = productObj.images.map((img) => {
        if (typeof img === "string") {
          // If it's an asset ID (starts with "assets/"), convert to Cloudinary URL
          if (img.startsWith("assets/")) {
            // Keep assets/ as-is since CSV images are stored in assets folder
            const publicId = img;
            const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
            if (cloudName) {
              return `https://res.cloudinary.com/${cloudName}/image/upload/${publicId}`;
            }
          }
          // If it's already a full URL, return as-is
          if (img.startsWith("http")) {
            return img;
          }
        }
        return img;
      });
    }

    // Fix variant images if they exist
    if (productObj.variants && Array.isArray(productObj.variants)) {
      productObj.variants = productObj.variants.map((variant) => {
        if (variant.images && Array.isArray(variant.images)) {
          variant.images = variant.images.map((img) => {
            if (typeof img === "string") {
              if (img.startsWith("assets/")) {
                // Keep assets/ as-is since CSV images are stored in assets folder
                const publicId = img;
                const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
                if (cloudName) {
                  return `https://res.cloudinary.com/${cloudName}/image/upload/${publicId}`;
                }
              }
              if (img.startsWith("http")) {
                return img;
              }
            }
            return img;
          });
        }
        return variant;
      });
    }

    // Get legacy variants if needed
    const legacyVariants = await Variant.find({ productId }).lean();
    if (
      legacyVariants.length > 0 &&
      (!productObj.variants || productObj.variants.length === 0)
    ) {
      productObj.variants = legacyVariants.map((v) => ({
        ...v,
        _id: v._id.toString(),
      }));
    }

    res.status(200).json({
      success: true,
      product: productObj,
    });
  } catch (err) {
    console.error("❌ Admin Error fetching product:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

module.exports = {
  getAllProducts,
  getProductById,
};
