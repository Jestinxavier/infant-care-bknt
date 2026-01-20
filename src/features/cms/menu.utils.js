/**
 * Menu utility functions
 * Helper functions for menu operations
 */

/**
 * Slugify text for ID generation
 * @param {string} text - Text to slugify
 * @returns {string} - Slugified text
 */
function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove special characters
    .replace(/[\s_-]+/g, "-") // Replace spaces and underscores with hyphens
    .replace(/^-+|-+$/g, ""); // Remove leading/trailing hyphens
}

/**
 * Generate unique ID from label
 * @param {string} label - Menu label
 * @param {Set} existingIds - Set of existing IDs
 * @returns {string} - Unique ID
 */
function generateMenuId(label, existingIds = new Set()) {
  let baseId = slugify(label);
  let id = baseId;
  let counter = 1;

  while (existingIds.has(id)) {
    id = `${baseId}-${counter}`;
    counter++;
  }

  return id;
}

/**
 * Get depth of a menu item by traversing its parents
 * @param {string} itemId - Item ID
 * @param {Array} menu - Menu tree
 * @param {number} currentDepth - Current depth (internal)
 * @returns {number} - Depth level (1, 2, or 3)
 */
function getMenuItemDepth(itemId, menu, currentDepth = 1) {
  for (const item of menu) {
    if (item.id === itemId) {
      return currentDepth;
    }
    if (item.children && item.children.length > 0) {
      const depth = getMenuItemDepth(itemId, item.children, currentDepth + 1);
      if (depth > 0) {
        return depth;
      }
    }
  }
  return 0; // Not found
}

/**
 * Find menu item by ID
 * @param {string} itemId - Item ID
 * @param {Array} menu - Menu tree
 * @returns {object|null} - Menu item or null
 */
function findMenuItemById(itemId, menu) {
  for (const item of menu) {
    if (item.id === itemId) {
      return item;
    }
    if (item.children && item.children.length > 0) {
      const found = findMenuItemById(itemId, item.children);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

/**
 * Collect all IDs from menu tree
 * @param {Array} menu - Menu tree
 * @returns {Set} - Set of all IDs
 */
function collectMenuIds(menu) {
  const ids = new Set();

  const traverse = (items) => {
    for (const item of items) {
      if (item.id) {
        ids.add(item.id);
      }
      if (item.children && item.children.length > 0) {
        traverse(item.children);
      }
    }
  };

  traverse(menu);
  return ids;
}

/**
 * Flatten menu tree to array with depth information
 * @param {Array} menu - Menu tree
 * @param {number} depth - Current depth
 * @returns {Array} - Flattened menu items with depth
 */
function flattenMenu(menu, depth = 1) {
  const result = [];

  for (const item of menu) {
    result.push({
      ...item,
      depth,
      hasChildren: !!(item.children && item.children.length > 0),
    });

    if (item.children && item.children.length > 0) {
      result.push(...flattenMenu(item.children, depth + 1));
    }
  }

  return result;
}

module.exports = {
  slugify,
  generateMenuId,
  getMenuItemDepth,
  findMenuItemById,
  collectMenuIds,
  flattenMenu,
};
