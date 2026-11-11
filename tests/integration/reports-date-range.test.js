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
    refundedAmountPaise: order.refundedAmountPaise,
    placedAt: created,
    createdAt: created,
  });
}

// Return a Date for "N days ago in Kolkata" at a given local time so period
// boundaries (which are Kolkata-local) are predictable. Hour 1 (UTC) maps to
// 06:30 IST, keeping "today's" seeds inside the Kolkata day while still being
// safely in the past for runs at any practical time of day.
function kolkataDaysAgo(days, hour = 1) {
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
    const today = kolkataDaysAgo(0, 1);
    const yesterday = kolkataDaysAgo(1, 1);
    const threeDaysAgo = kolkataDaysAgo(3, 1);
    const tenDaysAgo = kolkataDaysAgo(10, 1);
    const fortyDaysAgo = kolkataDaysAgo(40, 1);

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
      // Revenue = booked sales (utils/revenueExpr): paid orders plus COD
      // awaiting collection, not cancelled/returned:
      // PHONEPE 200 + COD 100 (today) + RAZORPAY 300 + COD 400 (10d) = 1000.
      // Excluded: paid-but-cancelled 50, returned COD 60.
      const seriesTotal = all.series.reduce((a, s) => a + (s.total || 0), 0);
      expect(seriesTotal).toBe(1000);
      expect(all.summary.revenue).toBe(1000);
      expect(all.summary.orders).toBe(4);
      // Collected (paid) part: 200 + 300
      expect(all.summary.collected).toBe(500);
      // COD pending (part of booked): today COD 100 + 10d COD 400 = 500
      expect(all.summary.codPending).toBe(500);

      const todayRes = await callCtrl(getRevenueOverTime, { period: "today" });
      expect(todayRes.summary.revenue).toBe(300); // paid 200 + COD awaiting 100
      expect(todayRes.summary.orders).toBe(2);

      const yesterdayRes = await callCtrl(getRevenueOverTime, { period: "yesterday" });
      expect(yesterdayRes.summary.revenue).toBe(300); // RAZORPAY paid 300
      expect(yesterdayRes.summary.orders).toBe(1);

      const weekRes = await callCtrl(getRevenueOverTime, { period: "week" });
      // Last 7 days (>= 6 days ago): today(200 + 100) + yesterday(300).
      // 3d cancelled order excluded; 10d COD is outside the window.
      expect(weekRes.summary.revenue).toBe(600);
      expect(weekRes.summary.orders).toBe(3);

      const custom = await callCtrl(getRevenueOverTime, {
        period: "custom",
        from: kolkataDateDaysAgo(0),
        to: kolkataDateDaysAgo(0),
      });
      // custom range = exactly today (Kolkata) -> same as "today": 300, 2 orders
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
      // Booked value replaces the old all-orders "gross" headline
      expect(byStatus.totals.bookedOrders).toBe(4);
      expect(byStatus.totals.bookedValue).toBe(1000);
      expect(byStatus.totals.unpaidOnline.count).toBe(0);
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
      // collectionRate = collected (booked AND paid: 200 + 300) / booked
      // value (1000) = 50%. COD awaiting cash is booked but not collected.
      expect(split.totals.orders).toBe(6);
      expect(split.totals.bookedValue).toBe(1000);
      expect(split.totals.collectedTotal).toBe(500);
      expect(split.totals.collectionRate).toBeCloseTo(50, 5);
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
      // lifetimeSpent counts paid orders that are not cancelled/returned.
      // User has paid PHONEPE 200 (delivered) + PHONEPE 50 (cancelled -> excluded) = 200.
      const row = cust.rows.find((r) => r.id === String(user._id));
      expect(row).toBeDefined();
      expect(row.lifetimeSpent).toBe(200);
      // Order counts use booked orders too: the cancelled one is not counted
      expect(row.lifetimeOrders).toBe(1);
      expect(cust.summary.customerCount ?? cust.summary.customers).toBe(1);
    }
  });

  it("takes partial refunds out of revenue", async () => {
    // A single day far from the other test's seeds so the custom range (and
    // its cache key) only sees these orders.
    const day = kolkataDaysAgo(400, 1);
    const dayStr = kolkataDateDaysAgo(400);
    // Paid ₹1000 with ₹250 refunded so far (partial refunds keep it "paid"),
    // plus an untouched paid ₹500 order.
    await seed({ totalAmount: 1000, paymentStatus: "paid", paymentMethod: "PHONEPE", refundedAmountPaise: 25000, createdAt: day });
    await seed({ totalAmount: 500, paymentStatus: "paid", paymentMethod: "PHONEPE", createdAt: day });
    const range = { period: "custom", from: dayStr, to: dayStr };

    const revenue = await callCtrl(getRevenueOverTime, range);
    expect(revenue.summary.revenue).toBe(1250);
    expect(revenue.series.reduce((a, s) => a + (s.total || 0), 0)).toBe(1250);
    // Still two paid orders: a partial refund doesn't remove the order.
    expect(revenue.summary.orders).toBe(2);

    const split = await callCtrl(getPaymentMethodSplit, range);
    const phonepe = split.splits.find((s) => s.method === "PHONEPE");
    expect(phonepe.paidTotal).toBe(1250);
  });
});