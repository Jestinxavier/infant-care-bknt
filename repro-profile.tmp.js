const path = require("path");
const backend = process.cwd();
require(path.join(backend, "node_modules/dotenv")).config({ path: path.join(backend, ".env") });
process.env.NODE_ENV = "development";
const mongoose = require(path.join(backend, "node_modules/mongoose"));
const Order = require(path.join(backend, "src/models/Order"));
const Product = require(path.join(backend, "src/models/Product"));

const period = process.argv[2] || "year";

(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  console.log("connected period=", period);

  const now = new Date();
  const kolkataDateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
  const todayStart = new Date(`${kolkataDateStr}T00:00:00.000+05:30`);
  let startDate = new Date();
  let isAllTime = false;
  let daysCount = 365;
  const endDateTime = null;
  if (period === "all") { isAllTime = true; }
  else if (period === "year") { startDate.setTime(todayStart.getTime() - 364 * 24 * 60 * 60 * 1000); }
  else { daysCount = 30; startDate.setTime(todayStart.getTime() - 29 * 24 * 60 * 60 * 1000); }

  const dateMatch = isAllTime ? {} : { createdAt: { $gte: startDate } };
  const salesMatch = { orderStatus: { $nin: ["cancelled", "returned"] }, paymentStatus: "paid", ...dateMatch };

  const timeIt = async (label, fn) => { const t = Date.now(); const r = await fn(); console.log(label, Date.now() - t, "ms"); return r; };

  await timeIt("countDocuments", () => Order.countDocuments(salesMatch));

  await timeIt("salesOverTime", () => Order.aggregate([
    { $match: salesMatch },
    { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "Asia/Kolkata" } }, total: { $sum: "$totalAmount" }, orders: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]));

  await timeIt("monthlySummary", () => Order.aggregate([
    { $match: salesMatch },
    { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$createdAt", timezone: "Asia/Kolkata" } }, revenue: { $sum: "$totalAmount" }, grossProfit: { $sum: "$totalAmount" }, orders: { $sum: 1 }, items: { $sum: "$totalQuantity" } } },
    { $sort: { _id: 1 } },
  ]));

  await timeIt("categorySales-lookup", () => Order.aggregate([
    { $match: salesMatch },
    { $unwind: "$items" },
    { $lookup: {
      from: "products",
      let: { pid: "$items.productId" },
      pipeline: [{ $match: { $expr: { $or: [
        { $eq: ["$_id", { $cond: [{ $regexMatch: { input: { $toString: "$$pid" }, regex: /^[0-9a-fA-F]{24}$/ } }, { $toObjectId: "$$pid" }, "$$pid"] }] },
        { $eq: ["$url_key", "$$pid"] },
        { $in: ["$$pid", { $ifNull: ["$variants.id", []] }] },
      ] } } }],
      as: "product",
    } },
    { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
    { $addFields: { categoryIdObj: { $cond: { if: { $and: [
      { $gt: ["$product.category", null] }, { $ne: ["$product.category", ""] },
      { $regexMatch: { input: { $toString: "$product.category" }, regex: /^[0-9a-fA-F]{24}$/ } },
    ] }, then: { $toObjectId: "$product.category" }, else: null } } } },
    { $lookup: { from: "categories", localField: "categoryIdObj", foreignField: "_id", as: "categoryDoc" } },
    { $unwind: { path: "$categoryDoc", preserveNullAndEmptyArrays: true } },
    { $group: { _id: { $ifNull: ["$categoryDoc.name", { $ifNull: ["$product.categoryName", "Uncategorized"] }] }, value: { $sum: { $multiply: ["$items.price", "$items.quantity"] } }, count: { $sum: "$items.quantity" } } },
    { $sort: { value: -1 } },
  ]));

  await timeIt("Product.find all", () => Product.find({}, { product_type: 1, stock: 1, stockObj: 1, variants: { stock: 1, stockObj: 1 } }).lean());
  await timeIt("recentOrders", () => Order.find({ orderStatus: { $ne: "cancelled" }, ...dateMatch }).sort({ createdAt: -1 }).limit(5).populate("userId", "username email"));
  await timeIt("orderStatusDist", () => Order.aggregate([{ $match: { orderStatus: { $ne: "cancelled" }, ...dateMatch } }, { $group: { _id: "$orderStatus", count: { $sum: 1 } } }]));

  console.log("distinct productIds in matched orders:");
  await timeIt("distinctItems", () => Order.aggregate([{ $match: salesMatch }, { $unwind: "$items" }, { $group: { _id: "$items.productId" } }]));

  await mongoose.disconnect();
  process.exit(0);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
