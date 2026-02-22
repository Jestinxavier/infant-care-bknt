// controllers/product/bulkImport.js
const mongoose = require("mongoose");
const Product = require("../../models/Product");
const Variant = require("../../models/Variant");
const Category = require("../../models/Category");
const Collection = require("../../models/Collection");
const CsvTempImage = require("../../models/CsvTempImage");
const Asset = require("../../models/Asset");
const { cloudinary } = require("../../config/cloudinary");
const ApiResponse = require("../../core/ApiResponse");
const asyncHandler = require("../../core/middleware/asyncHandler");
const {
  suggestProductSku,
  generateVariantSku,
  generateUniqueSku,
} = require("../../utils/skuGenerator");
const { generateUniqueUrlKey, generateSlug } = require("../../utils/slugGenerator");
const { processVariantOptions } = require("../../utils/variantNameFormatter");
const {
  parseCollectionsInput,
  validateCollectionsAndBadge,
  normalizeCollectionSlug,
} = require("../../utils/collectionUtils");

// Cloudinary folder for permanent CSV imported images
// CSV imported images should be stored in "assets" folder
const PERMANENT_FOLDER = "assets";

const OBJECT_ID_REGEX = /^[a-fA-F0-9]{24}$/;

const norm = (v) =>
  (v ?? "")
    .toString()
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const normalizeImportFieldKey = (key) =>
  String(key || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

const isFilterAttributesImportField = (key) => {
  const normalized = normalizeImportFieldKey(key);
  return (
    normalized === "filterattributes" ||
    normalized === "filter_attributes" ||
    normalized.startsWith("filterattributes.") ||
    normalized.startsWith("filter_attributes.") ||
    normalized.startsWith("filterattributes_") ||
    normalized.startsWith("filter_attributes_") ||
    normalized.startsWith("filterattributes[") ||
    normalized.startsWith("filter_attributes[")
  );
};

const stripFilterAttributesFromImportObject = (obj) => {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return [];

  const removed = [];
  Object.keys(obj).forEach((key) => {
    if (isFilterAttributesImportField(key)) {
      removed.push(key);
      delete obj[key];
    }
  });
  return removed;
};

function buildVariantTitle(parentTitle, productVariantOptions, attributesMap) {
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
}

function normalizeVariantAttributeValueForHash(value) {
  return String(value)
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Resolve image entry from CSV to Cloudinary URL.
 * Entry can be: full URL (return as-is), Asset _id (MongoDB ObjectId), or publicId.
 * Uses cache to avoid repeated Asset lookups. Saves only URL in DB, not asset ID.
 * @param {string} entry - URL, asset ID (24 hex), or publicId
 * @param {Map<string, string>} assetUrlCache - cache of assetId/publicId → secureUrl
 * @returns {Promise<string|null>} - Cloudinary URL or null if not found
 */
async function resolveImageEntryToUrl(entry, assetUrlCache) {
  if (entry == null || entry === "") return null;
  const trimmed = String(entry).trim();
  if (!trimmed) return null;

  // Already a full URL → use as-is
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  // Check cache
  if (assetUrlCache.has(trimmed)) {
    return assetUrlCache.get(trimmed) || null;
  }

  let asset = null;
  if (OBJECT_ID_REGEX.test(trimmed)) {
    asset = await Asset.findById(trimmed).select("secureUrl").lean();
  } else {
    asset = await Asset.findOne({ publicId: trimmed })
      .select("secureUrl")
      .lean();
  }

  const url = asset && asset.secureUrl ? asset.secureUrl : null;
  if (url) assetUrlCache.set(trimmed, url);
  return url;
}

/**
 * Normalize product details for DB storage (same logic as createProduct/updateProduct).
 * - description sections: fields as { type: "list"|"badge", data: string[] }
 * - grid/pair sections: fields as { label: string, value: string }
 * Ensures CSV-imported details match the shape expected by the Product schema and frontend.
 * @param {Array} details - Raw details array from CSV (details_json)
 * @returns {Array} Normalized details array
 */
function normalizeDetailsForImport(details) {
  if (!Array.isArray(details) || details.length === 0) return [];

  return details
    .filter((s) => s && (s.title || "").trim())
    .map((section) => {
      const cleanedSection = {
        title: section.title,
        type: section.type || "description",
      };
      if (section.type === "description" && section.description) {
        cleanedSection.description = section.description;
      }
      cleanedSection.fields = (section.fields || []).map((field) => {
        if (field.label !== undefined || field.value !== undefined) {
          return {
            label: field.label ?? "",
            value: field.value ?? "",
          };
        }
        if (field.type && (field.type === "list" || field.type === "badge")) {
          return {
            type: field.type,
            data: Array.isArray(field.data) ? field.data : [],
          };
        }
        return field;
      });
      return cleanedSection;
    });
}

/**
 * Bulk Import Controller
 * Handles two-phase atomic CSV import with rollback
 */
class BulkImportController {
  /**
   * Phase 1: Validate CSV data (no writes)
   * POST /api/v1/admin/products/validate-import
   * Body: { products: ParsedParentProduct[] }
   */
  validateImport = asyncHandler(async (req, res) => {
    const { products } = req.body;

    if (!products || !Array.isArray(products) || products.length === 0) {
      return res
        .status(400)
        .json(ApiResponse.error("Products array is required", 400).toJSON());
    }

    const errors = [];
    const warnings = [];
    const tempImagesNeeded = new Set();
    const AttributeDefinition = require("../../models/AttributeDefinition");

    console.log(
      `🔍 [Bulk Import] Validating ${products.length} products (Strict Mode)...`
    );

    // 1️⃣ GLOBAL ATTRIBUTE REGISTRY LOADING
    // Fetch all attributes to enforce strict validation
    const allAttributes = await AttributeDefinition.find({}).lean();

    // Create Lookup Maps:
    // codeMap: "color" -> Attribute Object
    const attributeMap = new Map();
    allAttributes.forEach((attr) => {
      if (attr.code) {
        attributeMap.set(attr.code.toLowerCase(), attr);
      }
      if (attr.name) {
        attributeMap.set(attr.name.toLowerCase(), attr); // Fallback lookup
      }
    });

    console.log(
      `📚 [Bulk Import] Loaded ${attributeMap.size} global attributes for validation.`
    );

    // Fetch all categories for validation
    const categories = await Category.find({})
      .select("name code slug _id")
      .lean();
    const categoryMap = new Map(); // key -> _id
    categories.forEach((cat) => {
      categoryMap.set(cat._id.toString(), cat._id);
      if (cat.name) categoryMap.set(cat.name.toLowerCase().trim(), cat._id);
      if (cat.code) categoryMap.set(cat.code.toLowerCase().trim(), cat._id);
      if (cat.slug) categoryMap.set(cat.slug.toLowerCase().trim(), cat._id);
    });
    const existingCollections = await Collection.find({})
      .select("slug")
      .lean();
    const collectionSlugSet = new Set(
      existingCollections.map((item) => String(item.slug || "").trim())
    );

    // Collect all SKUs from input for duplicate detection
    const inputSkus = new Set();
    const inputIds = new Set();

    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      const rowNum = i + 1;

      // CSV bulk import intentionally excludes filterAttributes fields.
      const removedImportFields = new Set(
        stripFilterAttributesFromImportObject(product)
      );
      if (Array.isArray(product.variants)) {
        product.variants.forEach((variant) => {
          stripFilterAttributesFromImportObject(variant).forEach((key) =>
            removedImportFields.add(`variants.${key}`)
          );
          if (
            variant &&
            typeof variant.attributes === "object" &&
            !Array.isArray(variant.attributes)
          ) {
            stripFilterAttributesFromImportObject(variant.attributes).forEach(
              (key) => removedImportFields.add(`variants.attributes.${key}`)
            );
          }
        });
      }
      if (removedImportFields.size > 0) {
        warnings.push({
          row: rowNum,
          field: "filterAttributes",
          message: `Ignored unsupported filterAttributes fields in CSV import: ${Array.from(
            removedImportFields
          ).join(", ")}`,
        });
      }

      // Check for duplicate SKUs in input
      if (product.sku) {
        if (inputSkus.has(product.sku)) {
          errors.push({
            row: rowNum,
            field: "sku",
            message: `Duplicate SKU in import: ${product.sku}`,
          });
        }
        inputSkus.add(product.sku);
      }

      // Check for duplicate IDs in input
      if (product.csvId && !product.csvId.startsWith("TMP_")) {
        if (inputIds.has(product.csvId)) {
          errors.push({
            row: rowNum,
            field: "csvId",
            message: `Duplicate ID in import: ${product.csvId}`,
          });
        }
        inputIds.add(product.csvId);
      }

      // Validate required fields
      if (!product.title || product.title.trim() === "") {
        errors.push({
          row: rowNum,
          field: "title",
          message: "Title is required",
        });
      }
      // SKU is now optional for new products (it will be auto-generated)
      if (
        !product.isNewProduct &&
        (!product.sku || product.sku.trim() === "")
      ) {
        errors.push({
          row: rowNum,
          field: "sku",
          message: "SKU is required for updates",
        });
      }

      // Validate category
      // Category is required for parent products (products with variants) and standalone products
      // Category is optional for variant products (they inherit from parent)
      // Note: Variants are nested inside products, so this validation only applies to parent/standalone products
      // If a product has variants, it's a parent product and category is required
      // If a product doesn't have variants, it's a standalone product and category is required
      // Variants themselves are validated separately in the nested loop and don't need category
      const hasVariants =
        product.variants &&
        Array.isArray(product.variants) &&
        product.variants.length > 0;
      const isParentOrStandalone =
        hasVariants || (!product.parentId && !product.parent_id);

      if (product.category && product.category.trim() !== "") {
        const catKey = product.category.toLowerCase().trim();
        if (!categoryMap.has(catKey)) {
          // Try to match partial MongoId
          if (!mongoose.Types.ObjectId.isValid(product.category)) {
            errors.push({
              row: rowNum,
              field: "category",
              message: `Category not found: ${product.category}`,
            });
          }
        }
      } else if (isParentOrStandalone) {
        // Category is required for parent products and standalone products
        errors.push({
          row: rowNum,
          field: "category",
          message: "Category is required",
        });
      }
      // If it's a variant product (has parentId), category is optional - skip validation

      const normalizedCollections = parseCollectionsInput(
        product.collections !== undefined ? product.collections : product.tag
      );
      const normalizedBadge = product.badge
        ? normalizeCollectionSlug(product.badge)
        : null;
      const unknownCollections = normalizedCollections.filter(
        (slug) => !collectionSlugSet.has(slug)
      );
      if (unknownCollections.length > 0) {
        errors.push({
          row: rowNum,
          field: "collections",
          message: `Unknown collection slug(s): ${unknownCollections.join(
            ", "
          )}`,
        });
      }
      if (normalizedBadge && !collectionSlugSet.has(normalizedBadge)) {
        errors.push({
          row: rowNum,
          field: "badge",
          message: `Unknown badge collection slug: ${normalizedBadge}`,
        });
      }
      if (normalizedBadge && !normalizedCollections.includes(normalizedBadge)) {
        errors.push({
          row: rowNum,
          field: "badge",
          message: "Badge must be one of the selected collections",
        });
      }

      // Collect temp images from product
      if (product.imageMetadata && Array.isArray(product.imageMetadata)) {
        for (const tempKey of product.imageMetadata) {
          if (tempKey.startsWith("csv_temp_")) {
            tempImagesNeeded.add(tempKey);
          }
        }
      }

      // 2️⃣ VARIANT VALIDATION & STRICT ATTRIBUTE CHECK
      if (product.variants && Array.isArray(product.variants)) {
        const productVariantHashes = new Map();

        for (let j = 0; j < product.variants.length; j++) {
          const variant = product.variants[j];
          const variantRow = `${rowNum}.${j + 1}`;

          // Check variant SKU
          if (variant.sku) {
            if (inputSkus.has(variant.sku)) {
              errors.push({
                row: variantRow,
                field: "sku",
                message: `Duplicate Variant SKU: ${variant.sku}`,
              });
            }
            inputSkus.add(variant.sku);
          }

          // Check required fields for variants
          if (variant.price === undefined || variant.price === null) {
            errors.push({
              row: variantRow,
              field: "price",
              message: "Variant price is required",
            });
          }
          if (variant.stock === undefined || variant.stock === null) {
            errors.push({
              row: variantRow,
              field: "stock",
              message: "Variant stock is required",
            });
          }

          // Validate offer fields if present
          if (
            variant.offerPrice !== undefined &&
            variant.offerPrice !== null &&
            variant.offerPrice !== ""
          ) {
            if (isNaN(variant.offerPrice) || Number(variant.offerPrice) < 0) {
              errors.push({
                row: variantRow,
                field: "offerPrice",
                message: "Offer price must be a valid non-negative number",
              });
            }
          }

          if (variant.offerStartAt && isNaN(Date.parse(variant.offerStartAt))) {
            errors.push({
              row: variantRow,
              field: "offerStartAt",
              message: "Invalid offer start date format",
            });
          }

          if (variant.offerEndAt && isNaN(Date.parse(variant.offerEndAt))) {
            errors.push({
              row: variantRow,
              field: "offerEndAt",
              message: "Invalid offer end date format",
            });
          }

          // STRICT ATTRIBUTE VALIDATION
          // Check 'attributes' object from parsed CSV
          if (variant.attributes) {
            const sortedAttributes = [];

            for (const [key, value] of Object.entries(variant.attributes)) {
              const normalizedKey = key.toLowerCase().trim();

              // Ignore non-attribute metadata like 'price', 'sku' if they leaked
              if (
                ["sku", "price", "stock", "image", "images"].includes(
                  normalizedKey
                )
              )
                continue;

              // CHECK GENUINE ATTRIBUTES
              const attributeDef = attributeMap.get(normalizedKey);

              if (!attributeDef) {
                // ❌ FAIL: Unknown attribute
                errors.push({
                  row: variantRow,
                  field: `attribute_${key}`,
                  message: `Unknown attribute: '${key}'. Please create this attribute in Settings > Product Attributes first.`,
                });
              } else {
                // Track for hash generation
                sortedAttributes.push(
                  `${attributeDef._id}:${normalizeVariantAttributeValueForHash(
                    value
                  )}`
                );
              }
            }

            // DUPLICATE VARIANT DETECTION (In-memory)
            sortedAttributes.sort();
            const optionsHash = sortedAttributes.join("|");
            const firstSeenRow = productVariantHashes.get(optionsHash);
            if (firstSeenRow) {
              errors.push({
                row: variantRow,
                field: "variants",
                message: `Duplicate variant configuration detected within this product. This matches row ${firstSeenRow}.`,
              });
            }
            productVariantHashes.set(optionsHash, variantRow);
          }

          // Collect temp images from variant
          if (variant.imageMetadata && Array.isArray(variant.imageMetadata)) {
            for (const tempKey of variant.imageMetadata) {
              if (tempKey.startsWith("csv_temp_")) {
                tempImagesNeeded.add(tempKey);
              }
            }
          }
        }
      }
    }

    // Check for existing SKUs in database
    // Check for existing SKUs in database (Product and embedded variants)
    const allSkus = Array.from(inputSkus).filter((s) => !!s);

    let existingSkusInDb = new Set();
    if (allSkus.length > 0) {
      // Find products where either the main sku OR any variant sku matches our list
      const existingProducts = await Product.find({
        $or: [
          { sku: { $in: allSkus } },
          { "variants.sku": { $in: allSkus } }, // Access embedded variants
        ],
      })
        .select("sku variants.sku")
        .lean();

      // Add parent SKUs
      existingProducts.forEach((p) => {
        if (p.sku) existingSkusInDb.add(p.sku);
        // Add variant SKUs
        if (p.variants && Array.isArray(p.variants)) {
          p.variants.forEach((v) => {
            if (v.sku) existingSkusInDb.add(v.sku);
          });
        }
      });
    }

    // Validate uniqueness against DB
    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      const rowNum = i + 1;

      // If creating new product, SKU must not exist
      if (p.isNewProduct && p.sku && existingSkusInDb.has(p.sku)) {
        errors.push({
          row: rowNum,
          field: "sku",
          message: `SKU "${p.sku}" already exists in database.`,
        });
      }

      // Check variants
      if (p.variants) {
        for (let j = 0; j < p.variants.length; j++) {
          const v = p.variants[j];
          const variantRow = `${rowNum}.${j + 1}`;

          if (v.isNewVariant && v.sku && existingSkusInDb.has(v.sku)) {
            errors.push({
              row: variantRow,
              field: "sku",
              message: `Variant SKU "${v.sku}" already exists in database.`,
            });
          }
        }
      }
    }

    // Determine which are updates vs creates
    const updateCount = products.filter(
      (p) => p.csvId && !p.csvId.startsWith("TMP_")
    ).length;
    const createCount = products.length - updateCount;

    // Calculate total variants
    const totalVariants = products.reduce(
      (sum, p) => sum + (p.variants ? p.variants.length : 0),
      0
    );

    // Validate all temp images exist
    const tempKeysArray = Array.from(tempImagesNeeded);
    let missingImages = [];

    if (tempKeysArray.length > 0) {
      const foundImages = await CsvTempImage.find({
        temp_key: { $in: tempKeysArray },
      }).lean();
      const foundKeys = new Set(foundImages.map((img) => img.temp_key));
      missingImages = tempKeysArray.filter((key) => !foundKeys.has(key));

      if (missingImages.length > 0) {
        errors.push({
          row: 0,
          field: "image_metadata",
          message: `Missing temp images: ${missingImages.join(", ")}`,
        });
      }
    }

    const isValid = errors.length === 0;

    console.log(
      `${isValid ? "✅" : "❌"} [Bulk Import] Validation ${
        isValid ? "passed" : "failed"
      }: ${errors.length} errors`
    );

    res.status(200).json(
      ApiResponse.success("Validation complete", {
        valid: isValid,
        errors,
        warnings,
        stats: {
          totalProducts: products.length,
          createCount,
          updateCount,
          totalVariants,
          tempImagesCount: tempKeysArray.length,
          missingImagesCount: missingImages.length,
        },
      }).toJSON()
    );
  });

  /**
   * Phase 2: Commit import (atomic with rollback)
   * POST /api/v1/admin/products/commit-import
   * Body: { products: ParsedParentProduct[] }
   */
  commitImport = asyncHandler(async (req, res) => {
    const { products } = req.body;

    if (!products || !Array.isArray(products) || products.length === 0) {
      return res
        .status(400)
        .json(ApiResponse.error("Products array is required", 400).toJSON());
    }

    // CSV bulk import intentionally excludes filterAttributes fields.
    let ignoredFilterAttributeFieldsCount = 0;
    products.forEach((product) => {
      ignoredFilterAttributeFieldsCount +=
        stripFilterAttributesFromImportObject(product).length;
      if (Array.isArray(product?.variants)) {
        product.variants.forEach((variant) => {
          ignoredFilterAttributeFieldsCount +=
            stripFilterAttributesFromImportObject(variant).length;
          if (
            variant &&
            typeof variant.attributes === "object" &&
            !Array.isArray(variant.attributes)
          ) {
            ignoredFilterAttributeFieldsCount +=
              stripFilterAttributesFromImportObject(variant.attributes).length;
          }
        });
      }
    });
    if (ignoredFilterAttributeFieldsCount > 0) {
      console.warn(
        `⚠️ [Bulk Import] Ignored ${ignoredFilterAttributeFieldsCount} filterAttributes field(s). CSV bulk import does not support filterAttributes.`
      );
    }

    // Initialize session for transaction support
    const session = await mongoose.startSession();
    let isTransactionStarted = false;

    // Detect MongoDB topology and determine transaction support
    const supportsTransactions = await this._checkTransactionSupport();

    if (supportsTransactions) {
      try {
        await session.startTransaction();
        isTransactionStarted = true;
        console.log(
          "✅ [Bulk Import] Transaction started (replica set detected)"
        );
      } catch (transactionError) {
        console.warn(
          "⚠️ [Bulk Import] Failed to start transaction:",
          transactionError.message
        );
        console.warn("⚠️ [Bulk Import] Continuing without transaction");
      }
    } else {
      console.warn(
        "⚠️ [Bulk Import] Standalone MongoDB detected - transactions not supported"
      );
      console.warn(
        "⚠️ [Bulk Import] Import will proceed without atomic guarantees"
      );
    }

    // Track created resources for rollback
    const createdProductIds = [];
    const createdVariantIds = [];
    const convertedImages = []; // { old_public_id, new_public_id }
    const tempKeysUsed = [];

    try {
      console.log(
        `📦 [Bulk Import] Starting commit for ${products.length} products...`
      );

      // Fetch categories for resolution
      let categoriesQuery = Category.find({}).select("name code slug _id");
      if (isTransactionStarted) {
        categoriesQuery = categoriesQuery.session(session);
      }
      const categories = await categoriesQuery;

      // 1️⃣ LOAD ATTRIBUTES FOR RESOLUTION
      const AttributeDefinition = require("../../models/AttributeDefinition");
      const allAttributes = await AttributeDefinition.find({}).lean();
      const attributeMap = new Map();
      allAttributes.forEach((attr) => {
        if (attr.code) {
          attributeMap.set(attr.code.toLowerCase(), attr);
        }
        if (attr.name) {
          attributeMap.set(attr.name.toLowerCase(), attr);
        }
      });

      const categoryMap = new Map();
      const idToDataMap = new Map();

      categories.forEach((cat) => {
        const catId = cat._id.toString();
        idToDataMap.set(catId, cat);

        categoryMap.set(catId, cat._id);
        if (cat.name) categoryMap.set(cat.name.toLowerCase().trim(), cat._id);
        if (cat.code) categoryMap.set(cat.code.toLowerCase().trim(), cat._id);
        if (cat.slug) categoryMap.set(cat.slug.toLowerCase().trim(), cat._id);
      });

      // Step 1: Convert all temp images to permanent
      const tempImagesNeeded = new Set();

      for (const product of products) {
        if (product.imageMetadata) {
          product.imageMetadata.forEach((key) => {
            if (key.startsWith("csv_temp_")) tempImagesNeeded.add(key);
          });
        }
        if (product.variants) {
          for (const variant of product.variants) {
            if (variant.imageMetadata) {
              variant.imageMetadata.forEach((key) => {
                if (key.startsWith("csv_temp_")) tempImagesNeeded.add(key);
              });
            }
          }
        }
      }

      const tempKeysArray = Array.from(tempImagesNeeded);
      const imageMapping = new Map(); // temp_key -> { new_public_id, url }

      if (tempKeysArray.length > 0) {
        console.log(
          `📷 [Bulk Import] Converting ${tempKeysArray.length} temp images...`
        );

        let tempImagesQuery = CsvTempImage.find({
          temp_key: { $in: tempKeysArray },
        });
        if (isTransactionStarted) {
          tempImagesQuery = tempImagesQuery.session(session);
        }
        const tempImages = await tempImagesQuery;

        for (const tempImage of tempImages) {
          try {
            // Generate new public_id in assets folder (for CSV imported images)
            const newPublicId = `${PERMANENT_FOLDER}/${Date.now()}_${Math.random()
              .toString(36)
              .substring(2, 8)}`;

            // Move image in Cloudinary
            const moveResult = await cloudinary.uploader.rename(
              tempImage.public_id,
              newPublicId,
              { resource_type: "image" }
            );

            imageMapping.set(tempImage.temp_key, {
              new_public_id: newPublicId,
              url: moveResult.secure_url || moveResult.url,
              old_public_id: tempImage.public_id,
            });

            convertedImages.push({
              old_public_id: tempImage.public_id,
              new_public_id: newPublicId,
            });
            tempKeysUsed.push(tempImage.temp_key);

            console.log(
              `  ✅ Converted: ${tempImage.temp_key} → ${newPublicId}`
            );
          } catch (error) {
            console.error(
              `  ❌ Failed to convert ${tempImage.temp_key}:`,
              error.message
            );
            throw new Error(
              `Failed to convert image ${tempImage.temp_key}: ${error.message}`
            );
          }
        }
      }

      // Cache for resolving asset IDs to Cloudinary URLs (CSV image_urls can be asset ID or URL)
      const assetUrlCache = new Map();

      // Track SKUs/url_keys assigned in this batch to avoid intra-import collisions
      const usedSkusInBatch = new Set();
      const usedUrlKeysInBatch = new Set();

      const skuExistsGlobally = async (sku, excludeProductId = null) => {
        if (!sku) return false;
        if (usedSkusInBatch.has(sku)) return true;

        const query = {
          $or: [{ sku }, { "variants.sku": sku }],
        };
        if (excludeProductId) {
          query._id = { $ne: excludeProductId };
        }

        const exists = isTransactionStarted
          ? await Product.findOne(query).select("_id").session(session)
          : await Product.findOne(query).select("_id");
        return !!exists;
      };

      const urlKeyExistsGlobally = async (urlKey, excludeProductId = null) => {
        if (!urlKey) return false;
        if (usedUrlKeysInBatch.has(urlKey)) return true;

        const query = {
          $or: [{ url_key: urlKey }, { "variants.url_key": urlKey }],
        };
        if (excludeProductId) {
          query._id = { $ne: excludeProductId };
        }

        const exists = isTransactionStarted
          ? await Product.findOne(query).select("_id").session(session)
          : await Product.findOne(query).select("_id");
        return !!exists;
      };

      // Step 2: Create/Update products
      for (const productData of products) {
        // Resolve category
        let resolvedCategoryId = null;
        if (productData.category) {
          const catKey = productData.category.toLowerCase().trim();
          if (categoryMap.has(catKey)) {
            resolvedCategoryId = categoryMap.get(catKey);
          } else if (mongoose.Types.ObjectId.isValid(productData.category)) {
            resolvedCategoryId = productData.category; // Trust it if it's a valid ID
          }
        }

        // If mandatory and missing, this will fail DB save.
        // We rely on validated data or we fail fast.

        const isUpdate =
          productData.csvId && !productData.csvId.startsWith("TMP_");

        // Build images array
        const images = [];

        // Pre-calculate ID for new products to use in variant linkage
        const finalProductId = isUpdate
          ? productData.csvId
          : new mongoose.Types.ObjectId();

        // 0. Auto-generate SKU for new product
        let finalProductSku = productData.sku;
        if (!isUpdate) {
          const catObj = idToDataMap.get(resolvedCategoryId?.toString());
          const catCode = catObj?.code || catObj?.name || "PROD";

          const baseSku = suggestProductSku(productData.title, {
            categoryCode: catCode,
          });

          // Check uniqueness and generate unique SKU
          finalProductSku = await generateUniqueSku(baseSku, async (sku) => {
            return skuExistsGlobally(sku);
          });
        }
        if (finalProductSku) usedSkusInBatch.add(finalProductSku);

        // 0b. For new products: ensure unique url_key (avoids E11000 duplicate key in bulk import)
        if (!isUpdate) {
          const checkUrlKeyExists = async (urlKey) => {
            return urlKeyExistsGlobally(urlKey);
          };
          productData.url_key = await generateUniqueUrlKey(
            productData.title,
            checkUrlKeyExists
          );
          usedUrlKeysInBatch.add(productData.url_key);
        }

        // 1. Process Temp Images
        if (productData.imageMetadata) {
          for (const key of productData.imageMetadata) {
            const mappedImage = imageMapping.get(key);
            if (mappedImage) {
              images.push({
                url: mappedImage.url,
                public_id: mappedImage.new_public_id,
              });
            }
          }
        }

        // 2. Process image_urls: resolve asset IDs to Cloudinary URL, save only URL in DB
        if (productData.images && Array.isArray(productData.images)) {
          for (const entry of productData.images) {
            const raw = typeof entry === "string" ? entry : entry && entry.url;
            const url = await resolveImageEntryToUrl(raw, assetUrlCache);
            if (url && !images.some((img) => img.url === url)) {
              images.push({ url });
            }
          }
        }

        // Prepare embedded variants with strictly resolved attributes
        const embeddedVariants = [];
        // Map to prevent duplicate variantOptions at product level
        const uniqueVariantOptions = new Map();

        if (productData.variants && productData.variants.length > 0) {
          const usedVariantSkus = new Set();
          const usedVariantUrlKeys = new Set();

          const ensureUniqueVariantSku = async (inputSku, variantIndex) => {
            const fallbackBase = `${finalProductSku || "VAR"}-${String(
              variantIndex + 1
            ).padStart(2, "0")}`;
            const baseSku = (inputSku || "").toString().trim() || fallbackBase;
            let candidate = baseSku;
            let counter = 2;

            while (
              usedVariantSkus.has(candidate) ||
              (await skuExistsGlobally(candidate, isUpdate ? finalProductId : null))
            ) {
              candidate = `${baseSku}-${String(counter).padStart(2, "0")}`;
              counter++;
            }

            usedVariantSkus.add(candidate);
            usedSkusInBatch.add(candidate);
            return candidate;
          };

          const ensureUniqueVariantUrlKey = async (
            inputUrlKey,
            variantIndex
          ) => {
            const fallbackBase = `${productData.url_key || "product"}-variant-${
              variantIndex + 1
            }`;
            const normalizedBase = generateSlug(
              (inputUrlKey || "").toString().trim() || fallbackBase
            );
            let candidate = normalizedBase;
            let counter = 2;

            while (
              usedVariantUrlKeys.has(candidate) ||
              (await urlKeyExistsGlobally(
                candidate,
                isUpdate ? finalProductId : null
              ))
            ) {
              candidate = `${normalizedBase}-${counter}`;
              counter++;
            }

            usedVariantUrlKeys.add(candidate);
            usedUrlKeysInBatch.add(candidate);
            return candidate;
          };

          for (const [variantIndex, variantData] of productData.variants.entries()) {
            // Build variant images - same type as product images: array of objects { url, public_id }
            // Then map to URL strings when assigning (schema is string[]).
            const variantImageObjects = [];
            // 1. Process temp images from imageMetadata
            if (variantData.imageMetadata) {
              for (const key of variantData.imageMetadata) {
                const mappedImage = imageMapping.get(key);
                if (mappedImage) {
                  variantImageObjects.push({
                    url: mappedImage.url,
                    public_id: mappedImage.new_public_id,
                  });
                }
              }
            }
            // 2. Process image_urls: resolve asset IDs to Cloudinary URL (same as product)
            if (variantData.images && Array.isArray(variantData.images)) {
              for (const entry of variantData.images) {
                const raw =
                  typeof entry === "string" ? entry : entry && entry.url;
                const url = await resolveImageEntryToUrl(raw, assetUrlCache);
                if (
                  url &&
                  !variantImageObjects.some((img) => img.url === url)
                ) {
                  variantImageObjects.push({ url });
                }
              }
            }
            const variantImages = variantImageObjects.map((i) =>
              typeof i === "string" ? i : i.url
            );

            // ✅ NEW: ID Generation Logic
            let variantId = variantData.csvId;
            // Only generate new ID if it's a temp ID or a new variant
            if (
              !variantId ||
              variantId.startsWith("TMP_") ||
              variantData.isNewVariant
            ) {
              const configCode = Math.random()
                .toString(36)
                .substring(2, 6)
                .toUpperCase();
              variantId = `${finalProductId}-${configCode}`;
            }

            // 3. Auto-generate Variant SKU if new
            let finalVariantSku = variantData.sku;

            // 4. RESOLVE ATTRIBUTES STRICTLY
            const resolvedAttributes = new Map();
            if (
              variantData.attributes &&
              typeof variantData.attributes === "object"
            ) {
              for (const [key, value] of Object.entries(
                variantData.attributes
              )) {
                const normalizedKey = key.toLowerCase().trim();
                if (
                  ["sku", "price", "stock", "image", "images"].includes(
                    normalizedKey
                  )
                )
                  continue;

                const attrDef = attributeMap.get(normalizedKey);
                if (attrDef && attrDef._id) {
                  // Store variant attribute as canonical value (slug), not label, for consistency with create/update
                  const attrKey = attrDef.name || attrDef.code || normalizedKey;
                  const attrCode = attrDef.code || normalizedKey; // Use code as key, fallback to normalizedKey
                  const valStr = String(value).trim();
                  const canonicalVal = valStr
                    .toLowerCase()
                    .replace(/\s+/g, "-");
                  resolvedAttributes.set(attrKey, canonicalVal);

                  // Collect unique variantOptions for Parent Product with ID
                  if (!uniqueVariantOptions.has(attrCode)) {
                    uniqueVariantOptions.set(attrCode, {
                      id: attrCode, // Use code as ID for stability or generate one
                      attributeId: attrDef._id, // ✅ MANDATORY
                      name: attrDef.name || attrDef.code || normalizedKey, // Use name, fallback to code or normalizedKey
                      code: attrCode,
                      values: [],
                    });
                  }

                  // Add value to variantOptions uniqueness list
                  const opt = uniqueVariantOptions.get(attrCode);

                  // Check if this value already exists (by canonical value)
                  if (
                    !opt.values.some(
                      (v) =>
                        v.value.toLowerCase() === canonicalVal.toLowerCase()
                    )
                  ) {
                    // Try to find rich metadata (hex, label) from the parsed frontend options
                    let hexCode = null;
                    let label = valStr;

                    if (
                      productData.variantOptions &&
                      Array.isArray(productData.variantOptions)
                    ) {
                      const attrName =
                        attrDef.name || attrDef.code || normalizedKey;
                      const attrCodeForMatch = attrDef.code || normalizedKey;
                      const feOption = productData.variantOptions.find(
                        (o) =>
                          o.name &&
                          attrName &&
                          (o.name.toLowerCase() === attrName.toLowerCase() ||
                            (o.code &&
                              attrCodeForMatch &&
                              o.code.toLowerCase() ===
                                attrCodeForMatch.toLowerCase()))
                      );
                      if (feOption && feOption.values) {
                        const feValue = feOption.values.find(
                          (v) =>
                            v.value &&
                            v.value.toLowerCase() === canonicalVal.toLowerCase()
                        );
                        if (feValue) {
                          if (feValue.hex) hexCode = feValue.hex;
                          if (feValue.label) label = feValue.label;
                        }
                      }
                    }

                    opt.values.push({
                      id: Math.random().toString(36).substr(2, 9),
                      value: canonicalVal,
                      label: label,
                      code: valStr.substring(0, 3).toUpperCase(), // simple code gen
                      hex: hexCode, // ✅ Added Hex Code
                    });
                  }
                }
              }
            }

            // Generate hash for safety
            const optionsArray = Array.from(resolvedAttributes.entries());
            optionsArray.sort((a, b) => a[0].localeCompare(b[0]));
            const optionsHash = optionsArray
              .map((p) => `${p[0]}:${p[1]}`)
              .join("|");

            // Auto-generate Variant SKU if missing
            if (!finalVariantSku || finalVariantSku.trim() === "") {
              // Convert resolvedAttributes Map to object for generateVariantSku
              const attrsObj = Object.fromEntries(resolvedAttributes);
              try {
                finalVariantSku = generateVariantSku(finalProductSku, attrsObj);
              } catch (error) {
                // Fallback if generateVariantSku fails
                console.warn(
                  `Failed to generate variant SKU: ${error.message}`
                );
                finalVariantSku = `${finalProductSku}-${optionsHash.substring(
                  0,
                  6
                )}`;
              }
            }
            finalVariantSku = await ensureUniqueVariantSku(
              finalVariantSku,
              variantIndex
            );

            const variantUrlKey = await ensureUniqueVariantUrlKey(
              `${productData.url_key}-${finalVariantSku.toLowerCase()}`,
              variantIndex
            );
            const variantName = buildVariantTitle(
              productData.title,
              Array.from(uniqueVariantOptions.values()),
              resolvedAttributes
            );

            embeddedVariants.push({
              id: variantId,
              name: variantName,
              parentId: finalProductId,
              url_key: variantUrlKey,
              sku: finalVariantSku,
              price: variantData.price,
              stock: variantData.stock,
              images: variantImages,
              attributes: resolvedAttributes, // Map<String, String>
              options: resolvedAttributes, // Legacy support

              stockObj: {
                available: variantData.stock || 0,
                isInStock: (variantData.stock || 0) > 0,
              },
              offerPrice:
                variantData.offerPrice !== undefined &&
                variantData.offerPrice !== null &&
                variantData.offerPrice !== ""
                  ? Number(variantData.offerPrice)
                  : undefined,
              offerStartAt:
                variantData.offerStartAt &&
                variantData.offerStartAt !== "" &&
                variantData.offerStartAt !== null
                  ? variantData.offerStartAt
                  : undefined,
              offerEndAt:
                variantData.offerEndAt &&
                variantData.offerEndAt !== "" &&
                variantData.offerEndAt !== null
                  ? variantData.offerEndAt
                  : undefined,
              _optionsHash: optionsHash,
            });
          }
        }

        // Convert variantOptions map to array and add " M" suffix to size labels (number hyphen number = months)
        const finalVariantOptions = processVariantOptions(
          Array.from(uniqueVariantOptions.values())
        );

        // Determine product type: CONFIGURABLE if has variants, otherwise SIMPLE
        // Use product_type from frontend if provided, otherwise determine from variants
        const hasVariants = embeddedVariants && embeddedVariants.length > 0;
        let productType = productData.product_type;
        if (!productType) {
          // Determine from variants: if has variants, it's CONFIGURABLE, otherwise SIMPLE
          productType = hasVariants ? "CONFIGURABLE" : "SIMPLE";
        } else {
          // Normalize to uppercase to match schema enum
          productType = productType.toUpperCase();
          // Validate it's a valid product type
          if (
            !["SIMPLE", "CONFIGURABLE", "BUNDLE", "CHOICE_GROUP"].includes(
              productType
            )
          ) {
            // Fallback to determining from variants if invalid
            productType = hasVariants ? "CONFIGURABLE" : "SIMPLE";
          }
        }

        const parsedCollections = await validateCollectionsAndBadge({
          collections:
            productData.collections !== undefined
              ? productData.collections
              : productData.tags || productData.tag,
          badgeCollection:
            productData.badgeCollection !== undefined
              ? productData.badgeCollection
              : productData.badge,
        });

        if (isUpdate) {
          // Update existing product
          await Product.findByIdAndUpdate(
            productData.csvId,
            {
              title: productData.title,
              name: productData.title, // Sync name with title
              sku: productData.sku,
              description: productData.description || "",
              category: resolvedCategoryId || productData.category,
              categoryCode:
                idToDataMap.get(resolvedCategoryId?.toString())?.code ||
                productData.categoryCode,
              status: ["draft", "published", "archived"].includes(
                (productData.status || "").toLowerCase()
              )
                ? productData.status.toLowerCase()
                : "draft",
              product_type: productType, // ✅ Set product type based on variants
              images: images.length > 0 ? images.map((i) => i.url) : undefined, // Product schema images is string[]
              price: productData.price || 0, // Ensure direct field is updated too
              offerPrice:
                productData.offerPrice !== undefined &&
                productData.offerPrice !== null &&
                productData.offerPrice !== ""
                  ? Number(productData.offerPrice)
                  : undefined,
              offerStartAt:
                productData.offerStartAt &&
                productData.offerStartAt !== "" &&
                productData.offerStartAt !== null
                  ? productData.offerStartAt
                  : undefined,
              offerEndAt:
                productData.offerEndAt &&
                productData.offerEndAt !== "" &&
                productData.offerEndAt !== null
                  ? productData.offerEndAt
                  : undefined,
              stockObj: {
                available: productData.stock || 0,
                isInStock: (productData.stock || 0) > 0,
              },
              details: normalizeDetailsForImport(productData.details || []),
              collections: parsedCollections.collections,
              badgeCollection: parsedCollections.badgeCollection,
              // New fields
              url_key: productData.url_key,
              metaTitle: productData.metaTitle,
              metaDescription: productData.metaDescription,
              uiMeta: productData.uiMeta, // ✅ NEW
              variantOptions: finalVariantOptions, // ✅ UPDATED with attributeId

              // ✅ NEW: Embed variants directly
              variants: embeddedVariants, // ✅ UPDATED strict variants
            },
            isTransactionStarted ? { session } : {}
          );
          console.log(`  📝 Updated product: ${productData.sku}`);
        } else {
          // Create new product
          const newProductData = {
            _id: finalProductId, // ✅ Explicit ID
            title: productData.title,
            name: productData.title, // Sync name with title
            sku: finalProductSku, // ✅ Use generated/unique SKU
            description: productData.description || "",
            category: resolvedCategoryId, // ✅ Use resolved ID
            categoryCode:
              idToDataMap.get(resolvedCategoryId?.toString())?.code ||
              productData.categoryCode,
            status: ["draft", "published", "archived"].includes(
              (productData.status || "").toLowerCase()
            )
              ? productData.status.toLowerCase()
              : "draft",
            product_type: productType, // ✅ Set product type based on variants
            images: images.map((i) => i.url),
            price: productData.price || 0,
            offerPrice:
              productData.offerPrice !== undefined &&
              productData.offerPrice !== null &&
              productData.offerPrice !== ""
                ? Number(productData.offerPrice)
                : undefined,
            offerStartAt:
              productData.offerStartAt &&
              productData.offerStartAt !== "" &&
              productData.offerStartAt !== null
                ? productData.offerStartAt
                : undefined,
            offerEndAt:
              productData.offerEndAt &&
              productData.offerEndAt !== "" &&
              productData.offerEndAt !== null
                ? productData.offerEndAt
                : undefined,
            stockObj: {
              available: productData.stock || 0,
              isInStock: (productData.stock || 0) > 0,
            },
            details: normalizeDetailsForImport(productData.details || []),
            collections: parsedCollections.collections,
            badgeCollection: parsedCollections.badgeCollection,
            url_key: productData.url_key,
            metaTitle: productData.metaTitle,
            metaDescription: productData.metaDescription,
            uiMeta: productData.uiMeta, // ✅ NEW
            variantOptions: finalVariantOptions, // ✅ UPDATED with attributeId
            variants: embeddedVariants, // ✅ UPDATED strict variants
          };

          const newProduct = new Product(newProductData);
          await newProduct.save(isTransactionStarted ? { session } : {});
          createdProductIds.push(newProduct._id);
          console.log(`  ✨ Created product with SKU: ${finalProductSku}`);
        }

        // REMOVED: Separate Step 3 for creating variants in Variant collection
      }

      // Step 4: Delete used temp images from database
      if (tempKeysUsed.length > 0) {
        await CsvTempImage.deleteMany(
          { temp_key: { $in: tempKeysUsed } },
          isTransactionStarted ? { session } : {}
        );
        console.log(
          `🧹 [Bulk Import] Cleaned up ${tempKeysUsed.length} temp image records`
        );
      }

      // Commit transaction if started
      if (isTransactionStarted) {
        try {
          await session.commitTransaction();
          console.log("✅ [Bulk Import] Transaction committed");
        } catch (commitError) {
          console.warn(
            "⚠️ [Bulk Import] Failed to commit transaction (standalone MongoDB):",
            commitError.message
          );
        }
      }
      session.endSession();

      console.log(
        `✅ [Bulk Import] Successfully committed ${products.length} products`
      );

      res.status(200).json(
        ApiResponse.success("Import completed successfully", {
          created: {
            products: createdProductIds.length,
            variants: createdVariantIds.length,
          },
          updated: {
            products: products.length - createdProductIds.length,
          },
          imagesConverted: convertedImages.length,
        }).toJSON()
      );
    } catch (error) {
      console.error(`❌ [Bulk Import] Error during commit:`, error.message);

      if (
        error.code === "INVALID_COLLECTIONS" ||
        error.code === "INVALID_BADGE_COLLECTION"
      ) {
        if (isTransactionStarted) {
          try {
            await session.abortTransaction();
          } catch (_) {}
        }
        session.endSession();
        return res.status(400).json(
          ApiResponse.error(error.message, {
            code: error.code,
          }).toJSON()
        );
      }

      // Rollback transaction if started
      if (isTransactionStarted) {
        try {
          await session.abortTransaction();
          console.log("🔄 [Bulk Import] Transaction aborted");
        } catch (abortError) {
          console.warn(
            "⚠️ [Bulk Import] Failed to abort transaction (standalone MongoDB):",
            abortError.message
          );
        }
      }
      session.endSession();

      // Manual rollback: Delete any created products/variants
      if (createdProductIds.length > 0) {
        try {
          await Product.deleteMany({ _id: { $in: createdProductIds } });
          console.log(
            `🔄 [Rollback] Deleted ${createdProductIds.length} products`
          );
        } catch (rollbackError) {
          console.error(
            "❌ [Rollback] Failed to delete products:",
            rollbackError.message
          );
        }
      }

      // Manual rollback: Revert converted images (move back to temp folder)
      for (const img of convertedImages) {
        try {
          await cloudinary.uploader.rename(
            img.new_public_id,
            img.old_public_id,
            {
              resource_type: "image",
            }
          );
          console.log(
            `🔄 [Rollback] Reverted image: ${img.new_public_id} → ${img.old_public_id}`
          );
        } catch (rollbackError) {
          console.error(
            `❌ [Rollback] Failed to revert image:`,
            rollbackError.message
          );
        }
      }

      // Handle duplicate key errors specifically
      if (error.code === 11000) {
        const field = Object.keys(error.keyPattern)[0];
        const value = error.keyValue[field];
        const friendlyMessage = `Duplicate value detected: ${field.toUpperCase()} "${value}" already exists.`;

        return res.status(409).json(
          ApiResponse.error(friendlyMessage, {
            code: "DUPLICATE_KEY",
            field,
            value,
            rolledBack: {
              products: createdProductIds.length,
              variants: createdVariantIds.length,
              images: convertedImages.length,
            },
          }).toJSON()
        );
      }

      res.status(500).json(
        ApiResponse.error(`Import failed: ${error.message}`, {
          originalError: error.message,
          rolledBack: {
            products: createdProductIds.length,
            variants: createdVariantIds.length,
            images: convertedImages.length,
          },
        }).toJSON()
      );
    }
  });

  /**
   * Helper: Check if MongoDB supports transactions
   * @private
   * @returns {Promise<boolean>} True if transactions are supported
   */
  _checkTransactionSupport = async () => {
    try {
      // Check if we're connected to a replica set or sharded cluster
      const adminDb = mongoose.connection.db.admin();
      const serverInfo = await adminDb.serverStatus();

      // Transaction support requires replica set or mongos
      const isReplicaSet = serverInfo.repl && serverInfo.repl.setName;
      const isMongos = serverInfo.process === "mongos";

      return isReplicaSet || isMongos;
    } catch (error) {
      // If we can't determine topology, assume standalone (no transaction support)
      console.warn(
        "⚠️ [Bulk Import] Unable to detect MongoDB topology:",
        error.message
      );
      return false;
    }
  };
}

module.exports = new BulkImportController();
