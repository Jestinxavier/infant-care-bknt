const ApiError = require("../ApiError");
const ApiResponse = require("../ApiResponse");

/**
 * Global Error Handling Middleware
 * Catches all errors and returns standardized responses
 */
const errorMiddleware = (err, req, res, next) => {
  // Log error for debugging
  console.error("❌ Error:", {
    message: err.message,
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    path: req.path,
    method: req.method,
  });

  // If response already sent, delegate to default Express error handler
  if (res.headersSent) {
    return next(err);
  }

  // Handle known ApiError
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json(err.toJSON());
  }

  // Handle Mongoose validation errors
  if (err.name === "ValidationError") {
    const errors = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    const apiError = ApiError.validation("Validation failed", errors);
    return res.status(apiError.statusCode).json(apiError.toJSON());
  }

  // Handle Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    const apiError = ApiError.conflict(`${field} already exists`);
    return res.status(apiError.statusCode).json(apiError.toJSON());
  }

  // Handle JWT errors
  if (err.name === "JsonWebTokenError") {
    const apiError = ApiError.unauthorized("Invalid token");
    return res.status(apiError.statusCode).json(apiError.toJSON());
  }

  if (err.name === "TokenExpiredError") {
    const apiError = ApiError.unauthorized("Token expired");
    return res.status(apiError.statusCode).json(apiError.toJSON());
  }

  // Handle CastError (invalid ObjectId)
  if (err.name === "CastError") {
    const apiError = ApiError.badRequest("Invalid ID format");
    return res.status(apiError.statusCode).json(apiError.toJSON());
  }

  // Default to 500 server error
  const apiError = ApiError.internal(
    process.env.NODE_ENV === "production"
      ? "Internal server error"
      : err.message
  );
  return res.status(apiError.statusCode).json(apiError.toJSON());
};

module.exports = errorMiddleware;
