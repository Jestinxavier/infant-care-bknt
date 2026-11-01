/**
 * Standardize month-range text embedded in variant/product display names.
 *
 * Order snapshots and legacy product names may still contain any historical
 * spelling ("0-3m", "0-3 M", "0-3 m M", "0-3 Months"). This helper rewrites
 * only the month-range token to the canonical display format "0-3M"; all
 * surrounding text is left untouched.
 *
 * It is idempotent, so it can be used both by the one-off migration and by
 * display code that renders immutable order snapshots.
 */

// A month range with an explicit months/m/mo suffix. The optional trailing
// "M" also absorbs the redundant " M" that older generators appended
// ("0-3 m M" -> "0-3M").
const EMBEDDED_MONTH_RANGE =
  /(\d{1,2})\s*[-\u2010-\u2015_ ]\s*(\d{1,2})\s*(?:[-\u2010-\u2015_ ]?\s*(?:months?|mon|mo|m))(?:\s*m)?\b/gi;

const MAX_MONTH = 36;

/**
 * @param {*} value
 * @returns {string}
 */
function formatVariantName(value) {
  if (value == null) return "";

  return String(value).replace(EMBEDDED_MONTH_RANGE, (match, rawStart, rawEnd) => {
    const start = Number(rawStart);
    const end = Number(rawEnd);
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start >= end ||
      end > MAX_MONTH
    ) {
      return match;
    }
    return `${start}-${end}M`;
  });
}

/** True when the text contains a month range that would be rewritten. */
function hasLegacyMonthRange(value) {
  if (value == null) return false;
  const text = String(value);
  EMBEDDED_MONTH_RANGE.lastIndex = 0;
  let match;
  while ((match = EMBEDDED_MONTH_RANGE.exec(text)) !== null) {
    const start = Number(match[1]);
    const end = Number(match[2]);
    if (
      Number.isFinite(start) &&
      Number.isFinite(end) &&
      start < end &&
      end <= MAX_MONTH
    ) {
      return true;
    }
  }
  return false;
}

const CANONICAL_MONTH_VALUE = /^(\d{1,2})\s*[-\u2010-\u2015_ ]\s*(\d{1,2})-months$/i;

/**
 * Derive the canonical display label from a registry month identity.
 *
 *   "0-3-months" -> "0-3M"
 *
 * Returns null for non-month values (newborn, 110x110cm, S, ...).
 */
function monthLabelFromSizeValue(value) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(CANONICAL_MONTH_VALUE);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start >= end ||
    end > MAX_MONTH
  ) {
    return null;
  }
  return `${start}-${end}M`;
}

// The trailing token of a generated variant name, e.g. "0-6M", "0-6 m M".
const TRAILING_MONTH_TOKEN = /(\d{1,2})\s*[-\u2010-\u2015_ ]\s*(\d{1,2})\s*(?:months?|mon|mo|m)?(?:\s*m)?$/i;

/**
 * Replace the trailing month token of a variant name with the canonical label
 * taken from the variant's own size value. Other trailing text is untouched.
 *
 *   ("Frock - White - 0-6M", "0-3M") -> "Frock - White - 0-3M"
 *   ("Frock - Newborn",      "0-3M") -> unchanged
 */
function applySizeLabelToVariantName(name, label) {
  if (!name || !label) return name;
  const index = name.lastIndexOf(" - ");
  if (index === -1) return name;
  const head = name.slice(0, index);
  const tail = name.slice(index + 3).trim();
  if (!TRAILING_MONTH_TOKEN.test(tail)) return name;
  return `${head} - ${label}`;
}

module.exports = {
  formatVariantName,
  hasLegacyMonthRange,
  monthLabelFromSizeValue,
  applySizeLabelToVariantName,
};
