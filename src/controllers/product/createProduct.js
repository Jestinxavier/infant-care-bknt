const Product = require("../../models/Product");
const Variant = require("../../models/Variant");
const Category = require("../../models/Category");
const mongoose = require("mongoose");
const { generateUniqueUrlKey } = require("../../utils/slugGenerator");
const {
  extractImagePublicIds,
  finalizeImages,
} = require("../../utils/mediaFinalizer");

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
      variants: legacyVariants,
      // Additional fields
      sku,
      url_key,
      subtitle,
      shortDescription,
      tags,
      metaTitle,
      metaDescription,
    } = parsedBody;

    // Use title or name (backward compatibility)
    const productTitle = title || name;
    if (!productTitle) {
      return res.status(400).json({
        success: false,
        message: "Product title/name is required",
      });
    }

    // Normalize status to lowercase - Product model expects: draft, proposed, published, rejected
    let normalizedStatus = status || "draft";
    if (typeof normalizedStatus === "string") {
      normalizedStatus = normalizedStatus.toLowerCase();
      // Map "archived" to "draft" since Product model doesn't support "archived"
      // Valid statuses: draft, proposed, published, rejected
      const validStatuses = ["draft", "proposed", "published", "rejected"];
      if (!validStatuses.includes(normalizedStatus)) {
        // Map common variations
        if (normalizedStatus === "archived") {
          normalizedStatus = "draft"; // Archive not supported, use draft
        } else {
          normalizedStatus = "draft";
        }
      }
    }

    // Handle category - can be ObjectId or category name
    let categoryId = category;
    let categoryName = null;

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
    }

    // Generate url_key if not provided
    let productUrlKey = url_key;
    if (!productUrlKey) {
      const checkUrlKeyExists = async (urlKey) => {
        const existing = await Product.findOne({ url_key: urlKey });
        return !!existing;
      };
      productUrlKey = await generateUniqueUrlKey(
        productTitle,
        checkUrlKeyExists
      );
    }

    // Process product images
    let productImages = [];

    // First, check if images metadata was sent as JSON
    if (parsedBody.images && typeof parsedBody.images === "string") {
      try {
        const imageMetadata = JSON.parse(parsedBody.images);
        if (Array.isArray(imageMetadata)) {
          productImages = imageMetadata;
        }
      } catch (e) {
        console.error("Error parsing images JSON:", e);
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
      processedVariants = variantsArray.map((v, index) => {
        // Process variant images
        let variantImages = [];

        // First, use images from variant object (metadata already uploaded)
        if (v.images && Array.isArray(v.images)) {
          variantImages = v.images.map((img) => {
            if (typeof img === "object" && img.url) {
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
          images: variantImages,
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

    // Parse tags if it's a string
    let parsedTags = [];
    if (tags) {
      if (typeof tags === "string") {
        parsedTags = tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
      } else if (Array.isArray(tags)) {
        parsedTags = tags;
      }
    }

    // Create product with new structure
    const productData = {
      title: productTitle,
      name: productTitle, // Auto-synced from title in pre-save middleware
      subtitle: subtitle || null,
      description: description || null,
      shortDescription: shortDescription || null,
      category: categoryId,
      categoryName: categoryName,
      url_key: productUrlKey,
      status: normalizedStatus,
      sku: sku || null,
      variantOptions: variantOptions || [],
      variants: processedVariants,
      details: details || [],
      pricing: pricing || null, // Parent-level pricing
      stockObj: stockObj || null, // Parent-level stock
      tags: parsedTags,
      images: productImages.length > 0 ? productImages : undefined,
      thumbnail: productImages.length > 0 ? productImages[0]?.url : undefined,
      metaTitle: metaTitle || null,
      metaDescription: metaDescription || null,
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

    // Mark all images as final (remove temp tags)
    try {
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

    // Handle validation errors
    if (err.name === "ValidationError") {
      const validationErrors = Object.keys(err.errors || {}).map((key) => ({
        field: key,
        message: err.errors[key].message,
      }));
      return res.status(400).json({
        success: false,
        message: "Validation Error",
        errors: validationErrors,
        error: err.message,
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
      message: "Internal Server Error",
      error: err.message,
      ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    });
  }
};

module.exports = createProduct;
