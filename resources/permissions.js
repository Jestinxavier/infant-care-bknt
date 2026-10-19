// resources/permissions.js
// Server-side Role-Based Access Control (RBAC) for admin routes.
//
// WARNING: Keep this in sync with dashboard/src/lib/rbac/permissions.ts.
// The frontend uses its copy for UI gating; this copy is the authority for
// API enforcement (requirePermission middleware in middlewares/).

// Roles: user, admin, super-admin, developer
const ROLE_PERMISSIONS = {
  // Super Admin: Full Access (no payment_options edit — developer only)
  "super-admin": [
    "view:dashboard",
    "view:analytics",
    "view:financial_data",

    "view:products",
    "create:products",
    "edit:products",
    "delete:products",
    "manage:inventory",

    "view:categories",
    "create:categories",
    "edit:categories",
    "delete:categories",

    "view:orders",
    "edit:orders",
    "manage:fulfillment",
    "delete:orders",

    "view:customers",
    "edit:customers",
    "delete:customers",

    "view:cms",
    "edit:cms",

    "view:reviews",
    "moderate:reviews",
    "delete:reviews",

    "view:cache",
    "manage:cache",

    // Error logs
    "view:error_logs",
    "manage:error_logs",

    "view:settings",
    "edit:settings",
    "manage:users",
    "manage:roles",
  ],

  // Developer: Same as super-admin + exclusive payment options access
  developer: [
    "view:dashboard",
    "view:analytics",
    "view:financial_data",

    "view:products",
    "create:products",
    "edit:products",
    "delete:products",
    "manage:inventory",

    "view:categories",
    "create:categories",
    "edit:categories",
    "delete:categories",

    "view:orders",
    "edit:orders",
    "manage:fulfillment",
    "delete:orders",

    "view:customers",
    "edit:customers",
    "delete:customers",

    "view:cms",
    "edit:cms",

    "view:reviews",
    "moderate:reviews",
    "delete:reviews",

    "view:cache",
    "manage:cache",

    // Error logs
    "view:error_logs",
    "manage:error_logs",

    "view:settings",
    "edit:settings",
    "edit:payment_options",
    "manage:users",
    "manage:roles",
  ],

  // Admin: Operational management only.
  // NO analytics/financial data, NO user/role management, NO error logs management.
  admin: [
    "view:dashboard",

    "view:products",
    "create:products",
    "edit:products",
    "delete:products",
    "manage:inventory",

    "view:categories",
    "create:categories",
    "edit:categories",
    "delete:categories",

    "view:orders",
    "edit:orders",
    "manage:fulfillment",

    "view:customers",
    "edit:customers",

    "view:cms",
    "edit:cms",

    "view:reviews",
    "moderate:reviews",

    "view:cache",
    "manage:cache",

    // Error logs – read-only (raw stack traces & metadata are stripped server-side)
    "view:error_logs",

    "view:settings",
  ],
};

/**
 * Check if a role holds a specific permission.
 */
const hasPermission = (role, permission) => {
  if (!role) return false;
  return (ROLE_PERMISSIONS[role] || []).includes(permission);
};

module.exports = { ROLE_PERMISSIONS, hasPermission };