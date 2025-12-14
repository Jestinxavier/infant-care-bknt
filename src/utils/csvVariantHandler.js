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
const { generateSKU } = require("./skuGenerator");

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

  // Determine option columns from variantOptions
  const optionNames = (product.variantOptions || []).map((opt) => opt.name);

  // Build rows
  const rows = product.variants.map((variant) => {
    const row = {
      SKU: variant.sku,
      Price: variant.price || variant.pricing?.price || 0,
      "Discount Price":
        variant.discountPrice || variant.pricing?.discountPrice || "",
      Stock: variant.stock || variant.stockObj?.available || 0,
    };

    // Add option columns
    const options = variant.options || variant.attributes || new Map();
    const optionsObj =
      options instanceof Map ? Object.fromEntries(options) : options;

    optionNames.forEach((name) => {
      row[name.charAt(0).toUpperCase() + name.slice(1)] =
        optionsObj[name] || "";
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

  // Get option names
  const optionNames = (product.variantOptions || []).map((opt) => opt.name);

  for (const [index, row] of rows.entries()) {
    try {
      // Build options from CSV columns
      const options = new Map();
      optionNames.forEach((name) => {
        const colName = name.charAt(0).toUpperCase() + name.slice(1);
        const value = row[colName] || row[name] || row[name.toUpperCase()];
        if (value) {
          options.set(name, value.trim().toLowerCase());
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

      const variantData = {
        options: options,
        attributes: options,
        price: parseFloat(row.Price),
        discountPrice: row["Discount Price"]
          ? parseFloat(row["Discount Price"])
          : undefined,
        stock: row.Stock ? parseInt(row.Stock) : 0,
        sku:
          row.SKU ||
          (await generateSKU(
            product.slug || product.title,
            options,
            productId
          )),
        _optionsHash: createOptionsHash(options),
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
      const existingIndex = product.variants.findIndex((v) => {
        if (v.sku === variantData.sku) return true;
        if (v._optionsHash === variantData._optionsHash) return true;
        return false;
      });

      if (existingIndex >= 0) {
        if (updateExisting) {
          product.variants[existingIndex] = {
            ...product.variants[existingIndex],
            ...variantData,
          };
          results.updated++;
        } else {
          results.skipped++;
        }
      } else {
        variantData.id = `variant-${Date.now()}-${index}`;
        variantData.url_key = variantData.sku.toLowerCase();
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
  }

  return results;
};

module.exports = {
  exportVariantsToCSV,
  importVariantsFromCSV,
};
