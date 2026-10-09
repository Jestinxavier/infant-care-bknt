/**
 * Validation for the Static Pages CMS.
 * Two layers:
 *  - express-validator chains for the HTTP envelope (routes)
 *  - schema-driven block validation against the content-type registry
 */

const { body, param, query } = require("express-validator");
const {
  CONTENT_TYPE_MAP,
  CONTENT_TYPES,
  fieldDefault,
} = require("../content-types");

/* -------------------------------------------------------------------------- */
/*                            Schema-driven validation                         */
/* -------------------------------------------------------------------------- */

/**
 * Validate a single value against a field definition.
 * Returns an array of error strings (empty when valid).
 */
function validateFieldValue(fieldDef, value, fieldPath = fieldDef.key) {
  const errors = [];
  const { type, required, options, itemSchema } = fieldDef;
  const isBlank = value === undefined || value === null || value === "";

  if (isBlank) {
    if (required) {
      errors.push(`${fieldPath} is required`);
    }
    return errors;
  }

  switch (type) {
    case "text":
    case "textarea":
    case "richText":
      if (typeof value !== "string") {
        errors.push(`${fieldPath} must be a string`);
      }
      break;
    case "image":
    case "url":
      if (typeof value !== "string") {
        errors.push(`${fieldPath} must be a string`);
      } else if (
        !value.startsWith("http://") &&
        !value.startsWith("https://") &&
        !value.startsWith("/") &&
        !value.startsWith("#")
      ) {
        errors.push(`${fieldPath} must be a valid URL or path`);
      }
      break;
    case "select":
      if (!Array.isArray(options) || !options.includes(value)) {
        errors.push(`${fieldPath} must be one of: ${(options || []).join(", ")}`);
      }
      break;
    case "boolean":
      if (typeof value !== "boolean") {
        errors.push(`${fieldPath} must be a boolean`);
      }
      break;
    case "repeater": {
      if (!Array.isArray(value)) {
        errors.push(`${fieldPath} must be an array`);
        break;
      }
      const subDefs = Array.isArray(itemSchema) ? itemSchema : [];
      value.forEach((item, index) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          errors.push(`${fieldPath}[${index}] must be an object`);
          return;
        }
        for (const sub of subDefs) {
          errors.push(
            ...validateFieldValue(
              sub,
              item[sub.key],
              `${fieldPath}[${index}].${sub.key}`
            )
          );
        }
      });
      break;
    }
    default:
      break;
  }

  return errors;
}

/**
 * Validate a page's block list against the content-type registry.
 * Returns { valid, errors, blocks } — the normalized blocks on success.
 */
function validateBlocks(rawBlocks) {
  if (!Array.isArray(rawBlocks)) {
    return { valid: false, errors: ["blocks must be an array"] };
  }

  const errors = [];
  const normalized = [];

  rawBlocks.forEach((block, index) => {
    if (!block || typeof block !== "object") {
      errors.push(`blocks[${index}] must be an object`);
      return;
    }

    const def = CONTENT_TYPE_MAP[block.type];
    if (!def) {
      errors.push(
        `blocks[${index}]: unknown block type "${block.type}". Allowed: ${Object.keys(
          CONTENT_TYPE_MAP
        ).join(", ")}`
      );
      return;
    }

    // Normalize shape: data object + enabled + order
    let data = block.data;
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      data = {};
    }
    if (typeof block.enabled !== "boolean") block.enabled = true;
    if (typeof block.order !== "number") block.order = index;

    for (const field of def.fields) {
      errors.push(...validateFieldValue(field, data[field.key]));

      // Fill in defaults for missing optional fields
      if (
        (data[field.key] === undefined || data[field.key] === null) &&
        fieldDefault(field) !== undefined
      ) {
        data[field.key] = fieldDefault(field);
      }
    }

    normalized.push({
      type: def.id,
      enabled: block.enabled,
      order: block.order,
      data,
    });
  });

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Assign order 0..n deterministically when not supplied
  normalized.forEach((b, i) => {
    if (b.order === 0 && normalized.filter((x) => x.order === 0).length > 1) {
      b.order = i;
    }
  });

  return { valid: true, errors: [], blocks: normalized };
}

/* -------------------------------------------------------------------------- */
/*                            Express validator chains                         */
/* -------------------------------------------------------------------------- */

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const validateCreatePage = [
  body("slug")
    .notEmpty()
    .withMessage("Slug is required")
    .matches(SLUG_RE)
    .withMessage("Slug must be lowercase letters, numbers and dashes"),
  body("title").notEmpty().withMessage("Title is required"),
  body("seo").optional().isObject().withMessage("seo must be an object"),
];

const validateUpdatePage = [
  param("id").isMongoId().withMessage("Invalid page id"),
  body("title").optional().notEmpty().withMessage("Title cannot be empty"),
  body("blocks").optional().isArray().withMessage("blocks must be an array"),
  body("seo").optional().isObject().withMessage("seo must be an object"),
];

const validatePublishPage = [
  param("id").isMongoId().withMessage("Invalid page id"),
];

const validatePageId = [
  param("id").isMongoId().withMessage("Invalid page id"),
];

const validateListQuery = [
  query("query").optional().isString().withMessage("query must be a string"),
];

module.exports = {
  validateBlocks,
  validateCreatePage,
  validateUpdatePage,
  validatePublishPage,
  validatePageId,
  validateListQuery,
  CONTENT_TYPES,
};