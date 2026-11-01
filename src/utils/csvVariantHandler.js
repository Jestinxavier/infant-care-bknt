/**
 * CSV Import/Export for Product Variants
 */

const { Parser } = require("json2csv");
const csv = require("csv-parser");
const fs = require("fs");
const Product = require("../models/Product");
const {
  createOptionsHash,
  validateVariantOptions,
} = require("./variantValidator");
const { generateVariantSku } = require("./skuGenerator");
const { generateSlug, generateVariantUrlKey } = require("./slugGenerator");

/**
 * Export product variants to CSV
 * @param {String} productId - Product ID
 * @returns {Promise<String>} CSV string
 */
const exportVariantsToCSV = async (productId) => {
  const product = await Product.findById(productId);
  if (!product) throw new Error("Product not found");

  if (!product.variants || product.variants.length === 0) {
    throw new Error("Product has no variants to export");
  }

  const toObject = (value) =>
    value instanceof Map ? Object.fromEntries(value) : value || {};

  // Build rows
  const rows = product.variants.map((variant) => {
    const row = {
      SKU: variant.sku,
      Price: variant.price ?? variant.pricing?.price ?? 0,
      // Variants store their offer as `offerPrice` (discountPrice is computed
      // at runtime, never stored). Header kept for existing spreadsheets.
      "Discount Price": variant.offerPrice ?? "",
      // stockObj.available is the authoritative stock; `stock || …` also
      // skipped a real 0.
      Stock: variant.stockObj?.available ?? variant.stock ?? 0,
    };

    // Add option columns. `attributes` is the current store (legacy
    // `options` may be an empty Map), and values are keyed by option code
    // ("color"), not display name ("Color").
    const attributes = toObject(variant.attributes);
    const optionsObj =
      Object.keys(attributes).length > 0 ? attributes : toObject(variant.options);

    (product.variantOptions || []).forEach((opt) => {
      const name = opt.name || "";
      row[name.charAt(0).toUpperCase() + name.slice(1)] =
        optionsObj[opt.code] ?? optionsObj[name] ?? optionsObj[name.toLowerCase()] ?? "";
    });

    // Add image columns
    const images = variant.images || [];
    for (let i = 0; i < 5; i++) {
      row[`Image ${i + 1}`] = images[i] || "";
    }

    return row;
  });

  // Generate CSV
  const parser = new Parser();
  return parser.parse(rows);
};

/**
 * Import variants from CSV
 * @param {String} filePath - Path to CSV file
 * @param {String} productId - Product ID
 * @param {Object} options - Import options
 * @returns {Promise<Object>} Import results
 */
const importVariantsFromCSV = async (filePath, productId, options = {}) => {
  const product = await Product.findById(productId);
  if (!product) throw new Error("Product not found");

  const { updateExisting = true, validateOnly = false } = options;

  const results = {
    total: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  const rows = [];

  // Read CSV
  await new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (row) => rows.push(row))
      .on("end", resolve)
      .on("error", reject);
  });

  results.total = rows.length;

  const variantOptions = product.variantOptions || [];

  for (const [index, row] of rows.entries()) {
    try {
      // Build options from CSV columns. Columns are headed by display name
      // ("Color"), but values are stored under the option code ("color"),
      // like every other write path, so filters and the options hash match.
      const options = new Map();
      variantOptions.forEach((opt) => {
        const name = opt.name || "";
        const key = opt.code || name;
        const colName = name.charAt(0).toUpperCase() + name.slice(1);
        const value =
          row[colName] || row[name] || row[name.toUpperCase()] || row[key];
        if (value) {
          options.set(key, value.trim().toLowerCase());
        }
      });

      // Validate options
      const validation = validateVariantOptions(product, options);
      if (!validation.valid) {
        results.errors.push({
          row: index + 2,
          errors: validation.errors,
        });
        results.skipped++;
        continue;
      }

      // Validate required fields
      if (!row.Price || isNaN(parseFloat(row.Price))) {
        results.errors.push({
          row: index + 2,
          errors: ["Invalid or missing Price"],
        });
        results.skipped++;
        continue;
      }

      const variantSku =
        (row.SKU && String(row.SKU).trim()) ||
        generateVariantSku(
          product.sku ||
            product.slug ||
            product.title.toUpperCase().substring(0, 5),
          Object.fromEntries(options), // Convert Map to Object
        );
      const optionsHash = createOptionsHash(options);

      // Resolve existing variant (by SKU or option hash) BEFORE url_key, so a
      // re-import keeps the stored slug instead of regenerating it.
      const existingIndex = product.variants.findIndex((v) => {
        if (v.sku === variantSku) return true;
        if (v._optionsHash === optionsHash) return true;
        return false;
      });

      const explicitUrlKey = row.UrlKey || row["URL Key"] || row.URL_KEY;
      const urlKey =
        explicitUrlKey ||
        (existingIndex >= 0 && product.variants[existingIndex].url_key) ||
        generateVariantUrlKey(
          product.url_key || product.slug || generateSlug(product.title),
          Object.fromEntries(options),
          { fallbackSuffix: variantSku },
        );

      // "Discount Price" maps to the stored offerPrice (a blank cell keeps
      // the variant's current offer). It must be below the regular price.
      const price = parseFloat(row.Price);
      const rawOffer = String(row["Discount Price"] ?? "").trim();
      const offerPrice = rawOffer ? parseFloat(rawOffer) : undefined;
      if (
        offerPrice !== undefined &&
        (Number.isNaN(offerPrice) || offerPrice <= 0 || offerPrice >= price)
      ) {
        results.errors.push({
          row: index + 2,
          errors: ["Discount Price must be a number below Price"],
        });
        results.skipped++;
        continue;
      }

      const variantData = {
        options: options,
        attributes: options,
        price,
        ...(offerPrice !== undefined ? { offerPrice } : {}),
        stock: row.Stock ? parseInt(row.Stock) : 0,
        // Keep the authoritative stock in sync with the flat field.
        stockObj: {
          available: row.Stock ? parseInt(row.Stock) : 0,
          isInStock: (row.Stock ? parseInt(row.Stock) : 0) > 0,
        },
        sku: variantSku,
        _optionsHash: optionsHash,
        url_key: urlKey,
        images: [],
      };

      // Extract images
      for (let i = 1; i <= 5; i++) {
        const imgUrl = row[`Image ${i}`];
        if (imgUrl && imgUrl.trim()) {
          variantData.images.push(imgUrl.trim());
        }
      }

      if (validateOnly) {
        console.log(`✓ Row ${index + 2}: Valid`);
        continue;
      }

      // Check if variant exists
      if (existingIndex >= 0) {
        if (updateExisting) {
          // Update in place; spreading a Mongoose subdocument drops fields that
          // are not enumerable (notably the required embedded `id`).
          const existingVariant = product.variants[existingIndex];
          existingVariant.set({ ...variantData, id: existingVariant.id });
          results.updated++;
        } else {
          results.skipped++;
        }
      } else {
        variantData.id = `variant-${Date.now()}-${index}`;

        product.variants.push(variantData);
        results.created++;
      }
    } catch (error) {
      results.errors.push({
        row: index + 2,
        errors: [error.message],
      });
      results.skipped++;
    }
  }

  if (!validateOnly && (results.created > 0 || results.updated > 0)) {
    await product.save();

    // Finalize images found in the product variants
    try {
      const {
        extractPublicIdsFromObject,
        finalizeImages,
      } = require("./mediaFinalizer");

      // Extract all image IDs from the product's variants
      const imagePublicIds = extractPublicIdsFromObject(product.variants);

      if (imagePublicIds.length > 0) {
        // Promote them to permanent
        const finalizeResult = await finalizeImages(
          imagePublicIds,
          "product",
          product._id,
        );
        console.log(
          `✅ [CSV Import] Finalized images for product ${product.slug}:`,
          {
            total: imagePublicIds.length,
            succeeded: finalizeResult.success.length,
          },
        );
      }
    } catch (finalizeError) {
      console.warn(
        "⚠️ [CSV Import] Failed to finalize images:",
        finalizeError.message,
      );
      // Non-critical, don't fail the import
    }
  }

  return results;
};

module.exports = {
  exportVariantsToCSV,
  importVariantsFromCSV,
};
