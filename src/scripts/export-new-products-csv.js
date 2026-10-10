/**
 * Generate a CSV import file for NEW products that reuse the image data of
 * existing products in the database.
 *
 * The output rows use fresh TMP_ ids and BLANK skus so importing them CREATES
 * brand-new products (never updates the source rows), but keeps the source
 * product's images, variant structure, pricing, descriptions, collections,
 * colors/sizes etc. as a starting point — edit titles/prices/SKUs in the CSV
 * before importing.
 *
 * Usage:
 *   node src/scripts/export-new-products-csv.js [options]
 *
 * Options:
 *   --category <code|name>   Only export products from this category
 *   --skus <sku,sku,...>     Only export these products (comma-separated)
 *   --status <draft|published|archived>
 *   --limit <n>              Max number of products to export
 *   --one-per-category       Export one product per category only
 *   --file <path>            Output file (default: new-products-<date>.csv)
 *   --dry-run                Print a summary only, write nothing
 *   --help                   Show this help
 *
 * Output column order matches the dashboard's import template:
 *   product_type, id, parent_id, title, price, offer_price, offer_period,
 *   stock, category, image_urls, image_public_ids, description, collections,
 *   badge, variant_color, hex_code, variant_size, <variant_* for other attrs>,
 *   seo_title, seo_description, status, details_json
 */

require("dotenv").config();
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const Product = require("../models/Product");
const AttributeDefinition = require("../models/AttributeDefinition");

const HELP = [
  "Usage: node src/scripts/export-new-products-csv.js [options]",
  "",
  "Options:",
  "  --category <code|name>   Only export products from this category",
  "  --skus <sku,sku,...>     Only export these products (comma-separated)",
  "  --status <draft|published|archived>",
  "  --limit <n>              Max number of products to export",
  "  --one-per-category       Export one product per category only",
  "  --file <path>            Output file (default: new-products-<date>.csv)",
  "  --dry-run                Print a summary only, write nothing",
  "  --help                   Show this help",
  "",
  "Output: TMP_ ids + blank SKUs => importing creates NEW products that reuse",
  "        the source products' images / variants / details / metadata.",
].join("\n");

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { skus: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--help":
      case "-h":
        args.help = true;
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--one-per-category":
        args.onePerCategory = true;
        break;
      case "--category":
        args.category = argv[++i];
        break;
      case "--status":
        args.status = argv[++i];
        break;
      case "--limit":
        args.limit = parseInt(argv[++i], 10);
        if (isNaN(args.limit) || args.limit < 1) {
          console.error("--limit must be a positive integer");
          process.exit(2);
        }
        break;
      case "--file":
        args.file = argv[++i];
        break;
      case "--skus":
        (argv[++i] || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .forEach((s) => args.skus.push(s));
        break;
      default:
        console.error(`Unknown option: ${arg}`);
        console.error(HELP);
        process.exit(2);
    }
  }
  return args;
}

// ---------------------------------------------------------------------------
// CSV helpers (mirrors the dashboard's export serialization)
// ---------------------------------------------------------------------------

const csvField = (value) => {
  const s = value == null ? "" : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
};

const pipeJoin = (arr) => {
  if (arr == null) return "";
  const list = Array.isArray(arr) ? arr : [arr];
  return list
    .map((x) => (typeof x === "string" ? x : (x && x.url) || ""))
    .filter(Boolean)
    .join("|");
};

// Extract a public_id from a Cloudinary or media-server URL (port of the
// dashboard's resolveImagePublicId).
function resolveImagePublicId(img) {
  const value = typeof img === "string" ? img : (img && img.url) || "";
  if (!value) return "";
  const uploadMatch = value.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.\w+)?$/);
  if (uploadMatch) {
    return uploadMatch[1].replace(/\.\w+$/, "");
  }
  try {
    const u = new URL(value);
    return decodeURIComponent(u.pathname).replace(/^\/+/, "").replace(/\.\w+$/, "");
  } catch {
    return value.replace(/\.\w+$/, "");
  }
}

const formatOfferPeriod = (start, end) => {
  if (!start && !end) return "";
  return `${start ? new Date(start).toISOString() : ""}|${end ? new Date(end).toISOString() : ""}`;
};

// ---------------------------------------------------------------------------
// Label / hex resolution from variantOptions + catalog
// ---------------------------------------------------------------------------

// option code -> Map(normalized option value -> { label, hex })
function buildOptionLookups(product, allAttributes) {
  const lookups = new Map();
  const norm = (s) => (s ?? "").toString().trim().toLowerCase();

  for (const option of product.variantOptions || []) {
    const code = norm(option.code || option.name);
    if (!code) continue;
    const valueMap = new Map();
    for (const v of option.values || []) {
      valueMap.set(norm(v.value), {
        label: v.label || v.value,
        hex: v.hex || null,
      });
    }
    lookups.set(code, valueMap);
  }

  // Backfill label/hex from the catalog for values the product does not carry.
  for (const attr of allAttributes) {
    const code = norm(attr.code);
    if (!code || !Array.isArray(attr.allowedValues)) continue;
    if (!lookups.has(code)) lookups.set(code, new Map());
    const valueMap = lookups.get(code);
    for (const av of attr.allowedValues || []) {
      if (!av || av.isActive === false) continue;
      const key = norm(av.value);
      if (!key) continue;
      if (!valueMap.has(key)) {
        valueMap.set(key, { label: av.label || av.value, hex: av.hex || null });
      } else if (!valueMap.get(key).hex && av.hex) {
        valueMap.set(key, { ...valueMap.get(key), hex: av.hex });
      }
    }
  }

  return lookups;
}

// Resolve a variant attribute value to its display label using the lookup.
function toDisplayLabel(lookups, attrKey, rawValue) {
  const norm = (s) => (s ?? "").toString().trim().toLowerCase();
  const valueMap = lookups.get(norm(attrKey));
  if (valueMap) {
    let entry = valueMap.get(norm(rawValue));
    if (entry) return entry.label;
    // Maybe the raw value is already a label ("3-6 Month"): try exact-ish match.
    const byLabel = Array.from(valueMap.entries()).find(
      ([, e]) => norm(e.label) === norm(rawValue)
    );
    if (byLabel) return byLabel[1].label;
  }
  return rawValue;
}

function findHex(lookups, attrKey, rawValue) {
  const norm = (s) => (s ?? "").toString().trim().toLowerCase();
  const valueMap = lookups.get(norm(attrKey));
  const entry = valueMap && valueMap.get(norm(rawValue));
  return (entry && entry.hex) || "";
}

// ---------------------------------------------------------------------------
// Row builders (mirrors the dashboard generateCsv row shape)
// ---------------------------------------------------------------------------

function buildRow(columns, values) {
  const row = {};
  columns.forEach((col, i) => {
    row[col] = values[i] == null ? "" : values[i];
  });
  return row;
}

function buildBaseHeaders() {
  return [
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
  ];
}

function buildSeoTailHeaders() {
  return ["seo_title", "seo_description", "status", "details_json"];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    return;
  }

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI not found in .env");

  console.log("Connecting to MongoDB...");
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 20000 });
  console.log("Connected.\n");

  const query = {};
  if (args.status) query.status = args.status;

  let finder = Product.find(query).lean();
  if (args.limit && !args.onePerCategory) finder = finder.limit(args.limit);

  let products = await finder;

  // Category filtering by code or name (resolve against the Category collection).
  if (args.category) {
    const Category = require("../models/Category");
    const like = new RegExp(`^${args.category.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
    const cats = await Category.find({
      $or: [{ code: like }, { name: like }, { slug: like }],
    }).select("_id").lean();
    const catIds = new Set(cats.map((c) => c._id.toString()));
    products = products.filter(
      (p) =>
        catIds.has(String(p.category)) ||
        catIds.has(String(p.categoryCode)) ||
        like.test(String(p.categoryCode || "")) ||
        like.test(String(p.categoryName || ""))
    );
  }

  if (args.skus.length > 0) {
    const skuSet = new Set(args.skus.map((s) => s.toLowerCase()));
    products = products.filter((p) => skuSet.has(String(p.sku || "").toLowerCase()));
  }

  // Only SIMPLE / CONFIGURABLE can be round-tripped through the import flow.
  let importable = products.filter((p) => {
    const t = (p.product_type || "").toUpperCase();
    return t === "" || t === "SIMPLE" || t === "CONFIGURABLE";
  });
  const skipped = products.length - importable.length;

  // One representative product per category (prefer the first with images).
  if (args.onePerCategory) {
    const byCategory = new Map();
    for (const p of importable) {
      const key =
        p.categoryCode ||
        p.categoryName ||
        (p.category != null ? String(p.category) : "") ||
        "__uncategorized__";
      const existing = byCategory.get(key);
      if (!existing) {
        byCategory.set(key, p);
      } else if (
        (!Array.isArray(existing.images) || existing.images.length === 0) &&
        Array.isArray(p.images) &&
        p.images.length > 0
      ) {
        byCategory.set(key, p);
      }
    }
    importable = Array.from(byCategory.values());
    if (args.limit) importable = importable.slice(0, args.limit);
  }

  if (importable.length === 0) {
    console.log("No importable products matched the given filters (SIMPLE/CONFIGURABLE only).");
    await mongoose.disconnect();
    return;
  }

  const allAttributes = await AttributeDefinition.find({}).lean();

  // Discover every variant attribute key used across the set so the output has
  // one variant_* column per attribute (color/size get conventional names).
  const attrKeySet = new Set();
  for (const p of importable) {
    for (const v of p.variants || []) {
      const attrs = v.attributes instanceof Map
        ? Object.fromEntries(v.attributes)
        : v.attributes || v.options || {};
      Object.keys(attrs).forEach((k) => attrKeySet.add(k.toLowerCase().trim()));
    }
  }
  const attrNames = Array.from(attrKeySet).sort();
  const variantHeaders = [];
  for (const k of attrNames) {
    if (k === "color") {
      variantHeaders.push("variant_color", "hex_code");
    } else if (k === "size") {
      variantHeaders.push("variant_size");
    } else {
      variantHeaders.push(`variant_${k}`);
    }
  }

  const headers = [
    ...buildBaseHeaders(),
    ...variantHeaders,
    ...buildSeoTailHeaders(),
  ];

  const rows = [];
  let parentSeq = 0;

  // Collect variants BEFORE rows so parent + its children stay contiguous.
  for (const p of importable) {
    parentSeq += 1;
    // Must match the dashboard's TMP_ID_REGEX (/^TMP_\d+$/) so the parser
    // treats this row as a NEW product. Blank child ids are auto-assigned
    // TMP_ ids that continue after this explicit number (no collisions).
    const parentTmpId = `TMP_${parentSeq}`;
    const isConfigurable =
      (p.product_type || "").toUpperCase() === "CONFIGURABLE" ||
      (Array.isArray(p.variants) && p.variants.length > 0);

    const categoryCell =
      p.categoryCode ||
      p.categoryName ||
      (typeof p.category === "object" && p.category?.name) ||
      "";

    const parentImages = pipeJoin(p.images);
    const parentPublicIds = pipeJoin((p.images || []).map(resolveImagePublicId));
    const detailsJson =
      Array.isArray(p.details) && p.details.length > 0
        ? JSON.stringify(p.details)
        : "";

    const parentValues = [
      isConfigurable ? "CONFIGURABLE" : "SIMPLE",
      parentTmpId,
      "",
      p.title || p.name || "",
      isConfigurable ? "" : p.price ?? "",
      p.offerPrice ?? "",
      formatOfferPeriod(p.offerStartAt, p.offerEndAt),
      isConfigurable ? "" : p.stockObj?.available ?? p.stock ?? 0,
      categoryCell,
      parentImages,
      parentPublicIds,
      p.description || "",
      pipeJoin(p.collections),
      p.badgeCollection || "",
    ];

    const lookups = buildOptionLookups(p, allAttributes);

    // Variant attribute columns for the parent row are blank.
    const parentAttrCells = variantHeaders.map(() => "");
    const parentSeoCells = [
      p.metaTitle || "",
      p.metaDescription || "",
      p.status || "draft",
      detailsJson,
    ];

    rows.push(buildRow(headers, [...parentValues, ...parentAttrCells, ...parentSeoCells]));

    // Children
    const variants = Array.isArray(p.variants) ? p.variants : [];
    variants.forEach((v) => {
      const attrs = v.attributes instanceof Map
        ? Object.fromEntries(v.attributes)
        : v.attributes || v.options || {};

      const resolveAttrKey = (h) =>
        h === "variant_color" ? "color"
          : h === "variant_size" ? "size"
            : h.replace(/^variant_/, "");

      const getAttr = (key) => {
        if (attrs == null) return "";
        if (attrs[key] !== undefined && attrs[key] !== null && attrs[key] !== "") return attrs[key];
        const lower = Object.keys(attrs).find((k) => k.toLowerCase() === String(key).toLowerCase());
        return lower !== undefined ? attrs[lower] : "";
      };

      const colorRaw = getAttr("color");
      const variantHex = findHex(lookups, "color", colorRaw) || v.hexCode || v.hex_code || "";

      // One cell per variant column (labels resolved; hex_code filled for color).
      const attrCells = variantHeaders.map((h) => {
        if (h === "hex_code") return variantHex;
        const key = resolveAttrKey(h);
        return toDisplayLabel(lookups, key, getAttr(key));
      });

      const variantValues = [
        "simple",
        "",
        parentTmpId,
        p.title || p.name || "",
        v.price ?? "",
        v.offerPrice ?? "",
        formatOfferPeriod(v.offerStartAt, v.offerEndAt),
        v.stockObj?.available ?? v.stock ?? 0,
        "",
        pipeJoin(v.images),
        pipeJoin((v.images || []).map(resolveImagePublicId)),
        "",
        "",
        "",
        ...attrCells,
        "",
        "",
        "",
        "",
      ];

      rows.push(buildRow(headers, variantValues));
    });
  }

  const csv = [
    headers.join(","),
    ...rows.map((r) =>
      headers.map((h) => csvField(r[h])).join(",")
    ),
  ].join("\n");

  const totalVariants = importable.reduce(
    (sum, p) => sum + (Array.isArray(p.variants) ? p.variants.length : 0),
    0
  );

  console.log("=".repeat(60));
  console.log(`Products exported:   ${importable.length}`);
  console.log(`Variants exported:   ${totalVariants}`);
  console.log(`Rows written:        ${rows.length}`);
  console.log(`Skipped (BUNDLE/etc):${skipped}`);
  console.log(`Categories:          ${[...new Set(importable.map((p) => p.categoryCode || p.categoryName || ""))].filter(Boolean).join(", ") || "(none)"}`);
  console.log("=".repeat(60));

  if (args.dryRun) {
    console.log("\nDry run — no file written.");
    await mongoose.disconnect();
    return;
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const outFile = args.file || path.join(process.cwd(), `new-products-${stamp}.csv`);
  fs.writeFileSync(outFile, "\uFEFF" + csv, "utf8");
  console.log(`\nWrote ${outFile}`);
  console.log("Open it in a sheet editor, edit titles/prices/description, then import via");
  console.log("Dashboard > Products > Import CSV (validate + commit). Blank SKUs create new rows.");

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("❌ Export failed:", err.message);
  process.exit(1);
});