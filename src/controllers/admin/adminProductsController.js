const Product = require("../../models/Product");
const Variant = require("../../models/Variant");
const { formatProductResponse } = require("../../utils/formatProductResponse");
const { transformForDashboard } = require("../../utils/transformForDashboard");

const escapeRegex = require("../../utils/escapeRegex");
const logger = require("../../utils/logger");

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

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 200);
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
      const safeSearch = escapeRegex(search);
      const searchRegex = { $regex: safeSearch, $options: "i" };
      filter.$or = [
        { title: searchRegex },
        { name: searchRegex },
        { description: searchRegex },
        { "variants.sku": searchRegex }, // Search in variant SKUs
        { sku: searchRegex }, // Search in parent SKU if exists
      ];
    }

    // Build sort — whitelist to prevent NoSQL injection via arbitrary key names
    const ALLOWED_SORT_FIELDS = ["createdAt", "updatedAt", "title", "price", "stock"];
    const safeSort = ALLOWED_SORT_FIELDS.includes(sortBy) ? sortBy : "createdAt";
    const sort = {};
    sort[safeSort] = parseInt(sortOrder, 10);

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
    logger.error("❌ Admin Error fetching products:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
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

    // Format product for admin
    const productObj = { ...product };
    productObj._id = productObj._id?.toString();
    productObj.collections = Array.isArray(productObj.collections)
      ? productObj.collections.filter(Boolean)
      : [];
    productObj.badgeCollection = productObj.badgeCollection || null;

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
    logger.error("❌ Admin Error fetching product:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
          });
  }
};

/**
 * Admin: Lightweight product search for bundle child picker
 */
const searchProducts = async (req, res) => {
  try {
    const { q, product_type = "SIMPLE", limit = 20 } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(200).json({
        success: true,
        data: [],
        message: "Search term must be at least 2 characters",
      });
    }

    const searchRegex = new RegExp(escapeRegex(q.trim()), "i");

    const productTypes = String(product_type)
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const productTypeFilter =
      productTypes.length > 1
        ? { product_type: { $in: productTypes } }
        : { product_type: productTypes[0] || "SIMPLE" };

    const products = await Product.find({
      $or: [{ sku: searchRegex }, { title: searchRegex }],
      ...productTypeFilter,
      status: "published",
    })
      .select("_id title sku url_key stockObj product_type")
      .limit(parseInt(limit))
      .lean();

    const data = products.map((p) => ({
      _id: p._id,
      title: p.title,
      sku: p.sku,
      url_key: p.url_key,
      stock: p.stockObj?.available ?? 0,
      product_type: p.product_type,
    }));

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    logger.error("Admin product search error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Search failed",
    });
  }
};

/**
 * Admin: Lookup product/variant by SKU
 */
const skuLookup = async (req, res) => {
  try {
    const { sku } = req.query;
    if (!sku || typeof sku !== "string" || !sku.trim()) {
      return res.status(400).json({
        success: false,
        message: "sku query param is required",
      });
    }

    const trimmedSku = sku.trim();

    let product = await Product.findOne({
      sku: trimmedSku,
      status: "published",
    })
      .select("title url_key product_type sku stockObj stock")
      .lean();

    if (product) {
      const available = product.stockObj?.available ?? product.stock ?? 0;
      return res.status(200).json({
        success: true,
        data: {
          sku: product.sku,
          title: product.title,
          url_key: product.url_key,
          product_type: product.product_type || "SIMPLE",
          available,
        },
      });
    }

    product = await Product.findOne({
      "variants.sku": trimmedSku,
      status: "published",
    })
      .select(
        "title url_key product_type variants.sku variants.url_key variants.attributes variants.options variants.stockObj variants.stock",
      )
      .lean();

    if (product) {
      const variant = (product.variants || []).find(
        (v) => v.sku === trimmedSku,
      );
      const variantUrlKey = variant?.url_key || product.url_key;
      const attrs = variant?.attributes || variant?.options;
      const attrStr =
        attrs && typeof attrs === "object"
          ? Object.values(attrs).join(" / ")
          : "";
      const title = attrStr ? `${product.title} - ${attrStr}` : product.title;
      const available = variant?.stockObj?.available ?? variant?.stock ?? 0;

      return res.status(200).json({
        success: true,
        data: {
          sku: trimmedSku,
          title,
          url_key: variantUrlKey,
          product_type: "CONFIGURABLE",
          available,
        },
      });
    }

    return res.status(404).json({
      success: false,
      message: `SKU "${trimmedSku}" not found`,
    });
  } catch (error) {
    logger.error("Admin sku-lookup error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Lookup failed",
    });
  }
};

module.exports = {
  getAllProducts,
  getProductById,
  searchProducts,
  skuLookup,
};
