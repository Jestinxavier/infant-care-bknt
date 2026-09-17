// services/aiReportService.js
// End-of-day AI business report:
//   1. Aggregates visitor/behavior events + cart/order data for a given IST day.
//   2. Asks the LLM (Gemini, same provider as AI product import) for a
//      narrative: summary, insights, plan & growth strategy.
//   3. Falls back to a deterministic template report if the LLM is unavailable.
//   4. Upserts the result into the AiDailyReport collection (auditable history).
const AnalyticsEvent = require("../models/AnalyticsEvent");
const AiDailyReport = require("../models/AiDailyReport");
const Cart = require("../models/Cart");
const Order = require("../models/Order");
const Product = require("../models/Product");
const logger = require("../utils/logger");

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Build the exact start/end Date for a Kolkata calendar day (yyyy-mm-dd).
 */
function getKolkataDayRange(dateStr) {
  const from = new Date(`${dateStr}T00:00:00.000+05:30`);
  const to = new Date(from.getTime() + DAY_MS - 1);
  return { from, to };
}

/**
 * Yesterday's date string computed in Asia/Kolkata.
 */
function getYesterdayDateStr(now = new Date()) {
  const kolkata = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const parts = kolkata.split("-");
  const yesterday = new Date(
    Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])),
  );
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return yesterday.toISOString().slice(0, 10); // yyyy-mm-dd
}

const pct = (num, den) =>
  den > 0 ? Math.round((num / den) * 1000) / 10 : 0; // 0-100 with one decimal

/**
 * Aggregate everything the AI needs for one day.
 */
async function aggregateDay(from, to, dateStr) {
  const match = { createdAt: { $gte: from, $lte: to } };

  const [visits, uniqueVisitors, sessions, productViews] = await Promise.all([
    AnalyticsEvent.countDocuments({ eventType: "page_view", ...match }),
    AnalyticsEvent.distinct("visitorId", {
      ...match,
      visitorId: { $ne: null, $ne: "" },
    }),
    AnalyticsEvent.distinct("sessionId", {
      eventType: "page_view",
      ...match,
      sessionId: { $ne: null, $ne: "" },
    }),
    AnalyticsEvent.countDocuments({ eventType: "product_view", ...match }),
  ]);

  const visitorIds = (uniqueVisitors || []).filter(Boolean);
  const visitors = visitorIds.length;

  const [pageAgg, productAgg, addToCartAgg, referrerAgg] = await Promise.all([
    // Top pages
    AnalyticsEvent.aggregate([
      { $match: { eventType: "page_view", path: { $ne: "" }, ...match } },
      { $group: { _id: "$path", views: { $sum: 1 } } },
      { $sort: { views: -1 } },
      { $limit: 12 },
      { $project: { _id: 0, path: "$_id", views: 1 } },
    ]),
    // Top viewed products (by url_key)
    AnalyticsEvent.aggregate([
      {
        $match: {
          eventType: "product_view",
          productSlug: { $ne: null, $ne: "" },
          ...match,
        },
      },
      { $group: { _id: "$productSlug", views: { $sum: 1 } } },
      { $sort: { views: -1 } },
      { $limit: 15 },
      { $project: { _id: 0, slug: "$_id", views: 1 } },
    ]),
    // Add-to-cart per product (by url_key)
    AnalyticsEvent.aggregate([
      {
        $match: {
          eventType: "add_to_cart",
          productSlug: { $ne: null, $ne: "" },
          ...match,
        },
      },
      { $group: { _id: "$productSlug", adds: { $sum: 1 } } },
      { $project: { _id: 0, slug: "$_id", adds: 1 } },
    ]),
    // Top referrers
    AnalyticsEvent.aggregate([
      { $match: { referrer: { $ne: null, $ne: "" }, ...match } },
      { $group: { _id: "$referrer", views: { $sum: 1 } } },
      { $sort: { views: -1 } },
      { $limit: 8 },
      { $project: { _id: 0, referrer: "$_id", views: 1 } },
    ]),
  ]);

  const addToCartCount = await AnalyticsEvent.countDocuments({
    eventType: "add_to_cart",
    ...match,
  });
  const beginCheckoutCount = await AnalyticsEvent.countDocuments({
    eventType: "begin_checkout",
    ...match,
  });

  // Enrich top viewed slugs with product details (best effort)
  const slugToAdds = new Map(addToCartAgg.map((r) => [r.slug, r.adds]));
  const slugs = productAgg.map((r) => r.slug);
  let productMeta = {};
  if (slugs.length) {
    try {
      const found = await Product.find({ url_key: { $in: slugs } })
        .select("title price offerPrice category status url_key")
        .lean();
      productMeta = Object.fromEntries(
        found.map((p) => [
          p.url_key,
          {
            name: p.title,
            price: p.price ?? p.offerPrice ?? null,
            offerPrice: p.offerPrice ?? null,
            category: typeof p.category === "string" ? p.category : null,
            status: p.status,
          },
        ]),
      );
    } catch (err) {
      logger.warn(`[AiReport] product enrichment skipped: ${err.message}`);
    }
  }
  const topViewedProducts = productAgg.map((r) => ({
    slug: r.slug,
    name: productMeta[r.slug]?.name || null,
    category: productMeta[r.slug]?.category || null,
    price: productMeta[r.slug]?.price ?? null,
    offerPrice: productMeta[r.slug]?.offerPrice ?? null,
    views: r.views,
    addToCarts: slugToAdds.get(r.slug) || 0,
    addToCartRate: pct(slugToAdds.get(r.slug) || 0, r.views),
  }));

  // Cart snapshot (created within the day)
  const [cartsCreated, cartsAbandoned, cartsOrdered] = await Promise.all([
    Cart.countDocuments(match),
    Cart.countDocuments({ status: "abandoned", ...match }),
    Cart.countDocuments({ status: "ordered", ...match }),
  ]);

  // Orders + revenue
  // Base = active (non-cancelled, non-returned) orders. Revenue = only paid.
  const ORDERS_BASE = { orderStatus: { $nin: ["cancelled", "returned"] } };
  const ordersPlaced = await Order.countDocuments({ ...ORDERS_BASE, ...match });
  const [revenueAgg, orderValueAgg] = await Promise.all([
    Order.aggregate([
      {
        $match: {
          ...ORDERS_BASE,
          paymentStatus: "paid",
          ...match,
        },
      },
      { $group: { _id: null, revenue: { $sum: "$totalAmount" } } },
    ]),
    Order.aggregate([
      { $match: { ...ORDERS_BASE, ...match } },
      { $group: { _id: null, value: { $sum: "$totalAmount" } } },
    ]),
  ]);
  const revenue = revenueAgg[0]?.revenue || 0;
  const orderValue = Math.round(orderValueAgg[0]?.value || 0);

  const topSellingAgg = await Order.aggregate([
    { $match: { ...ORDERS_BASE, ...match } },
    { $unwind: "$items" },
    {
      $group: {
        _id: "$items.name",
        qtySold: { $sum: "$items.quantity" },
        revenue: {
          $sum: { $multiply: ["$items.quantity", "$items.price"] },
        },
      },
    },
    { $sort: { qtySold: -1 } },
    { $limit: 10 },
    {
      $project: { _id: 0, name: "$_id", qtySold: 1, revenue: 1 },
    },
  ]);

  const trackedSessions = (sessions || []).length;
  // Note: conversion denominators use *tracked* sessions/visitors. Tracking has
  // only recently launched, so order counts can exceed tracked sessions (many
  // buyers have no analytics session yet). Surface that gap instead of fake 100%+.
  const conversionBase = Math.max(trackedSessions, visitors, 1);
  const trackingGapOvershoot = Math.max(0, ordersPlaced - conversionBase);

  return {
    date: dateStr || null,
    period: { from, to },
    traffic: {
      visits,
      uniqueVisitors: visitors,
      sessions: trackedSessions,
      avgViewsPerVisitor: visitors ? Math.round(visits / visitors) : 0,
      trackingGapOvershoot,
      topPages: pageAgg.slice(0, 8),
      topReferrers: referrerAgg,
    },
    productInterest: {
      productViews,
      productsViewed: productAgg.length,
      topViewedProducts,
    },
    funnel: {
      pageViews: visits,
      productViews,
      addToCartCount,
      addToCartRate: pct(addToCartCount, visits),
      beginCheckoutCount,
      beginCheckoutRate: pct(beginCheckoutCount, visits),
      ordersPlaced,
      conversionRate: Math.min(100, pct(ordersPlaced, conversionBase)),
      cartsCreated,
      cartsAbandoned,
      cartsOrdered,
      abandonmentRate: pct(cartsAbandoned, cartsCreated),
    },
    sales: {
      ordersPlaced,
      orderValue,
      revenue: Math.round(revenue),
      aov: ordersPlaced ? Math.round(orderValue / ordersPlaced) : 0,
      topSellingProducts: topSellingAgg.slice(0, 5),
    },
  };
}

/**
 * Deterministic template narrative — used when the LLM is unavailable so the
 * daily pipeline always produces a report.
 */
function buildFallbackContent(metrics) {
  const { traffic, funnel, sales, productInterest } = metrics;
  const trackingGapNote =
    traffic.trackingGapOvershoot > 0
      ? ` Note: ${traffic.trackingGapOvershoot} more order(s) than tracked sessions — analytics tracking is still partial, so visitor/conversion numbers are a lower bound.`
      : "";

  const topViewed = productInterest.topViewedProducts.slice(0, 3).map(
    (p) => `${p.name || p.slug} (${p.views} views, ${p.addToCarts} added to cart)`,
  );
  const topSold = sales.topSellingProducts
    .slice(0, 3)
    .map((p) => `${p.name} (${p.qtySold} sold, ₹${p.revenue})`);

  return {
    executiveSummary: `The store recorded ${traffic.uniqueVisitors} tracked unique visitors, ${traffic.visits} page views and ${sales.ordersPlaced} orders for ₹${sales.orderValue} order value (₹${sales.revenue} collected). ${sales.ordersPlaced === 0 ? "No orders were placed today." : "Conversion from visitor to order was " + funnel.conversionRate + "%."} ${funnel.addToCartRate}% of page views led to an add-to-cart.${trackingGapNote}`,
    trafficSummary: {
      label: "Traffic summary",
      text: `${traffic.uniqueVisitors} tracked unique visitors across ${traffic.sessions} sessions (~${traffic.avgViewsPerVisitor} pages/visitor).${trackingGapNote}`,
      topPages: traffic.topPages,
    },
    topViewedProducts: topViewed.map((t) => ({ product: t })),
    topPerformingProducts: topSold.map((t) => ({ product: t })),
    funnelAnalysis: {
      label: "Purchase funnel",
      text: `Page views -> Add to cart: ${funnel.addToCartRate}% | Orders placed: ${sales.ordersPlaced} (${funnel.ordersPlaced}) | Visitor -> Order (tracked): ${funnel.conversionRate}%. ${funnel.cartsAbandoned} carts were abandoned (${funnel.abandonmentRate}%).${trackingGapNote}`,
    },
    insights: [
      `${funnel.addToCartRate}% of page views converted to cart additions${funnel.addToCartCount > 0 && sales.ordersPlaced === 0 ? ", but nothing was purchased" : ""} — an opportunity to follow up with abandoned carts.`,
      topViewed.length
        ? `Most-viewed products today: ${topViewed.join("; ")}.`
        : "No product views were recorded today.",
      topSold.length
        ? `Top sellers today: ${topSold.join("; ")}.`
        : "No sales recorded today.",
    ].filter(Boolean),
    bottlenecks: [],
    opportunities: [
      "Send abandoned-cart reminders (WhatsApp/email) to recover potential sales.",
      "Feature today's most-viewed products on the homepage and in offers.",
      "Reduce friction between view and purchase for top-viewed items.",
    ],
    recommendations: [
      "Review stock and pricing for top-viewed products that did not sell.",
      "Promote best-sellers in ads and social media to leverage proven demand.",
    ],
    growthStrategy:
      "Focus on converting existing traffic by improving product pages (clearer prices, offers, urgency) and recapturing abandoned carts. Then invest in acquisition channels that send high-intent shoppers to best-selling products.",
    actionPlan: [
      { day: "Day 1", action: "Send abandoned cart follow-ups for today's cart abandonments." },
      { day: "Day 2", action: "Add offers/badges on top-viewed products to lift conversion." },
      { day: "Day 3", action: "Analyze top pages and strengthen SEO/titles for those pages." },
      { day: "Day 4", action: "Run a promotion on the top-selling product and measure lift." },
      { day: "Day 5", action: "Survey visitors who added to cart but did not buy." },
    ],
  };
}

function parseLlmJson(text) {
  if (!text) return null;
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Some providers wrap partial content; try to extract the last JSON object.
    const start = cleaned.lastIndexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Ask Gemini for the narrative report. Returns parsed JSON content or null.
 */
async function generateNarrativeWithLlm(metrics) {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) return null;

  const systemPrompt = `You are a senior e-commerce growth analyst for InfantCare, an Indian online store selling baby care products (price in INR). Write an honest, data-driven daily business report.

Read the JSON metrics below carefully and return ONLY a valid JSON object (no markdown fences) with exactly these keys:
- "executiveSummary": string, 2-4 sentences for the owner.
- "trafficSummary": an object with "label" ("Traffic summary"), "text" (string), and "topPages" (array of {path, views}).
- "topViewedProducts": array of {product, views, addToCarts, analysis} for the top products people LOOKED at.
- "topPerformingProducts": array of {product, qtySold, revenue, analysis} for products that actually sold.
- "funnelAnalysis": object with "label" ("Purchase funnel"), "text" (string) explaining visitor -> product views -> add-to-cart -> checkout -> order.
- "insights": array of 2-4 short strings (facts + what they mean).
- "bottlenecks": array of 2-3 short strings naming where customers drop off (e.g. view to cart, cart to checkout, checkout to order).
- "opportunities": array of 2-3 short strings with clear opportunities, prioritized.
- "recommendations": array of 3-5 actionable, specific recommendations (include which products/channels to push).
- "growthStrategy": a paragraph (3-5 sentences) plus a short bullet list: short-term (this week) and mid-term (next month) growth plan.
- "actionPlan": array of 5 objects {day, action} — concrete actions for the next 5 business days.

Use real numbers from the metrics. If a number is 0 or a section is empty, say so honestly instead of inventing data. Keep money in INR with the ₹ symbol. Respond in the same language the owner speaks (English).

Important consistency rules (orders):
- metrics.sales.ordersPlaced = active (non-cancelled, non-returned) orders for the day.
- metrics.sales.orderValue = total INR value of those orders (including COD/pending not yet collected).
- metrics.sales.revenue = INR actually COLLECTED (paid orders only). Never mix them.
- Avg order value = orderValue / ordersPlaced.
- If metrics.traffic.trackingGapOvershoot > 0, tracking is partial: there are more orders than tracked sessions, so visitor/conversion numbers are lower bounds — say this honestly instead of reporting impossible percentages.

Use metrics.sales.orderValue as the day's business number, and mention collected (revenue) only as a secondary note. Always treat the orders/revenue numbers as the source of truth over any rates.`;

  const userPrompt = `Today's metrics (JSON):\n${JSON.stringify(metrics)}`;

  try {
    const { GoogleGenAI } = require("@google/genai");
    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const response = await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: `${systemPrompt}\n\n${userPrompt}`,
      config: {
        temperature: 0.4,
        responseMimeType: "application/json",
      },
    });

    const text = response?.text || response?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return parseLlmJson(text);
  } catch (err) {
    logger.warn(`[AiReport] Gemini call failed: ${err.message.slice(0, 160)}`);
    return null;
  }
}

/**
 * Generate + upsert a report for a date string (yyyy-mm-dd).
 * Returns { saved, report }.
 */
async function generateReportForDate(dateStr) {
  const { from, to } = getKolkataDayRange(dateStr);
  const metrics = await aggregateDay(from, to, dateStr);

  let content = null;
  let provider = "";
  let status = "generated";
  let aiError = "";

  content = await generateNarrativeWithLlm(metrics);
  if (content) {
    provider = "gemini";
  } else {
    content = buildFallbackContent(metrics);
    provider = "template";
    status = "fallback";
    aiError = "LLM unavailable — used deterministic template.";
  }

  const report = await AiDailyReport.findOneAndUpdate(
    { date: dateStr },
    {
      $set: {
        period: { from, to },
        metrics,
        content,
        provider,
        status,
        aiError,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  return { saved: !!report, date: dateStr, status, provider };
}

/**
 * Kick-off function for the end-of-day cron.
 */
async function runDailyAiReport({ onComplete } = {}) {
  const dateStr = getYesterdayDateStr();
  logger.info(`[AiReport] Generating daily report for ${dateStr}...`);
  try {
    const result = await generateReportForDate(dateStr);
    logger.info(`[AiReport] Done (${result.status} / ${result.provider})`);
    if (typeof onComplete === "function") onComplete(result);
    return result;
  } catch (err) {
    logger.error(`[AiReport] Failed: ${err.message}`);
    if (typeof onComplete === "function") onComplete({ error: err.message });
    return { error: err.message };
  }
}

/**
 * Cron: end of day IST. Env overridable via AI_DAILY_REPORT_CRON
 * (node-cron expression, server-local time). Default 23:10.
 */
function startDailyAiReportCron() {
  const cron = require("node-cron");
  const expr = process.env.AI_DAILY_REPORT_CRON || "10 23 * * *";
  logger.info(`[AiReport] Scheduling daily report cron: ${expr}`);
  cron.schedule(expr, () => {
    runDailyAiReport();
  });
  logger.info("[AiReport] Daily report cron started");
}

module.exports = {
  getKolkataDayRange,
  getYesterdayDateStr,
  aggregateDay,
  generateReportForDate,
  runDailyAiReport,
  startDailyAiReportCron,
};