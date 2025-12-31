/**
 * Backend Constants - Centralized configuration values
 *
 * This file contains all hardcoded constants used across the backend.
 * Centralizing these values makes them easier to maintain and modify.
 */

// ============================================================================
// ORDER MANAGEMENT
// ============================================================================

/**
 * Number of days that admin/moderator roles are restricted to viewing orders
 * Super-admin role has no such restriction
 */
const ORDER_DATE_RESTRICTION_DAYS = 3;

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  ORDER_DATE_RESTRICTION_DAYS,
};
