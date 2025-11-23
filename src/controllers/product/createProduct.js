const Product = require("../../models/Product");
const Variant = require("../../models/Variant");
const Category = require("../../models/Category");
const mongoose = require("mongoose");
const { generateUniqueUrlKey } = require("../../utils/slugGenerator");

const createProduct = async (req, res) => {
  try {
    // Support both new structure and legacy structure
    const {
      // New structure fields
      title,
      description,
      category,
      status = "draft",
      variantOptions,
      variants: variantsArray,
      details,
      pricing, // Parent-level pricing
      stockObj, // Parent-level stock
      refreshSlug = false,
      // Legacy fields (for backward compatibility)
      name,
      variants: legacyVariants,
    } = req.body;

    // Use title or name (backward compatibility)
    const productTitle = title || name;
    if (!productTitle) {
      return res.status(400).json({
        success: false,
        message: "Product title/name is required",
      });
    }

    // Handle category - can be ObjectId or category name
    let categoryId = category;
    let categoryName = null;

    if (!mongoose.Types.ObjectId.isValid(category)) {
      const foundCategory = await Category.findOne({
        name: category.trim(),
        isActive: true,
      });
      if (foundCategory) {
        categoryId = foundCategory._id;
        categoryName = foundCategory.name;
      } else {
        return res.status(400).json({
          success: false,
          message: `Category "${category}" not found. Please create the category first.`,
        });
      }
    } else {
      const foundCategory = await Category.findById(category);
      if (!foundCategory || !foundCategory.isActive) {
        return res.status(400).json({
          success: false,
          message: "Category not found or inactive",
        });
      }
      categoryName = foundCategory.name;
    }

    // Generate url_key
    const checkUrlKeyExists = async (urlKey) => {
      const existing = await Product.findOne({ url_key: urlKey });
      return !!existing;
    };

    const url_key = await generateUniqueUrlKey(productTitle, checkUrlKeyExists);

    // Process variants (new structure)
    let processedVariants = [];
    if (variantsArray && Array.isArray(variantsArray)) {
      processedVariants = variantsArray.map((v, index) => {
        // Map images from uploaded files
        const images =
          req.files && req.files.length > 0
            ? req.files
                .filter((f) => f.fieldname.includes(v.sku || v.id || index))
                .map((f) => f.path)
            : v.images || [];

        // Convert attributes/options object to Map if needed
        let attributesMap = new Map();
        const attrs = v.attributes || v.options || {};
        if (attrs) {
          if (attrs instanceof Map) {
            attributesMap = attrs;
          } else if (typeof attrs === "object") {
            attributesMap = new Map(Object.entries(attrs));
          }
        }

        // Support both direct fields and nested pricing/stock
        const price = v.pricing?.price || v.price || 0;
        const discountPrice =
          v.pricing?.discountPrice || v.discountPrice || null;
        const stock =
          v.stockObj?.available !== undefined
            ? v.stockObj.available
            : v.stock || 0;
        const isInStock =
          v.stockObj?.isInStock !== undefined
            ? v.stockObj.isInStock
            : stock > 0;

        return {
          id: v.id || `variant-${Date.now()}-${index}`,
          sku: v.sku,
          // Keep direct fields for backward compatibility
          price: price,
          discountPrice: discountPrice,
          stock: stock,
          // New nested format
          pricing: {
            price: price,
            ...(discountPrice ? { discountPrice: discountPrice } : {}),
          },
          stockObj: {
            available: stock,
            isInStock: isInStock,
          },
          images: images,
          attributes: attributesMap, // New format
          options: attributesMap, // Keep for backward compatibility
          weight: v.weight,
          length: v.length,
          height: v.height,
          width: v.width,
        };
      });
    }

    // Process legacy variants (backward compatibility)
    let legacyVariantsArray = [];
    if (legacyVariants && typeof legacyVariants === "string") {
      try {
        legacyVariantsArray = JSON.parse(legacyVariants);
      } catch (e) {
        legacyVariantsArray = [];
      }
    } else if (Array.isArray(legacyVariants)) {
      legacyVariantsArray = legacyVariants;
    }

    // Create product with new structure
    const productData = {
      title: productTitle,
      name: productTitle, // Auto-synced from title in pre-save middleware
      description: description || null,
      category: categoryId,
      categoryName: categoryName,
      url_key: url_key,
      status: status,
      variantOptions: variantOptions || [],
      variants: processedVariants,
      details: details || [],
      pricing: pricing || null, // Parent-level pricing
      stockObj: stockObj || null, // Parent-level stock
      // DO NOT allow rating fields to be set manually
      averageRating: 0,
      totalReviews: 0,
    };

    const product = await Product.create(productData);

    // Create legacy variants if provided (for backward compatibility)
    if (legacyVariantsArray.length > 0) {
      const variantData = legacyVariantsArray.map((v) => {
        const images =
          req.files && req.files.length > 0
            ? req.files
                .filter((f) => f.fieldname.includes(v.sku || v.age))
                .map((f) => f.path)
            : [];

        return {
          productId: product._id,
          color: v.color,
          age: v.age,
          price: v.price,
          stock: v.stock,
          sku: v.sku,
          images: images,
        };
      });

      await Variant.insertMany(variantData);
    }

    // No need to set selectedOptions - variant selection is determined from URL

    res.status(201).json({
      success: true,
      message: "Product created successfully",
      product: {
        _id: product._id.toString(),
        title: product.title,
        url_key: product.url_key,
        variants: product.variants,
      },
    });
  } catch (err) {
    console.error("❌ Error creating product:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

module.exports = createProduct;
