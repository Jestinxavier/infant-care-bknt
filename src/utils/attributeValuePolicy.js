/**
 * Shared validation policy for attribute allowed values.
 *
 * Used by:
 *  - attributeController (hard 400s on add/update/create/update-attribute)
 *  - scripts/review-attribute-values.js (read-only cleanup report)
 *  - the admin UI (mirrored client-side warnings)
 *
 * Design:
 *  - Hard errors  → reject the write (errorCode: INVALID_VALUE).
 *  - Review flags → accept the write but mark the value `needsReview` so
 *    concatenated/overlong labels (e.g.
 *    "Polyurethene Coatedinner100polysterliner Insert88polyster") are audited
 *    instead of silently polluting the registry. Flags never block.
 */

const LABEL_MIN_LENGTH = 2;
const LABEL_MAX_LENGTH = 80;
const LABEL_REVIEW_LENGTH = 48;
const VALUE_MAX_LENGTH = 80;
const {
  canonicalSizeLabel,
  canonicalSizeValue,
} = require("./attributeValueNormalizer");
// Aliases that preserve a renamed value's old code (so old filter URLs still
// resolve) can be as long as the value code itself, hence the same 80 cap.
const SYNONYM_MAX_LENGTH = 80;
const SYNONYM_MAX_COUNT = 8;
const MERGE_SYNONYM_CAP = 24;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;

const MULTICOLOR_HEX = "__multicolor__";

/** Collapse repeated whitespace and trim: "Cotton   Blend " -> "Cotton Blend". */
const normalizeLabel = (label) =>
  String(label ?? "")
    .replace(/\s+/g, " ")
    .trim();

/** Lowercase, trim, whitespace → hyphen: the canonical value-code form. */
const toValueToken = (value) =>
  String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-");

/** Derive a clean slug from free text: "Cotton Blend!" -> "cotton-blend". */
const toSlug = (label) =>
  String(label ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

/** Dedupe + normalize synonyms, dropping empty values and self-references. */
const normalizeSynonyms = (canonicalValue, synonyms) => {
  if (!Array.isArray(synonyms)) return [];
  const canonical = toValueToken(canonicalValue);
  return [
    ...new Set(
      synonyms
        .map(toValueToken)
        .filter((s) => s && s !== canonical),
    ),
  ];
};

/**
 * Heuristic review flags for a label/value pair. Purely advisory.
 *   label_too_long  – longer than most attribute values should be
 *   missing_spaces  – one giant word (typical of concatenated input)
 *   digits_inside_words – digits glued to letters inside a word
 *                     (e.g. "coatedinner100polyster"), while range-style
 *                     labels ("12-18 Months") and dimension sizes
 *                     ("60x120cm", "25x30inches") stay clean
 */
const DIMENSION_WORD = /^\d+(?:\.\d+)?[x×]\d+(?:\.\d+)?(?:cm|mm|m|in|inch|inches)?$/i;

const reviewFlagsFor = (label, value) => {
  const flags = [];
  const text = normalizeLabel(label);

  if (text.length > LABEL_REVIEW_LENGTH) flags.push("label_too_long");

  if (!text.includes(" ") && text.replace(/[\s-]/g, "").length > 24) {
    flags.push("missing_spaces");
  }

  const words = text.split(/[\s\-–—/]+/).filter(Boolean);
  const digitsInsideWords = words.some(
    (word) =>
      !DIMENSION_WORD.test(word) &&
      /[a-z]{2,}\d|\d{2,}[a-z]{2,}|[a-z]\d[a-z]/i.test(word) &&
      !/^\d+[a-z]?$/i.test(word),
  );
  if (digitsInsideWords) flags.push("digits_inside_words");

  const slug = toValueToken(value || toSlug(text));
  if (slug.length > 40) flags.push("code_too_long");

  return flags;
};

/**
 * Validate a single allowed-value entry.
 *
 * @param {{label?: string, value?: string, hex?: string, synonyms?: string[]}} entry
 * @param {{ uiType?: string, requireHex?: boolean}} opts
 * @returns {{
 *   ok: boolean,
 *   errors: Record<string, string>,
 *   label: string, value: string, hex?: string, synonyms: string[],
 *   needsReview: boolean, flags: string[],
 * }}
 */
const validateAllowedValueEntry = (entry = {}, opts = {}) => {
  const errors = {};

  const label = normalizeLabel(entry.label);
  if (!label) {
    errors.label = "Label is required";
  } else if (label.length < LABEL_MIN_LENGTH) {
    errors.label = `Label must be at least ${LABEL_MIN_LENGTH} characters`;
  } else if (label.length > LABEL_MAX_LENGTH) {
    errors.label = `Label cannot exceed ${LABEL_MAX_LENGTH} characters`;
  } else if (CONTROL_CHARS.test(label)) {
    errors.label = "Label contains control characters";
  }

  const value = toValueToken(entry.value || toSlug(label));
  // Month-range sizes have exactly one identity/label pair, so a registry
  // edit can never reintroduce "0-3m" or "0 - 3 Months".
  const monthRange =
    String(opts.code || "").toLowerCase() === "size"
      ? canonicalSizeValue(entry.value) || (!entry.value ? canonicalSizeValue(label) : null)
      : null;
  const canonicalValue = monthRange || value;
  const canonicalLabel = monthRange ? canonicalSizeLabel(monthRange) : label;
  if (!canonicalValue) {
    errors.value = "Value could not be derived from the label";
  } else if (canonicalValue.length > VALUE_MAX_LENGTH) {
    errors.value = `Value cannot exceed ${VALUE_MAX_LENGTH} characters`;
  } else if (!SLUG_PATTERN.test(canonicalValue)) {
    errors.value = "Value must be a lowercase slug (letters, numbers, hyphens)";
  }

  const hexRaw = entry.hex === undefined ? "" : String(entry.hex).trim();
  if (hexRaw) {
    if (hexRaw !== MULTICOLOR_HEX && !HEX_PATTERN.test(hexRaw)) {
      errors.hex = "Color must be a 6-digit hex value like #ff6600";
    }
  } else if (opts.requireHex) {
    errors.hex = "A color is required for swatch attributes";
  }

  const rawSynonyms = Array.isArray(entry.synonyms) ? entry.synonyms : [];
  const synonyms = [];
  const synonymProblems = [];
  if (rawSynonyms.length > MERGE_SYNONYM_CAP) {
    synonymProblems.push(`At most ${MERGE_SYNONYM_CAP} aliases are allowed`);
  }
  const seen = new Set([canonicalValue]);
  for (const raw of rawSynonyms) {
    const syn = toValueToken(raw);
    if (!syn) {
      synonymProblems.push(`Alias "${raw}" is empty or invalid`);
      continue;
    }
    if (syn.length > SYNONYM_MAX_LENGTH) {
      synonymProblems.push(
        `Alias "${raw}" is longer than ${SYNONYM_MAX_LENGTH} characters`,
      );
      continue;
    }
    if (!SLUG_PATTERN.test(syn)) {
      synonymProblems.push(`Alias "${raw}" is not a valid slug`);
      continue;
    }
    if (seen.has(syn)) continue; // drop duplicates and self-references
    seen.add(syn);
    synonyms.push(syn);
  }
  if (synonymProblems.length) {
    errors.synonyms = synonymProblems.join("; ");
  }

  const ok = Object.keys(errors).length === 0;
  const flags = ok ? reviewFlagsFor(canonicalLabel, canonicalValue) : [];

  return {
    ok,
    errors,
    label: canonicalLabel,
    value: canonicalValue,
    hex: hexRaw || undefined,
    synonyms,
    needsReview: flags.length > 0,
    flags,
  };
};

/**
 * Validate a full allowedValues array (create / update / reorder payloads).
 *
 * Values whose code already exists on the attribute (`opts.existing`) are
 * treated as legacy: they are preserved (so reorder/merge of old data keeps
 * working) and only flagged, never rejected.
 *
 * @param {Array} list
 * @param {{ uiType?: string, requireHex?: boolean, existing?: string[] }} opts
 */
const prepareAllowedValues = (list, opts = {}) => {
  if (!Array.isArray(list)) {
    return { ok: true, values: [], issues: [] };
  }

  const existingSet = new Set(
    (opts.existing || []).map((v) => toValueToken(v)).filter(Boolean),
  );
  const values = [];
  const issues = [];
  const seen = new Set();

  list.forEach((entry, index) => {
    const res = validateAllowedValueEntry(entry, {
      code: opts.code,
      uiType: opts.uiType,
      requireHex: opts.requireHex,
    });

    if (existingSet.has(res.value)) {
      // Legacy entry — keep it, flag it, never block bulk rewrites on it.
      const legacyHex = entry?.hex === undefined ? "" : String(entry.hex).trim();
      values.push({
        value: res.value,
        label: res.label || normalizeLabel(entry?.label),
        ...(legacyHex ? { hex: legacyHex } : {}),
        synonyms: res.synonyms,
        isActive: entry?.isActive !== false,
        needsReview: res.ok ? res.needsReview : true,
      });
      return;
    }

    if (!res.ok) {
      issues.push({ index, label: normalizeLabel(entry?.label), errors: res.errors });
      return;
    }
    if (seen.has(res.value)) {
      issues.push({
        index,
        label: res.label,
        errors: { value: `Duplicate value "${res.value}"` },
      });
      return;
    }
    seen.add(res.value);
    values.push({
      value: res.value,
      label: res.label,
      ...(res.hex ? { hex: res.hex } : {}),
      synonyms: res.synonyms,
      isActive: entry?.isActive !== false,
      needsReview: res.needsReview,
    });
  });

  return { ok: issues.length === 0, values, issues };
};

module.exports = {
  LABEL_MIN_LENGTH,
  LABEL_MAX_LENGTH,
  LABEL_REVIEW_LENGTH,
  VALUE_MAX_LENGTH,
  SYNONYM_MAX_LENGTH,
  SYNONYM_MAX_COUNT,
  MERGE_SYNONYM_CAP,
  MULTICOLOR_HEX,
  normalizeLabel,
  toValueToken,
  toSlug,
  normalizeSynonyms,
  reviewFlagsFor,
  validateAllowedValueEntry,
  prepareAllowedValues,
};
