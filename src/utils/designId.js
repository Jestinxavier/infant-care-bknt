/**
 * Canonicalize a design-family identifier so the same design can never be
 * stored under two different spellings.
 *
 * Products sharing a `designId` pool their approved reviews on the storefront.
 * Because the value is hand-typed in several places (product form, quick edit,
 * CSV import), every write path runs it through this normalizer:
 *   - accents stripped, lowercased, trimmed
 *   - any run of non-alphanumeric characters collapses to a single "-"
 *   - no leading/trailing "-", capped at MAX_DESIGN_ID_LENGTH
 *
 *   "Cotton Air Bodysuit", "cotton-air bodysuit" and "Cotton__Air  Bodysuit!"
 *   all canonicalize to "cotton-air-bodysuit".
 *
 * Returns null for empty / whitespace-only input (product does not share).
 */

const MAX_DESIGN_ID_LENGTH = 120;

const normalizeDesignId = (value) => {
  if (value === undefined || value === null) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const ascii = raw.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const slug = ascii
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");

  if (!slug) return null;

  return slug.slice(0, MAX_DESIGN_ID_LENGTH).replace(/-+$/, "");
};

module.exports = { normalizeDesignId, MAX_DESIGN_ID_LENGTH };
