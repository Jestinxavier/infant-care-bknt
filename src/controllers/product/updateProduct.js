const Product = require("../../models/Product");
const Variant = require("../../models/Variant");
const Category = require("../../models/Category");
const mongoose = require("mongoose");
const { generateUniqueUrlKey } = require("../../utils/slugGenerator");
const {
  extractImagePublicIds,
  finalizeImages,
} = require("../../utils/mediaFinalizer");

const updateProduct = async (req, res) => {
  try {
    const {
      productId,
      // New structure fields
      title,
      description,
      category,
      status,
      variantOptions,
      variants: variantsArray,
      details,
      pricing, // Parent-level pricing
      stockObj, // Parent-level stock
      refreshSlug = false,
      // Additional fields
      sku,
      url_key,
      subtitle,
      shortDescription,
      tags,
      metaTitle,
      metaDescription,
      // Legacy fields
      name,
      variants: legacyVariants,
    } = req.body;

    // Find product
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Update title/name
    const newTitle = title || name;
    if (newTitle && newTitle !== product.title) {
      product.title = newTitle;
      product.name = newTitle; // Sync for backward compatibility

      // Regenerate url_key only if refreshSlug is true
      if (refreshSlug) {
        const checkUrlKeyExists = async (urlKey) => {
          const existing = await Product.findOne({
            url_key: urlKey,
            _id: { $ne: productId },
          });
          return !!existing;
        };

        product.url_key = await generateUniqueUrlKey(
          newTitle,
          checkUrlKeyExists,
          product.url_key
        );
      }
    }

    // Update other fields
    if (description !== undefined) product.description = description;
    if (status !== undefined) product.status = status;
    if (pricing !== undefined) product.pricing = pricing;
    if (stockObj !== undefined) product.stockObj = stockObj;

    // Update category
    if (category) {
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
        }
      } else {
        const foundCategory = await Category.findById(category);
        if (foundCategory && foundCategory.isActive) {
          categoryName = foundCategory.name;
        }
      }

      if (categoryId) {
        product.category = categoryId;
        if (categoryName) product.categoryName = categoryName;
      }
    }

    // Update variantOptions with validation
    if (variantOptions !== undefined) {
      // Validate variant option codes are unique
      if (Array.isArray(variantOptions)) {
        const codes = variantOptions.map((opt) => opt.code).filter(Boolean);
        const uniqueCodes = new Set(codes);

        if (codes.length !== uniqueCodes.size) {
          return res.status(400).json({
            success: false,
            message: "Variant option code must be unique per product.",
            error: "Duplicate variant option codes detected",
          });
        }

        // Prevent code changes if variants exist
        if (product.variants && product.variants.length > 0) {
          const existingCodes =
            product.variantOptions?.map((opt) => opt.code) || [];
          const newCodes = variantOptions.map((opt) => opt.code);

          // Check if any codes changed (by comparing at same index)
          const codesChanged = existingCodes.some(
            (code, index) => code && newCodes[index] && code !== newCodes[index]
          );

          if (codesChanged) {
            return res.status(400).json({
              success: false,
              message: "Cannot change variant option codes when variants exist.",
              error: "Variant option codes are locked",
            });
          }
        }
      }

      product.variantOptions = variantOptions;
    }

    // Update additional fields
    if (sku !== undefined) product.sku = sku;
    if (url_key !== undefined) product.url_key = url_key;
    if (subtitle !== undefined) product.subtitle = subtitle;
    if (shortDescription !== undefined) product.shortDescription = shortDescription;
    if (tags !== undefined) product.tags = tags;
    if (metaTitle !== undefined) product.metaTitle = metaTitle;
    if (metaDescription !== undefined) product.metaDescription = metaDescription;

    // Update variants (new structure)
    if (variantsArray !== undefined && Array.isArray(variantsArray)) {
      const { generateSlug } = require("../../utils/slugGenerator");

      const processedVariants = variantsArray.map((v, index) => {
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

        // Generate variant url_key: <parent-url-key>-<color>-<size>
        // Use existing url_key if provided, otherwise generate from attributes
        let variantUrlKey = v.url_key;
        if (!variantUrlKey && product.url_key) {
          const attrsObj = Object.fromEntries(attributesMap);
          const parts = [product.url_key];
          if (attrsObj.color) parts.push(generateSlug(attrsObj.color));
          if (attrsObj.size || attrsObj.age)
            parts.push(generateSlug(attrsObj.size || attrsObj.age));
          variantUrlKey = parts.join("-");
        }

        return {
          id: v.id || `variant-${Date.now()}-${index}`,
          url_key: variantUrlKey, // Store url_key in variant
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
          images: images.length > 0 ? images : v.images || [],
          attributes: attributesMap, // New format
          options: attributesMap, // Keep for backward compatibility
          weight: v.weight,
          length: v.length,
          height: v.height,
          width: v.width,
        };
      });

      product.variants = processedVariants;

      // Auto-select first variant if only one exists
      // No need to set selectedOptions - variant selection is determined from URL
    }

    // Update details
    if (details !== undefined) {
      product.details = details;
    }

    // DO NOT allow rating fields to be updated manually
    // They are calculated from reviews

    // ========================================================================
    // AUTO-DRAFT VALIDATION: If trying to publish, verify required fields
    // ========================================================================
    if (status === "published") {
      const missingFields = [];

      // Check required fields for publishing
      if (!product.title || !product.title.trim()) {
        missingFields.push("title");
      }
      if (!product.sku || !product.sku.trim()) {
        missingFields.push("sku");
      }
      if (!product.category) {
        missingFields.push("category");
      }
      if (!product.images || product.images.length === 0) {
        missingFields.push("images (at least 1 required)");
      }

      // Check price - support both structures
      const hasPrice = (product.pricing?.price && product.pricing.price > 0) ||
        (pricing?.price && pricing.price > 0);
      if (!hasPrice) {
        missingFields.push("price (must be greater than 0)");
      }

      // Check stock - support both structures (allow 0)
      const hasStock = (product.stockObj?.available !== undefined) ||
        (stockObj?.available !== undefined);
      if (!hasStock) {
        missingFields.push("stock");
      }

      // If any required fields are missing, force to draft
      if (missingFields.length > 0) {
        console.log(`⚠️ Product cannot be published - missing required fields: ${missingFields.join(", ")}`);
        console.log("   → Auto-saving as 'draft' instead");
        product.status = "draft";
      }
    }

    await product.save();

    // Mark all images as final (remove temp tags)
    try {
      const productData = {
        images: product.images,
        variants: product.variants,
      };
      const imagePublicIds = extractImagePublicIds(productData);
      if (imagePublicIds.length > 0) {
        const finalizeResult = await finalizeImages(imagePublicIds);
        console.log("✅ [Product] Finalized images:", {
          total: imagePublicIds.length,
          succeeded: finalizeResult.success.length,
          failed: finalizeResult.failed.length,
        });
      }
    } catch (finalizeError) {
      // Non-critical error - log but don't fail the request
      console.warn(
        "⚠️ [Product] Failed to finalize images (non-critical):",
        finalizeError
      );
    }

    // Update legacy variants if provided (for backward compatibility)
    if (legacyVariants) {
      const legacyVariantsArray =
        typeof legacyVariants === "string"
          ? JSON.parse(legacyVariants)
          : legacyVariants;

      for (const v of legacyVariantsArray) {
        let variant = await Variant.findOne({ _id: v._id });
        if (variant) {
          variant.color = v.color || variant.color;
          variant.age = v.age || variant.age;
          variant.price = v.price || variant.price;
          variant.stock = v.stock || variant.stock;

          if (req.files && req.files.length > 0) {
            const images = req.files
              .filter((f) => f.fieldname.includes(v.sku || v.age))
              .map((f) => f.path);
            if (images.length > 0) variant.images = images;
          }

          await variant.save();
        } else {
          const images =
            req.files && req.files.length > 0
              ? req.files
                .filter((f) => f.fieldname.includes(v.sku || v.age))
                .map((f) => f.path)
              : [];

          await Variant.create({
            productId,
            color: v.color,
            age: v.age,
            price: v.price,
            stock: v.stock,
            sku: v.sku,
            images,
          });
        }
      }
    }

    res.status(200).json({
      success: true,
      message: "Product updated successfully",
      product: {
        _id: product._id.toString(),
        title: product.title,
        url_key: product.url_key,
        variants: product.variants,
      },
    });
  } catch (err) {
    console.error("❌ Error updating product:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

module.exports = updateProduct;
