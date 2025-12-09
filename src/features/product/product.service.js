const productRepository = require("./product.repository");
const ApiError = require("../../core/ApiError");
const { validatePricing } = require("./rules/pricing.rules");
const { isInStock, validateStockQuantity } = require("./rules/inventory.rules");
const {
  generateUniqueUrlKey,
  generateUrlKeyWithRedirect,
} = require("../../utils/slugGenerator");
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
  async getAllProducts(filters = {}, options = {}) {
    const {
      page = 1,
      limit = 20,
      category,
      status = "published", // Default to published for storefront
      minPrice,
      maxPrice,
      inStock,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = filters;

    // Build filter object
    const filter = {};

    // Only show published products for storefront (unless admin)
    if (!options.isAdmin) {
      filter.status = "published";
    } else if (status) {
      filter.status = status;
    }

    if (category) {
      filter.category = category;
    }

    // Price filtering (check variant prices)
    if (minPrice || maxPrice) {
      filter["variants.price"] = {};
      if (minPrice) filter["variants.price"].$gte = minPrice;
      if (maxPrice) filter["variants.price"].$lte = maxPrice;
    }

    // Stock filtering
    if (inStock !== undefined) {
      filter["variants.stock"] = inStock ? { $gt: 0 } : 0;
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === "asc" ? 1 : -1;

    const result = await productRepository.findAll(filter, {
      page: parseInt(page),
      limit: parseInt(limit),
      sort,
      populate: [{ path: "category", select: "name slug" }],
    });

    return result;
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
        checkUrlKeyExists,
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

    // Validate variants if provided
    if (productData.variants && Array.isArray(productData.variants)) {
      const allVariantSkus = [];

      for (const variant of productData.variants) {
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
              `Invalid variant SKU: ${skuValidation.error}`,
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
              `Variant SKU already exists: ${variant.sku}`,
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
          "Cannot change SKU: Product SKU is locked (used in orders)",
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
          productId,
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
          (v) => v.id === variant.id,
        );

        // Check variant SKU locking
        if (
          variant.sku !== undefined &&
          existingVariant &&
          variant.sku !== existingVariant.sku
        ) {
          if (existingVariant.skuLocked) {
            throw ApiError.forbidden(
              `Cannot change variant SKU: SKU ${existingVariant.sku} is locked (used in orders)`,
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
              `Invalid variant SKU: ${skuValidation.error}`,
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
              `Variant SKU already exists: ${variant.sku}`,
            );
          }
        }
      }
    }

    const updatedProduct = await productRepository.updateById(
      productId,
      updateData,
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
        `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      );
    }

    const updatedProduct = await productRepository.updateStatus(
      productId,
      status,
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
        `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
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
