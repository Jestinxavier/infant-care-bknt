const mongoose = require("mongoose");
const Order = require("../../src/models/Order");
const {
  getRevenueOverTime,
} = require("../../src/controllers/admin/revenueReportController");
const {
  getOrdersByStatus,
} = require("../../src/controllers/admin/ordersByStatusController");
const {
  getReturnsCancellations,
} = require("../../src/controllers/admin/returnsCancellationsController");
const {
  getPaymentMethodSplit,
} = require("../../src/controllers/admin/paymentMethodSplitController");
const {
  getCustomersReport,
} = require("../../src/controllers/admin/customerReportController");

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

// Seed an order at an explicit Date (createdAt + placedAt)
async function seed(order) {
  const created = order.createdAt;
  await Order.create({
    userId: new mongoose.Types.ObjectId(),
    orderId: `SEED-${Date.now()}-${seedId++}`,
    items: [],
    totalAmount: order.totalAmount,
    totalQuantity: 1,
    subtotal: order.totalAmount,
    paymentStatus: order.paymentStatus ?? "pending",
    paymentMethod: order.paymentMethod ?? "PHONEPE",
    orderStatus: order.orderStatus ?? "delivered",
    placedAt: created,
    createdAt: created,
  });
}

// Return a Date for "N days ago in Kolkata" at a given local time so period
// boundaries (which are Kolkata-local) are predictable.
function kolkataDaysAgo(days, hour = 12) {
  const kolkataNow = new Date(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kolkata",
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    }).format(new Date()),
  );
  const localBase = new Date(kolkataNow.getTime() - days * 86400000);
  localBase.setHours(hour, 0, 0, 0);
  return localBase;
}

// Mirror the controller's "<kolkata-date> days ago" YYYY-MM-DD string (en-CA,
// Kolkata timezone), so custom-range from/to align with the backend boundary.
function kolkataDateDaysAgo(days) {
  const now = Date.now() - days * 86400000;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
  }).format(new Date(now));
}

describe("Report controllers — date-range correctness", () => {
  it("returns correct totals across presets and custom range", async () => {
    const today = kolkataDaysAgo(0, 12);
    const yesterday = kolkataDaysAgo(1, 12);
    const threeDaysAgo = kolkataDaysAgo(3, 12);
    const tenDaysAgo = kolkataDaysAgo(10, 12);
    const fortyDaysAgo = kolkataDaysAgo(40, 12);

    // Spread seeded orders so each bracket has distinct volume:
    // today: 2 orders (1 paid PHONEPE 200, 1 pending COD 100)
    // yesterday: 1 order (paid RAZORPAY 300)
    // 3d ago: 1 order (cancelled PHONEPE 50)
    // 10d ago: 1 order (pending COD 400, delivered)
    // 40d ago: 1 order (returned COD 60)
    await seed({ totalAmount: 200, paymentStatus: "paid", paymentMethod: "PHONEPE", orderStatus: "delivered", createdAt: today });
    await seed({ totalAmount: 100, paymentStatus: "pending", paymentMethod: "COD", orderStatus: "delivered", createdAt: today });
    await seed({ totalAmount: 300, paymentStatus: "paid", paymentMethod: "RAZORPAY", orderStatus: "delivered", createdAt: yesterday });
    await seed({ totalAmount: 50, paymentStatus: "paid", paymentMethod: "PHONEPE", orderStatus: "cancelled", createdAt: threeDaysAgo });
    await seed({ totalAmount: 400, paymentStatus: "pending", paymentMethod: "COD", orderStatus: "delivered", createdAt: tenDaysAgo });
    await seed({ totalAmount: 60, paymentStatus: "pending", paymentMethod: "COD", orderStatus: "returned", createdAt: fortyDaysAgo });

    //
    // 1. Revenue over time
    //
    {
      const all = await callCtrl(getRevenueOverTime, { period: "all" });
      expect(all.success).toBe(true);
      // Revenue counts paid online OR all COD (not cancelled/returned).
      // Paid PHONEPE 200 + COD 100 (today, delivered) + RAZORPAY 300 (yesterday)
      // + COD 400 (10d, delivered) + COD 60 (40d, RETURNED -> excluded) + cancelled 50 (excluded)
      // = 200 + 100 + 300 + 400 = 1000
      const seriesTotal = all.series.reduce((a, s) => a + (s.total || 0), 0);
      expect(seriesTotal).toBe(1000);
      expect(all.summary.revenue).toBe(1000);
      expect(all.summary.orders).toBe(4);
      // COD pending (COD & not paid & not excl): today COD 100 + 10d COD 400 = 500
      expect(all.summary.codPending).toBe(500);

      const todayRes = await callCtrl(getRevenueOverTime, { period: "today" });
      expect(todayRes.summary.revenue).toBe(300); // 200 paid + 100 COD (delivered)
      expect(todayRes.summary.orders).toBe(2);

      const yesterdayRes = await callCtrl(getRevenueOverTime, { period: "yesterday" });
      expect(yesterdayRes.summary.revenue).toBe(300); // RAZORPAY paid 300
      expect(yesterdayRes.summary.orders).toBe(1);

      const weekRes = await callCtrl(getRevenueOverTime, { period: "week" });
      // Revenue in transactions up to 7 days ago: today(200+100) + yesterday(300) + 3d(cancelled excl) + 10d COD 400
      // week window is last 7 days (>= 6 days ago) -> includes today, yesterday, 3d, 10d? 
      // 7-day window from todayStart: start = todayStart - 6 days. 10d ago is outside. So 200+100+300 = 600
      expect(weekRes.summary.revenue).toBe(600);

      const custom = await callCtrl(getRevenueOverTime, {
        period: "custom",
        from: kolkataDateDaysAgo(0),
        to: kolkataDateDaysAgo(0),
      });
      // custom range = exactly today (Kolkata) -> same as "today": 300 revenue, 2 orders
      expect(custom.success).toBe(true);
      expect(custom.summary.revenue).toBe(300);
      expect(custom.summary.orders).toBe(2);
    }

    //
    // 2. Orders by status
    //
    {
      const byStatus = await callCtrl(getOrdersByStatus, { period: "all" });
      expect(byStatus.success).toBe(true);
      const cancelled = byStatus.statusStats.find((s) => s.status === "cancelled");
      const returned = byStatus.statusStats.find((s) => s.status === "returned");
      expect(cancelled.count).toBe(1);
      expect(returned.count).toBe(1);
      const delivered = byStatus.statusStats.find((s) => s.status === "delivered");
      expect(delivered.count).toBe(4); // today x2, yesterday, 10d
      expect(byStatus.totals.orders).toBe(6);
      const codRow = byStatus.paymentStats.find((p) => p.method === "COD");
      // COD orders: today(100, not cancelled), 10d(400), 40d(60, returned) => total includes all 3
      expect(codRow.count).toBe(3);
      expect(codRow.total).toBe(560);
      // codPending: COD & not paid & not cancelled/returned = today(100) + 10d(400) = 500
      expect(byStatus.codPending.total).toBe(500);
    }

    //
    // 3. Returns & cancellations
    //
    {
      const rc = await callCtrl(getReturnsCancellations, { period: "all" });
      expect(rc.success).toBe(true);
      expect(rc.cancelled.count).toBe(1);
      expect(rc.returned.count).toBe(1);
      expect(rc.totals.orders).toBe(6);
      expect(rc.totals.rate).toBeCloseTo((2 / 6) * 100, 1);
    }

    //
    // 4. Payment method split
    //
    {
      const split = await callCtrl(getPaymentMethodSplit, { period: "all" });
      expect(split.success).toBe(true);
      const cod = split.splits.find((s) => s.method === "COD");
      const phonep = split.splits.find((s) => s.method === "PHONEPE");
      // COD count = 3 (today pending, 10d pending, 40d returned). paid online only PHONEPE 200 (cancelled 50 excluded from paid? no, it's paid so counts).
      expect(cod.count).toBe(3);
      // collectionRate: collected = paidOnline(after fix: PHONEPE 200 + cancelled 50 + RAZORPAY 300) + codCollected(valid COD not cancelled/ret = today+10d = 2)
      // paidOnline = PHONEPE paidCount(2) + RAZORPAY paidCount(1) = 3; codCollected=2; total orders=6 -> rate=(3+2)/6=83.3%
      expect(split.totals.orders).toBe(6);
      expect(split.totals.collectionRate).toBeGreaterThan(70);
      expect(split.totals.collectionRate).toBeLessThan(90);
    }

    //
    // 5. Customers report (aggregation $not/$in path)
    //
    {
      const UserModel = mongoose.model("User");
      const user = await UserModel.create({
        firstName: "Test",
        lastName: "User",
        username: "test_customer",
        email: "customer@example.com",
        password: "hashed",
        role: "user",
      });
      await UserModel.create({
        firstName: "Admin",
        lastName: "One",
        username: "admin_one",
        email: "admin@example.com",
        password: "hashed",
        role: "admin",
      });

      // Linked orders: paid PHONEPE 200 (delivered, today) + cancelled PHONEPE 50 (today)
      await Order.create({
        userId: user._id,
        orderId: `SEED-CUST-${seedId++}`,
        items: [],
        totalAmount: 200,
        totalQuantity: 1,
        subtotal: 200,
        paymentStatus: "paid",
        paymentMethod: "PHONEPE",
        orderStatus: "delivered",
        placedAt: today,
        createdAt: today,
      });
      await Order.create({
        userId: user._id,
        orderId: `SEED-CUST-${seedId++}`,
        items: [],
        totalAmount: 50,
        totalQuantity: 1,
        subtotal: 50,
        paymentStatus: "paid",
        paymentMethod: "PHONEPE",
        orderStatus: "cancelled",
        placedAt: today,
        createdAt: today,
      });

      const cust = await callCtrl(getCustomersReport, {
        period: "all",
        page: "1",
        limit: "10",
        sortKey: "lifetimeSpent",
        order: "desc",
        search: "",
      });
      expect(cust.success).toBe(true);
      // lifetimeSpent counts paid online (regardless of status) + valid COD.
      // User has paid PHONEPE 200 (delivered) + PHONEPE 50 (cancelled -> still paid) = 250.
      const row = cust.rows.find((r) => r.id === String(user._id));
      expect(row).toBeDefined();
      expect(row.lifetimeSpent).toBe(250);
      expect(row.lifetimeOrders).toBe(2);
      expect(cust.summary.customerCount ?? cust.summary.customers).toBe(1);
    }
  });
});