const Product = require("../../models/Product");
const Category = require("../../models/Category");
const mongoose = require("mongoose");
const { generateUniqueUrlKey, generateSlug } = require("../../utils/slugGenerator");
const {
  generateUniqueSku,
  generateVariantSku,
} = require("../../utils/skuGenerator");
const {
  extractImagePublicIds,
  finalizeImages,
} = require("../../utils/mediaFinalizer");
const {
  processVariantOptions,
  normalizeVariantAttributesToValues,
} = require("../../utils/variantNameFormatter");
const {
  validateCollectionsAndBadge,
  parseCollectionsInput,
} = require("../../utils/collectionUtils");
const {
  sanitizeIncomingFilterAttributes,
  getFilterAttributeCardinalityViolations,
  normalizeFilterValue,
} = require("../../utils/filterAttributes");
const { mergeColorHexUiMeta } = require("../../utils/colorHexMeta");
const bundleService = require("../../features/product/bundle.service");

const norm = (v) =>
  (v ?? "")
    .toString()
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const buildVariantTitle = (parentTitle, productVariantOptions, attributesMap) => {
  const attrsObj =
    attributesMap instanceof Map
      ? Object.fromEntries(attributesMap)
      : { ...(attributesMap || {}) };

  const getAttrValue = (option) => {
    const code = option?.code;
    const name = option?.name;
    for (const [k, v] of Object.entries(attrsObj)) {
      if (norm(k) === norm(code) || norm(k) === norm(name)) {
        return String(v ?? "");
      }
    }
    return "";
  };

  const labels = (productVariantOptions || [])
    .map((option) => {
      const rawValue = getAttrValue(option);
      if (!rawValue) return null;
      const valueDef = (option.values || []).find(
        (val) => norm(val.value) === norm(rawValue)
      );
      return (valueDef?.label || rawValue).trim();
    })
    .filter(Boolean);

  if (!labels.length) return parentTitle;
  return `${parentTitle} - ${labels.join(" / ")}`;
};

const updateProduct = async (req, res) => {
  try {
    // Parse FormData JSON string fields (variants, etc. come as strings from multipart)
    let parsedBody = { ...req.body };
    if (typeof parsedBody.variants === "string") {
      try {
        parsedBody.variants = JSON.parse(parsedBody.variants);
      } catch (e) {
        console.error("Error parsing variants JSON in updateProduct:", e);
        parsedBody.variants = [];
      }
    }
    if (typeof parsedBody.filterAttributes === "string") {
      try {
        parsedBody.filterAttributes = JSON.parse(parsedBody.filterAttributes);
      } catch (e) {
        console.error(
          "Error parsing filterAttributes JSON in updateProduct:",
          e
        );
        parsedBody.filterAttributes = {};
      }
    }
    if (typeof parsedBody.uiMeta === "string") {
      try {
        parsedBody.uiMeta = JSON.parse(parsedBody.uiMeta);
      } catch (e) {
        console.error("Error parsing uiMeta JSON in updateProduct:", e);
        parsedBody.uiMeta = {};
      }
    }

    const {
      productId: bodyProductId,
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
      collections,
      badgeCollection,
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
      filterAttributes,
      filterColorHex,
      uiMeta,
      // Legacy fields
      name,
    } = parsedBody;
    const productId = bodyProductId || req.params.productId;

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
      const bundleValidation = await bundleService.validateBundleConfig(
        bundle_config
      );
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
            $or: [{ url_key: urlKey }, { "variants.url_key": urlKey }],
            _id: { $ne: productId },
          })
            .select("_id")
            .lean();
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

    // Update product type and bundle configuration
    if (product_type !== undefined) product.product_type = product_type;
    if (bundle_config !== undefined) product.bundle_config = bundle_config;

    // Update direct pricing fields (for simple/bundle products)
    if (price !== undefined) product.price = price;
    if (stock !== undefined) product.stock = stock;
    if (offerPrice !== undefined) product.offerPrice = offerPrice;
    if (offerStartAt !== undefined) product.offerStartAt = offerStartAt;
    if (offerEndAt !== undefined) product.offerEndAt = offerEndAt;
    const sanitizedFilterAttributes =
      filterAttributes !== undefined
        ? sanitizeIncomingFilterAttributes(filterAttributes)
        : undefined;

    if (filterAttributes && typeof filterAttributes === "object") {
      const cardinalityViolations = getFilterAttributeCardinalityViolations(
        filterAttributes,
        {
          productType: product_type || product.product_type,
        }
      );

      if (cardinalityViolations.length > 0) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid filterAttributes: some fields accept only a single value.",
          error: "FILTER_ATTRIBUTES_CARDINALITY_ERROR",
          violations: cardinalityViolations.map((item) => ({
            key: item.key,
            values: item.values,
          })),
        });
      }
    }
    if (filterAttributes !== undefined) {
      product.filterAttributes = sanitizedFilterAttributes;
    }

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
    const rawVariantOptionsForUiMeta = Array.isArray(variantOptions)
      ? variantOptions
      : undefined;

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
        })
      );

      product.variantOptions = cleanedVariantOptions;
    }

    const shouldSyncColorHexMeta =
      uiMeta !== undefined ||
      filterColorHex !== undefined ||
      variantOptions !== undefined ||
      filterAttributes !== undefined;

    if (shouldSyncColorHexMeta) {
      const normalizeColorToken = (value) => normalizeFilterValue(value, "color");
      const colorAllowList =
        filterAttributes !== undefined
          ? sanitizedFilterAttributes?.color
          : product.filterAttributes?.color;

      const mergedUiMeta = mergeColorHexUiMeta({
        existingUiMeta: uiMeta !== undefined ? uiMeta : product.uiMeta,
        variantOptions: rawVariantOptionsForUiMeta,
        colorHexInput: filterColorHex,
        normalizeColorToken,
        colorAllowList,
      });

      product.uiMeta =
        mergedUiMeta &&
        typeof mergedUiMeta === "object" &&
        Object.keys(mergedUiMeta).length > 0
          ? mergedUiMeta
          : undefined;
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
    if (
      collections !== undefined ||
      badgeCollection !== undefined ||
      tags !== undefined
    ) {
      const effectiveCollectionsInput =
        collections !== undefined
          ? collections
          : tags !== undefined
          ? parseCollectionsInput(tags)
          : product.collections || [];
      const normalizedIncomingCollections = parseCollectionsInput(
        effectiveCollectionsInput
      );
      const effectiveBadgeInput =
        badgeCollection !== undefined
          ? badgeCollection
          : collections !== undefined &&
            product.badgeCollection &&
            !normalizedIncomingCollections.includes(product.badgeCollection)
          ? null
          : product.badgeCollection || null;
      const parsedCollections = await validateCollectionsAndBadge({
        collections: effectiveCollectionsInput,
        badgeCollection: effectiveBadgeInput,
      });
      product.collections = parsedCollections.collections;
      product.badgeCollection = parsedCollections.badgeCollection;
    }
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
      const usedVariantSkus = new Set();
      const usedVariantUrlKeys = new Set();

      const checkAnySkuExists = async (s) => {
        if (!s) return false;
        const existing = await Product.findOne({
          $or: [{ sku: s }, { "variants.sku": s }],
          _id: { $ne: productId },
        })
          .select("_id")
          .lean();
        return !!existing;
      };

      const checkAnyUrlKeyExists = async (urlKey) => {
        if (!urlKey) return false;
        const existing = await Product.findOne({
          $or: [{ url_key: urlKey }, { "variants.url_key": urlKey }],
          _id: { $ne: productId },
        })
          .select("_id")
          .lean();
        return !!existing;
      };

      const ensureUniqueVariantSku = async (inputSku, index) => {
        const fallbackBase = `${product.sku || "VAR"}-${String(index + 1).padStart(
          2,
          "0"
        )}`;
        const baseSku = (inputSku || "").toString().trim() || fallbackBase;
        let candidate = baseSku;
        let counter = 2;

        while (
          usedVariantSkus.has(candidate) ||
          (await checkAnySkuExists(candidate))
        ) {
          candidate = `${baseSku}-${String(counter).padStart(2, "0")}`;
          counter++;
        }

        usedVariantSkus.add(candidate);
        return candidate;
      };

      const ensureUniqueVariantUrlKey = async (inputUrlKey, index) => {
        const fallbackBase = `${product.url_key || "product"}-variant-${index + 1}`;
        const normalizedBase = generateSlug(
          (inputUrlKey || "").toString().trim() || fallbackBase
        );
        let candidate = normalizedBase;
        let counter = 2;

        while (
          usedVariantUrlKeys.has(candidate) ||
          (await checkAnyUrlKeyExists(candidate))
        ) {
          candidate = `${normalizedBase}-${counter}`;
          counter++;
        }

        usedVariantUrlKeys.add(candidate);
        return candidate;
      };

      const processedVariants = [];
      for (let index = 0; index < variantsArray.length; index++) {
        const v = variantsArray[index];
        // Process variant images - handle both file uploads and Cloudinary metadata
        let variantImages = [];

        // First, collect existing images from variant data
        if (v.images && Array.isArray(v.images)) {
          // Extract URLs from Cloudinary metadata objects or use strings directly.
          // If an element is a JSON string (e.g. stringified array of objects), parse and flatten.
          const flattenToUrls = (img) => {
            if (typeof img === "string") {
              if (img.startsWith("http") || img.startsWith("/")) return img;
              if (img.trim().startsWith("[")) {
                try {
                  const arr = JSON.parse(img);
                  return Array.isArray(arr)
                    ? arr.flatMap(flattenToUrls)
                    : [img];
                } catch (e) {
                  return [img];
                }
              }
              return [img];
            }
            if (img && typeof img === "object" && img.url) return [img.url];
            return [];
          };
          variantImages = v.images.flatMap(flattenToUrls).filter(Boolean);
        }

        // Then, add newly uploaded files (merge, don't replace)
        if (req.files && req.files.length > 0) {
          const uploadedFiles = req.files
            .filter((f) => f.fieldname.includes(v.sku || v.id || index))
            .map((f) => f.path);
          // Append new uploads to existing images
          variantImages = [...variantImages, ...uploadedFiles];
        }

        // Convert attributes/options object to Map if needed, then normalize to store values (not labels)
        let attributesMap = new Map();
        const attrs = v.attributes || v.options || {};
        if (attrs) {
          if (attrs instanceof Map) {
            attributesMap = attrs;
          } else if (typeof attrs === "object") {
            attributesMap = new Map(Object.entries(attrs));
          }
        }
        attributesMap = normalizeVariantAttributesToValues(
          product.variantOptions || [],
          attributesMap
        );

        // Variant document shape: price, offerPrice, offerStartAt, offerEndAt at root (see product.model variantSchema)
        // Dashboard may send v.pricing.{price,discountPrice} or v.price, v.offerPrice
        const price =
          v.price != null && v.price !== ""
            ? Number(v.price)
            : v.pricing && v.pricing.price != null
            ? Number(v.pricing.price)
            : 0;
        const stock =
          v.stockObj && v.stockObj.available !== undefined
            ? v.stockObj.available
            : v.stock !== undefined && v.stock !== null
            ? Number(v.stock)
            : 0;
        const isInStock =
          v.stockObj && v.stockObj.isInStock !== undefined
            ? v.stockObj.isInStock
            : stock > 0;
        // Schema fields: offerPrice, offerStartAt, offerEndAt (stored at variant root)
        const offerPriceRaw =
          v.offerPrice != null
            ? v.offerPrice
            : v.pricing && v.pricing.discountPrice != null
            ? v.pricing.discountPrice
            : v.discountPrice;
        const offerPrice =
          offerPriceRaw != null && offerPriceRaw !== ""
            ? Number(offerPriceRaw)
            : undefined;
        const offerStartAtRaw =
          v.offerStartAt != null && v.offerStartAt !== ""
            ? v.offerStartAt
            : v.pricing && v.pricing.offerStartAt != null
            ? v.pricing.offerStartAt
            : null;
        const offerStartAtDate = offerStartAtRaw
          ? new Date(offerStartAtRaw)
          : null;
        const offerStartAt =
          offerStartAtDate && !isNaN(offerStartAtDate.getTime())
            ? offerStartAtDate
            : undefined;
        const offerEndAtRaw =
          v.offerEndAt != null && v.offerEndAt !== ""
            ? v.offerEndAt
            : v.pricing && v.pricing.offerEndAt != null
            ? v.pricing.offerEndAt
            : null;
        const offerEndAtDate = offerEndAtRaw ? new Date(offerEndAtRaw) : null;
        const offerEndAt =
          offerEndAtDate && !isNaN(offerEndAtDate.getTime())
            ? offerEndAtDate
            : undefined;

        // Auto-generate variant SKU when missing (align with createProduct / product.service)
        let variantSku = v.sku;
        if (
          !variantSku ||
          (typeof variantSku === "string" && !variantSku.trim())
        ) {
          const attrsObj = Object.fromEntries(attributesMap);
          variantSku = generateVariantSku(product.sku, attrsObj);
        }
        variantSku = await ensureUniqueVariantSku(variantSku, index);

        // Generate variant url_key: <parent-url-key>-<color>-<size>-<sku|index> (unique per variant)
        let variantUrlKey = v.url_key;
        if (!variantUrlKey && product.url_key) {
          const attrsObj = Object.fromEntries(attributesMap);
          const parts = [product.url_key];
          if (attrsObj.color) parts.push(generateSlug(attrsObj.color));
          if (attrsObj.size || attrsObj.age)
            parts.push(generateSlug(attrsObj.size || attrsObj.age));
          variantUrlKey = parts.join("-");
          variantUrlKey = `${variantUrlKey}-${variantSku}`;
        }
        variantUrlKey = await ensureUniqueVariantUrlKey(variantUrlKey, index);
        const variantName = buildVariantTitle(
          product.title,
          product.variantOptions || [],
          attributesMap
        );

        processedVariants.push({
          id: v.id || `variant-${crypto.randomUUID()}`,
          name: variantName,
          url_key: variantUrlKey,
          sku: variantSku,
          price,
          stock,
          offerPrice:
            offerPrice != null && offerPrice > 0 ? offerPrice : undefined,
          offerStartAt: offerStartAt || undefined,
          offerEndAt: offerEndAt || undefined,
          stockObj: {
            available: stock,
            isInStock: isInStock,
          },
          images: variantImages,
          attributes: attributesMap,
          options: attributesMap,
          weight: v.weight,
          length: v.length,
          height: v.height,
          width: v.width,
        });
      }

      product.variants = processedVariants;
      product.markModified("variants");

      // Auto-select first variant if only one exists
      // No need to set selectedOptions - variant selection is determined from URL
    }

    // Update details
    if (details !== undefined) {
      // Filter out sections with empty title (model requires title)
      const validDetails = (Array.isArray(details) ? details : []).filter(
        (s) => s && (s.title || "").trim()
      );
      // Clean up details by removing empty/irrelevant fields
      const cleanedDetails = validDetails.map((section) => {
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
          // Priority 1: If field has label/value properties, treat as label-value pair
          // This takes precedence over type/data fields (for grid/pair sections)
          if (field.label !== undefined || field.value !== undefined) {
            return {
              label: field.label || "",
              value: field.value || "",
            };
          }
          // Priority 2: If field has 'type' property (list/badge), only include type and data
          // This is for description sections
          if (field.type && (field.type === "list" || field.type === "badge")) {
            return {
              type: field.type,
              data: field.data || [],
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

      // Check price:
      // - CONFIGURABLE: at least one variant must have price > 0
      // - Others: parent price must be > 0
      const isConfigurable = product.product_type === "CONFIGURABLE";
      const hasConfigurableVariantPrice = isConfigurable
        ? (product.variants || []).some((v) => Number(v.price) > 0)
        : false;
      const hasParentPrice =
        Number(product.pricing?.price) > 0 || Number(pricing?.price) > 0;
      const hasPrice = isConfigurable
        ? hasConfigurableVariantPrice
        : hasParentPrice;
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
            ", "
          )}`
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
          product._id
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
        finalizeError
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

    if (
      err.code === "INVALID_COLLECTIONS" ||
      err.code === "INVALID_BADGE_COLLECTION"
    ) {
      return res.status(400).json({
        success: false,
        message: err.message,
        error: "Collection Validation Error",
      });
    }

    // Handle validation errors (Mongoose ValidationError)
    if (err.name === "ValidationError") {
      const validationErrors = Object.keys(err.errors || {}).map((key) => ({
        field: key,
        message: err.errors[key].message,
      }));
      return res.status(400).json({
        success: false,
        message: err.message,
        error: "Validation Error",
        errors: validationErrors,
      });
    }

    // Handle duplicate key errors
    if (err.code === 11000) {
      const duplicateField = Object.keys(err.keyPattern || {})[0];
      return res.status(400).json({
        success: false,
        message: `Duplicate value for ${duplicateField}. This ${duplicateField} already exists.`,
        error: err.message,
      });
    }

    res.status(500).json({
      success: false,
      message: err.message,
      error: "Internal Server Error",
      ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    });
  }
};

module.exports = updateProduct;
