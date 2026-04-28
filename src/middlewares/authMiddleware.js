const jwt = require("jsonwebtoken");
const ApiError = require("../core/ApiError");

const verifyToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  if (!authHeader) return next(ApiError.unauthorized("No token provided"));

  const token = authHeader.split(" ")[1];
  if (!token) return next(ApiError.unauthorized("Invalid token format"));

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    next(ApiError.unauthorized("Invalid or expired token"));
  }
};

/**
 * Optional auth — populates req.user when a valid token is present,
 * continues as guest otherwise. Used on cart and public product routes.
 */
const optionalVerifyToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  req.user = null;

  if (!authHeader) return next();

  const token = authHeader.split(" ")[1];
  if (!token) return next();

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    // Invalid token → guest mode, not an error
  }
  next();
};

module.exports = verifyToken;
module.exports.optionalVerifyToken = optionalVerifyToken;
