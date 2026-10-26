const FILTER_ATTRIBUTE_KEY = /^[a-z][a-z0-9-]{0,39}$/;

/**
 * Normalise the `filterAttributes` allowlist from a request body.
 *
 * Accepts an array (JSON body) or a JSON/CSV string (multipart FormData).
 * Returns `undefined` when the field was not supplied so callers can leave
 * the existing value untouched on updates.
 */
function parseFilterAttributes(raw) {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return [];

  let values;
  if (Array.isArray(raw)) {
    values = raw;
  } else if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed === "") return [];
    try {
      const parsed = JSON.parse(trimmed);
      values = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      values = trimmed.split(",");
    }
  } else {
    return undefined;
  }

  const seen = new Set();
  const result = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const key = value.trim().toLowerCase();
    if (!key || !FILTER_ATTRIBUTE_KEY.test(key) || seen.has(key)) continue;
    seen.add(key);
    result.push(key);
  }
  return result;
}

module.exports = { parseFilterAttributes };
