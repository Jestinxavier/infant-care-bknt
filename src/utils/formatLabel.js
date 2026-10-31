const SIZE_LABEL_MAP = {
  "newborn": "Newborn",
  "new-born": "Newborn",
  "new born": "Newborn",
  "free-size": "Free Size",
  "free size": "Free Size",
  "s": "S", "m": "M", "l": "L", "xl": "XL", "xxl": "XXL",
};

const formatLabel = (value) => {
  if (!value || typeof value !== "string") return value;

  const v = value.trim().toLowerCase();

  if (SIZE_LABEL_MAP[v]) return SIZE_LABEL_MAP[v];

  // Dimension sizes: "80x80cm" → "80 x 80 cm"
  if (/^\d+x\d+/.test(v)) {
    return value.replace(/x/i, " x ");
  }

  // Age ranges: "0-3-months" → "0-3M", "0 - 3 Months" → "0-3M",
  // "0–3M" → "0-3M". Spacing, dash style, and an optional "months"/"m"
  // suffix are all accepted so the helper is idempotent on any stored form.
  const ageMatch = v.match(
    /^(\d+)\s*[-\u2013\u2014_ ]\s*(\d+)\s*(?:[-\u2013\u2014_ ]?\s*(?:months?|m))?$/,
  );
  if (ageMatch) {
    return `${ageMatch[1]}-${ageMatch[2]}M`;
  }

  // Year ranges: "2-3-years" → "2 - 3 Years"
  const yearMatch = v.match(
    /^(\d+)\s*[-\u2013\u2014_ ]\s*(\d+)\s*[-\u2013\u2014_ ]?\s*years?$/,
  );
  if (yearMatch) {
    return `${yearMatch[1]} - ${yearMatch[2]} Years`;
  }

  // Generic hyphenated: "sky-blue" → "Sky Blue"
  return v
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

module.exports = { formatLabel };

