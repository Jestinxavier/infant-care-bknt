/**
 * Custom API Error Class
 * Extends Error with status code and additional metadata
 */
class ApiError extends Error {
  constructor(message, statusCode = 500, errors = null, isOperational = true) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Bad Request (400)
   */
  static badRequest(message, errors = null) {
    return new ApiError(message, 400, errors);
  }

  /**
   * Unauthorized (401)
   */
  static unauthorized(message = "Unauthorized") {
    return new ApiError(message, 401);
  }

  /**
   * Forbidden (403)
   */
  static forbidden(message = "Forbidden") {
    return new ApiError(message, 403);
  }

  /**
   * Not Found (404)
   */
  static notFound(message = "Resource not found") {
    return new ApiError(message, 404);
  }

  /**
   * Conflict (409)
   */
  static conflict(message, errors = null) {
    return new ApiError(message, 409, errors);
  }

  /**
   * Validation Error (422)
   */
  static validation(message, errors = null) {
    return new ApiError(message, 422, errors);
  }

  /**
   * Internal Server Error (500)
   */
  static internal(message = "Internal server error") {
    return new ApiError(message, 500, null, false);
  }

  /**
   * Service Unavailable (503)
   */
  static serviceUnavailable(message = "Service temporarily unavailable") {
    return new ApiError(message, 503);
  }

  /**
   * Convert to JSON for error response
   */
  toJSON() {
    return {
      success: false,
      message: this.message,
      statusCode: this.statusCode,
      errors: this.errors,
      timestamp: new Date().toISOString(),
    };
  }
}

module.exports = ApiError;
