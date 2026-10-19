/**
 * One-off: populate the homepage "editorPicks" CMS block with real products.
 *
 * - Picks the newest published, in-stock SIMPLE/CONFIGURABLE products (up to 8).
 * - Mirrors the exact ProductItem shape returned by GET /api/v1/cms/products,
 *   so the storefront editorial cards render with image/price/stock.
 * - Upserts the editorPicks block in the homepage document (keeps existing
 *   id/title/link/enabled/order; re-pins only if the saved pin no longer matches).
 *
 * Run with: node src/scripts/populate-editor-picks.js
 * Optional:  --limit=8  --title="Editor's Picks" --pinned=<url_key_or_id>
 */
require("dotenv").config();
const mongoose = require("mongoose");

const PRODUCT_LIMIT = 8;

function getFirstImageUrl(images) {
  const first = images?.[0];
  if (!first) return "";
  if (typeof first === "string") return first;
  if (first && typeof first === "object" && first.url) return first.url;
  return "";
}

function getActiveOfferPrice(item) {
  const offerPrice = item.offerPrice ?? null;
  if (offerPrice == null || offerPrice <= 0) return null;
  const now = new Date();
  if (item.offerStartAt && now < new Date(item.offerStartAt)) return null;
  if (item.offerEndAt && now > new Date(item.offerEndAt)) return null;
  return offerPrice;
}

function toProductItem(product) {
  let price = 0;
  let discountPrice = 0;
  let stock = 0;
  let image = "";

  if (product.product_type === "CONFIGURABLE" && product.variants?.length > 0) {
    const availableVariants = product.variants.filter((v) => {
      const variantStock = v.stockObj?.available ?? v.stock ?? 0;
      return variantStock > 0;
    });
    if (availableVariants.length === 0) return null;

    const firstVariant = availableVariants[0];
    price = firstVariant.price ?? 0;
    discountPrice = getActiveOfferPrice(firstVariant) ?? 0;
    stock = firstVariant.stockObj?.available ?? firstVariant.stock ?? 0;
    image =
      getFirstImageUrl(firstVariant.images) ||
      getFirstImageUrl(product.images) ||
      "";
  } else if (product.product_type === "SIMPLE") {
    stock = product.stockObj?.available ?? product.stock ?? 0;
    if (stock === 0) return null;
    price = product.price ?? 0;
    discountPrice = getActiveOfferPrice(product) ?? 0;
    image = getFirstImageUrl(product.images) || "";
  } else {
    return null;
  }

  const variantCount = Array.isArray(product.variants)
    ? product.variants.length
    : 0;
  const colors = [
    ...new Set(
      (product.variants || [])
        .map((v) => v?.attributes?.color)
        .filter((c) => typeof c === "string" && c.trim())
        .map((c) => c.trim()),
    ),
  ];

  return {
    id: product._id.toString(),
    title: product.title,
    slug: product.url_key,
    price,
    discountPrice,
    image,
    stock,
    product_type: product.product_type || "SIMPLE",
    variantCount,
    hasVariants: variantCount > 0,
    colors,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const parseArg = (name, fallback) => {
    const hit = args.find((a) => a.startsWith(`${name}=`));
    return hit ? hit.split("=")[1] : fallback;
  };
  const limit = Math.min(Math.max(parseInt(parseArg("limit", PRODUCT_LIMIT), 10) || PRODUCT_LIMIT, 1), 20);
  const requestedTitle = parseArg("title", "");
  const requestedPin = parseArg("pinned", "");

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MongoDB URI not found in environment variables");

  console.log("🔌 Connecting to MongoDB...");
  await mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 15000,
    connectTimeoutMS: 15000,
  });
  console.log("✅ Connected to MongoDB");

  const Product = require("../models/Product");
  const Homepage = require("../models/Homepage");

  // Fetch the newest published products as a pool, then keep in-stock ones.
  const pool = await Product.find({
    status: "published",
    product_type: { $in: ["SIMPLE", "CONFIGURABLE"] },
  })
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit * 6)
    .lean();

  const items = [];
  for (const product of pool) {
    const item = toProductItem(product);
    if (item) items.push(item);
    if (items.length >= limit) break;
  }

  console.log(`🛍️  Found ${pool.length} published products; ${items.length} in stock (using ${items.length}).`);
  items.forEach((p, i) => console.log(`   ${i + 1}. ${p.title} — ₹${p.price} (stock ${p.stock}) [${p.slug}]`));

  if (items.length === 0) {
    console.log("❌ No in-stock products found. Aborting without write.");
    await mongoose.disconnect();
    return;
  }

  const home = await Homepage.findOne({}).lean();
  if (!home) {
    throw new Error("Homepage document not found in DB");
  }

  const content = Array.isArray(home.content) ? home.content.map((b) => ({ ...b })) : [];
  let block = content.find((b) => b && b.block_type === "editorPicks");

  if (!block) {
    block = {
      id: `block-editor-picks-${Date.now()}`,
      block_type: "editorPicks",
      enabled: true,
      order: content.length,
      title: requestedTitle || "Editor's Picks",
      link: "",
      content: [],
    };
    content.push(block);
  }

  const prevPin = block.pinnedUrlKey;
  const pinStillValid = prevPin && items.some((p) => p.slug === prevPin || p.id === prevPin);
  const pin = pinStillValid
    ? prevPin
    : requestedPin && items.some((p) => p.slug === requestedPin || p.id === requestedPin)
      ? requestedPin
      : items[0].slug;

  block.content = items;
  block.pinnedUrlKey = pin;
  block.enabled = block.enabled !== false;
  if (requestedTitle) block.title = requestedTitle;
  if (!block.title) block.title = "Editor's Picks";
  if (typeof block.link !== "string") block.link = "";

  // Bypass Mongoose casting/validation via raw update ($set on the array only).
  // The flexible Homepage schema can hold docs whose timestamps are not valid Dates,
  // so a full save() would fail casting; updateOne does not.
  await Homepage.updateOne({ _id: home._id }, { $set: { content } });
  console.log(`✅ Saved editorPicks block (id=${block.id}) with ${items.length} products.`);
  console.log(`   Pinned spotlight: ${pin}`);

  // Best-effort cache invalidation (Redis) + frontend revalidation.
  try {
    const { cacheDel, cacheDelPattern } = require("../utils/redisCache");
    await Promise.allSettled([cacheDel("homepage"), cacheDelPattern("cms:home*")]);
    console.log("🧹 Cleared homepage/cms cache keys.");
  } catch (e) {
    console.log("⚠️  Redis cache clear skipped:", e.message);
  }

  try {
    const { triggerRevalidation } = require("../services/revalidateService");
    await Promise.allSettled([
      triggerRevalidation({ tag: "cms:home" }),
      triggerRevalidation({ tag: "page:home" }),
      triggerRevalidation({ type: "page", resource: "home", tag: "group:cms" }),
    ]);
    console.log("📡 Frontend revalidation triggered (best-effort).");
  } catch (e) {
    console.log("⚠️  Revalidation skipped:", e.message);
  }

  await mongoose.disconnect();
  console.log("✅ Done.");
}

main().catch(async (err) => {
  console.error("❌ Script failed:", err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});