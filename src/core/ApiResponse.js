/**
 * Unified API Response Handler
 * All API responses follow this standardized format
 */
class ApiResponse {
  constructor(success, message, data = null, meta = null) {
    this.success = success;
    this.message = message;
    this.data = data;
    this.meta = meta;
    this.timestamp = new Date().toISOString();
  }

  /**
   * Success response
   */
  static success(message, data = null, meta = null) {
    return new ApiResponse(true, message, data, meta);
  }

  /**
   * Success response with pagination
   */
  static paginated(message, data, pagination) {
    return new ApiResponse(true, message, data, { pagination });
  }

  /**
   * Error response
   */
  static error(message, errors = null) {
    return new ApiResponse(false, message, null, errors ? { errors } : null);
  }

  /**
   * Convert to JSON for Express response
   */
  toJSON() {
    const response = {
      success: this.success,
      message: this.message,
      timestamp: this.timestamp,
    };

    if (this.data !== null) {
      response.data = this.data;
    }

    if (this.meta !== null) {
      response.meta = this.meta;
    }

    return response;
  }
}

module.exports = ApiResponse;
