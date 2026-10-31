/**
 * Canonical size vocabulary helpers shared by migrations and generators.
 *
 * The store uses two legitimate size representations for month ranges:
 *   - `value`  : the identity slug, e.g. "0-3-months"
 *   - `label`  : the display text, e.g. "0-3M"
 *
 * Input spellings ("0-3 Month", "0 - 3 Months", "0-3m", "0–3M", "0 3 Months")
 * all collapse to that pair. Non-month sizes (S, M, Free Size, "110x110cm")
 * are deliberately left untouched here - they are not month ranges.
 */

const MONTH_RANGE_RE =
  /^(\d{1,2})\s*[-\u2010-\u2015_ ]\s*(\d{1,2})\s*(?:[-\u2010-\u2015_ ]?\s*(?:months?|month|mo|m))?$/i;

/**
 * Parse a raw size value as a month range.
 * @param {*} raw
 * @returns {{a:number,b:number}|null}
 */
function parseMonthRange(raw) {
  if (raw == null) return null;
  const text = String(raw)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  const match = text.match(MONTH_RANGE_RE);
  if (!match) return null;
  const a = Number(match[1]);
  const b = Number(match[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (a === b) return null;
  if (a > b) return null;
  // Baby sizes only; this also avoids treating "12-18" style dates as sizes.
  if (b > 36) return null;
  return { a, b };
}

/** Canonical identity value: "0-3-months" (null when not a month range). */
function canonicalSizeValue(raw) {
  const range = parseMonthRange(raw);
  return range ? `${range.a}-${range.b}-months` : null;
}

/** Canonical display label: "0-3M" (null when not a month range). */
function canonicalSizeLabel(raw) {
  const range = parseMonthRange(raw);
  return range ? `${range.a}-${range.b}M` : null;
}

/**
 * Identity key used to detect duplicate-meaning size values. Month ranges
 * share one key regardless of spelling; every other value falls back to a
 * loose lowercase token.
 */
function sizeIdentityKey(raw) {
  const canonical = canonicalSizeValue(raw);
  if (canonical) return canonical;
  return looseToken(raw);
}

/** Loose token for registry matching (case/spacing/punctuation insensitive). */
function looseToken(raw) {
  return String(raw ?? "")
    .replace(/\u00a0/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/s+$/, "");
}

module.exports = {
  parseMonthRange,
  canonicalSizeValue,
  canonicalSizeLabel,
  sizeIdentityKey,
  looseToken,
};
