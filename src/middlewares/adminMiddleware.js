const User = require("../models/user");
const { ADMIN_ROLES } = require("../../resources/constants");
const logger = require("../utils/logger");
const { cacheGet, cacheSet } = require("../utils/redisCache");

// Admin identity (role + active flag) is validated against the DB on every
// admin request so demotions/suspensions take effect immediately. We still do
// that, but cache the result briefly so a dashboard page that fires 10 requests
// doesn't hit the users collection 10 times. Short TTL keeps it fresh.
const ADMIN_IDENTITY_TTL_SECONDS = 60;

async function getAdminIdentity(userId) {
  const cacheKey = `admin:identity:${userId}`;
  const cached = await cacheGet(cacheKey);
  if (cached !== null) return cached;

  const user = await User.findById(userId)
    .select("role email username active")
    .lean();

  if (!user) return null;

  const identity = {
    role: user.role,
    email: user.email,
    username: user.username,
    active: user.active !== false,
  };
  await cacheSet(cacheKey, identity, ADMIN_IDENTITY_TTL_SECONDS);
  return identity;
}

/**
 * Middleware to require admin role for admin routes
 * Must be used after verifyToken middleware
 */
const requireAdmin = async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized - No user ID found",
      });
    }

    // Fetch (or read cached) user to re-check role and suspension status.
    const user = await getAdminIdentity(userId);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }
    // Check if user has admin role using centralized constants
    if (!ADMIN_ROLES.includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin role required.",
      });
    }
    // Suspended accounts are blocked from all admin routes.
    if (user.active === false) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Account is disabled.",
      });
    }

    // Attach full user info to request for use in controllers
    req.user = {
      id: userId,
      _id: userId,
      role: user.role,
      email: user.email,
      username: user.username,
    };

    next();
  } catch (error) {
    logger.error("Admin middleware error", { error: error.message });
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

module.exports = requireAdmin;

