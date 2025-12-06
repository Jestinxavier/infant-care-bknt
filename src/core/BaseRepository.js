/**
 * Base Repository Class
 * Provides common database operations that all repositories can extend
 */
class BaseRepository {
  constructor(model) {
    this.model = model;
  }

  /**
   * Find all documents with optional filtering and pagination
   */
  async findAll(filter = {}, options = {}) {
    const {
      page = 1,
      limit = 10,
      sort = { createdAt: -1 },
      select = null,
      populate = [],
    } = options;

    const skip = (page - 1) * limit;

    const query = this.model.find(filter);

    if (select) {
      query.select(select);
    }

    if (populate.length > 0) {
      populate.forEach((pop) => {
        query.populate(pop);
      });
    }

    if (sort) {
      query.sort(sort);
    }

    query.skip(skip).limit(limit);

    const [data, total] = await Promise.all([
      query.exec(),
      this.model.countDocuments(filter),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Find one document by filter
   */
  async findOne(filter, options = {}) {
    const { select = null, populate = [] } = options;
    const query = this.model.findOne(filter);

    if (select) {
      query.select(select);
    }

    if (populate.length > 0) {
      populate.forEach((pop) => {
        query.populate(pop);
      });
    }

    return query.exec();
  }

  /**
   * Find document by ID
   */
  async findById(id, options = {}) {
    const { select = null, populate = [] } = options;
    const query = this.model.findById(id);

    if (select) {
      query.select(select);
    }

    if (populate.length > 0) {
      populate.forEach((pop) => {
        query.populate(pop);
      });
    }

    return query.exec();
  }

  /**
   * Create a new document
   */
  async create(data) {
    const document = new this.model(data);
    return document.save();
  }

  /**
   * Create multiple documents
   */
  async createMany(dataArray) {
    return this.model.insertMany(dataArray);
  }

  /**
   * Update document by ID
   */
  async updateById(id, data, options = {}) {
    const { new: returnNew = true, runValidators = true } = options;
    return this.model.findByIdAndUpdate(id, data, {
      new: returnNew,
      runValidators,
    });
  }

  /**
   * Update one document by filter
   */
  async updateOne(filter, data, options = {}) {
    const { new: returnNew = true, runValidators = true } = options;
    return this.model.findOneAndUpdate(filter, data, {
      new: returnNew,
      runValidators,
    });
  }

  /**
   * Update multiple documents
   */
  async updateMany(filter, data) {
    return this.model.updateMany(filter, data);
  }

  /**
   * Delete document by ID
   */
  async deleteById(id) {
    return this.model.findByIdAndDelete(id);
  }

  /**
   * Delete one document by filter
   */
  async deleteOne(filter) {
    return this.model.findOneAndDelete(filter);
  }

  /**
   * Delete multiple documents
   */
  async deleteMany(filter) {
    return this.model.deleteMany(filter);
  }

  /**
   * Count documents
   */
  async count(filter = {}) {
    return this.model.countDocuments(filter);
  }

  /**
   * Check if document exists
   */
  async exists(filter) {
    return this.model.exists(filter);
  }

  /**
   * Aggregate pipeline
   */
  async aggregate(pipeline) {
    return this.model.aggregate(pipeline);
  }
}

module.exports = BaseRepository;
