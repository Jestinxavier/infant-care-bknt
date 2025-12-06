const productRepository = require("./product.repository");
const ApiError = require("../../core/ApiError");
const { validatePricing } = require("./rules/pricing.rules");
const { isInStock, validateStockQuantity } = require("./rules/inventory.rules");

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
    // Validate variants if provided
    if (productData.variants && Array.isArray(productData.variants)) {
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

    // Validate variants if being updated
    if (updateData.variants && Array.isArray(updateData.variants)) {
      for (const variant of updateData.variants) {
        const price = variant.pricing?.price || variant.price;
        const discountPrice =
          variant.pricing?.discountPrice || variant.discountPrice;

        if (price !== undefined) {
          const validation = validatePricing(price, discountPrice || price);
          if (!validation.valid) {
            throw ApiError.validation(validation.error);
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
}

module.exports = new ProductService();
