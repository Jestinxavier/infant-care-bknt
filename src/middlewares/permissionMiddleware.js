// middlewares/permissionMiddleware.js
// Fine-grained permission enforcement for admin routes.
// Must be used AFTER verifyToken and requireAdmin so req.user.role is populated.

const { hasPermission } = require("../../resources/permissions");

/**
 * requirePermission("manage:error_logs")
 * Rejects with 403 unless the authenticated user's role holds the permission.
 */
const requirePermission = (permission) => async (req, res, next) => {
  const role = req.user?.role;

  if (!role || !hasPermission(role, permission)) {
    return res.status(403).json({
      success: false,
      message: "Access denied. Insufficient permissions.",
    });
  }

  next();
};

module.exports = requirePermission;