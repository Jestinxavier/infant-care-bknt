/**
 * Word matching for storefront product search. Shared by the listing
 * (features/product/product.service.js) and the filter sidebar counts
 * (controllers/filter/getFilters.js) so both find the same products for the
 * same search. Each caller picks which fields the regexes run against.
 */

const { normalizeFilterArray } = require("./filterAttributes");

const MIN_FUZZY_QUERY_LENGTH = 3;
// Cap the token length used for the fuzzy pattern: each character expands to a
// `.{0,2}` group, so an unbounded token creates a catastrophic-backtracking
// regex. Long queries simply skip the fuzzy branch (exact/prefix still match).
const MAX_FUZZY_QUERY_LENGTH = 32;
// Variants are matched as word prefixes, so for short words one-letter edits
// were far too loose: "bib" -> "bi" matched "Big", "cap" -> "ca" matched
// "Carry", "kit" -> "it" matched "Items". 3-letter words get no typo variants;
// 4-letter words get them except deletions (which leave 3-letter prefixes).
const MIN_VARIANT_QUERY_LENGTH = 4;
const MIN_DELETION_QUERY_LENGTH = 5;
const MAX_SEARCH_VARIANTS = 600;
// MongoDB rejects $regex patterns over 32KB (error 51091 -> a 500 on /search).
const MAX_TOKEN_PATTERN_LENGTH = 16000;

const SEARCH_ALPHABET = "abcdefghijklmnopqrstuvwxyz";
const VOWELS = new Set(["a", "e", "i", "o", "u"]);
const COMMON_REPLACEMENTS = {
  b: ["p"],
  p: ["b"],
  d: ["t"],
  t: ["d"],
  m: ["n"],
  n: ["m"],
  c: ["k"],
  k: ["c"],
};

const SEARCH_TERM_SYNONYMS = {
  dress: ["frock", "gown", "one-piece", "onepiece"],
  frock: ["dress", "gown"],
  gown: ["dress", "frock"],
  romper: ["onesie", "jumpsuit"],
  onesie: ["romper", "jumpsuit"],
  jumpsuit: ["romper", "onesie"],
  bodysuit: ["onesie", "romper"],
  tshirt: ["t-shirt", "tee", "top"],
  "t-shirt": ["tshirt", "tee", "top"],
  pant: ["pants", "trouser", "trousers", "bottom"],
  pants: ["pant", "trouser", "trousers", "bottom"],
  // Both words are used for the same cloth nappies ("Reusable Diaper",
  // "Padded Nappy"). The search rank lists the "Diapering & Nappies" category
  // ahead of the "Jhabla & Nappy" clothing sets.
  nappy: ["diaper"],
  diaper: ["nappy"],
  // Titles say "Cord Set"; shoppers type "co-ord".
  coord: ["cord"],
  // Same garment, several spellings in titles and the "Jhablas" category.
  // They're 2+ edits apart, beyond the one-edit typo matching, so "jabala"
  // used to miss every "Jhabla" product. Plurals are added automatically.
  jabala: ["jhabla", "jabla", "jhabala"],
  jhabla: ["jabala", "jabla", "jhabala"],
  jabla: ["jabala", "jhabla", "jhabala"],
  jhabala: ["jabala", "jhabla", "jabla"],
};

// Words the catalogue writes both joined and split ("Sleepsuit Without Hood" /
// "Sleep Suit Without Hood", "NewBorn" / "New Born"). The search term is
// rewritten to the joined form, and the joined token matches both spellings.
const COMPOUND_WORDS = {
  sleepsuit: "sleep suit",
  newborn: "new born",
  coord: "co ord",
};

const COMPOUND_PATTERNS = Object.entries(COMPOUND_WORDS).map(
  ([joined, spaced]) => ({
    joined,
    pattern: new RegExp(`\\b${spaced.split(" ").join("[\\s-]+")}(s?)\\b`, "gi"),
  }),
);

const escapeRegexLiteral = (value = "") =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const joinCompoundWords = (text = "") =>
  COMPOUND_PATTERNS.reduce(
    (result, { joined, pattern }) => result.replace(pattern, `${joined}$1`),
    text,
  );

const singularOf = (term) => {
  if (term.endsWith("ies") && term.length > 4) return `${term.slice(0, -3)}y`;
  return term.endsWith("s") && !term.endsWith("ss") ? term.slice(0, -1) : term;
};

/** Adds the other number of `term`: frock <-> frocks, nappy <-> nappies,
 * dress <-> dresses. Extra forms are harmless; they only widen the match. */
const addPluralPair = (variants, term) => {
  if (!term || term.length < 4) return;

  if (term.endsWith("ies") && term.length > 4) {
    variants.add(`${term.slice(0, -3)}y`);
  } else if (term.endsWith("y") && !VOWELS.has(term[term.length - 2])) {
    variants.add(`${term.slice(0, -1)}ies`);
  }

  if (/(?:ss|sh|ch|x)es$/.test(term)) {
    variants.add(term.slice(0, -2));
  } else if (/(?:ss|sh|ch|x)$/.test(term)) {
    variants.add(`${term}es`);
  }

  if (term.endsWith("s") && !term.endsWith("ss")) {
    variants.add(term.slice(0, -1));
  } else if (!term.endsWith("s")) {
    variants.add(`${term}s`);
  }
};

const getReplacementCandidates = (char) => {
  const candidates = new Set();
  if (VOWELS.has(char)) {
    VOWELS.forEach((v) => {
      if (v !== char) candidates.add(v);
    });
  }

  (COMMON_REPLACEMENTS[char] || []).forEach((candidate) =>
    candidates.add(candidate),
  );

  return Array.from(candidates);
};

const buildSingleTermVariants = (term = "") => {
  const variants = new Set();
  const normalizedTerm = String(term).trim().toLowerCase();
  if (!normalizedTerm) return variants;

  variants.add(normalizedTerm);
  addPluralPair(variants, normalizedTerm);

  if (normalizedTerm.length < MIN_VARIANT_QUERY_LENGTH) {
    return variants;
  }

  const chars = normalizedTerm.split("");
  const push = (candidate) => {
    if (!candidate) return;
    if (variants.size >= MAX_SEARCH_VARIANTS) return;
    variants.add(candidate);
    addPluralPair(variants, candidate);
  };

  // Delete one char (handles accidental extra char)
  if (normalizedTerm.length >= MIN_DELETION_QUERY_LENGTH) {
    for (let i = 0; i < chars.length; i += 1) {
      push(`${normalizedTerm.slice(0, i)}${normalizedTerm.slice(i + 1)}`);
    }
  }

  // Insert one char (handles missing-char typos)
  for (let i = 0; i <= chars.length; i += 1) {
    for (const letter of SEARCH_ALPHABET) {
      push(`${normalizedTerm.slice(0, i)}${letter}${normalizedTerm.slice(i)}`);
    }
  }

  // Swap adjacent chars (handles transposition typos)
  for (let i = 0; i < chars.length - 1; i += 1) {
    const swapped = [...chars];
    [swapped[i], swapped[i + 1]] = [swapped[i + 1], swapped[i]];
    push(swapped.join(""));
  }

  // Replace one char using targeted common substitutions.
  for (let i = 0; i < chars.length; i += 1) {
    const candidates = getReplacementCandidates(chars[i]);
    for (const letter of candidates) {
      if (letter === chars[i]) continue;
      push(`${normalizedTerm.slice(0, i)}${letter}${normalizedTerm.slice(i + 1)}`);
    }
  }

  return variants;
};

const addSynonyms = (variants, term) => {
  const related = [
    ...(SEARCH_TERM_SYNONYMS[term] || []),
    ...(SEARCH_TERM_SYNONYMS[singularOf(term)] || []),
  ];
  const spaced = COMPOUND_WORDS[term] || COMPOUND_WORDS[singularOf(term)];
  if (spaced) related.push(spaced);

  related.forEach((synonym) => {
    const normalizedSynonym = String(synonym).trim().toLowerCase();
    if (!normalizedSynonym) return;
    variants.add(normalizedSynonym);
    addPluralPair(variants, normalizedSynonym);
  });
};

const buildSearchVariants = (searchTerm = "") => {
  const normalized = String(searchTerm)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (!normalized) return [];

  const variants = normalized.includes(" ")
    ? new Set([normalized])
    : buildSingleTermVariants(normalized);
  if (normalized.includes(" ")) addPluralPair(variants, normalized);
  addSynonyms(variants, normalized);

  return Array.from(variants).filter(Boolean);
};

const buildFuzzySearchPattern = (searchTerm = "") => {
  const normalized = String(searchTerm).trim().toLowerCase();
  if (normalized.length < MIN_FUZZY_QUERY_LENGTH) return null;
  if (normalized.length > MAX_FUZZY_QUERY_LENGTH) return null;

  return normalized
    .split("")
    .map((char) => escapeRegexLiteral(char))
    .join(".{0,2}");
};

const tokenizeSearchTerm = (searchTerm = "") =>
  joinCompoundWords(String(searchTerm).trim().toLowerCase())
    .split(/\s+/)
    .filter(Boolean);

/**
 * Extra $or clauses for a search word beyond the text fields. "newborn" also
 * finds newborn-size products whose text never says newborn. (It used to be a
 * hard size filter, which hid hospital kits and essentials: they have no size.)
 */
const buildExtraTokenClauses = (token) =>
  token === "newborn" || token === "newborns"
    ? [{ "filterAttributes.size": "newborn" }]
    : [];

const buildTokenRegex = (token, { includeFuzzy = false } = {}) => {
  // Codes/SKUs (anything with a digit) are matched literally: a one-char edit
  // of a code is a different product, and long codes would otherwise expand
  // into hundreds of variants.
  const variants = /[0-9]/.test(token) ? [token] : buildSearchVariants(token);
  if (variants.length === 0) return null;

  // A space inside a variant ("sleep suit") also matches "sleepsuit",
  // "sleep-suit" and doubled spaces.
  let variantPattern = variants
    .map((term) => escapeRegexLiteral(term).replace(/ /g, "[\\s-]*"))
    .join("|");
  if (variantPattern.length > MAX_TOKEN_PATTERN_LENGTH) {
    variantPattern = escapeRegexLiteral(token);
  }
  const patternParts = [`\\b(?:${variantPattern})`];

  if (includeFuzzy) {
    const fuzzyPattern = buildFuzzySearchPattern(token);
    if (fuzzyPattern) {
      patternParts.push(`\\b${fuzzyPattern}`);
    }
  }

  return {
    $regex: patternParts.join("|"),
    $options: "i",
  };
};

// Words that mean a filter, not text: "girls frock" searches "frock" with
// the girls filter applied.
const SEARCH_INTENT_PHRASE_MAP = {
  "all season": { season: "all-season" },
  "short sleeve": { sleeve: "short-sleeve" },
  "long sleeve": { sleeve: "long-sleeve" },
  sleeveless: { sleeve: "sleeveless" },
  "pack of 2": { pack: "pack-of-2" },
  "pack of 3": { pack: "pack-of-3" },
  "pack of 4": { pack: "pack-of-4" },
};
const SEARCH_INTENT_TOKEN_MAP = {
  boy: { gender: "boys" },
  boys: { gender: "boys" },
  male: { gender: "boys" },
  girl: { gender: "girls" },
  girls: { gender: "girls" },
  female: { gender: "girls" },
  unisex: { gender: "unisex" },
  // "newborn" is not here on purpose: as a size filter it hid hospital kits
  // and essentials (no size). It's a search word that also matches newborn
  // size, see buildExtraTokenClauses in utils/searchTerms.js.
  onesize: { size: "free-size" },
  "one-size": { size: "free-size" },
  freesize: { size: "free-size" },
  "free-size": { size: "free-size" },
};

const mergeSearchIntentValue = (target, key, rawValue) => {
  const normalizedValues = normalizeFilterArray(rawValue, key);
  if (normalizedValues.length === 0) return;

  if (!target[key]) target[key] = [];
  target[key].push(...normalizedValues);
};

const applySearchIntentFilters = (filters = {}) => {
  const nextFilters = { ...filters };
  const searchTerm = String(filters.search || "").trim();
  if (!searchTerm) return nextFilters;

  let remaining = searchTerm.toLowerCase().replace(/\s+/g, " ");
  const inferredFilters = {};

  const sortedPhraseEntries = Object.entries(SEARCH_INTENT_PHRASE_MAP).sort(
    (a, b) => b[0].length - a[0].length
  );

  sortedPhraseEntries.forEach(([phrase, mapping]) => {
    const phrasePattern = new RegExp(`\\b${escapeRegexLiteral(phrase)}\\b`, "i");
    while (phrasePattern.test(remaining)) {
      remaining = remaining.replace(phrasePattern, " ").replace(/\s+/g, " ").trim();
      Object.entries(mapping).forEach(([key, value]) =>
        mergeSearchIntentValue(inferredFilters, key, value)
      );
    }
  });

  const residualTokens = [];
  tokenizeSearchTerm(remaining).forEach((token) => {
    const intentMapping = SEARCH_INTENT_TOKEN_MAP[token];
    if (!intentMapping) {
      residualTokens.push(token);
      return;
    }

    Object.entries(intentMapping).forEach(([key, value]) =>
      mergeSearchIntentValue(inferredFilters, key, value)
    );
  });

  Object.entries(inferredFilters).forEach(([key, values]) => {
    const mergedValues = normalizeFilterArray(
      [...normalizeFilterArray(nextFilters[key], key), ...values],
      key
    );
    if (mergedValues.length > 0) {
      nextFilters[key] = mergedValues;
    }
  });

  nextFilters.search = residualTokens.join(" ").trim();
  return nextFilters;
};

module.exports = {
  applySearchIntentFilters,
  SEARCH_TERM_SYNONYMS,
  COMPOUND_WORDS,
  escapeRegexLiteral,
  joinCompoundWords,
  addPluralPair,
  buildSearchVariants,
  buildFuzzySearchPattern,
  tokenizeSearchTerm,
  buildTokenRegex,
  buildExtraTokenClauses,
};
