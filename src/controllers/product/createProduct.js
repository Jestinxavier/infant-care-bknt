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
const { createOptionsHash } = require("../../utils/variantValidator");
const {
  processVariantOptions,
  normalizeVariantAttributesToValues,
} = require("../../utils/variantNameFormatter");
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

const createProduct = async (req, res) => {
  try {
    console.log("📦 Creating product - Request received");
    console.log("Request body keys:", Object.keys(req.body || {}));
    console.log("Request files:", req.files?.length || 0, "files");

    // Parse FormData fields - FormData sends all fields as strings
    // Need to handle JSON strings and parse them
    let parsedBody = { ...req.body };

    // Parse JSON string fields from FormData
    if (typeof parsedBody.variants === "string") {
      try {
        parsedBody.variants = JSON.parse(parsedBody.variants);
      } catch (e) {
        console.error("Error parsing variants JSON:", e);
        parsedBody.variants = [];
      }
    }

    if (typeof parsedBody.variantOptions === "string") {
      try {
        parsedBody.variantOptions = JSON.parse(parsedBody.variantOptions);
      } catch (e) {
        console.error("Error parsing variantOptions JSON:", e);
        parsedBody.variantOptions = [];
      }
    }

    if (typeof parsedBody.details === "string") {
      try {
        parsedBody.details = JSON.parse(parsedBody.details);
      } catch (e) {
        parsedBody.details = [];
      }
    }

    if (typeof parsedBody.pricing === "string") {
      try {
        parsedBody.pricing = JSON.parse(parsedBody.pricing);
      } catch (e) {
        parsedBody.pricing = null;
      }
    }

    if (typeof parsedBody.stockObj === "string") {
      try {
        parsedBody.stockObj = JSON.parse(parsedBody.stockObj);
      } catch (e) {
        parsedBody.stockObj = null;
      }
    }

    if (typeof parsedBody.subCategories === "string") {
      try {
        parsedBody.subCategories = JSON.parse(parsedBody.subCategories);
      } catch (e) {
        parsedBody.subCategories = [];
      }
    }

    if (typeof parsedBody.bundle_config === "string") {
      try {
        parsedBody.bundle_config = JSON.parse(parsedBody.bundle_config);
      } catch (e) {
        parsedBody.bundle_config = null;
      }
    }

    if (typeof parsedBody.quantityRules === "string") {
      try {
        parsedBody.quantityRules = JSON.parse(parsedBody.quantityRules);
      } catch (e) {
        parsedBody.quantityRules = [];
      }
    }

    // Support both new structure and legacy structure
    const {
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
      // Legacy fields (for backward compatibility)
      name,
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
      // Direct pricing/stock fields
      price,
      stock,
      offerPrice,
      offerStartAt,
      offerEndAt,
      // Quantity-based tier pricing
      quantityRules,
    } = parsedBody;

    // Use title or name (backward compatibility)
    const productTitle = title || name;
    if (!productTitle) {
      return res.status(400).json({
        success: false,
        message: "Product title/name is required",
      });
    }

    // Validate variant option codes are unique
    if (variantOptions && Array.isArray(variantOptions)) {
      const codes = variantOptions.map((opt) => opt.code).filter(Boolean);
      const uniqueCodes = new Set(codes);

      if (codes.length !== uniqueCodes.size) {
        return res.status(400).json({
          success: false,
          message: "Variant option code must be unique per product.",
          error: "Duplicate variant option codes detected",
        });
      }
    }

    // Normalize status to lowercase - Product model expects: draft, published, archived
    let normalizedStatus = status || "draft";
    if (typeof normalizedStatus === "string") {
      normalizedStatus = normalizedStatus.toLowerCase();
      // Valid statuses: draft, published, archived
      const validStatuses = ["draft", "published", "archived"];
      if (!validStatuses.includes(normalizedStatus)) {
        normalizedStatus = "draft"; // Default to draft for invalid statuses
      }
    }

    // Validate bundle configuration for BUNDLE products
    if (product_type === "BUNDLE") {
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

    // Handle category - can be ObjectId or category name
    let categoryId = category;
    let categoryName = null;
    let categoryCode = null;

    if (!mongoose.Types.ObjectId.isValid(category)) {
      // Try exact match first
      let foundCategory = await Category.findOne({
        name: category.trim(),
        isActive: true,
      });

      // If not found, try case-insensitive match
      if (!foundCategory) {
        foundCategory = await Category.findOne({
          name: { $regex: new RegExp(`^${category.trim()}$`, "i") },
          isActive: true,
        });
      }

      // If still not found, try to match partial (e.g., "Romper" -> "Rompers")
      if (!foundCategory) {
        foundCategory = await Category.findOne({
          name: { $regex: new RegExp(`^${category.trim()}s?$`, "i") },
          isActive: true,
        });
      }

      if (foundCategory) {
        categoryId = foundCategory._id;
        categoryName = foundCategory.name;
        categoryCode = foundCategory.code;
      } else {
        console.error(`Category lookup failed for: "${category}"`);
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
      categoryCode = foundCategory.code;
    }

    const checkAnySkuExists = async (s) => {
      if (!s) return false;
      const existing = await Product.findOne({
        $or: [{ sku: s }, { "variants.sku": s }],
      })
        .select("_id")
        .lean();
      return !!existing;
    };

    const checkAnyUrlKeyExists = async (urlKey) => {
      if (!urlKey) return false;
      const existing = await Product.findOne({
        $or: [{ url_key: urlKey }, { "variants.url_key": urlKey }],
      })
        .select("_id")
        .lean();
      return !!existing;
    };

    // Generate url_key if not provided or if provided key already exists (avoid E11000)
    const checkUrlKeyExists = async (urlKey) => {
      return checkAnyUrlKeyExists(urlKey);
    };
    let productUrlKey =
      url_key && typeof url_key === "string" ? url_key.trim() : "";
    if (!productUrlKey || (await checkUrlKeyExists(productUrlKey))) {
      productUrlKey = await generateUniqueUrlKey(
        productTitle,
        checkUrlKeyExists
      );
    }

    // Generate SKU if not provided
    let productSku = sku;
    if (!productSku || (typeof productSku === "string" && !productSku.trim())) {
      try {
        productSku = await generateUniqueSku(null, checkAnySkuExists, null, {
          strategy: "structured",
          categoryCode: categoryCode || "GEN",
          productName: productTitle,
        });
        console.log("✅ Auto-generated SKU:", productSku);
      } catch (skuError) {
        console.error("Failed to generate SKU:", skuError);
        // Verify if we should throw or allow draft save?
        // If we fail generation, we should probably allow draft save but with empty SKU.
      }
    }

    // Process product images
    let productImages = [];

    // First, check if images metadata was sent as JSON
    if (parsedBody.images) {
      if (typeof parsedBody.images === "string") {
        try {
          // Try to parse as JSON string
          const imageMetadata = JSON.parse(parsedBody.images);
          if (Array.isArray(imageMetadata)) {
            productImages = imageMetadata;
          } else if (imageMetadata && typeof imageMetadata === "object") {
            // Single object, wrap in array
            productImages = [imageMetadata];
          }
        } catch (e) {
          console.error("Error parsing images JSON:", e);
          console.error(
            "Images string value:",
            parsedBody.images.substring(0, 200)
          );
          // If parsing fails, try to extract URL if it's a simple string
          if (parsedBody.images.startsWith("http")) {
            productImages = [{ url: parsedBody.images }];
          }
        }
      } else if (Array.isArray(parsedBody.images)) {
        // Already an array
        productImages = parsedBody.images;
      } else if (typeof parsedBody.images === "object") {
        // Single object, wrap in array
        productImages = [parsedBody.images];
      }
    }

    // Then, process any uploaded files (these will be uploaded to Cloudinary)
    if (req.files && req.files.length > 0) {
      // Filter product-level images (not variant images)
      const productImageFiles = req.files.filter(
        (f) =>
          (f.fieldname.startsWith("product_image_") ||
            f.fieldname.startsWith("images")) &&
          !f.fieldname.includes("variant_") &&
          !f.fieldname.includes("variant")
      );

      // Files are already uploaded to Cloudinary by multer-cloudinary
      const uploadedImageMetadata = productImageFiles.map((f) => ({
        url: f.path || f.secure_url || f.url,
        public_id: f.public_id || f.filename,
        width: f.width || 0,
        height: f.height || 0,
        format: f.format || "jpg",
        size: f.bytes || 0,
      }));

      // Combine metadata from JSON and uploaded files
      productImages = [...productImages, ...uploadedImageMetadata];
    }

    // Process variants (new structure)
    let processedVariants = [];
    if (variantsArray && Array.isArray(variantsArray)) {
      const usedVariantSkus = new Set();
      const usedVariantUrlKeys = new Set();

      const ensureUniqueVariantSku = async (inputSku, index) => {
        const fallbackBase = `${productSku || "VAR"}-${String(index + 1).padStart(
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
        const fallbackBase = `${productUrlKey || "product"}-variant-${index + 1}`;
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

      for (let index = 0; index < variantsArray.length; index++) {
        const v = variantsArray[index];
        // Process variant images
        let variantImages = [];

        // First, use images from variant object (metadata already uploaded)
        if (v.images && Array.isArray(v.images)) {
          variantImages = v.images.map((img) => {
            if (typeof img === "object" && img !== null && img.url) {
              return img;
            }
            return typeof img === "string" ? { url: img } : img;
          });
        }

        // Then, add any newly uploaded files for this variant
        if (req.files && req.files.length > 0) {
          const variantImageFiles = req.files.filter((f) => {
            const fieldName = f.fieldname.toLowerCase();
            const variantId = (v.id || "").toString().toLowerCase();
            const variantSku = (v.sku || "").toString().toLowerCase();
            const variantIndexStr = index.toString();

            return (
              fieldName.includes("variant_") &&
              (fieldName.includes(variantId) ||
                fieldName.includes(variantSku) ||
                fieldName.includes(variantIndexStr))
            );
          });

          // Files are already uploaded to Cloudinary by multer-cloudinary
          const uploadedVariantImages = variantImageFiles.map((f) => ({
            url: f.path || f.secure_url || f.url,
            public_id: f.public_id || f.filename,
            width: f.width || 0,
            height: f.height || 0,
            format: f.format || "jpg",
            size: f.bytes || 0,
          }));

          variantImages = [...variantImages, ...uploadedVariantImages];
        }

        // Product model expects variant.images as array of URL strings, not objects
        const variantImageUrls = variantImages
          .map((img) => {
            if (typeof img === "string") return img;
            if (img && typeof img === "object" && img.url) return img.url;
            if (img && typeof img === "object" && (img.path || img.secure_url))
              return img.path || img.secure_url;
            return null;
          })
          .filter(Boolean);

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
          variantOptions || [],
          attributesMap
        );

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

        // ✅ Generate options hash for duplicate detection
        const optionsHash = createOptionsHash(attributesMap);

        // ✅ Auto-generate variant SKU when missing (align with product.service)
        let variantSku = v.sku;
        if (
          !variantSku ||
          (typeof variantSku === "string" && !variantSku.trim())
        ) {
          const attrsObj = Object.fromEntries(attributesMap);
          variantSku = generateVariantSku(productSku, attrsObj);
        }
        variantSku = await ensureUniqueVariantSku(variantSku, index);

        // ✅ Generate unique URL key for variant
        let variantUrlKey = v.url_key;
        if (!variantUrlKey) {
          const attrsObj = Object.fromEntries(attributesMap);
          const colorCode = (attrsObj.color || "").toLowerCase();
          const sizeCode = (attrsObj.size || attrsObj.age || "").toLowerCase();
          const baseSlug = `${productUrlKey}${
            colorCode ? "-" + colorCode : ""
          }${sizeCode ? "-" + sizeCode : ""}`;
          variantUrlKey = `${baseSlug}-${variantSku}`;
        }
        variantUrlKey = await ensureUniqueVariantUrlKey(variantUrlKey, index);
        const variantName = buildVariantTitle(
          productTitle,
          variantOptions || [],
          attributesMap
        );

        processedVariants.push({
          id: v.id || `variant-${crypto.randomUUID()}`,
          name: variantName,
          sku: variantSku,
          url_key: variantUrlKey,
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
          _optionsHash: optionsHash,
          images: variantImageUrls,
          attributes: attributesMap, // New format
          options: attributesMap, // Keep for backward compatibility
          weight: v.weight,
          length: v.length,
          height: v.height,
          width: v.width,
        });
      }
    }

    // Tags - keep as single string (comma-separated if multiple)
    let parsedTags = "";
    if (tags) {
      if (typeof tags === "string") {
        parsedTags = tags.trim(); // Keep as string
      } else if (Array.isArray(tags)) {
        parsedTags = tags.join(",").trim(); // Convert array to comma-separated string
      }
    }

    // Extract URLs from image objects (Product model expects array of strings)
    const productImageUrls = productImages
      .map((img) => {
        // If it's already a string, use it directly
        if (typeof img === "string") return img;
        // If it's an object, extract the URL
        return img.url || img.path || img.secure_url;
      })
      .filter(Boolean); // Remove any null/undefined values

    // ========================================================================
    // AUTO-DRAFT VALIDATION: If trying to publish, verify required fields
    // ========================================================================
    if (normalizedStatus === "published") {
      const missingFields = [];

      // Check required fields for publishing
      if (!productTitle || !productTitle.trim()) {
        missingFields.push("title");
      }
      if (!productSku || !productSku.trim()) {
        missingFields.push("sku");
      }
      if (!categoryId) {
        missingFields.push("category");
      }
      if (!productImageUrls || productImageUrls.length === 0) {
        missingFields.push("images (at least 1 required)");
      }

      // Check price:
      // - CONFIGURABLE: at least one variant must have price > 0
      // - Others: parent price must be > 0
      const isConfigurable = product_type === "CONFIGURABLE";
      const hasConfigurableVariantPrice = isConfigurable
        ? processedVariants.some((v) => Number(v.price) > 0)
        : false;
      const hasParentPrice =
        Number(pricing?.price) > 0 || Number(parsedBody.price) > 0;
      const hasPrice = isConfigurable
        ? hasConfigurableVariantPrice
        : hasParentPrice;
      if (!hasPrice) {
        missingFields.push("price (must be greater than 0)");
      }

      // Check stock - support both structures (allow 0)
      // Exception: BUNDLE and CONFIGURABLE products derive stock dynamically
      const isBundleOrConfigurable =
        product_type === "BUNDLE" || product_type === "CONFIGURABLE";

      const hasStock =
        isBundleOrConfigurable ||
        stockObj?.available !== undefined ||
        parsedBody.stock !== undefined;
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
        normalizedStatus = "draft";
      }
    }

    // ✅ Lock options if variants exist
    const optionsLocked = processedVariants.length > 0;

    // Create product with new structure
    const productData = {
      title: productTitle,
      name: productTitle, // Auto-synced from title in pre-save middleware
      subtitle: subtitle || null,
      description: description || null,
      shortDescription: shortDescription || null,
      category: categoryId,
      categoryName: categoryName,
      categoryCode: categoryCode,
      url_key: productUrlKey,
      status: normalizedStatus,
      sku: productSku || null,
      // Strip hex values from variantOptions.values - uiMeta handles hex separately
      // Also capitalize variant option names and add "M" suffix for size patterns
      variantOptions: variantOptions
        ? processVariantOptions(variantOptions).map((opt) => ({
            ...opt,
            values: (opt.values || []).map(({ hex, ...rest }) => rest),
          }))
        : [],
      variants: processedVariants,
      optionsLocked: optionsLocked, // ✅ NEW: Lock if variants exist
      details: details
        ? details
            .filter((s) => s && (s.title || "").trim())
            .map((section) => {
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
                if (
                  field.type &&
                  (field.type === "list" || field.type === "badge")
                ) {
                  return {
                    type: field.type,
                    data: field.data || [],
                  };
                }
                // Fallback: return as-is
                return field;
              });

              return cleanedSection;
            })
        : [],
      pricing: pricing || null, // Parent-level pricing
      stockObj: stockObj || null, // Parent-level stock
      tags: parsedTags,
      images: productImageUrls.length > 0 ? productImageUrls : undefined,
      thumbnail: productImageUrls.length > 0 ? productImageUrls[0] : undefined,
      metaTitle: metaTitle || null,
      metaDescription: metaDescription || null,
      subCategories: Array.isArray(subCategories) ? subCategories : [],
      // Product type and bundle configuration
      product_type: product_type || "SIMPLE",
      bundle_config: bundle_config || null,
      // Direct pricing/stock fields (for simple/bundle products)
      price: price ? parseFloat(price) : null,
      stock: stock !== undefined ? parseInt(stock) : null,
      offerPrice: offerPrice ? parseFloat(offerPrice) : null,
      offerStartAt: offerStartAt || null,
      offerEndAt: offerEndAt || null,
      // Quantity-based tier pricing
      quantityRules:
        Array.isArray(quantityRules) && quantityRules.length > 0
          ? quantityRules.map((rule) => ({
              minQty: parseInt(rule.minQty),
              price: parseFloat(rule.price),
            }))
          : [],
      // DO NOT allow rating fields to be set manually
      averageRating: 0,
      totalReviews: 0,
    };

    const product = await Product.create(productData);

    // Legacy variant creation removed - all variants are now embedded in Product document

    // Mark all images as final (remove temp tags)
    try {
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
    console.error("Error stack:", err.stack);
    console.error("Request body keys:", Object.keys(req.body || {}));
    console.error("Request files count:", req.files?.length || 0);
    console.error("Error name:", err.name);
    console.error("Error code:", err.code);

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

    // Handle duplicate key errors (e.g., duplicate SKU or url_key)
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

module.exports = createProduct;
