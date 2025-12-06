const { validationResult } = require("express-validator");
const ApiError = require("../ApiError");

/**
 * Validation Middleware
 * Checks express-validator results and returns formatted errors
 */
const validate = (validations) => {
  return async (req, res, next) => {
    // Run all validations
    await Promise.all(validations.map((validation) => validation.run(req)));

    // Check for errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const formattedErrors = errors.array().map((err) => ({
        field: err.path || err.param,
        message: err.msg,
        value: err.value,
      }));

      return next(ApiError.validation("Validation failed", formattedErrors));
    }

    next();
  };
};

module.exports = { validate };
