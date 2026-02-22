const BaseRepository = require("../../core/BaseRepository");
const Product = require("./product.model");
const { buildFilterAttributesQuery } = require("../../utils/filterAttributes");

/**
 * Product Repository
 * Handles all database operations for products
 * Extends BaseRepository for common operations
 */
class ProductRepository extends BaseRepository {
  constructor() {
    super(Product);
  }

  /**
   * Find products by category
   */
  async findByCategory(categoryId, options = {}) {
    return this.findAll({ category: categoryId }, options);
  }

  /**
   * Find products by status
   */
  async findByStatus(status, options = {}) {
    return this.findAll({ status }, options);
  }

  /**
   * Find product by URL key
   */
  async findByUrlKey(urlKey, options = {}) {
    return this.findOne({ url_key: urlKey }, options);
  }

  /**
   * Search products by text or SKU
   * @param {string} searchTerm - Search term
   * @param {Object} options - { page, limit, product_type, includeNonPublished }
   */
  async search(searchTerm, options = {}) {
    // Build search conditions using regex for flexibility
    // This allows searching by SKU, title, or description
    const searchRegex = new RegExp(searchTerm, "i");

    const filter = {
      $or: [
        { sku: searchRegex },
        { title: searchRegex },
        { description: searchRegex },
      ],
    };

    // For bundle child picker, we want published products
    // but also allow includeNonPublished option
    if (!options.includeNonPublished) {
      filter.status = "published";
    }

    // Add product_type filter if provided
    if (options.product_type) {
      filter.product_type = options.product_type;
    }

    return this.findAll(filter, {
      page: options.page,
      limit: options.limit,
      sort: { title: 1 },
    });
  }

  /**
   * Find products with filters
   */
  async findWithFilters(filters = {}, options = {}) {
    const query = { status: "published" };

    if (filters.category) {
      query.category = filters.category;
    }

    Object.assign(query, buildFilterAttributesQuery(filters));

    // Legacy fallback for simple repository lookups (primary PLP uses aggregation service)
    if (filters.minPrice || filters.maxPrice) {
      query.price = {};
      if (filters.minPrice) query.price.$gte = filters.minPrice;
      if (filters.maxPrice) query.price.$lte = filters.maxPrice;
    }

    if (filters.inStock !== undefined) {
      query["stockObj.isInStock"] = !!filters.inStock;
    }

    return this.findAll(query, options);
  }

  /**
   * Update product status
   */
  async updateStatus(productId, status) {
    return this.updateById(productId, { status });
  }

  /**
   * Bulk update status
   */
  async bulkUpdateStatus(productIds, status) {
    return this.updateMany({ _id: { $in: productIds } }, { status });
  }
}

module.exports = new ProductRepository();
