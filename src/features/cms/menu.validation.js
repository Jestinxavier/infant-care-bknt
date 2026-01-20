/**
 * Menu Validation Module
 * Validates hierarchical menu structure with max 3 levels
 */

class MenuValidator {
  /**
   * Validate maximum depth of menu tree
   * @param {Array} menu - Menu items array
   * @param {number} currentDepth - Current depth level (default: 1)
   * @param {number} maxDepth - Maximum allowed depth (default: 3)
   * @returns {object} - { valid: boolean, error?: string }
   */
  validateMenuDepth(menu, currentDepth = 1, maxDepth = 3) {
    if (!Array.isArray(menu)) {
      return { valid: false, error: "Menu must be an array" };
    }

    if (currentDepth > maxDepth) {
      return {
        valid: false,
        error: `Menu depth exceeds maximum of ${maxDepth} levels`,
      };
    }

    for (const item of menu) {
      if (!item || typeof item !== "object") {
        return { valid: false, error: "Invalid menu item" };
      }

      if (item.children && Array.isArray(item.children)) {
        if (item.children.length > 0) {
          const childResult = this.validateMenuDepth(
            item.children,
            currentDepth + 1,
            maxDepth
          );
          if (!childResult.valid) {
            return childResult;
          }
        }
      }
    }

    return { valid: true };
  }

  /**
   * Validate that leaf nodes at level 3 have URLs
   * Items with children may omit URLs
   * @param {Array} menu - Menu items array
   * @param {number} depth - Current depth level (default: 1)
   * @returns {object} - { valid: boolean, error?: string }
   */
  validateLeafUrls(menu, depth = 1) {
    if (!Array.isArray(menu)) {
      return { valid: false, error: "Menu must be an array" };
    }

    for (const item of menu) {
      if (!item || typeof item !== "object") {
        return { valid: false, error: "Invalid menu item" };
      }

      const hasChildren = item.children && item.children.length > 0;
      const isLevel3 = depth === 3;

      // Level 3 leaf nodes MUST have a URL
      if (isLevel3 && !hasChildren && !item.url) {
        return {
          valid: false,
          error: `Leaf node "${
            item.label || "Unnamed"
          }" at level 3 must have a URL`,
        };
      }

      // Recursively validate children
      if (hasChildren) {
        const childResult = this.validateLeafUrls(item.children, depth + 1);
        if (!childResult.valid) {
          return childResult;
        }
      }
    }

    return { valid: true };
  }

  /**
   * Validate that all IDs are unique across the entire tree
   * @param {Array} menu - Menu items array
   * @returns {object} - { valid: boolean, error?: string, ids?: Set }
   */
  validateUniqueIds(menu) {
    const ids = new Set();
    const duplicates = [];

    const collectIds = (items, path = []) => {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item || typeof item !== "object") continue;

        const currentPath = [...path, item.label || `Item ${i}`];

        if (!item.id) {
          duplicates.push({
            path: currentPath.join(" > "),
            error: "Missing ID",
          });
          continue;
        }

        if (ids.has(item.id)) {
          duplicates.push({
            path: currentPath.join(" > "),
            id: item.id,
            error: "Duplicate ID",
          });
        } else {
          ids.add(item.id);
        }

        if (item.children && Array.isArray(item.children)) {
          collectIds(item.children, currentPath);
        }
      }
    };

    collectIds(menu);

    if (duplicates.length > 0) {
      return {
        valid: false,
        error: `Found ${duplicates.length} ID issues: ${duplicates
          .map((d) => `${d.path} (${d.error}${d.id ? `: ${d.id}` : ""})`)
          .join(", ")}`,
      };
    }

    return { valid: true, ids };
  }

  /**
   * Validate required fields for each menu item
   * @param {Array} menu - Menu items array
   * @returns {object} - { valid: boolean, error?: string }
   */
  validateRequiredFields(menu) {
    if (!Array.isArray(menu)) {
      return { valid: false, error: "Menu must be an array" };
    }

    const validateItem = (item, path = []) => {
      if (!item || typeof item !== "object") {
        return {
          valid: false,
          error: `Invalid item at ${path.join(" > ") || "root"}`,
        };
      }

      const currentPath = [...path, item.label || "Unnamed"];

      // Required fields
      if (!item.id || typeof item.id !== "string" || !item.id.trim()) {
        return {
          valid: false,
          error: `Missing or invalid 'id' at ${currentPath.join(" > ")}`,
        };
      }

      if (!item.label || typeof item.label !== "string" || !item.label.trim()) {
        return {
          valid: false,
          error: `Missing or invalid 'label' at ${currentPath.join(" > ")}`,
        };
      }

      // Validate children recursively
      if (item.children) {
        if (!Array.isArray(item.children)) {
          return {
            valid: false,
            error: `'children' must be an array at ${currentPath.join(" > ")}`,
          };
        }

        for (const child of item.children) {
          const childResult = validateItem(child, currentPath);
          if (!childResult.valid) {
            return childResult;
          }
        }
      }

      return { valid: true };
    };

    for (const item of menu) {
      const result = validateItem(item);
      if (!result.valid) {
        return result;
      }
    }

    return { valid: true };
  }

  /**
   * Comprehensive menu validation
   * Runs all validators and returns detailed results
   * @param {Array} menu - Menu items array
   * @returns {object} - { valid: boolean, errors: string[] }
   */
  validateMenu(menu) {
    const errors = [];

    // Run all validators
    const requiredFieldsResult = this.validateRequiredFields(menu);
    if (!requiredFieldsResult.valid) {
      errors.push(requiredFieldsResult.error);
    }

    const depthResult = this.validateMenuDepth(menu);
    if (!depthResult.valid) {
      errors.push(depthResult.error);
    }

    const urlResult = this.validateLeafUrls(menu);
    if (!urlResult.valid) {
      errors.push(urlResult.error);
    }

    const idResult = this.validateUniqueIds(menu);
    if (!idResult.valid) {
      errors.push(idResult.error);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

module.exports = new MenuValidator();
