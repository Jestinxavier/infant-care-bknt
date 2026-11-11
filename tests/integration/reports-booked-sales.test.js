// Reports share one definition of a sale ("booked", utils/revenueExpr):
// paid orders plus COD awaiting collection, never cancelled/returned, never
// unpaid online checkouts. Each test uses its own far-past day and a custom
// range so cached report results from other tests can't leak in.
const mongoose = require("mongoose");
const Order = require("../../src/models/Order");
const { getRevenueOverTime } = require("../../src/controllers/admin/revenueReportController");
const { getSalesByProduct } = require("../../src/controllers/admin/salesReportController");
const { getReturnsCancellations } = require("../../src/controllers/admin/returnsCancellationsController");
const { getOrdersByStatus } = require("../../src/controllers/admin/ordersByStatusController");
const { getPaymentMethodSplit } = require("../../src/controllers/admin/paymentMethodSplitController");
const { getCustomersReport } = require("../../src/controllers/admin/customerReportController");
const { getOrderStatusCounts } = require("../../src/controllers/admin/adminOrdersController");

let seedId = 0;

function callCtrl(handler, query, user) {
  const req = { query, method: "GET", user };
  const res = {
    status() {
      return res;
    },
    json(obj) {
      res._body = obj;
    },
  };
  return handler(req, res).then(() => res._body);
}

// YYYY-MM-DD in IST, N days ago
function ymdDaysAgo(days) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
    new Date(Date.now() - days * 86400000),
  );
}
const at = (ymd, hhmm = "12:00") => new Date(`${ymd}T${hhmm}:00+05:30`);

async function seed(o) {
  await Order.create({
    userId: o.userId || new mongoose.Types.ObjectId(),
    orderId: `RBS-${Date.now()}-${seedId++}`,
    items: o.items || [],
    totalAmount: o.totalAmount,
    totalQuantity: o.totalQuantity ?? 1,
    subtotal: o.totalAmount,
    paymentStatus: o.paymentStatus,
    paymentMethod: o.paymentMethod,
    orderStatus: o.orderStatus ?? "delivered",
    placedAt: o.createdAt,
    createdAt: o.createdAt,
  });
}

const item = (quantity, price) => ({
  productId: new mongoose.Types.ObjectId(),
  name: "Sleep Suit",
  quantity,
  price,
});

describe("Reports — booked sales", () => {
  it("revenue over time: booked + collected, IST buckets, zero periods, hourly single day, aligned previous period", async () => {
    const d = ymdDaysAgo(520);
    const dMinus1 = ymdDaysAgo(521);
    const dMinus2 = ymdDaysAgo(522);
    // 01:00 IST is the previous day in UTC — must still land on `d`
    await seed({ totalAmount: 200, paymentStatus: "paid", paymentMethod: "PHONEPE", createdAt: at(d, "01:00") });
    await seed({ totalAmount: 100, paymentStatus: "pending", paymentMethod: "COD", createdAt: at(d, "15:00") });
    // Not sales
    await seed({ totalAmount: 900, paymentStatus: "failed", paymentMethod: "PHONEPE", orderStatus: "cancelled", createdAt: at(d) });
    await seed({ totalAmount: 900, paymentStatus: "pending", paymentMethod: "RAZORPAY", orderStatus: "pending", createdAt: at(d) });
    // The day before (previous period of the single-day range)
    await seed({ totalAmount: 150, paymentStatus: "paid", paymentMethod: "PHONEPE", createdAt: at(dMinus1) });

    // A single day is charted by hour (24 buckets for a past day)
    const single = await callCtrl(getRevenueOverTime, { from: d, to: d });
    expect(single.granularity).toBe("hour");
    expect(single.series).toHaveLength(24);
    // 01:00 IST is the previous day in UTC: must land in d's 1 AM bucket
    expect(single.series[1]).toMatchObject({ key: `${d}T01:00`, total: 200, collected: 200, orders: 1 });
    expect(single.series[15]).toMatchObject({ key: `${d}T15:00`, total: 100, codPending: 100, orders: 1 });
    expect(single.summary).toMatchObject({ revenue: 300, collected: 200, codPending: 100, orders: 2 });
    // Previous day, same hour: paired with d's bucket, real time in prevKey
    expect(single.previousPeriod[12]).toMatchObject({
      key: `${d}T12:00`,
      prevKey: `${dMinus1}T12:00`,
      total: 150,
    });
    expect(single.previousPeriodSummary.revenue).toBe(150);

    const threeDays = await callCtrl(getRevenueOverTime, { from: dMinus2, to: d });
    expect(threeDays.granularity).toBe("day");
    // Empty days are present as zero buckets
    expect(threeDays.series.map((s) => s.key)).toEqual([dMinus2, dMinus1, d]);
    expect(threeDays.series.map((s) => s.total)).toEqual([0, 150, 300]);
  });

  it("sales by product counts booked orders only", async () => {
    const d = ymdDaysAgo(540);
    // Two different products in one order: still one order in the summary
    await seed({ totalAmount: 200, totalQuantity: 2, paymentStatus: "paid", paymentMethod: "PHONEPE", items: [item(1, 100), item(1, 100)], createdAt: at(d) });
    await seed({ totalAmount: 50, paymentStatus: "pending", paymentMethod: "COD", items: [item(1, 50)], createdAt: at(d) });
    await seed({ totalAmount: 50, totalQuantity: 5, paymentStatus: "failed", paymentMethod: "PHONEPE", orderStatus: "cancelled", items: [item(5, 10)], createdAt: at(d) });

    const body = await callCtrl(getSalesByProduct, { from: d, to: d });
    expect(body.summary.revenue).toBe(250);
    expect(body.summary.unitsSold).toBe(3);
    expect(body.summary.orders).toBe(2); // summing rows used to give 3
    expect(body.rows.every((r) => !("_orderIds" in r))).toBe(true);
  });

  it("returns & cancellations: abandoned payments are separate from cancellations", async () => {
    const d = ymdDaysAgo(500);
    await seed({ totalAmount: 100, paymentStatus: "pending", paymentMethod: "COD", orderStatus: "cancelled", createdAt: at(d) });
    await seed({ totalAmount: 200, paymentStatus: "paid", paymentMethod: "PHONEPE", orderStatus: "cancelled", createdAt: at(d) });
    await seed({ totalAmount: 300, paymentStatus: "pending", paymentMethod: "COD", orderStatus: "delivered", createdAt: at(d) });
    // Abandoned online checkouts (one already auto-cancelled by the reconciler)
    await seed({ totalAmount: 400, paymentStatus: "failed", paymentMethod: "PHONEPE", orderStatus: "cancelled", createdAt: at(d) });
    await seed({ totalAmount: 500, paymentStatus: "pending", paymentMethod: "RAZORPAY", orderStatus: "pending", createdAt: at(d) });

    const rc = await callCtrl(getReturnsCancellations, { from: d, to: d });
    expect(rc.cancelled.count).toBe(2);
    expect(rc.totals.orders).toBe(3);
    expect(rc.totals.rate).toBeCloseTo((2 / 3) * 100, 5);
    expect(rc.unpaidOnline).toEqual({ count: 2, gross: 900 });
    // Single day: hourly trend with every hour listed
    expect(rc.granularity).toBe("hour");
    expect(rc.trendKeys).toHaveLength(24);
    expect(rc.trend.every((t) => t.key === `${d}T12:00`)).toBe(true);
  });

  it("orders by status and payment split report booked value and real collection rate", async () => {
    const d = ymdDaysAgo(580);
    await seed({ totalAmount: 200, paymentStatus: "paid", paymentMethod: "PHONEPE", createdAt: at(d) });
    await seed({ totalAmount: 300, paymentStatus: "pending", paymentMethod: "COD", orderStatus: "shipped", createdAt: at(d) });
    await seed({ totalAmount: 1000, paymentStatus: "pending", paymentMethod: "RAZORPAY", orderStatus: "pending", createdAt: at(d) });
    await seed({ totalAmount: 1000, paymentStatus: "paid", paymentMethod: "COD", orderStatus: "returned", createdAt: at(d) });

    const obs = await callCtrl(getOrdersByStatus, { from: d, to: d });
    expect(obs.totals.orders).toBe(4);
    expect(obs.totals.bookedOrders).toBe(2);
    expect(obs.totals.bookedValue).toBe(500);
    expect(obs.totals.unpaidOnline).toEqual({ count: 1, total: 1000 });
    const pending = obs.statusStats.find((s) => s.status === "pending");
    expect(pending).toMatchObject({ count: 1, bookedValue: 0, unpaidOnline: 1 });

    const split = await callCtrl(getPaymentMethodSplit, { from: d, to: d });
    expect(split.totals.bookedValue).toBe(500);
    expect(split.totals.collectedTotal).toBe(200); // COD 300 not collected yet
    expect(split.totals.collectionRate).toBeCloseTo(40, 5);
  });

  it("payment split groups lowercase method names with their method", async () => {
    const d = ymdDaysAgo(600);
    // The PhonePe failure path writes "phonepe"; bypass enum validation like it does
    await Order.collection.insertOne({
      orderId: `RBS-LC-${seedId++}`,
      items: [],
      totalAmount: 70,
      totalQuantity: 1,
      subtotal: 70,
      paymentStatus: "failed",
      paymentMethod: "phonepe",
      orderStatus: "cancelled",
      createdAt: at(d),
    });
    const split = await callCtrl(getPaymentMethodSplit, { from: d, to: d });
    const phonepe = split.splits.find((s) => s.method === "PHONEPE");
    expect(phonepe.count).toBe(1);
    expect(split.totals.orders).toBe(1);
  });

  it("customers: spend and order counts both use booked orders", async () => {
    const d = ymdDaysAgo(620);
    const User = mongoose.model("User");
    const user = await User.create({
      firstName: "Booked",
      lastName: "Buyer",
      username: "booked_buyer",
      email: "booked-buyer@example.com",
      password: "hashed",
      role: "user",
    });
    await seed({ userId: user._id, totalAmount: 200, paymentStatus: "paid", paymentMethod: "PHONEPE", createdAt: at(d, "10:00") });
    // A failed payment retry the same day: not an order, not "returning"
    await seed({ userId: user._id, totalAmount: 300, paymentStatus: "failed", paymentMethod: "PHONEPE", orderStatus: "pending", createdAt: at(d, "09:00") });

    const body = await callCtrl(getCustomersReport, { from: d, to: d, search: "booked-buyer" });
    const row = body.rows.find((r) => r.id === String(user._id));
    expect(row).toMatchObject({ orderCount: 1, lifetimeOrders: 1, totalSpent: 200, avgOrderValue: 200, customerType: "new" });
  });

  it("orders page status counts expose booked amount and unpaid online checkouts", async () => {
    const d = ymdDaysAgo(560);
    await seed({ totalAmount: 300, paymentStatus: "pending", paymentMethod: "PHONEPE", orderStatus: "pending", createdAt: at(d) });
    await seed({ totalAmount: 100, paymentStatus: "pending", paymentMethod: "COD", orderStatus: "pending", createdAt: at(d) });
    await seed({ totalAmount: 200, paymentStatus: "paid", paymentMethod: "RAZORPAY", orderStatus: "confirmed", createdAt: at(d) });

    const body = await callCtrl(getOrderStatusCounts, { from: d, to: d }, { role: "superadmin" });
    const pending = body.counts.find((c) => c.status === "pending");
    expect(pending).toMatchObject({ count: 2, amount: 400, bookedAmount: 100, unpaidOnlineCount: 1, unpaidOnlineAmount: 300 });
    expect(body.bookedAmount).toBe(300);
    expect(body.unpaidOnlineCount).toBe(1);
  });
});
