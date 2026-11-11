const mongoose = require("mongoose");
const Order = require("../../src/models/Order");
const {
  getDashboardStats,
  invalidateDashboardCache,
} = require("../../src/controllers/admin/dashboardController");

let seedId = 0;

function callCtrl(handler, query) {
  const req = { query };
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

async function seed(order) {
  await Order.create({
    userId: new mongoose.Types.ObjectId(),
    orderId: `BOOKED-${Date.now()}-${seedId++}`,
    items: [],
    totalAmount: order.totalAmount,
    totalQuantity: 1,
    subtotal: order.totalAmount,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    orderStatus: order.orderStatus ?? "delivered",
    placedAt: order.createdAt,
    createdAt: order.createdAt,
  });
}

// 06:30 IST N days ago, so the order stays inside that Kolkata day.
function kolkataDaysAgo(days) {
  const d = new Date(Date.now() - days * 86400000);
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
  return new Date(`${ymd}T06:30:00+05:30`);
}

describe("Dashboard stats — booked sales", () => {
  beforeEach(async () => {
    await invalidateDashboardCache();
  });

  it("counts paid orders and uncollected COD, excludes unpaid online and cancelled/returned", async () => {
    const d = kolkataDaysAgo(2);
    // Booked:
    await seed({ totalAmount: 200, paymentStatus: "paid", paymentMethod: "PHONEPE", createdAt: d });
    await seed({ totalAmount: 300, paymentStatus: "paid", paymentMethod: "COD", createdAt: d });
    await seed({ totalAmount: 400, paymentStatus: "pending", paymentMethod: "COD", orderStatus: "shipped", createdAt: d });
    // Not booked:
    await seed({ totalAmount: 1000, paymentStatus: "pending", paymentMethod: "RAZORPAY", orderStatus: "pending", createdAt: d });
    await seed({ totalAmount: 1000, paymentStatus: "failed", paymentMethod: "PHONEPE", orderStatus: "pending", createdAt: d });
    await seed({ totalAmount: 1000, paymentStatus: "pending", paymentMethod: "COD", orderStatus: "cancelled", createdAt: d });
    await seed({ totalAmount: 1000, paymentStatus: "paid", paymentMethod: "PHONEPE", orderStatus: "returned", createdAt: d });

    const body = await callCtrl(getDashboardStats, { period: "week" });
    expect(body.success).toBe(true);
    expect(body.totalRevenue).toBe(900);
    expect(body.collectedRevenue).toBe(500);
    expect(body.newOrders).toBe(3);
    expect(body.codPendingRevenue).toBe(400);
    expect(body.salesOverTime.reduce((s, x) => s + x.total, 0)).toBe(900);
  });

  it("returns hourly buckets for a single-day range", async () => {
    const day = kolkataDaysAgo(3); // 06:30 IST
    const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(day);
    const at = (hhmm) => new Date(`${ymd}T${hhmm}:00+05:30`);
    await seed({ totalAmount: 100, paymentStatus: "paid", paymentMethod: "PHONEPE", createdAt: at("09:10") });
    await seed({ totalAmount: 250, paymentStatus: "pending", paymentMethod: "COD", createdAt: at("09:45") });
    await seed({ totalAmount: 400, paymentStatus: "paid", paymentMethod: "RAZORPAY", createdAt: at("21:05") });
    // Previous day, same hour
    await seed({
      totalAmount: 80,
      paymentStatus: "paid",
      paymentMethod: "PHONEPE",
      createdAt: new Date(at("09:30").getTime() - 86400000),
    });

    const body = await callCtrl(getDashboardStats, { from: ymd, to: ymd });
    expect(body.granularity).toBe("hour");
    expect(body.salesOverTime).toHaveLength(24);
    expect(body.salesOverTime[9]).toMatchObject({ name: "9 AM", total: 350, orders: 2 });
    expect(body.salesOverTime[21]).toMatchObject({ name: "9 PM", total: 400, orders: 1 });
    expect(body.previousPeriodSales[9].total).toBe(80);
    expect(body.codPendingOverTime[9].total).toBe(250);
    expect(body.totalRevenue).toBe(750);
  });

  it("keeps daily buckets for multi-day ranges", async () => {
    const body = await callCtrl(getDashboardStats, { period: "week" });
    expect(body.granularity).toBe("day");
    expect(body.salesOverTime).toHaveLength(7);
  });

  it("compares booked sales against the previous period", async () => {
    // Previous 7-day window: one uncollected COD order (would be 0 under paid-only)
    await seed({ totalAmount: 500, paymentStatus: "pending", paymentMethod: "COD", createdAt: kolkataDaysAgo(9) });
    // Current window
    await seed({ totalAmount: 1000, paymentStatus: "paid", paymentMethod: "PHONEPE", createdAt: kolkataDaysAgo(1) });

    const body = await callCtrl(getDashboardStats, { period: "week" });
    expect(body.trends.revenue.trend).toBe("+100.0%");
    expect(body.previousPeriodSales.reduce((s, x) => s + x.total, 0)).toBe(500);
  });
});
