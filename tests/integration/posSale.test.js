const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../../src/app");
const Product = require("../../src/models/Product");
const Order = require("../../src/models/Order");
const Payment = require("../../src/models/Payment");
const { createVerifiedUser, accessTokenFor } = require("../helpers/authFixtures");

let counter = 0;
const token = (prefix) => `${prefix}-${Date.now()}-${counter++}`;
const auth = (t) => ({ Authorization: `Bearer ${t}` });

async function makeSimple({ price = 500, offerPrice, stock = 5, quantityRules } = {}) {
  const key = token("pos-simple");
  return Product.create({
    title: `POS Simple ${key}`,
    category: new mongoose.Types.ObjectId(),
    url_key: key,
    sku: key.toUpperCase(),
    status: "published",
    product_type: "SIMPLE",
    price,
    ...(offerPrice ? { offerPrice } : {}),
    ...(quantityRules ? { quantityRules } : {}),
    stock,
    stockObj: { available: stock, isInStock: stock > 0 },
  });
}

async function makeConfigurable({ variantStock = 3 } = {}) {
  const key = token("pos-config");
  return Product.create({
    title: `POS Config ${key}`,
    category: new mongoose.Types.ObjectId(),
    url_key: key,
    sku: key.toUpperCase(),
    status: "published",
    product_type: "CONFIGURABLE",
    price: 300,
    variants: [
      {
        id: "v1",
        name: "Red / M",
        sku: `${key.toUpperCase()}-RD-M`,
        price: 300,
        stock: variantStock,
        stockObj: { available: variantStock, isInStock: true },
      },
    ],
  });
}

describe("POS sales", () => {
  let adminToken;
  let userToken;

  beforeEach(async () => {
    adminToken = accessTokenFor(await createVerifiedUser({ role: "admin" }));
    userToken = accessTokenFor(await createVerifiedUser());
  });

  const sell = (body, key = token("idem"), t = adminToken) =>
    request(app)
      .post("/api/v1/admin/pos/sales")
      .set(auth(t))
      .set("Idempotency-Key", key)
      .send(body);

  it("rejects non-admins", async () => {
    const res = await request(app).get("/api/v1/admin/pos/config").set(auth(userToken));
    expect(res.status).toBe(403);
  });

  it("finds a variant by exact SKU scan", async () => {
    const product = await makeConfigurable();
    const res = await request(app)
      .get("/api/v1/admin/pos/items")
      .query({ q: product.variants[0].sku.toLowerCase() })
      .set(auth(adminToken));

    expect(res.status).toBe(200);
    expect(res.body.exactMatch).toBe(true);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({ variantId: "v1", price: 300, stock: 3 });
  });

  it("records a cash sale with offer pricing, bill discount, change and stock deduction", async () => {
    const product = await makeSimple({ price: 500, offerPrice: 400, stock: 5 });

    const res = await sell({
      items: [{ productId: String(product._id), quantity: 2 }],
      discount: { type: "percent", value: 10 },
      paymentMethod: "CASH",
      amountTendered: 1000,
      expectedTotal: 720,
      customer: { name: "Anu", phone: "98765 43210" },
    });

    expect(res.status).toBe(201);
    const { order } = res.body;
    expect(order).toMatchObject({
      channel: "pos",
      paymentMethod: "CASH",
      paymentStatus: "paid",
      orderStatus: "delivered",
      subtotal: 1000,
      totalAmount: 720,
      discount: 280, // 200 offer + 80 bill discount
    });
    expect(order.pos).toMatchObject({
      amountTendered: 1000,
      changeDue: 280,
      billDiscount: { type: "percent", value: 10, amount: 80 },
    });
    expect(order.shippingAddress).toMatchObject({ fullName: "Anu", phone: "9876543210" });

    const after = await Product.findById(product._id).lean();
    expect(after.stockObj.available).toBe(3);
    expect(await Payment.countDocuments({ orderId: order._id, status: "success" })).toBe(1);
  });

  it("applies quantity tier pricing and deducts variant stock", async () => {
    const tiered = await makeSimple({
      price: 100,
      stock: 10,
      quantityRules: [{ minQty: 3, price: 80 }],
    });
    const configurable = await makeConfigurable({ variantStock: 3 });

    const res = await sell({
      items: [
        { productId: String(tiered._id), quantity: 3 },
        { productId: String(configurable._id), variantId: "v1", quantity: 1 },
      ],
      paymentMethod: "UPI",
      paymentReference: "UTR123",
    });

    expect(res.status).toBe(201);
    expect(res.body.order.totalAmount).toBe(540); // 3 × 80 + 300
    const variant = (await Product.findById(configurable._id).lean()).variants[0];
    expect(variant.stockObj.available).toBe(2);
  });

  it("returns the same sale for a repeated idempotency key", async () => {
    const product = await makeSimple({ stock: 5 });
    const body = {
      items: [{ productId: String(product._id), quantity: 1 }],
      paymentMethod: "CARD",
    };
    const key = token("same");

    const first = await sell(body, key);
    const second = await sell(body, key);

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.idempotent).toBe(true);
    expect(second.body.order._id).toBe(first.body.order._id);
    expect(await Order.countDocuments({ channel: "pos" })).toBe(1);
    expect((await Product.findById(product._id).lean()).stockObj.available).toBe(4);
  });

  it("refuses to oversell and leaves stock untouched", async () => {
    const plenty = await makeSimple({ stock: 5 });
    const scarce = await makeSimple({ stock: 1 });

    const res = await sell({
      items: [
        { productId: String(plenty._id), quantity: 2 },
        { productId: String(scarce._id), quantity: 2 },
      ],
      paymentMethod: "CASH",
    });

    expect(res.status).toBe(409);
    expect(res.body.errorCode).toBe("OUT_OF_STOCK");
    expect((await Product.findById(plenty._id).lean()).stockObj.available).toBe(5);
    expect(await Order.countDocuments({})).toBe(0);
  });

  it("rejects a sale whose total moved since the cashier quoted it", async () => {
    const product = await makeSimple({ price: 500 });
    const res = await sell({
      items: [{ productId: String(product._id), quantity: 1 }],
      paymentMethod: "CARD",
      expectedTotal: 450,
    });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ errorCode: "TOTAL_CHANGED", totalAmount: 500 });
  });

  it("rejects cash short of the total and discounts above the bill", async () => {
    const product = await makeSimple({ price: 500 });
    const items = [{ productId: String(product._id), quantity: 1 }];

    const short = await sell({ items, paymentMethod: "CASH", amountTendered: 200 });
    expect(short.body.errorCode).toBe("INSUFFICIENT_TENDER");

    const tooMuch = await sell({ items, paymentMethod: "CARD", discount: { type: "flat", value: 600 } });
    expect(tooMuch.body.errorCode).toBe("INVALID_DISCOUNT");
  });

  it("filters the admin order list by channel", async () => {
    const product = await makeSimple({ stock: 5 });
    await sell({ items: [{ productId: String(product._id), quantity: 1 }], paymentMethod: "CASH" });

    const pos = await request(app)
      .get("/api/v1/admin/orders")
      .query({ channel: "pos" })
      .set(auth(adminToken));
    const online = await request(app)
      .get("/api/v1/admin/orders")
      .query({ channel: "online" })
      .set(auth(adminToken));

    expect(pos.body.orders).toHaveLength(1);
    expect(pos.body.orders[0]).toMatchObject({ channel: "pos", customerName: "Walk-in customer" });
    expect(online.body.orders).toHaveLength(0);
  });

  it("does not let online checkout use counter tenders", async () => {
    const res = await request(app)
      .post("/api/v1/orders/create")
      .set("Idempotency-Key", token("online"))
      .send({ items: [{ productId: new mongoose.Types.ObjectId().toString(), quantity: 1 }], paymentMethod: "CASH" });
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe("INVALID_PAYMENT_METHOD");
  });
});
