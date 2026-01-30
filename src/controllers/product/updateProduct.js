const Product = require("../../models/Product");
const Category = require("../../models/Category");
const mongoose = require("mongoose");
const { generateUniqueUrlKey } = require("../../utils/slugGenerator");
const { generateUniqueSku, validateSku } = require("../../utils/skuGenerator");
const {
  extractImagePublicIds,
  finalizeImages,
} = require("../../utils/mediaFinalizer");
const { processVariantOptions } = require("../../utils/variantNameFormatter");
const bundleService = require("../../features/product/bundle.service");
const { triggerRevalidation } = require("../../services/revalidateService");

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
      subCategories,
      // Product type and bundle configuration
      product_type,
      bundle_config,
      // Direct pricing/stock fields (for simple/bundle products)
      price,
      stock,
      offerPrice,
      offerStartAt,
      offerEndAt,
      // Quantity-based tier pricing
      quantityRules,
      // Legacy fields
      name,
    } = req.body;

    // DEBUG: Log bundle-related fields
    console.log("📦 [updateProduct] Received bundle fields:", {
      product_type,
      bundle_config,
      price,
      stock,
      offerPrice,
      hasProductType: product_type !== undefined,
      hasBundleConfig: bundle_config !== undefined,
      bodyKeys: Object.keys(req.body),
    });

    // Find product
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Validate bundle configuration for BUNDLE products
    const effectiveProductType =
      product_type !== undefined ? product_type : product.product_type;
    if (effectiveProductType === "BUNDLE" && bundle_config !== undefined) {
      const bundleValidation =
        await bundleService.validateBundleConfig(bundle_config);
      if (!bundleValidation.valid) {
        return res.status(400).json({
          success: false,
          errorCode: "INVALID_BUNDLE_CONFIG",
          message: "Invalid bundle configuration",
          errors: bundleValidation.errors,
        });
      }
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
          product.url_key,
        );
      }
    }

    // Update other fields
    if (description !== undefined) product.description = description;
    if (status !== undefined) product.status = status;
    if (pricing !== undefined) product.pricing = pricing;
    if (stockObj !== undefined) product.stockObj = stockObj;

    // Update product type and bundle configuration
    if (product_type !== undefined) product.product_type = product_type;
    if (bundle_config !== undefined) product.bundle_config = bundle_config;

    // Update direct pricing fields (for simple/bundle products)
    if (price !== undefined) product.price = price;
    if (stock !== undefined) product.stock = stock;
    if (offerPrice !== undefined) product.offerPrice = offerPrice;
    if (offerStartAt !== undefined) product.offerStartAt = offerStartAt;
    if (offerEndAt !== undefined) product.offerEndAt = offerEndAt;

    // CLEANUP: Explicitly remove choice_config if it exists (deprecated/misplaced)
    if (product.toObject().choice_config) {
      product.choice_config = undefined;
    }

    // Update quantity-based tier pricing
    if (quantityRules !== undefined) {
      let parsedRules = quantityRules;
      if (typeof quantityRules === "string") {
        try {
          parsedRules = JSON.parse(quantityRules);
        } catch (e) {
          parsedRules = [];
        }
      }
      product.quantityRules =
        Array.isArray(parsedRules) && parsedRules.length > 0
          ? parsedRules.map((rule) => ({
              minQty: parseInt(rule.minQty),
              price: parseFloat(rule.price),
            }))
          : [];
    }

    // Update category
    if (category) {
      let categoryId = category;
      let categoryName = null;
      let categoryCode = null;

      if (!mongoose.Types.ObjectId.isValid(category)) {
        const foundCategory = await Category.findOne({
          name: category.trim(),
          isActive: true,
        });
        if (foundCategory) {
          categoryId = foundCategory._id;
          categoryName = foundCategory.name;
          categoryCode = foundCategory.code;
        }
      } else {
        const foundCategory = await Category.findById(category);
        if (foundCategory && foundCategory.isActive) {
          categoryName = foundCategory.name;
          categoryCode = foundCategory.code;
        }
      }

      if (categoryId) {
        product.category = categoryId;
        if (categoryName) product.categoryName = categoryName;
        if (categoryCode) product.categoryCode = categoryCode;
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
            (code, index) =>
              code && newCodes[index] && code !== newCodes[index],
          );

          if (codesChanged) {
            return res.status(400).json({
              success: false,
              message:
                "Cannot change variant option codes when variants exist.",
              error: "Variant option codes are locked",
            });
          }
        }
      }

      // Strip hex values from values - uiMeta handles hex separately
      // Also capitalize variant option names and add "M" suffix for size patterns
      const cleanedVariantOptions = processVariantOptions(variantOptions).map(
        (opt) => ({
          ...opt,
          values: (opt.values || []).map(({ hex, ...rest }) => rest),
        }),
      );

      product.variantOptions = cleanedVariantOptions;
    }

    // Update additional fields
    // Update SKU with auto-generation fallback
    if (sku !== undefined) product.sku = sku;

    if (
      !product.sku ||
      (typeof product.sku === "string" && !product.sku.trim())
    ) {
      const checkSkuExists = async (s) => {
        const existing = await Product.findOne({
          $or: [{ sku: s }, { "variants.sku": s }],
          _id: { $ne: productId },
        });
        return !!existing;
      };

      try {
        if (!product.categoryCode && product.category) {
          const foundCat = await Category.findById(product.category);
          if (foundCat) product.categoryCode = foundCat.code;
        }

        product.sku = await generateUniqueSku(null, checkSkuExists, null, {
          strategy: "structured",
          categoryCode: product.categoryCode || "GEN",
          productName: product.title,
        });
        console.log("✅ Auto-generated SKU in update:", product.sku);
      } catch (e) {
        console.error("Failed generate SKU update:", e);
      }
    }
    if (url_key !== undefined) product.url_key = url_key;
    if (subtitle !== undefined) product.subtitle = subtitle;
    if (shortDescription !== undefined)
      product.shortDescription = shortDescription;
    if (tags !== undefined) product.tags = tags;
    if (metaTitle !== undefined) product.metaTitle = metaTitle;
    if (metaDescription !== undefined)
      product.metaDescription = metaDescription;

    // Update subcategories
    if (subCategories !== undefined) {
      if (typeof subCategories === "string") {
        try {
          product.subCategories = JSON.parse(subCategories);
        } catch (e) {
          console.error("Error parsing subCategories JSON:", e);
        }
      } else if (Array.isArray(subCategories)) {
        product.subCategories = subCategories;
      }
    }

    // Update product-level images
    if (req.body.images !== undefined) {
      try {
        const imagesData =
          typeof req.body.images === "string"
            ? JSON.parse(req.body.images)
            : req.body.images;

        if (Array.isArray(imagesData)) {
          // Extract URLs from Cloudinary metadata objects or use strings directly
          product.images = imagesData
            .map((img) => {
              if (typeof img === "string") return img;
              if (img && typeof img === "object" && img.url) return img.url;
              return null;
            })
            .filter(Boolean);
        }
      } catch (err) {
        console.error("Error parsing product images:", err);
      }
    }

    // Update variants (new structure)
    if (variantsArray !== undefined && Array.isArray(variantsArray)) {
      const { generateSlug } = require("../../utils/slugGenerator");

      const processedVariants = variantsArray.map((v, index) => {
        // Process variant images - handle both file uploads and Cloudinary metadata
        let variantImages = [];

        // First, collect existing images from variant data
        if (v.images && Array.isArray(v.images)) {
          // Extract URLs from Cloudinary metadata objects or use strings directly
          variantImages = v.images
            .map((img) => {
              if (typeof img === "string") return img;
              if (img && typeof img === "object" && img.url) return img.url;
              return null;
            })
            .filter(Boolean);
        }

        // Then, add newly uploaded files (merge, don't replace)
        if (req.files && req.files.length > 0) {
          const uploadedFiles = req.files
            .filter((f) => f.fieldname.includes(v.sku || v.id || index))
            .map((f) => f.path);
          // Append new uploads to existing images
          variantImages = [...variantImages, ...uploadedFiles];
        }

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
          id: v.id || `variant-${crypto.randomUUID()}`,
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
          images: variantImages,
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
      // Clean up details by removing empty/irrelevant fields
      const cleanedDetails = details.map((section) => {
        const cleanedSection = {
          title: section.title,
          type: section.type,
        };

        // Only include description for description-type sections and if not empty
        if (section.type === "description" && section.description) {
          cleanedSection.description = section.description;
        }

        // Clean fields based on their structure
        cleanedSection.fields = (section.fields || []).map((field) => {
          // If field has 'type' property (list/badge), only include type and data
          if (field.type && (field.type === "list" || field.type === "badge")) {
            return {
              type: field.type,
              data: field.data || [],
            };
          }
          // Otherwise it's a label-value pair, only include label and value
          else if (field.label !== undefined && field.value !== undefined) {
            return {
              label: field.label,
              value: field.value,
            };
          }
          // Fallback: return as-is but this shouldn't happen
          return field;
        });

        return cleanedSection;
      });

      product.details = cleanedDetails;
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
      const hasPrice =
        (product.pricing?.price && product.pricing.price > 0) ||
        (pricing?.price && pricing.price > 0);
      if (!hasPrice) {
        missingFields.push("price (must be greater than 0)");
      }

      // Check stock - support both structures (allow 0)
      // Exception: BUNDLE and CONFIGURABLE products derive stock dynamically
      const isBundleOrConfigurable =
        product.product_type === "BUNDLE" ||
        product.product_type === "CONFIGURABLE";

      const hasStock =
        isBundleOrConfigurable ||
        product.stockObj?.available !== undefined ||
        stockObj?.available !== undefined;
      if (!hasStock) {
        missingFields.push("stock");
      }

      // If any required fields are missing, force to draft
      if (missingFields.length > 0) {
        console.log(
          `⚠️ Product cannot be published - missing required fields: ${missingFields.join(
            ", ",
          )}`,
        );
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
        const finalizeResult = await finalizeImages(
          imagePublicIds,
          "product",
          product._id,
        );
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
        finalizeError,
      );
    }

    // Legacy variants handling removed - variants are now embedded in Product document

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
