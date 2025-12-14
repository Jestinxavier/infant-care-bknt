// controllers/product/bulkImport.js
const mongoose = require("mongoose");
const Product = require("../../models/Product");
const Variant = require("../../models/Variant");
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
      if (!product.name || product.name.trim() === "") {
        errors.push({
          row: rowNum,
          field: "name",
          message: "Name is required",
        });
      }
      if (!product.sku || product.sku.trim() === "") {
        errors.push({ row: rowNum, field: "sku", message: "SKU is required" });
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
    const allSkus = Array.from(inputSkus);
    const existingProducts = await Product.find({
      sku: { $in: allSkus },
    }).lean();
    const existingVariants = await Variant.find({
      sku: { $in: allSkus },
    }).lean();

    const existingSkusInDb = new Set([
      ...existingProducts.map((p) => p.sku),
      ...existingVariants.map((v) => v.sku),
    ]);

    // Determine which are updates vs creates
    const updateCount = products.filter(
      (p) => p.csvId && !p.csvId.startsWith("TMP_")
    ).length;
    const createCount = products.length - updateCount;

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
        const isUpdate =
          productData.csvId && !productData.csvId.startsWith("TMP_");

        // Build images array
        const images = [];
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

        if (isUpdate) {
          // Update existing product
          await Product.findByIdAndUpdate(
            productData.csvId,
            {
              name: productData.name,
              sku: productData.sku,
              description: productData.description || "",
              category: productData.category || "",
              images: images.length > 0 ? images : undefined,
            },
            { session }
          );
          console.log(`  📝 Updated product: ${productData.sku}`);
        } else {
          // Create new product
          const newProduct = new Product({
            name: productData.name,
            sku: productData.sku,
            description: productData.description || "",
            category: productData.category || "",
            images,
            status: "draft",
          });

          await newProduct.save({ session });
          createdProductIds.push(newProduct._id);
          productData._mongoId = newProduct._id; // Store for variant reference
          console.log(`  ✨ Created product: ${productData.sku}`);
        }

        // Step 3: Create/Update variants
        if (productData.variants && productData.variants.length > 0) {
          const productId = isUpdate ? productData.csvId : productData._mongoId;

          for (const variantData of productData.variants) {
            const isVariantUpdate =
              variantData.csvId && !variantData.csvId.startsWith("TMP_");

            // Build variant images
            const variantImages = [];
            if (variantData.imageMetadata) {
              for (const key of variantData.imageMetadata) {
                const mappedImage = imageMapping.get(key);
                if (mappedImage) {
                  variantImages.push({
                    url: mappedImage.url,
                    public_id: mappedImage.new_public_id,
                  });
                }
              }
            }

            if (isVariantUpdate) {
              await Variant.findByIdAndUpdate(
                variantData.csvId,
                {
                  productId,
                  sku: variantData.sku,
                  price: variantData.price,
                  stock: variantData.stock,
                  images: variantImages.length > 0 ? variantImages : undefined,
                  ...variantData.attributes,
                },
                { session }
              );
            } else {
              const newVariant = new Variant({
                productId,
                sku: variantData.sku,
                price: variantData.price,
                stock: variantData.stock,
                images: variantImages,
                ...variantData.attributes,
              });

              await newVariant.save({ session });
              createdVariantIds.push(newVariant._id);
            }
          }
        }
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

      if (createdVariantIds.length > 0) {
        try {
          await Variant.deleteMany({ _id: { $in: createdVariantIds } });
          console.log(
            `🔄 [Rollback] Deleted ${createdVariantIds.length} variants`
          );
        } catch (rollbackError) {
          console.error(
            "❌ [Rollback] Failed to delete variants:",
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

      res.status(500).json(
        ApiResponse.error("Import failed and rolled back", 500, {
          message: error.message,
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
