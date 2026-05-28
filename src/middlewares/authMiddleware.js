const jwt = require("jsonwebtoken");
const ApiError = require("../core/ApiError");
const { getAuthCookieName } = require("../utils/authCookieOptions");

const getTokenFromRequest = (req, kind = "access") => {
  const authHeader = req.headers["authorization"];
  if (authHeader) {
    const token = authHeader.split(" ")[1];
    if (token) return token;
  }

  const clientType = req.headers["x-client-type"] || "frontend";
  const cookieName = getAuthCookieName(clientType, kind);
  const cookies = req.cookies || {};

  return cookies[cookieName] || cookies.access_token || cookies.dashboard_access_token || null;
};

const verifyToken = (req, res, next) => {
  const token = getTokenFromRequest(req, "access");
  if (!token) return next(ApiError.unauthorized("No token provided"));

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
  req.user = null;

  const token = getTokenFromRequest(req, "access");
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
