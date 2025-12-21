const productRepository = require("./product.repository");
const ApiError = require("../../core/ApiError");
const { validatePricing } = require("./rules/pricing.rules");
const { validateStockQuantity } = require("./rules/inventory.rules");
const { generateUniqueUrlKey } = require("../../utils/slugGenerator");
const {
  suggestProductSku,
  generateVariantSku,
  generateUniqueSku,
  validateSku,
} = require("../../utils/skuGenerator");
const mongoose = require("mongoose");

/**
 * Product Service
 * Contains all business logic for products
 * Reusable by both storefront and admin controllers
 */
class ProductService {
  /**
   * Get all products (with filtering and pagination)
   */
  /**
   * Get all products with advanced filtering and grouping (PLP)
   */
  async getAllProducts(filters = {}, options = {}) {
    const {
      page = 1,
      limit = 20,
      category,
      status = "published",
      minPrice,
      maxPrice,
      inStock,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = filters;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitVal = parseInt(limit);

    // 1. Initial Match Stage - Filter Parent Products
    const matchStage = {};

    if (!options.isAdmin) {
      matchStage.status = "published";
    } else if (status) {
      matchStage.status = status;
    }

    if (category) {
      matchStage.category = new mongoose.Types.ObjectId(category);
    }

    // Search Filter (Regex on title/name)
    if (filters.search) {
      const searchRegex = { $regex: filters.search, $options: "i" };
      matchStage.$or = [
        { title: searchRegex },
        { name: searchRegex },
        { description: searchRegex },
        { "variants.sku": searchRegex },
      ];
    }

    // 2. Aggregation Pipeline
    const pipeline = [
      { $match: matchStage },
      // Unwind variants but keep simple products (no variants)
      {
        $unwind: {
          path: "$variants",
          preserveNullAndEmptyArrays: true,
        },
      },

      // Lookup category by categoryCode
      {
        $lookup: {
          from: "categories",
          localField: "categoryCode",
          foreignField: "code",
          as: "categoryInfo",
        },
      },
      {
        $addFields: {
          categoryName: { $arrayElemAt: ["$categoryInfo.name", 0] },
        },
      },

      // Apply Variant Level Filters (Color, Size)
      ...(filters.color || filters.size
        ? [
            {
              $match: {
                ...(filters.color
                  ? {
                      "variants.attributes.color": {
                        $in: Array.isArray(filters.color)
                          ? filters.color
                          : [filters.color],
                      },
                    }
                  : {}),
                ...(filters.size
                  ? {
                      "variants.attributes.size": {
                        $in: Array.isArray(filters.size)
                          ? filters.size
                          : [filters.size],
                      },
                    }
                  : {}),
              },
            },
          ]
        : []),

      // Calculate effective price and stock (Handle both Variant and Simple Product)
      {
        $addFields: {
          effectivePrice: {
            $cond: {
              if: { $ifNull: ["$variants", false] },
              then: {
                $ifNull: [
                  "$variants.pricing.discountPrice",
                  "$variants.pricing.price",
                  "$variants.price",
                ],
              },
              else: {
                $ifNull: ["$pricing.discountPrice", "$pricing.price", "$price"],
              },
            },
          },
          isInStock: {
            $cond: {
              if: { $ifNull: ["$variants", false] },
              then: {
                $cond: {
                  if: {
                    $ifNull: [
                      "$variants.stockObj.isInStock",
                      { $gt: ["$variants.stock", 0] },
                    ],
                  },
                  then: true,
                  else: false,
                },
              },
              else: {
                $cond: {
                  if: {
                    $ifNull: ["$stockObj.isInStock", { $gt: ["$stock", 0] }],
                  },
                  then: true,
                  else: false,
                },
              },
            },
          },
        },
      },

      // Filter Logic (Price & Stock)
      ...(minPrice || maxPrice
        ? [
            {
              $match: {
                effectivePrice: {
                  ...(minPrice ? { $gte: parseFloat(minPrice) } : {}),
                  ...(maxPrice ? { $lte: parseFloat(maxPrice) } : {}),
                },
              },
            },
          ]
        : []),

      // Stock Filter
      { $match: { isInStock: true } },

      // Grouping Stage
      {
        $group: {
          _id: {
            productId: "$_id",
            color: {
              $cond: {
                if: { $ifNull: ["$variants", false] },
                then: { $ifNull: ["$variants.attributes.color", "default"] },
                else: "single-item",
              },
            },
          },
          // Accumulate data
          parentId: { $first: "$_id" },
          title: { $first: "$title" },
          url_key: {
            $first: {
              $cond: {
                if: { $ifNull: ["$variants", false] },
                then: "$variants.url_key", // Use variant's url_key for variants
                else: "$url_key", // Use product url_key for non-variants
              },
            },
          },
          slug: {
            $first: {
              $cond: {
                if: { $ifNull: ["$variants", false] },
                then: "$variants.url_key", // Use variant's url_key for variants
                else: "$url_key", // Use product url_key for non-variants
              },
            },
          },
          sku: { $first: "$sku" },
          category: { $first: "$category" },
          categoryName: { $first: "$categoryName" },

          // Variant/Product specific data
          variantId: {
            $first: {
              $cond: {
                if: { $ifNull: ["$variants", false] },
                then: "$variants.id",
                else: null, // null for non-variant products
              },
            },
          },
          variantSku: {
            $first: {
              $cond: {
                if: { $ifNull: ["$variants", false] },
                then: "$variants.sku",
                else: null,
              },
            },
          },
          image: {
            $first: {
              $cond: {
                if: { $ifNull: ["$variants", false] },
                then: { $arrayElemAt: ["$variants.images", 0] },
                else: { $arrayElemAt: ["$images", 0] },
              },
            },
          },
          price: { $first: "$effectivePrice" },
          discountPrice: {
            $first: {
              $cond: {
                if: { $ifNull: ["$variants", false] },
                then: "$variants.pricing.discountPrice",
                else: "$pricing.discountPrice",
              },
            },
          },
          regularPrice: {
            $first: {
              $cond: {
                if: { $ifNull: ["$variants", false] },
                then: "$variants.pricing.price",
                else: "$pricing.price",
              },
            },
          },

          // Sorting fields
          createdAt: { $first: "$createdAt" },
          averageRating: { $first: "$averageRating" },

          // Metadata
          colors: { $addToSet: "$variants.attributes.color" },
        },
      },

      // Ensure unique ID for frontend and clean up fields
      {
        $addFields: {
          id: {
            $cond: {
              if: { $eq: [{ $type: "$variantId" }, "null"] },
              then: "$parentId",
              else: "$variantId",
            },
          },
        },
      },

      // Remove internal MongoDB IDs and unnecessary fields
      {
        $project: {
          "_id.color": 0, // Remove color from _id
          category: 0, // Remove category ObjectId
          slug: 0, // Remove slug
          colors: 0, // Remove colors array
        },
      },

      // Sorting
      { $sort: { [sortBy]: sortOrder === "asc" ? 1 : -1 } },

      // Pagination with Facet
      {
        $facet: {
          metadata: [{ $count: "total" }],
          items: [{ $skip: skip }, { $limit: limitVal }],
        },
      },
    ];

    const result = await productRepository.aggregate(pipeline);

    const data = result[0];
    const total = data.metadata.length > 0 ? data.metadata[0].total : 0;
    const totalPages = Math.ceil(total / limitVal);

    return {
      success: true,
      items: data.items,
      pagination: {
        page: parseInt(page),
        limit: limitVal,
        total,
        totalPages,
      },
    };
  }

  /**
   * Get product by ID
   */
  async getProductById(productId, options = {}) {
    const product = await productRepository.findById(productId, {
      populate: [{ path: "category", select: "name slug" }],
    });

    if (!product) {
      throw ApiError.notFound("Product not found");
    }

    // Check if product is published (for storefront)
    if (!options.isAdmin && product.status !== "published") {
      throw ApiError.notFound("Product not found");
    }

    return product;
  }

  /**
   * Get product by URL key
   */
  async getProductByUrlKey(urlKey, options = {}) {
    const product = await productRepository.findByUrlKey(urlKey, {
      populate: [{ path: "category", select: "name slug" }],
    });

    if (!product) {
      throw ApiError.notFound("Product not found");
    }

    if (!options.isAdmin && product.status !== "published") {
      throw ApiError.notFound("Product not found");
    }

    return product;
  }

  /**
   * Create product
   */
  async createProduct(productData) {
    // Generate URL key if not provided
    if (!productData.url_key && productData.title) {
      const checkUrlKeyExists = async (urlKey) => {
        const existing = await productRepository.findByUrlKey(urlKey);
        return !!existing;
      };
      productData.url_key = await generateUniqueUrlKey(
        productData.title,
        checkUrlKeyExists
      );
    }

    // Validate and generate SKU if needed
    if (productData.sku) {
      const skuValidation = validateSku(productData.sku);
      if (!skuValidation.valid) {
        throw ApiError.validation(`Invalid SKU: ${skuValidation.error}`);
      }

      // Check SKU uniqueness
      const checkSkuExists = async (sku) => {
        const Product = require("./product.model");
        const existing = await Product.findOne({
          $or: [{ sku: sku }, { "variants.sku": sku }],
        });
        return !!existing;
      };

      const skuExists = await checkSkuExists(productData.sku);
      if (skuExists) {
        throw ApiError.validation("SKU already exists");
      }
    }

    // Generate productId upfront to use for variant IDs
    const productId = new mongoose.Types.ObjectId();
    productData._id = productId;

    // Validate variants if provided
    if (productData.variants && Array.isArray(productData.variants)) {
      const allVariantSkus = [];

      for (const variant of productData.variants) {
        // ✅ NEW: Enforce Variant ID Format: ParentID-ConfigurationCode
        // Generate configuration code (e.g. from SKU suffix or attributes)
        // If we don't have a specific code, we try to derive it or fallback to random string
        // User said: "append the configuration values code like we generate the sku and url keys for variants"
        // Let's try to get a code from attributes or existing sku suffix
        let configCode = "";

        if (variant.attributes && typeof variant.attributes === "object") {
          // Try to construct code from attributes (e.g. RED-S)
          const parts = [];
          if (variant.attributes.color)
            parts.push(variant.attributes.color.substring(0, 3).toUpperCase());
          if (variant.attributes.size)
            parts.push(variant.attributes.size.toUpperCase());
          if (parts.length > 0) configCode = parts.join("-");
        }

        if (!configCode) {
          // Fallback: use SKU suffix or random 4 chars
          configCode = Math.random().toString(36).substring(2, 6).toUpperCase();
        }

        // Set the structured ID
        variant.id = `${productId}-${configCode}`;

        // Link to parent
        variant.parentId = productId;

        // Validate pricing
        const price = variant.pricing?.price || variant.price;
        const discountPrice =
          variant.pricing?.discountPrice || variant.discountPrice;

        if (price !== undefined) {
          const validation = validatePricing(price, discountPrice || price);
          if (!validation.valid) {
            throw ApiError.validation(validation.error);
          }
        }

        // Validate stock
        const stock = variant.stockObj?.available || variant.stock;
        if (stock !== undefined) {
          const stockValidation = validateStockQuantity(stock);
          if (!stockValidation.valid) {
            throw ApiError.validation(stockValidation.error);
          }
        }

        // Validate variant SKU
        if (variant.sku) {
          const skuValidation = validateSku(variant.sku);
          if (!skuValidation.valid) {
            throw ApiError.validation(
              `Invalid variant SKU: ${skuValidation.error}`
            );
          }

          // Check for duplicate SKUs within this product
          if (allVariantSkus.includes(variant.sku)) {
            throw ApiError.validation(`Duplicate variant SKU: ${variant.sku}`);
          }
          allVariantSkus.push(variant.sku);

          // Check global SKU uniqueness
          const checkSkuExists = async (sku) => {
            const Product = require("./product.model");
            const existing = await Product.findOne({
              $or: [{ sku: sku }, { "variants.sku": sku }],
            });
            return !!existing;
          };

          const skuExists = await checkSkuExists(variant.sku);
          if (skuExists) {
            throw ApiError.validation(
              `Variant SKU already exists: ${variant.sku}`
            );
          }
        }
      }
    }

    const product = await productRepository.create(productData);
    return product;
  }

  /**
   * Update product
   */
  async updateProduct(productId, updateData) {
    const product = await productRepository.findById(productId);

    if (!product) {
      throw ApiError.notFound("Product not found");
    }

    // Check SKU locking if updating product SKU
    if (updateData.sku !== undefined && updateData.sku !== product.sku) {
      if (product.skuLocked) {
        throw ApiError.forbidden(
          "Cannot change SKU: Product SKU is locked (used in orders)"
        );
      }

      if (updateData.sku) {
        const skuValidation = validateSku(updateData.sku);
        if (!skuValidation.valid) {
          throw ApiError.validation(`Invalid SKU: ${skuValidation.error}`);
        }

        // Check SKU uniqueness (exclude current product)
        const checkSkuExists = async (sku, excludeId) => {
          const Product = require("./product.model");
          const query = {
            $or: [{ sku: sku }, { "variants.sku": sku }],
          };
          if (excludeId) {
            query._id = { $ne: excludeId };
          }
          const existing = await Product.findOne(query);
          return !!existing;
        };

        const skuExists = await checkSkuExists(updateData.sku, productId);
        if (skuExists) {
          throw ApiError.validation("SKU already exists");
        }
      }
    }

    // Handle URL key updates with redirect creation
    if (
      updateData.url_key !== undefined &&
      updateData.url_key !== product.url_key
    ) {
      if (updateData.url_key) {
        const checkUrlKeyExists = async (urlKey, excludeId) => {
          const query = { url_key: urlKey };
          if (excludeId) {
            query._id = { $ne: excludeId };
          }
          const existing = await productRepository.findOne(query);
          return !!existing;
        };

        const urlKeyExists = await checkUrlKeyExists(
          updateData.url_key,
          productId
        );
        if (urlKeyExists) {
          throw ApiError.validation("URL key already exists");
        }

        // Add previous URL key to history if it's changing
        if (product.url_key && product.url_key !== updateData.url_key) {
          if (!updateData.urlKeyHistory) {
            updateData.urlKeyHistory = [...(product.urlKeyHistory || [])];
          }
          updateData.urlKeyHistory.push({
            urlKey: product.url_key,
            createdAt: new Date(),
          });
        }
      }
    }

    // Validate variants if being updated
    if (updateData.variants && Array.isArray(updateData.variants)) {
      const allVariantSkus = [];

      for (let i = 0; i < updateData.variants.length; i++) {
        const variant = updateData.variants[i];
        const existingVariant = product.variants.find(
          (v) => v.id === variant.id
        );

        // Check variant SKU locking
        if (
          variant.sku !== undefined &&
          existingVariant &&
          variant.sku !== existingVariant.sku
        ) {
          if (existingVariant.skuLocked) {
            throw ApiError.forbidden(
              `Cannot change variant SKU: SKU ${existingVariant.sku} is locked (used in orders)`
            );
          }
        }

        // Validate pricing
        const price = variant.pricing?.price || variant.price;
        const discountPrice =
          variant.pricing?.discountPrice || variant.discountPrice;

        if (price !== undefined) {
          const validation = validatePricing(price, discountPrice || price);
          if (!validation.valid) {
            throw ApiError.validation(validation.error);
          }
        }

        // Validate stock
        const stock = variant.stockObj?.available || variant.stock;
        if (stock !== undefined) {
          const stockValidation = validateStockQuantity(stock);
          if (!stockValidation.valid) {
            throw ApiError.validation(stockValidation.error);
          }
        }

        // Validate variant SKU
        if (variant.sku) {
          const skuValidation = validateSku(variant.sku);
          if (!skuValidation.valid) {
            throw ApiError.validation(
              `Invalid variant SKU: ${skuValidation.error}`
            );
          }

          // Check for duplicate SKUs within this product
          if (allVariantSkus.includes(variant.sku)) {
            throw ApiError.validation(`Duplicate variant SKU: ${variant.sku}`);
          }
          allVariantSkus.push(variant.sku);

          // Check global SKU uniqueness (exclude current product)
          const checkSkuExists = async (sku, excludeId) => {
            const Product = require("./product.model");
            const query = {
              $or: [{ sku: sku }, { "variants.sku": sku }],
            };
            if (excludeId) {
              query._id = { $ne: excludeId };
            }
            const existing = await Product.findOne(query);
            return !!existing;
          };

          const skuExists = await checkSkuExists(variant.sku, productId);
          if (skuExists) {
            throw ApiError.validation(
              `Variant SKU already exists: ${variant.sku}`
            );
          }
        }
      }
    }

    const updatedProduct = await productRepository.updateById(
      productId,
      updateData
    );
    return updatedProduct;
  }

  /**
   * Delete product
   */
  async deleteProduct(productId) {
    const product = await productRepository.findById(productId);

    if (!product) {
      throw ApiError.notFound("Product not found");
    }

    await productRepository.deleteById(productId);
    return { success: true };
  }

  /**
   * Update product status
   */
  async updateProductStatus(productId, status) {
    const product = await productRepository.findById(productId);

    if (!product) {
      throw ApiError.notFound("Product not found");
    }

    const validStatuses = ["draft", "published", "archived"];
    if (!validStatuses.includes(status)) {
      throw ApiError.validation(
        `Invalid status. Must be one of: ${validStatuses.join(", ")}`
      );
    }

    const updatedProduct = await productRepository.updateStatus(
      productId,
      status
    );
    return updatedProduct;
  }

  /**
   * Bulk update product status
   */
  async bulkUpdateStatus(productIds, status) {
    const validStatuses = ["draft", "published", "archived"];
    if (!validStatuses.includes(status)) {
      throw ApiError.validation(
        `Invalid status. Must be one of: ${validStatuses.join(", ")}`
      );
    }

    const result = await productRepository.bulkUpdateStatus(productIds, status);
    return result;
  }

  /**
   * Search products
   */
  async searchProducts(searchTerm, options = {}) {
    if (!searchTerm || searchTerm.trim().length === 0) {
      throw ApiError.badRequest("Search term is required");
    }

    const result = await productRepository.search(searchTerm.trim(), {
      page: options.page || 1,
      limit: options.limit || 20,
    });

    return result;
  }

  /**
   * Check if SKU is available (not in use)
   */
  async checkSkuAvailable(sku, excludeProductId = null) {
    if (!sku) {
      throw ApiError.badRequest("SKU is required");
    }

    const Product = require("./product.model");
    const query = {
      $or: [{ sku: sku }, { "variants.sku": sku }],
    };

    if (excludeProductId) {
      query._id = { $ne: excludeProductId };
    }

    const existing = await Product.findOne(query);
    return !existing;
  }

  /**
   * Check if URL key is available (not in use)
   */
  async checkUrlKeyAvailable(urlKey, excludeProductId = null) {
    if (!urlKey) {
      throw ApiError.badRequest("URL key is required");
    }

    const query = { url_key: urlKey };
    if (excludeProductId) {
      query._id = { $ne: excludeProductId };
    }

    const existing = await productRepository.findOne(query);
    return !existing;
  }

  /**
   * Generate SKU suggestion for product
   */
  async generateSkuSuggestion(productName, options = {}) {
    if (!productName) {
      throw ApiError.badRequest("Product name is required");
    }

    const baseSku = suggestProductSku(productName, options);

    const checkSkuExists = async (sku) => {
      return !(await this.checkSkuAvailable(sku));
    };

    const uniqueSku = await generateUniqueSku(baseSku, checkSkuExists);
    return uniqueSku;
  }

  /**
   * Generate variant SKU suggestion
   */
  generateVariantSkuSuggestion(baseSku, variantOptions, config = {}) {
    if (!baseSku) {
      throw ApiError.badRequest("Base SKU is required");
    }

    return generateVariantSku(baseSku, variantOptions, config);
  }

  /**
   * Lock product SKU (called when used in orders)
   */
  async lockProductSku(productId) {
    const product = await productRepository.findById(productId);
    if (!product) {
      throw ApiError.notFound("Product not found");
    }

    await productRepository.updateById(productId, { skuLocked: true });
    return { success: true };
  }

  /**
   * Lock variant SKU (called when used in orders)
   */
  async lockVariantSku(productId, variantId) {
    const product = await productRepository.findById(productId);
    if (!product) {
      throw ApiError.notFound("Product not found");
    }

    const variantIndex = product.variants.findIndex((v) => v.id === variantId);
    if (variantIndex === -1) {
      throw ApiError.notFound("Variant not found");
    }

    const updateData = {};
    updateData[`variants.${variantIndex}.skuLocked`] = true;

    await productRepository.updateById(productId, updateData);
    return { success: true };
  }
}

module.exports = new ProductService();
