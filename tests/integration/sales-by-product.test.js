const mongoose = require("mongoose");
const Order = require("../../src/models/Order");
const Product = require("../../src/models/Product");
const {
  getSalesByProduct,
} = require("../../src/controllers/admin/salesReportController");

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

async function seedProduct(overrides = {}) {
  return Product.create({
    title: overrides.name || "Test Product",
    category: new mongoose.Types.ObjectId(),
    categoryName: overrides.categoryName || "Toys",
    sku: overrides.sku || `SKU-${seedId++}`,
    price: overrides.price || 100,
    pricing: {
      price: overrides.price || 100,
      discountPrice: overrides.price || 100,
    },
    url_key: overrides.urlKey || `p-${overrides.sku || seedId}`,
    images: overrides.image ? [overrides.image] : [],
    product_type: "SIMPLE",
    status: "published",
    stockObj: { available: 5, lowStockThreshold: 2 },
    ...overrides,
  });
}

async function seedOrder(items, extra = {}) {
  const created = new Date(Date.now() - 1 * 86400000);
  return Order.create({
    userId: new mongoose.Types.ObjectId(),
    orderId: `SALESPROD-${Date.now()}-${seedId++}`,
    items,
    totalAmount: items.reduce((s, i) => s + i.price * i.quantity, 0),
    totalQuantity: items.reduce((s, i) => s + i.quantity, 0),
    subtotal: items.reduce((s, i) => s + i.price * i.quantity, 0),
    paymentStatus: "paid",
    paymentMethod: "PHONEPE",
    orderStatus: "delivered",
    placedAt: created,
    createdAt: created,
    ...extra,
  });
}

describe("Sales by Product report", () => {
  it("sums item snapshots and preserves name/price/units/revenue", async () => {
    const p = await seedProduct({ name: "Bottle", sku: "BTL42", price: 250 });
    await seedOrder([
      {
        productId: p._id.toString(),
        variantId: null,
        quantity: 2,
        price: 250,
        regularPrice: 300,
        name: "Bottle",
        sku: "BTL42",
        image: "",
        urlKey: "bottle",
        variantName: null,
        variantSku: null,
        variantAttributes: null,
      },
    ]);

    const body = await callCtrl(getSalesByProduct, { period: "all" });
    const rows = body.rows || [];
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Bottle");
    expect(rows[0].sku).toBe("BTL42");
    expect(rows[0].price).toBe(250);
    expect(rows[0].regularPrice).toBe(300);
    expect(rows[0].unitsSold).toBe(2);
    expect(rows[0].revenue).toBe(500);
    expect(rows[0].orders).toBe(1);
    expect(rows[0].category).toBe("Toys");
    expect(rows[0].currentStock).toBe(5);
    expect(body.summary.revenue).toBe(500);
    expect(body.summary.unitsSold).toBe(2);
  });

  it("excludes cancelled/refunded and unpaid orders", async () => {
    const p = await seedProduct({ name: "Bottle", sku: "BTL42", price: 250 });
    const mkItem = () => ({
      productId: p._id.toString(),
      variantId: null,
      quantity: 1,
      price: 250,
      name: "Bottle",
      sku: "BTL42",
    });
    await seedOrder([mkItem()], { orderStatus: "cancelled" });
    await seedOrder([mkItem()], { paymentStatus: "pending" });
    await seedOrder([mkItem()], { orderStatus: "returned" });

    const body = await callCtrl(getSalesByProduct, { period: "all" });
    expect(body.rows).toHaveLength(0);
    expect(body.summary.revenue).toBe(0);
  });

  it("limit=0 returns the complete filtered dataset (CSV export mode)", async () => {
    const p1 = await seedProduct({ name: "Bottle", sku: "BTL42", price: 250 });
    const p2 = await seedProduct({ name: "Pacifier", sku: "PAC1", price: 90 });
    for (let i = 0; i < 30; i++) {
      const p = i % 2 === 0 ? p1 : p2;
      await seedOrder([
        {
          productId: p._id.toString(),
          variantId: null,
          quantity: 1,
          price: i % 2 === 0 ? 250 : 90,
          name: p.name,
          sku: p.sku,
        },
      ]);
    }

    // 30 paid orders, one item each, alternating across 2 products
    const bodyPaged = await callCtrl(getSalesByProduct, {
      period: "all",
      limit: "20",
    });
    expect(bodyPaged.rows).toHaveLength(2); // page still returns 2 rows (small dataset)
    expect(bodyPaged.pagination.limit).toBe(20);

    const bodyExport = await callCtrl(getSalesByProduct, {
      period: "all",
      limit: "0",
      sortBy: "name",
      sortOrder: "asc",
    });
    expect(bodyExport.rows).toHaveLength(2);
    expect(bodyExport.pagination.limit).toBe(0);
    expect(bodyExport.rows[0].name).toBe("Bottle");
    expect(bodyExport.rows[0].unitsSold).toBe(15);
    expect(bodyExport.rows[1].unitsSold).toBe(15);
    expect(bodyExport.summary.unitsSold).toBe(30);
  });

  it("backfills name/sku from live product when item snapshots are missing (legacy data)", async () => {
    const p = await seedProduct({ name: "Bottle", sku: "BTL42", price: 250 });
    const created = new Date(Date.now() - 1 * 86400000);
    await Order.collection.insertOne({
      userId: new mongoose.Types.ObjectId(),
      orderId: `SALESPROD-LEGACY-${Date.now()}-${seedId++}`,
      items: [
        {
          productId: p._id.toString(),
          variantId: "some-variant",
          quantity: 2,
          price: 250,
        },
      ],
      totalAmount: 500,
      totalQuantity: 2,
      subtotal: 500,
      paymentStatus: "paid",
      paymentMethod: "PHONEPE",
      orderStatus: "delivered",
      placedAt: created,
      createdAt: created,
    });

    const body = await callCtrl(getSalesByProduct, { period: "all" });
    const rows = body.rows || [];
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Bottle");
    expect(rows[0].sku).toBe("BTL42");
    expect(rows[0].urlKey).toBe("p-BTL42");
    expect(rows[0].unitsSold).toBe(2);
    expect(rows[0].revenue).toBe(500);
  });
});