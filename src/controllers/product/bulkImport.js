// controllers/product/bulkImport.js
const mongoose = require("mongoose");
const Product = require("../../models/Product");
const Variant = require("../../models/Variant");
const Category = require("../../models/Category");
const CsvTempImage = require("../../models/CsvTempImage");
const { cloudinary } = require("../../config/cloudinary");
const ApiResponse = require("../../core/ApiResponse");
const asyncHandler = require("../../core/middleware/asyncHandler");

// Cloudinary folder for permanent product images
const PERMANENT_FOLDER = "products";

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

    console.log(`🔍 [Bulk Import] Validating ${products.length} products...`);

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

    // Collect all SKUs from input for duplicate detection
    const inputSkus = new Set();
    const inputIds = new Set();

    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      const rowNum = i + 1;

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
      if (!product.sku || product.sku.trim() === "") {
        errors.push({ row: rowNum, field: "sku", message: "SKU is required" });
      }

      // Validate category
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
      } else {
        // Category is required in Product model
        errors.push({
          row: rowNum,
          field: "category",
          message: "Category is required",
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

      // Validate variants
      if (product.variants && Array.isArray(product.variants)) {
        for (let j = 0; j < product.variants.length; j++) {
          const variant = product.variants[j];
          const variantRow = `${rowNum}.${j + 1}`;

          // Check variant SKU
          if (variant.sku) {
            if (inputSkus.has(variant.sku)) {
              errors.push({
                row: variantRow,
                field: "sku",
                message: `Duplicate variant SKU: ${variant.sku}`,
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
    const allSkus = Array.from(inputSkus);

    // Find products where either the main sku OR any variant sku matches our list
    const existingProducts = await Product.find({
      $or: [
        { sku: { $in: allSkus } },
        { "variants.sku": { $in: allSkus } }, // Access embedded variants
      ],
    })
      .select("sku variants.sku")
      .lean();

    const existingSkusInDb = new Set();

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

    // Validate uniqueness against DB
    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      const rowNum = i + 1;

      // If creating new product, SKU must not exist
      if (p.isNewProduct && existingSkusInDb.has(p.sku)) {
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

          if (v.isNewVariant && existingSkusInDb.has(v.sku)) {
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
          totalVariants, // ✅ Added variant count
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

    // Start MongoDB session for transaction
    const session = await mongoose.startSession();
    session.startTransaction();

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
      const categories = await Category.find({})
        .select("name code slug _id")
        .session(session); // Use session? No, read doesn't strictly need it unless we want snapshot isolation, but safe.
      // Actually, just find normally. Session is for write transaction mainly.
      // Let's use standard find.

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

        const tempImages = await CsvTempImage.find({
          temp_key: { $in: tempKeysArray },
        });

        for (const tempImage of tempImages) {
          try {
            // Generate new public_id in products folder
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

      // Step 2: Create/Update products
      for (const productData of products) {
        // Resolve category
        let resolvedCategoryId = null;
        if (productData.category) {
          const catKey = productData.category.toLowerCase().trim();
          if (categoryMap.has(catKey)) {
            resolvedCategoryId = categoryMap.get(catKey);
          } else if (mongoose.Types.ObjectId.isValid(productData.category)) {
            resolvedCategoryId = productData.category; // Trust it if it's a valid ID but not in our lean cache (unlikely but safe fallback)
          }
        }

        // If mandatory and missing, this will fail DB save.
        // We rely on validated data or we fail fast.

        const isUpdate =
          productData.csvId && !productData.csvId.startsWith("TMP_");

        // Build images array
        const images = []; // ✅ Restored missing variable

        // Pre-calculate ID for new products to use in variant linkage
        const finalProductId = isUpdate
          ? productData.csvId
          : new mongoose.Types.ObjectId();

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

        // 2. Process Direct URLs (from CSV 'image_urls' or existing)
        if (productData.images && Array.isArray(productData.images)) {
          productData.images.forEach((url) => {
            // Avoid duplicates if temp images already covered it (unlikely but safe)
            if (!images.some((img) => img.url === url)) {
              images.push({ url });
            }
          });
        }

        // Prepare embedded variants
        const embeddedVariants = [];
        if (productData.variants && productData.variants.length > 0) {
          for (const variantData of productData.variants) {
            // Build variant images
            const variantImages = [];
            if (variantData.imageMetadata) {
              for (const key of variantData.imageMetadata) {
                const mappedImage = imageMapping.get(key);
                if (mappedImage) {
                  variantImages.push(mappedImage.url); // Embedded stores URL strings usually, or check schema
                  // Schema says: images: [{ type: String }] // URLs
                }
              }
            }

            // ✅ NEW: ID Generation Logic
            let variantId = variantData.csvId;
            // Only generate new ID if it's a temp ID or a new variant
            if (
              !variantId ||
              variantId.startsWith("TMP_") ||
              variantData.isNewVariant
            ) {
              let configCode = "";
              if (
                variantData.attributes &&
                typeof variantData.attributes === "object"
              ) {
                const attrs = variantData.attributes;
                // Attributes might be a Map or object depending on parsing.
                // Assuming object based on earlier use.
                const parts = [];
                // Try common keys case-insensitively
                const colorKey = Object.keys(attrs).find(
                  (k) => k.toLowerCase() === "color"
                );
                const sizeKey = Object.keys(attrs).find(
                  (k) => k.toLowerCase() === "size"
                );

                if (colorKey && attrs[colorKey])
                  parts.push(
                    String(attrs[colorKey]).substring(0, 3).toUpperCase()
                  );
                if (sizeKey && attrs[sizeKey])
                  parts.push(String(attrs[sizeKey]).toUpperCase());

                if (parts.length > 0) configCode = parts.join("-");
              }

              if (!configCode) {
                configCode = Math.random()
                  .toString(36)
                  .substring(2, 6)
                  .toUpperCase();
              }

              variantId = `${finalProductId}-${configCode}`;
            }

            embeddedVariants.push({
              id: variantId, // ✅ Use standardized ID
              parentId: finalProductId, // ✅ Linking to parent
              url_key: `${productData.url_key}-${variantData.sku
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")}`, // Generate simplified url_key for variant
              sku: variantData.sku,
              price: variantData.price,
              stock: variantData.stock,
              images: variantImages,
              attributes: variantData.attributes, // Map<String, String> in schema, object here is fine if mongoose casting works, else might need transform
              // Mongoose 'Map' type usually needs key-value pairs or object.
              // Let's ensure attributes is an object.

              // Populate other fields required by schema defaults
              stockObj: {
                available: variantData.stock || 0,
                isInStock: (variantData.stock || 0) > 0,
              },
              pricing: {
                // Redundant but good for schema compatibility
                price: variantData.price,
                discountPrice: variantData.discountPrice || variantData.price,
              },
            });
          }
        }

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
              images: images.length > 0 ? images.map((i) => i.url) : undefined, // Product schema images is string[]
              pricing: {
                price: productData.price || 0,
                discountPrice:
                  productData.discountPrice || productData.price || 0,
              },
              stockObj: {
                available: productData.stock || 0,
                isInStock: (productData.stock || 0) > 0,
              },
              details: productData.details || [],
              tags: productData.tags || productData.tag, // ✅ Store as single string
              // New fields
              url_key: productData.url_key,
              metaTitle: productData.metaTitle,
              metaDescription: productData.metaDescription,
              uiMeta: productData.uiMeta, // ✅ NEW
              variantOptions:
                productData.variantOptions || productData.options || [],

              // ✅ NEW: Embed variants directly
              variants: embeddedVariants,
            },
            { session }
          );
          console.log(`  📝 Updated product: ${productData.sku}`);
        } else {
          // Create new product
          const newProduct = new Product({
            _id: finalProductId, // ✅ Explicit ID
            title: productData.title,
            name: productData.title, // Sync name with title
            sku: productData.sku,
            description: productData.description || "",
            category: resolvedCategoryId || productData.category,
            categoryCode: productData.category, // ✅ Save code
            images: images.map((i) => i.url),
            status: ["draft", "published", "archived"].includes(
              (productData.status || "").toLowerCase()
            )
              ? productData.status.toLowerCase()
              : "draft",
            pricing: {
              price: productData.price || 0,
              discountPrice:
                productData.discountPrice || productData.price || 0,
            },
            stockObj: {
              available: productData.stock || 0,
              isInStock: (productData.stock || 0) > 0,
            },
            details: productData.details || [],
            tags: productData.tags || productData.tag, // ✅ Store as single string
            // New fields
            url_key: productData.url_key,
            metaTitle: productData.metaTitle,
            metaDescription: productData.metaDescription,
            uiMeta: productData.uiMeta, // ✅ NEW
            variantOptions:
              productData.variantOptions || productData.options || [],

            // ✅ NEW: Embed variants directly
            variants: embeddedVariants,
          });

          await newProduct.save({ session });
          createdProductIds.push(newProduct._id);
          console.log(`  ✨ Created product: ${productData.sku}`);
        }

        // REMOVED: Separate Step 3 for creating variants in Variant collection
      }

      // Step 4: Delete used temp images from database
      if (tempKeysUsed.length > 0) {
        await CsvTempImage.deleteMany(
          { temp_key: { $in: tempKeysUsed } },
          { session }
        );
        console.log(
          `🧹 [Bulk Import] Cleaned up ${tempKeysUsed.length} temp image records`
        );
      }

      // Commit transaction
      await session.commitTransaction();
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

      // Rollback transaction
      await session.abortTransaction();
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
}

module.exports = new BulkImportController();
