const Order = require("../../models/Order");
const {
  cacheGetOrSet,
  cacheDelPattern,
  TTL,
} = require("../../utils/redisCache");
const { wantsCsv, sendReportCsv } = require("../../utils/reportCsv");

const CSV_COLUMNS = [
  { field: "name", header: "Product" },
  { field: "variantName", header: "Variant" },
  { field: "sku", header: "SKU" },
  { field: "category", header: "Category" },
  { field: "price", header: "Sold Price (INR)" },
  { field: "regularPrice", header: "MRP (INR)" },
  { field: "unitsSold", header: "Units Sold" },
  { field: "orders", header: "Orders" },
  { field: "revenue", header: "Revenue (INR)" },
  { field: "currentStock", header: "Current Stock" },
];

/**
 * Call whenever an order is placed/updated to flush report caches.
 */
exports.invalidateSalesReportCache = () =>
  cacheDelPattern("report:sales-by-product:*");

function parseDateRange(from, to) {
  const range = {};
  if (from) {
    const start = new Date(`${from}T00:00:00.000+05:30`);
    if (!Number.isNaN(start.getTime())) range.$gte = start;
  }
  if (to) {
    const end = new Date(`${to}T23:59:59.999+05:30`);
    if (!Number.isNaN(end.getTime())) range.$lte = end;
  }
  return Object.keys(range).length > 0 ? range : null;
}

/**
 * @desc    Sales by Product report (paginated, filterable, CSV source)
 * @route   GET /api/v1/admin/reports/sales-by-product
 * @access  Private/Admin
 *
 * Aggregates item-level snapshots stored on orders (sold price + quantity),
 * so historical pricing stays accurate even if a product is later deleted.
 * Each row = one product. Rows include best-effort product metadata
 * (category, current stock) resolved via lookup where the product still exists.
 */
exports.getSalesByProduct = async (req, res) => {
  try {
    const {
      period = "month",
      from,
      to,
      page = 1,
      limit = 20,
      search = "",
      sortBy = "revenue",
      sortOrder = "desc",
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    // limit=0 requests the complete filtered/sorted dataset (report CSV export)
    const exportAll = String(limit).trim() === "0";
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 20));

    // Clamp allowed sort fields
    const SORTABLE = new Set([
      "revenue",
      "unitsSold",
      "orders",
      "price",
      "name",
    ]);
    const sortKey = SORTABLE.has(sortBy) ? sortBy : "revenue";
    const order = sortOrder === "asc" ? 1 : -1;

    const customDateRange = parseDateRange(from, to);
    // Cache key covers the period/range AND the search + sort params because the
    // cached payload is the complete filtered/sorted dataset (page-independent).
    const cacheKey = [
      customDateRange
        ? `report:sales-by-product:custom:${from || "start"}:${to || "end"}`
        : `report:sales-by-product:${period}`,
      `q:${String(search || "").toLowerCase()}`,
      `s:${sortKey}:${order}`,
    ].join(":");

    const cached = await cacheGetOrSet(cacheKey, TTL.DASHBOARD, async () => {
      // Resolve period -> date match (mirrors dashboardController semantics)
      const now = new Date();
      const kolkataDateStr = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
      }).format(now);
      const todayStart = new Date(`${kolkataDateStr}T00:00:00.000+05:30`);

      let dateMatch = {};
      if (customDateRange) {
        dateMatch = { createdAt: customDateRange };
      } else if (period !== "all") {
        let start = new Date(todayStart);
        const days = { today: 1, yesterday: 1, week: 7, month: 30, year: 365 }[period] ?? 7;
        if (period === "yesterday") {
          start = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
          dateMatch = { createdAt: { $gte: start, $lt: todayStart } };
        } else if (period === "today") {
          dateMatch = { createdAt: { $gte: start } };
        } else {
          start = new Date(todayStart.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
          dateMatch = { createdAt: { $gte: start } };
        }
      }

      // Sales exclude cancelled/returned and only count paid revenue.
      const match = {
        orderStatus: { $nin: ["cancelled", "returned"] },
        paymentStatus: "paid",
        ...dateMatch,
      };

      // Group item snapshots by product + variant so each variant is a row.
      const grouped = await Order.aggregate([
        { $match: match },
        { $unwind: "$items" },
        {
          $group: {
            _id: {
              productId: "$items.productId",
              variantId: "$items.variantId",
              sku: {
                $ifNull: ["$items.variantSku", "$items.sku"],
              },
            },
            name: { $first: "$items.name" },
            variantName: { $first: "$items.variantName" },
            price: { $first: "$items.price" },
            regularPrice: { $first: "$items.regularPrice" },
            image: { $first: "$items.image" },
            urlKey: { $first: "$items.urlKey" },
            unitsSold: { $sum: "$items.quantity" },
            revenue: {
              $sum: { $multiply: ["$items.price", "$items.quantity"] },
            },
            orders: { $addToSet: "$_id" },
          },
        },
        {
          $project: {
            _id: 1,
            name: 1,
            variantName: 1,
            image: 1,
            urlKey: 1,
            price: 1,
            regularPrice: 1,
            unitsSold: 1,
            revenue: 1,
            orders: { $size: "$orders" },
          },
        },
      ]);

      // Attach best-effort live product metadata (category + current stock).
      const productIds = [
        ...new Set(
          grouped
            .filter((r) => r._id?.productId)
            .map((r) => String(r._id.productId)),
        ),
      ];

      const products = await require("../../models/Product")
        .find({ _id: { $in: productIds } })
        .select("name title sku images url_key categoryName stock stockObj variants.stock")
        .lean();

      const productMeta = new Map(
        products.map((p) => [
          String(p._id),
          {
            name: p.name || p.title || null,
            sku: p.sku || null,
            image: p.images?.[0] || null,
            urlKey: p.url_key || null,
            categoryName: p.categoryName || null,
            currentStock:
              p.stockObj?.available ??
              p.stock ??
              (Array.isArray(p.variants)
                ? p.variants.reduce(
                    (sum, v) => sum + (Number(v.stock) || 0),
                    0,
                  )
                : 0),
          },
        ]),
      );

      let rows = grouped.map((r) => {
        const meta = productMeta.get(String(r._id?.productId || "")) || {};
        const variantLabel = r.variantName && r.variantName !== r.name ? r.variantName : "";
        return {
          productId: r._id?.productId ? String(r._id.productId) : null,
          variantId: r._id?.variantId ? String(r._id.variantId) : null,
          name: r.name || meta.name || "Unknown Product",
          variantName: variantLabel,
          sku: r._id?.sku || meta.sku || "",
          image: r.image || meta.image || null,
          urlKey: r.urlKey || meta.urlKey || null,
          category: meta.categoryName || "Uncategorized",
          currentStock: meta.currentStock ?? 0,
          price: Number(r.price) || 0,
          regularPrice: Number(r.regularPrice) || 0,
          unitsSold: r.unitsSold || 0,
          revenue: Number(r.revenue) || 0,
          orders: r.orders || 0,
        };
      });

      // Client-side search across name/variant/sku/category
      if (search) {
        const q = search.toLowerCase();
        rows = rows.filter(
          (r) =>
            r.name.toLowerCase().includes(q) ||
            r.variantName.toLowerCase().includes(q) ||
            r.sku.toLowerCase().includes(q) ||
            r.category.toLowerCase().includes(q),
        );
      }

      // Sort
      const multiplier = order;
      const sortFn = {
        name: (a, b) => a.name.localeCompare(b.name) * multiplier,
        price: (a, b) => (a.price - b.price) * multiplier,
        unitsSold: (a, b) => (a.unitsSold - b.unitsSold) * multiplier,
        orders: (a, b) => (a.orders - b.orders) * multiplier,
        revenue: (a, b) => (a.revenue - b.revenue) * multiplier,
      };
      rows.sort(sortFn[sortKey]);

      const summary = rows.reduce(
        (acc, r) => {
          acc.revenue += r.revenue;
          acc.unitsSold += r.unitsSold;
          acc.orders += r.orders;
          return acc;
        },
        { revenue: 0, unitsSold: 0, orders: 0, variants: rows.length },
      );

      return { rows, total: rows.length, summary };
    });

    // Slice the full filtered/sorted dataset for the requested page AFTER the
    // cache read, so page 2 / export (limit=0) never hit a stale cached page-1 payload.
    const totalPages = exportAll ? 1 : Math.ceil(cached.total / limitNum) || 1;
    const startIdx = (pageNum - 1) * limitNum;
    const paginatedRows = exportAll
      ? cached.rows
      : cached.rows.slice(startIdx, startIdx + limitNum);

    if (wantsCsv(req)) {
      return sendReportCsv(
        res,
        paginatedRows,
        CSV_COLUMNS,
        req.query.filename ||
          `sales-by-product-${from || period}-${new Date().toISOString().slice(0, 10)}`,
      );
    }

    res.status(200).json({
      success: true,
      rows: paginatedRows,
      summary: cached.summary,
      pagination: {
        page: pageNum,
        limit: exportAll ? 0 : limitNum,
        total: cached.total,
        totalPages,
      },
    });
  } catch (error) {
    const logger = require("../../utils/logger");
    logger.error("Sales by product report error", { message: error.message });
    res.status(500).json({
      success: false,
      message: "Server Error: Unable to fetch sales by product report",
    });
  }
};
