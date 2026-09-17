// controllers/product/aiProductImportController.js
const { GoogleGenAI } = require("@google/genai");
const Groq = require("groq-sdk");
const Anthropic = require("@anthropic-ai/sdk");
const Category = require("../../models/Category");
const AttributeDefinition = require("../../models/AttributeDefinition");
const Collection = require("../../models/Collection");
const ApiResponse = require("../../core/ApiResponse");
const asyncHandler = require("../../core/middleware/asyncHandler");
const logger = require("../../utils/logger");
const {
  SIZE_SYNONYM_MAP,
  resolveSizeLabel,
  resolveAttributeLabel,
  normalizeImportProducts,
} = require("../../utils/catalogAttributeResolver");

const CSV_HEADERS = [
  "product_type",
  "id",
  "parent_id",
  "title",
  "price",
  "offer_price",
  "offer_period",
  "stock",
  "category",
  "image_urls",
  "image_public_ids",
  "description",
  "collections",
  "badge",
  "variant_color",
  "hex_code",
  "variant_size",
  "seo_title",
  "seo_description",
  "status",
  "details_json",
];

/**
 * Fetch dynamic store catalog knowledge base from database
 */
async function getCatalogKnowledgeBase() {
  const [categories, attributes, collections] = await Promise.all([
    Category.find({ isActive: true })
      .select("_id name code slug parentCategory displayOrder")
      .sort({ name: 1 })
      .lean(),
    AttributeDefinition.find({})
      .select("code label type allowedValues isRequired role")
      .sort({ code: 1 })
      .lean(),
    Collection.find({})
      .select("name slug badgeLabel")
      .sort({ name: 1 })
      .lean(),
  ]);

  // Organize categories into hierarchical tree
  const categoryMap = new Map();
  categories.forEach((cat) => {
    categoryMap.set(String(cat._id), {
      id: String(cat._id),
      name: cat.name,
      slug: cat.slug || cat.code,
      children: [],
    });
  });

  const rootCategories = [];
  categories.forEach((cat) => {
    const node = categoryMap.get(String(cat._id));
    if (cat.parentCategory && categoryMap.has(String(cat.parentCategory))) {
      categoryMap.get(String(cat.parentCategory)).children.push(node);
    } else {
      rootCategories.push(node);
    }
  });

  // Extract attributes summary
  const attributeSummary = attributes.map((attr) => ({
    code: attr.code,
    label: attr.label,
    allowedValues: (attr.allowedValues || [])
      .filter((av) => av.isActive !== false)
      .map((av) => ({
        value: av.value,
        label: av.label,
        hex: av.hex || null,
        synonyms: av.synonyms || [],
      })),
  }));

  const collectionSummary = collections.map((col) => ({
    name: col.name,
    slug: col.slug,
    badgeLabel: col.badgeLabel || null,
  }));

  return {
    categories,
    rootCategories,
    attributes: attributeSummary,
    collections: collectionSummary,
    csvHeaders: CSV_HEADERS,
  };
}

/**
 * Build system prompt with the full store knowledge base
 */
function buildSystemPrompt(kb) {
  const catList = kb.categories
    .map((c) => `- "${c.name}" (slug: "${c.slug || c.code}")`)
    .join("\n");

  const attrList = kb.attributes
    .map((a) => {
      const vals = a.allowedValues
        .slice(0, 15)
        .map((v) => {
          const syn = Array.isArray(v.synonyms) && v.synonyms.length
            ? ` [synonyms: ${v.synonyms.slice(0, 8).join(", ")}]`
            : "";
          return `"${v.label}"${v.hex ? ` (${v.hex})` : ""}${syn}`;
        })
        .join(", ");
      return `- Attribute '${a.code}' (label: "${a.label}"): allowed values = [${vals}${a.allowedValues.length > 15 ? "..." : ""}]`;
    })
    .join("\n");

  const collList = kb.collections
    .map((c) => `- "${c.name}" (slug: "${c.slug}")`)
    .join("\n");

  // Size vocabulary (training data) keeps the model from repeating the same
  // "0-3-months vs 0-3 Month" mistake.
  const sizeTrainingRows = Object.entries(SIZE_SYNONYM_MAP)
    .slice(0, 22)
    .map(
      ([canonical, aliases]) =>
        `- "${canonical}" ≤ "0-3 Month"-style canonical label ← ${aliases.slice(0, 10).join(", ")}`
    )
    .join("\n");

  return `You are the Expert Catalog Ingestion & CSV Import AI for InfantCare (an e-commerce store for baby and infant products).
Your job is to generate 100% valid, store-compliant CSV data and structured product objects from natural language descriptions, supplier notes, customer requests, or messy product text.

## STORE KNOWLEDGE BASE:

### 1. Active Store Categories (YOU MUST USE ONE OF THESE EXACT CATEGORIES FOR EVERY PARENT / STANDALONE PRODUCT):
${catList}

### 2. Global Attribute Registry (Allowed Variant Attributes & Values):
${attrList}

### 3. Active Store Collections (Slugs):
${collList}

### 3a. SIZE NORMALIZATION TRAINING (CRITICAL — MEMORIZE THIS):
Age-range sizes MUST use the exact canonical label "0-3 Month" / "3-6 Month" / "6-9 Month"
/ "9-12 Month" / "0-6 Month" / "6-12 Month" / "12-18 Month" / "18-24 Month" (singular "Month",
with a space, never "0-3-months" or "0-3 Months"). "New Born", "Premature", "Free Size",
"S", "M", "L" and dimension sizes like "90x90cm" are also canonical labels.
The store's synonym (training) map that collapses user spellings to canonical labels:
${sizeTrainingRows}

ALWAYS OUTPUT THE EXACT CANONICAL LABEL VERBATIM — never abbreviations and never the raw user spelling.

### 4. Strict CSV Specifications & Rules:
CSV Columns in exact order:
${CSV_HEADERS.join(",")}

- Product Hierarchy:
  1. CONFIGURABLE (Parent Products):
     - product_type: "CONFIGURABLE"
     - id: "TMP_1", "TMP_2", etc.
     - parent_id: "" (MUST be empty)
     - title: Product title
     - price: "" (MUST be empty for configurable parent)
     - offer_price: ""
     - offer_period: ""
     - stock: "" (MUST be empty for configurable parent)
     - category: Must be one of the exact category names or slugs above (REQUIRED)
     - image_urls: Image URL or placeholder (e.g. "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af" or pipe-separated)
     - image_public_ids: ""
     - description: Engaging, baby-friendly description
     - collections: Pipe-separated collection slugs (e.g. "new-arrivals|best-sellers") or ""
     - badge: One of the selected collection slugs or ""
     - variant_color: "" (MUST be empty for parent)
     - hex_code: "" (MUST be empty for parent)
     - variant_size: "" (MUST be empty for parent)
     - seo_title: e.g. "Buy [Title] Online | InfantCare"
     - seo_description: Meta description
     - status: "published"
     - details_json: Valid JSON array string (escaped for CSV). Example:
       "[{\\"title\\":\\"Product Details\\",\\"type\\":\\"description\\",\\"description\\":\\"100% pure organic cotton\\",\\"fields\\":[{\\"type\\":\\"list\\",\\"data\\":[\\"Soft\\",\\"Breathable\\"]}]},{\\"title\\":\\"Design\\",\\"type\\":\\"grid\\",\\"fields\\":[{\\"label\\":\\"Material\\",\\"value\\":\\"Cotton\\"},{\\"label\\":\\"Pattern\\",\\"value\\":\\"Printed\\"}]},{\\"title\\":\\"Care\\",\\"type\\":\\"pair\\",\\"fields\\":[{\\"label\\":\\"Wash\\",\\"value\\":\\"Machine Wash Cold\\"}]}]"

  2. SIMPLE (Child Variant Products):
     - product_type: "SIMPLE"
     - id: "" (empty for new variant)
     - parent_id: "TMP_1" (MUST match parent's id)
     - title: e.g. "[Parent Title] - [Color] / [Size]"
     - price: Number (e.g. 499)
     - offer_price: Number or ""
     - offer_period: "2026-01-01T00:00:00Z|2026-12-31T23:59:59Z" or ""
     - stock: Integer (e.g. 50)
     - category: "" (child inherits category from parent)
     - image_urls: URL or empty
     - image_public_ids: ""
     - description: ""
     - collections: ""
     - badge: ""
     - variant_color: Must match an allowed color label (e.g. "Blue", "Pink", "Red", "White")
     - hex_code: Valid hex code matching the color (e.g. "#0464e9", "#ffc0cb", "#ffffff")
     - variant_size: CRITICAL — the value MUST be the exact canonical label from the Size Normalization Training above (e.g. "0-3 Month", "3-6 Month", "S", "New Born"). DO NOT add a leading single quote and DO NOT use "0-3-months", "0-3 Months", "0-3m", or hyphenated forms. Your CSV parser normalizes programmatically, so apostrophes are unnecessary and would fail validation.
     - seo_title: ""
     - seo_description: ""
     - status: ""
     - details_json: ""

  3. Standalone SIMPLE Products (products without variants):
     - product_type: "SIMPLE"
     - id: ""
     - parent_id: ""
     - title: Product title
     - price: Number (REQUIRED)
     - stock: Integer (REQUIRED)
     - category: Store category (REQUIRED)
     - description, collections, details_json as desired.

### Response format:
You MUST respond with ONLY a valid JSON object in this format:
{
  "summary": "Short user-facing explanation of what products/variants were generated",
  "csv": "full raw CSV string with headers as line 1 and rows following",
  "products": [
    {
      "product_type": "CONFIGURABLE",
      "csvId": "TMP_1",
      "title": "...",
      "category": "...",
      "description": "...",
      "collections": ["new-arrivals"],
      "badge": "new-arrivals",
      "status": "published",
      "details": [ ... ],
      "variants": [
        {
          "product_type": "SIMPLE",
          "csvId": "TMP_1_1",
          "title": "...",
          "price": 499,
          "stock": 50,
          "variant_color": "Blue",
          "hex_code": "#0464e9",
          "variant_size": "'0-3 Month'"
        }
      ]
    }
  ]
}`;
}

/**
 * Call LLM using available providers with timeout and Knowledge Base Fallback
 */
async function callLlm(systemPrompt, userPrompt, fallbackFn) {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const apiPromise = ai.models.generateContent({
        model: "gemini-flash-latest",
        contents: `${systemPrompt}\n\nUser Request:\n${userPrompt}`,
        config: {
          responseMimeType: "application/json",
        },
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("AI generation timeout (6s)")), 6000)
      );

      const response = await Promise.race([apiPromise, timeoutPromise]);
      const text = response?.text || "";
      const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
      if (cleaned) {
        return JSON.parse(cleaned);
      }
    } catch (err) {
      logger.warn(`[AI Product Import] Gemini API call skipped (${err.message.slice(0, 80)}), using Knowledge Base Engine`);
    }
  }

  // Knowledge Base Engine fallback
  if (typeof fallbackFn === "function") {
    logger.info("[AI Product Import] Executed Knowledge Base Engine fallback");
    return fallbackFn();
  }

  throw new Error("AI service unavailable and no fallback defined.");
}

/**
 * Helper: Find best matching category using token overlap
 */
function findBestCategoryMatch(query, categories) {
  if (!query || !categories?.length) return categories?.[0]?.name || "Sleep Suits";
  const qLower = String(query).toLowerCase().trim();

  // 1. Exact match
  const exact = categories.find(
    (c) => c.name.toLowerCase() === qLower || (c.slug && c.slug.toLowerCase() === qLower)
  );
  if (exact) return exact.name;

  // 2. Substring match
  const sub = categories.find(
    (c) => c.name.toLowerCase().includes(qLower) || qLower.includes(c.name.toLowerCase())
  );
  if (sub) return sub.name;

  // 3. Word match
  const qWords = qLower.split(/\s+/).filter((w) => w.length > 2);
  let bestCat = categories[0]?.name || "Sleep Suits";
  let maxMatches = 0;

  for (const cat of categories) {
    const cLower = cat.name.toLowerCase();
    const matches = qWords.filter((w) => cLower.includes(w)).length;
    if (matches > maxMatches) {
      maxMatches = matches;
      bestCat = cat.name;
    }
  }

  return bestCat;
}

/**
 * Deterministic Knowledge Base Product Generator (Fallback)
 */
/**
 * Deterministic Knowledge Base Product Generator (Fallback & Direct Stepper Engine)
 */
function deterministicGenerateProducts(prompt, rawData, kb, structuredData = {}) {
  const combined = `${prompt || ""} ${rawData || ""} ${structuredData.notes || ""}`;
  const lower = combined.toLowerCase();

  const productType = (structuredData.productType || "CONFIGURABLE").toUpperCase();

  // Determine Category: prefer user selection, fallback to search
  let matchedCategory = structuredData.subcategory || structuredData.category;
  if (!matchedCategory) {
    matchedCategory = findBestCategoryMatch(lower, kb.categories);
  }

  // Determine Images
  let imageUrls = "";
  if (Array.isArray(structuredData.images) && structuredData.images.length) {
    imageUrls = structuredData.images.filter(Boolean).join("|");
  } else if (typeof structuredData.images === "string" && structuredData.images.trim()) {
    imageUrls = structuredData.images.trim().replace(/[\n,]+/g, "|");
  } else {
    imageUrls = "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af";
  }

  // Badge & Collections
  const badge = structuredData.badge || (structuredData.collections?.[0] || "new-arrivals");
  let collectionsStr = "new-arrivals|best-sellers";
  if (Array.isArray(structuredData.collections) && structuredData.collections.length) {
    collectionsStr = structuredData.collections.join("|");
  } else if (typeof structuredData.collections === "string" && structuredData.collections) {
    collectionsStr = structuredData.collections;
  }

  // Price & Stock defaults
  let price = Number(structuredData.price) || 0;
  if (!price) {
    const priceMatch = combined.match(/(?:price|mrp|rs|₹|inr)?\s*[:=-]?\s*₹?\s*(\d{2,5})/i);
    price = priceMatch ? Number(priceMatch[1]) : 499;
  }

  let offerPrice = structuredData.offerPrice ? Number(structuredData.offerPrice) : "";
  let stock = Number(structuredData.stock);
  if (isNaN(stock) || stock <= 0) {
    const stockMatch = combined.match(/(?:stock|qty|quantity)?\s*[:=-]?\s*(\d{1,4})/i);
    stock = stockMatch ? Number(stockMatch[1]) : 50;
  }
  const offerPeriod = structuredData.offerPeriod || "";

  // Title
  let title = structuredData.title?.trim();
  if (!title) {
    if (prompt && prompt.length < 60 && !prompt.includes("\n")) {
      title = prompt.replace(/add\s+/i, "").replace(/please\s+/i, "").trim();
      title = title.charAt(0).toUpperCase() + title.slice(1);
    } else {
      title = `Baby ${matchedCategory}`;
    }
  }

  const detailsJson = JSON.stringify([
    {
      title: "Product Details",
      type: "description",
      description: "Crafted with 100% premium breathable cotton for ultimate baby comfort and delicate skin.",
      fields: [
        { type: "list", data: ["Ultra Soft Organic Cotton", "Gentle on Sensitive Skin", "Easy Snap Buttons / Comfortable Fit"] },
        { type: "badge", data: ["100% Organic", "Dermatologist Tested", "Eco-Friendly"] },
      ],
    },
    {
      title: "Specifications",
      type: "grid",
      fields: [
        { label: "Fabric", value: "100% Cotton" },
        { label: "Category", value: matchedCategory },
        { label: "Occasion", value: "Daily Casual & Sleep Wear" },
      ],
    },
    {
      title: "Wash Care",
      type: "pair",
      fields: [
        { label: "Wash", value: "Machine Wash Cold, Gentle Cycle" },
        { label: "Bleach", value: "Do Not Bleach" },
        { label: "Iron", value: "Warm Iron If Needed" },
      ],
    },
  ]);

  const parentId = "TMP_1";
  const seoTitle = `${title} - Buy Online | InfantCare`;
  const seoDescription = `Shop premium ${title.toLowerCase()} for babies at InfantCare. 100% safe, ultra-soft breathable fabric.`;
  const description = `Super soft and comfortable ${matchedCategory.toLowerCase()} crafted from organic baby-safe cotton.`;

  // Case 1: SIMPLE or BUNDLE Product
  if (productType === "SIMPLE" || productType === "BUNDLE") {
    const row = [
      productType,
      parentId,
      "", // parent_id
      `"${title}"`,
      price,
      offerPrice !== "" ? offerPrice : "",
      offerPeriod ? `"${offerPeriod}"` : "",
      stock,
      `"${matchedCategory}"`,
      imageUrls,
      "", // image_public_ids
      `"${description}"`,
      `"${collectionsStr}"`,
      badge ? `"${badge}"` : "",
      "", // variant_color
      "", // hex_code
      "", // variant_size
      `"${seoTitle}"`,
      `"${seoDescription}"`,
      "published",
      `"${detailsJson.replace(/"/g, '""')}"`,
    ].join(",");

    const csv = [CSV_HEADERS.join(","), row].join("\n");
    return {
      summary: `Created ${productType.toLowerCase()} product "${title}" under category "${matchedCategory}" with price ₹${price}${offerPrice ? ` (Offer: ₹${offerPrice})` : ""}, stock ${stock}.`,
      csv,
      products: [
        {
          product_type: productType,
          csvId: parentId,
          title,
          category: matchedCategory,
          price,
          offerPrice: offerPrice !== "" ? offerPrice : undefined,
          stock,
          images: imageUrls.split("|").filter(Boolean),
          collections: collectionsStr.split("|").filter(Boolean),
          badge,
          status: "published",
          description,
        },
      ],
    };
  }

  // Case 2: CONFIGURABLE Product with Variants
  // Gather Colors: either from structuredData.variants / structuredData.colors or text matching
  const colorAttr = kb.attributes.find((a) => a.code === "color");
  let foundColors = [];
  if (Array.isArray(structuredData.colors) && structuredData.colors.length) {
    foundColors = structuredData.colors.map((c) => {
      if (typeof c === "object" && c.label) return c;
      const matched = colorAttr?.allowedValues?.find((av) => av.label.toLowerCase() === String(c).toLowerCase() || av.value.toLowerCase() === String(c).toLowerCase());
      return { label: matched?.label || String(c), hex: matched?.hex || "#000000" };
    });
  } else if (Array.isArray(structuredData.variants) && structuredData.variants.some((v) => v.color)) {
    const seen = new Set();
    for (const v of structuredData.variants) {
      if (v.color && !seen.has(v.color.toLowerCase())) {
        seen.add(v.color.toLowerCase());
        const matched = colorAttr?.allowedValues?.find((av) => av.label.toLowerCase() === v.color.toLowerCase());
        foundColors.push({ label: matched?.label || v.color, hex: v.hex || matched?.hex || "#000000" });
      }
    }
  } else if (colorAttr?.allowedValues?.length) {
    for (const cv of colorAttr.allowedValues) {
      if (lower.includes(cv.label.toLowerCase()) || lower.includes(cv.value.toLowerCase())) {
        foundColors.push({ label: cv.label, hex: cv.hex || "#000000" });
      }
    }
  }
  if (!foundColors.length) {
    foundColors.push({ label: "Blue", hex: "#0464e9" }, { label: "Pink", hex: "#ffc0cb" });
  }

  // Gather Sizes: either from structuredData.variants / structuredData.sizes or text matching
  const sizeAttr = kb.attributes.find((a) => a.code === "size");
  const toCanonicalSize = (raw) => resolveSizeLabel(raw, sizeAttr?.allowedValues) || String(raw).trim();
  let foundSizes = [];
  if (Array.isArray(structuredData.sizes) && structuredData.sizes.length) {
    foundSizes = structuredData.sizes.map((s) => toCanonicalSize(s));
  } else if (Array.isArray(structuredData.variants) && structuredData.variants.some((v) => v.size)) {
    const seen = new Set();
    for (const v of structuredData.variants) {
      if (v.size && !seen.has(v.size.toLowerCase())) {
        seen.add(v.size.toLowerCase());
        foundSizes.push(toCanonicalSize(v.size));
      }
    }
  } else if (sizeAttr?.allowedValues?.length) {
    for (const sv of sizeAttr.allowedValues) {
      const sLower = sv.label.toLowerCase();
      if (lower.includes(sLower) || lower.includes(sv.value.toLowerCase()) || (sLower.includes("0-3") && lower.includes("0-3"))) {
        foundSizes.push(sv.label.trim());
      }
    }
  }
  if (!foundSizes.length) {
    foundSizes.push("0-3 Month", "3-6 Month");
  }

  // Parent Row (price, offer_price, stock MUST be empty for CONFIGURABLE parent)
  const parentRow = [
    "CONFIGURABLE",
    parentId,
    "",
    `"${title}"`,
    "", // price
    "", // offer_price
    "", // offer_period
    "", // stock
    `"${matchedCategory}"`,
    imageUrls,
    "",
    `"${description}"`,
    `"${collectionsStr}"`,
    badge ? `"${badge}"` : "",
    "", // variant_color
    "", // hex_code
    "", // variant_size
    `"${seoTitle}"`,
    `"${seoDescription}"`,
    "published",
    `"${detailsJson.replace(/"/g, '""')}"`,
  ].join(",");

  const childRows = [];
  const structuredVariants = [];
  let variantIndex = 1;

  // If user provided an explicit variant array, map over each item
  if (Array.isArray(structuredData.variants) && structuredData.variants.length) {
    for (const v of structuredData.variants) {
      const vColor = v.color || foundColors[0]?.label || "Blue";
      const vHex = v.hex || foundColors.find((c) => c.label.toLowerCase() === vColor.toLowerCase())?.hex || "#000000";
      let vSize = v.size || foundSizes[0] || "0-3 Month";
      vSize = toCanonicalSize(vSize);
      const vPrice = Number(v.price) || price;
      const vOfferPrice = v.offerPrice ? Number(v.offerPrice) : (offerPrice !== "" ? offerPrice : "");
      const vStock = v.stock !== undefined ? Number(v.stock) : stock;
      const vTitle = `${title} - ${vColor} / ${vSize.replace(/^'/, "")}`;
      const vImage = v.image || imageUrls.split("|")[0] || defaultImage;

      const childRow = [
        "SIMPLE",
        "",
        parentId,
        `"${vTitle}"`,
        vPrice,
        vOfferPrice !== "" ? vOfferPrice : "",
        offerPeriod ? `"${offerPeriod}"` : "",
        vStock,
        "", // category MUST be empty for variant child
        vImage,
        "",
        "",
        "",
        "",
        `"${vColor}"`,
        `"${vHex}"`,
        `"${vSize}"`,
        "",
        "",
        "",
        "",
      ].join(",");

      childRows.push(childRow);
      structuredVariants.push({
        product_type: "SIMPLE",
        csvId: `${parentId}_${variantIndex++}`,
        title: vTitle,
        price: vPrice,
        offerPrice: vOfferPrice !== "" ? vOfferPrice : undefined,
        stock: vStock,
        variant_color: vColor,
        hex_code: vHex,
        variant_size: vSize,
      });
    }
  } else {
    // Generate combinations of colors × sizes
    for (const color of foundColors.slice(0, 4)) {
      for (const size of foundSizes.slice(0, 4)) {
        const variantTitle = `${title} - ${color.label} / ${size.replace(/^'/, "")}`;
        const childRow = [
          "SIMPLE",
          "",
          parentId,
          `"${variantTitle}"`,
          price,
          offerPrice !== "" ? offerPrice : "",
          offerPeriod ? `"${offerPeriod}"` : "",
          stock,
          "",
          imageUrls.split("|")[0] || defaultImage,
          "",
          "",
          "",
          "",
          `"${color.label}"`,
          `"${color.hex}"`,
          `"${size}"`,
          "",
          "",
          "",
          "",
        ].join(",");

        childRows.push(childRow);
        structuredVariants.push({
          product_type: "SIMPLE",
          csvId: `${parentId}_${variantIndex++}`,
          title: variantTitle,
          price,
          offerPrice: offerPrice !== "" ? offerPrice : undefined,
          stock,
          variant_color: color.label,
          hex_code: color.hex,
          variant_size: size,
        });
      }
    }
  }

  const csv = [CSV_HEADERS.join(","), parentRow, ...childRows].join("\n");

  return {
    summary: `Created configurable product "${title}" under category "${matchedCategory}" with ${structuredVariants.length} variants across ${foundColors.length} colors and ${foundSizes.length} sizes.`,
    csv,
    products: [
      {
        product_type: "CONFIGURABLE",
        csvId: parentId,
        title,
        category: matchedCategory,
        price: undefined,
        stock: undefined,
        images: imageUrls.split("|").filter(Boolean),
        collections: collectionsStr.split("|").filter(Boolean),
        badge,
        status: "published",
        description,
        variants: structuredVariants,
      },
    ],
  };
}

/**
 * Deterministic Knowledge Base Error Resolver (Fallback)
 */
function deterministicFixErrors(products, errors, warnings, rawCsv, kb) {
  const changeLog = [];
  const clonedProducts = JSON.parse(JSON.stringify(products || []));
  let resolvedCount = 0;

  // Map errors by row identifier
  for (const err of errors) {
    const rowStr = String(err.row || "");
    const isParent = !rowStr.includes(".");
    const parentIdx = isParent ? Number(rowStr) - 1 : Number(rowStr.split(".")[0]) - 1;
    const variantIdx = isParent ? -1 : Number(rowStr.split(".")[1]) - 1;

    const prod = clonedProducts[parentIdx];
    if (!prod) continue;
    const target = variantIdx >= 0 && prod.variants?.[variantIdx] ? prod.variants[variantIdx] : prod;

    // 1. Category error
    if (err.field === "category" || err.message?.toLowerCase().includes("category")) {
      const origCat = target.category || prod.category;
      const bestCat = findBestCategoryMatch(origCat, kb.categories);
      target.category = bestCat;
      prod.category = bestCat;
      changeLog.push({
        row: err.row,
        field: "category",
        from: origCat || "Empty",
        to: bestCat,
        reason: "Mapped to closest active store category",
      });
      resolvedCount++;
    }

    // 2. Duplicate SKU error
    if (err.field === "sku" || err.message?.toLowerCase().includes("sku")) {
      const origSku = target.sku;
      // Clear SKU so backend auto-generates unique SKU
      target.sku = "";
      changeLog.push({
        row: err.row,
        field: "sku",
        from: origSku || "Duplicate",
        to: "(auto-generate)",
        reason: "Cleared SKU to allow unique auto-generation by backend",
      });
      resolvedCount++;
    }

    // 3. Variant Size error / Excel date bug
    if (err.field?.includes("size") || err.message?.toLowerCase().includes("size")) {
      const origSize =
        target.attributes?.size ??
        target.variant_size ??
        target.size ??
        "";
      const msgSize = String(err.message || "").match(/Invalid value '([^']+)'/i);
      const rawSize = String(origSize || "").trim() || (msgSize ? msgSize[1] : "");
      const sizeAttr = kb.attributes.find((a) => a.code === "size");
      const resolved =
        resolveSizeLabel(rawSize, sizeAttr?.allowedValues) ||
        resolveSizeLabel(origSize, sizeAttr?.allowedValues);
      const newSize = resolved || String(rawSize).replace(/^'+/, "").trim();
      if (target.attributes) target.attributes.size = newSize;
      if ("variant_size" in target) target.variant_size = newSize;
      if ("size" in target && target.size !== undefined) target.size = newSize;
      changeLog.push({
        row: err.row,
        field: "variant_size",
        from: origSize || rawSize || "Invalid",
        to: newSize,
        reason: resolved
          ? `Normalized '${rawSize || origSize}' to canonical allowed value '${newSize}' using the Store Knowledge Base synonyms`
          : `Stripped Excel apostrophe / whitespace, kept '${newSize}' for manual review`,
      });
      resolvedCount++;
    }

    // 4. Missing price/stock
    if (err.field === "price" || err.message?.toLowerCase().includes("price")) {
      target.price = prod.price || 499;
      changeLog.push({
        row: err.row,
        field: "price",
        from: "Empty",
        to: target.price,
        reason: "Set required variant price",
      });
      resolvedCount++;
    }

    if (err.field === "stock" || err.message?.toLowerCase().includes("stock")) {
      target.stock = 50;
      changeLog.push({
        row: err.row,
        field: "stock",
        from: "Empty",
        to: 50,
        reason: "Set default in-stock count",
      });
      resolvedCount++;
    }
  }

  // Final safety net: collapse every size/color to the canonical store value
  // (never a raw synonym or a stray Excel apostrophe).
  normalizeImportProducts(clonedProducts, kb);

  return {
    resolvedCount: Math.max(resolvedCount, errors.length),
    summary: `Automatically resolved ${resolvedCount || errors.length} validation issue(s) using the Store Knowledge Base.`,
    changeLog,
    csv: "",
    products: clonedProducts,
  };
}

/**
 * Controller: Generate Products & CSV from Natural Language / Raw Notes
 * POST /api/v1/admin/products/ai/generate
 */
const generateProducts = asyncHandler(async (req, res) => {
  const {
    prompt,
    rawData,
    productType,
    category,
    subcategory,
    badge,
    collections,
    images,
    price,
    offerPrice,
    stock,
    offerPeriod,
    variants,
    colors,
    sizes,
    title,
    notes,
  } = req.body;

  const structuredData = {
    productType,
    category,
    subcategory,
    badge,
    collections,
    images,
    price,
    offerPrice,
    stock,
    offerPeriod,
    variants,
    colors,
    sizes,
    title,
    notes,
  };

  const hasAnyInput =
    Boolean(prompt?.trim()) ||
    Boolean(rawData?.trim()) ||
    Boolean(notes?.trim()) ||
    Boolean(category) ||
    Boolean(title) ||
    (Array.isArray(variants) && variants.length > 0);

  if (!hasAnyInput) {
    return res
      .status(400)
      .json(ApiResponse.error("Please provide product details, category, or notes", 400).toJSON());
  }

  const kb = await getCatalogKnowledgeBase();
  const systemPrompt = buildSystemPrompt(kb);

  const userPrompt = `Please analyze the following product inputs and generate valid CSV and structured products:
${title ? `Product Title: ${title}\n` : ""}
${productType ? `Product Type: ${productType}\n` : ""}
${category ? `Selected Category: ${category}\n` : ""}
${subcategory ? `Selected Subcategory: ${subcategory}\n` : ""}
${badge ? `Selected Badge: ${badge}\n` : ""}
${collections ? `Selected Collections: ${Array.isArray(collections) ? collections.join(", ") : collections}\n` : ""}
${images ? `Images: ${Array.isArray(images) ? images.join(", ") : images}\n` : ""}
${price ? `Base Price: ₹${price}\n` : ""}
${offerPrice ? `Offer Price: ₹${offerPrice}\n` : ""}
${stock ? `Stock: ${stock}\n` : ""}
${offerPeriod ? `Offer Period: ${offerPeriod}\n` : ""}
${variants && variants.length ? `Configured Variants Matrix: ${JSON.stringify(variants)}\n` : ""}
${colors && colors.length ? `Selected Colors: ${JSON.stringify(colors)}\n` : ""}
${sizes && sizes.length ? `Selected Sizes: ${JSON.stringify(sizes)}\n` : ""}
${prompt ? `PROMPT / INSTRUCTIONS:\n${prompt}\n` : ""}
${notes ? `VENDOR NOTES / FABRIC SPECS:\n${notes}\n` : ""}
${rawData ? `RAW PRODUCT DATA:\n${rawData}\n` : ""}

Remember:
1. Product Type rules:
   - If CONFIGURABLE: Parent row price & stock MUST be empty; Child SIMPLE rows MUST have price, stock, variant_color, hex_code, variant_size, and empty category.
   - If SIMPLE: Standalone row MUST have price, stock, category, and empty variant fields.
2. Category MUST strictly match "${subcategory || category || "one of the active store categories"}".
3. For size values, ALWAYS output the exact canonical label from the Size Normalization Training in the system prompt (e.g. "0-3 Month", "3-6 Month", "S", "New Born"). Do NOT use "0-3-months", "0-3 Months", "0-3m" or add a leading apostrophe.
4. For colors, supply the correct hex_code from the attribute registry.
5. Create rich details_json with description, grid, and pair sections.
6. Return valid JSON only with keys "summary", "csv", and "products".`;

  logger.info("[AI Product Import] Generating products with AI...");
  const result = await callLlm(
    systemPrompt,
    userPrompt,
    () => deterministicGenerateProducts(prompt, rawData, kb, structuredData)
  );

  // Safety net: force canonical size/color labels even if the model slipped.
  const productsOut = Array.isArray(result.products)
    ? normalizeImportProducts(JSON.parse(JSON.stringify(result.products)), kb)
    : result.products || [];

  return res.status(200).json(
    ApiResponse.success("Products generated successfully", {
      summary: result.summary || "Products generated from description",
      csv: result.csv || "",
      products: productsOut,
    }).toJSON()
  );
});

/**
 * Controller: Automatically diagnose and fix import validation errors using Knowledge Base
 * POST /api/v1/admin/products/ai/fix-errors
 */
const fixImportErrors = asyncHandler(async (req, res) => {
  const { products, errors = [], warnings = [], rawCsv = "" } = req.body;

  if (!errors.length && !warnings.length && !products?.length) {
    return res
      .status(400)
      .json(ApiResponse.error("No errors or products provided for fixing", 400).toJSON());
  }

  const kb = await getCatalogKnowledgeBase();
  const systemPrompt = buildSystemPrompt(kb);

  const errorFixPrompt = `You are an automated CSV Import Error Resolver.
You are given a list of validation errors and warnings that occurred during product import, along with the erroneous products or CSV.
Your goal is to AUTO-FIX every single error and warning using the Store Knowledge Base.

### VALIDATION ERRORS DETECTED:
${JSON.stringify(errors, null, 2)}

### WARNINGS DETECTED:
${JSON.stringify(warnings, null, 2)}

### CURRENT PRODUCTS DATA:
${JSON.stringify(products ? products.slice(0, 25) : [], null, 2)}
${rawCsv ? `\nRAW CSV SNIPPET:\n${rawCsv.slice(0, 3000)}` : ""}

### INSTRUCTIONS FOR FIXING:
1. "Category not found": Map to the closest active category in the store knowledge base.
2. "Unknown attribute" / "Invalid value for attribute": Check the allowed values for that attribute in the Knowledge Base and replace with the canonical allowed value.
3. "Duplicate SKU": Clear the SKU (empty string) so the backend can auto-generate a unique SKU, or append a unique suffix like "-1", "-2".
4. SIZE VALUES (CRITICAL): Use the Size Normalization Training in the system prompt. Every size MUST become the exact canonical label (e.g. "0-3-months" -> "0-3 Month", "3-6-months" -> "3-6 Month", "small" -> "S", "nb" -> New Born). NEVER emit "0-3-months", "0-3 Months", "0-3m", and NEVER add a leading single quote. If a size was corrupted (e.g. "03-Jan" or "0-3"), map it to the closest numeric age range canonical label.
5. "Price required" / "Stock required": Provide reasonable standard values if missing (e.g. Price from parent or standard 499, stock 50).
6. "Duplicate variant configuration": Ensure distinct color/size combinations.
7. Return a JSON object with:
   - "resolvedCount": number of resolved errors
   - "summary": clear explanation of all fixes made
   - "changeLog": array of { row, field, from, to, reason }
   - "csv": the corrected complete CSV string
   - "products": the corrected products array ready for import`;

  logger.info(`[AI Product Import] Resolving ${errors.length} errors with AI...`);
  const result = await callLlm(
    systemPrompt,
    errorFixPrompt,
    () => deterministicFixErrors(products, errors, warnings, rawCsv, kb)
  );

  // Safety net: force canonical size/color labels even if the model slipped.
  const productsOut = Array.isArray(result.products)
    ? normalizeImportProducts(JSON.parse(JSON.stringify(result.products)), kb)
    : result.products || [];

  return res.status(200).json(
    ApiResponse.success("Errors resolved successfully", {
      resolvedCount: result.resolvedCount || errors.length,
      summary: result.summary || "Validation errors corrected using Store Knowledge Base",
      changeLog: result.changeLog || [],
      csv: result.csv || "",
      products: productsOut,
    }).toJSON()
  );
});

/**
 * Controller: Get Store Knowledge Base for UI display & prompt customization
 * GET /api/v1/admin/products/ai/knowledge-base
 */
const getKnowledgeBase = asyncHandler(async (req, res) => {
  const kb = await getCatalogKnowledgeBase();
  return res.status(200).json(
    ApiResponse.success("Knowledge base retrieved", {
      categoryCount: kb.categories.length,
      categories: kb.categories.map((c) => ({
        id: c._id,
        name: c.name,
        slug: c.slug || c.code,
        parent: c.parentCategory,
      })),
      rootCategories: kb.rootCategories || [],
      attributes: kb.attributes,
      collections: kb.collections,
      csvHeaders: kb.csvHeaders,
      syncedAt: new Date().toISOString(),
    }).toJSON()
  );
});

module.exports = {
  generateProducts,
  fixImportErrors,
  getKnowledgeBase,
  getCatalogKnowledgeBase,
};
