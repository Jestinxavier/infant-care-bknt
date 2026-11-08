const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../../src/app");
const Product = require("../../src/models/Product");
const SiteSetting = require("../../src/models/SiteSetting");
const { createVerifiedUser, accessTokenFor } = require("../helpers/authFixtures");

let counter = 0;
const token = (prefix) => `${prefix}-${Date.now()}-${counter++}`;
const auth = (t) => ({ Authorization: `Bearer ${t}` });

async function makeSimple({ price = 500, stock = 10, gstRate } = {}) {
  const key = token("pos-charge");
  return Product.create({
    title: `POS Charge ${key}`,
    category: new mongoose.Types.ObjectId(),
    url_key: key,
    sku: key.toUpperCase(),
    status: "published",
    product_type: "SIMPLE",
    price,
    stock,
    stockObj: { available: stock, isInStock: true },
    ...(gstRate !== undefined ? { gstRate } : {}),
  });
}

const CHARGE_TYPES = [
  { code: "shipping", name: "Shipping", kind: "shipping", type: "flat", value: 60, editable: true, taxable: true, active: true },
  { code: "gift_wrap", name: "Gift wrapping", kind: "other", type: "flat", value: 30, editable: false, taxable: false, active: true },
  { code: "packing", name: "Packing", kind: "other", type: "percent", value: 5, editable: true, taxable: true, active: false },
];

describe("POS extra charges", () => {
  let adminToken;
  let ownerToken;

  beforeEach(async () => {
    adminToken = accessTokenFor(await createVerifiedUser({ role: "admin" }));
    ownerToken = accessTokenFor(await createVerifiedUser({ role: "super-admin" }));
  });

  const saveTypes = (charges = CHARGE_TYPES, t = ownerToken) =>
    request(app).put("/api/v1/admin/pos/charges").set(auth(t)).send({ charges });

  const sell = (body, t = adminToken) =>
    request(app)
      .post("/api/v1/admin/pos/sales")
      .set(auth(t))
      .set("Idempotency-Key", token("idem"))
      .send({ paymentMethod: "UPI", source: { code: "walkin" }, ...body });

  describe("managing charge types (RBAC)", () => {
    it("starts with a Shipping charge for owners", async () => {
      const res = await request(app).get("/api/v1/admin/pos/charges").set(auth(ownerToken));
      expect(res.status).toBe(200);
      expect(res.body.charges).toEqual([
        expect.objectContaining({ code: "shipping", kind: "shipping", active: true }),
      ]);
    });

    it("does not let a plain admin read or change charge types", async () => {
      expect((await request(app).get("/api/v1/admin/pos/charges").set(auth(adminToken))).status).toBe(403);
      expect((await saveTypes(CHARGE_TYPES, adminToken)).status).toBe(403);
    });

    it("blocks the generic settings routes from editing pos.charges", async () => {
      expect((await saveTypes()).status).toBe(200);
      const put = await request(app)
        .put("/api/v1/admin/settings/pos.charges")
        .set(auth(adminToken))
        .send({ value: [{ code: "shipping", name: "Shipping", value: 0 }] });
      expect(put.status).toBe(403);
      const del = await request(app).delete("/api/v1/admin/settings/pos.charges").set(auth(adminToken));
      expect(del.status).toBe(403);
      const post = await request(app)
        .post("/api/v1/admin/settings")
        .set(auth(adminToken))
        .send({ key: "pos.charges", value: [] });
      expect(post.status).toBe(403);
      // Still the owner's list
      const stored = await SiteSetting.findOne({ key: "pos.charges" }).lean();
      expect(stored.value).toHaveLength(3);
    });

    it("validates the list", async () => {
      const bad = [
        [{ ...CHARGE_TYPES[0], code: "Bad Code" }],
        [CHARGE_TYPES[0], { ...CHARGE_TYPES[1], code: "shipping" }],
        [CHARGE_TYPES[0], { ...CHARGE_TYPES[1], kind: "shipping" }],
        [{ ...CHARGE_TYPES[2], value: 150 }],
        [{ ...CHARGE_TYPES[1], value: -5 }],
        [{ ...CHARGE_TYPES[1], name: "  " }],
      ];
      for (const charges of bad) {
        const res = await saveTypes(charges);
        expect(res.status).toBe(400);
        expect(res.body.errorCode).toBe("INVALID_CHARGE");
      }
    });

    it("gives the till only active charge types", async () => {
      await saveTypes();
      const res = await request(app).get("/api/v1/admin/pos/config").set(auth(adminToken));
      expect(res.status).toBe(200);
      expect(res.body.charges.map((c) => c.code)).toEqual(["shipping", "gift_wrap"]);
    });
  });

  describe("charges on a sale", () => {
    beforeEach(async () => {
      await saveTypes();
    });

    it("adds charges after the discount and stores them on the order", async () => {
      const product = await makeSimple({ price: 500 });
      const res = await sell({
        items: [{ productId: String(product._id), quantity: 1 }],
        discount: { type: "percent", value: 10 }, // 50 off the items only
        charges: [{ code: "shipping" }, { code: "gift_wrap" }],
        expectedTotal: 540, // 450 + 60 + 30
      });
      expect(res.status).toBe(201);
      const order = res.body.order;
      expect(order.totalAmount).toBe(540);
      expect(order.shippingCost).toBe(60);
      expect(order.otherCharges).toBe(30);
      expect(order.pos.charges).toEqual([
        expect.objectContaining({ code: "shipping", name: "Shipping", amount: 60, kind: "shipping" }),
        expect.objectContaining({ code: "gift_wrap", name: "Gift wrapping", amount: 30, taxable: false }),
      ]);
    });

    it("rejects a quoted total that left out the charges", async () => {
      const product = await makeSimple({ price: 500 });
      const res = await sell({
        items: [{ productId: String(product._id), quantity: 1 }],
        charges: [{ code: "shipping" }],
        expectedTotal: 500,
      });
      expect(res.status).toBe(409);
      expect(res.body.errorCode).toBe("TOTAL_CHANGED");
      expect(res.body.totalAmount).toBe(560);
    });

    it("lets the cashier change an editable charge, but not a locked one", async () => {
      const product = await makeSimple();
      const items = [{ productId: String(product._id), quantity: 1 }];

      const edited = await sell({ items, charges: [{ code: "shipping", value: 120 }] });
      expect(edited.status).toBe(201);
      expect(edited.body.order.shippingCost).toBe(120);

      const locked = await sell({ items, charges: [{ code: "gift_wrap", value: 5 }] });
      expect(locked.status).toBe(403);
      expect(locked.body.errorCode).toBe("CHARGE_LOCKED");

      // Same value as configured is fine
      const same = await sell({ items, charges: [{ code: "gift_wrap", value: 30 }] });
      expect(same.status).toBe(201);
    });

    it("lets an owner override a locked charge", async () => {
      const product = await makeSimple();
      const res = await sell(
        { items: [{ productId: String(product._id), quantity: 1 }], charges: [{ code: "gift_wrap", value: 5 }] },
        ownerToken,
      );
      expect(res.status).toBe(201);
      expect(res.body.order.otherCharges).toBe(5);
    });

    it("refuses inactive, unknown, repeated and invalid charges", async () => {
      const product = await makeSimple();
      const items = [{ productId: String(product._id), quantity: 1 }];
      const cases = [
        [{ code: "packing" }],
        [{ code: "made_up" }],
        [{ code: "shipping" }, { code: "shipping" }],
        [{ code: "shipping", value: -10 }],
        "not-a-list",
      ];
      for (const charges of cases) {
        const res = await sell({ items, charges });
        expect(res.status).toBe(400);
        expect(res.body.errorCode).toBe("INVALID_CHARGE");
      }
      const stock = (await Product.findById(product._id).lean()).stockObj.available;
      expect(stock).toBe(10); // nothing sold
    });

    it("keeps old bills unchanged when charge types change later", async () => {
      const product = await makeSimple();
      const res = await sell({ items: [{ productId: String(product._id), quantity: 1 }], charges: [{ code: "gift_wrap" }] });
      await saveTypes([CHARGE_TYPES[0]]); // gift wrapping removed
      const order = await mongoose.model("Order").findById(res.body.order._id).lean();
      expect(order.pos.charges[0]).toEqual(expect.objectContaining({ name: "Gift wrapping", amount: 30 }));
    });

    it("puts GST only on taxable charges", async () => {
      await SiteSetting.create({
        key: "tax.gst",
        value: { enabled: true, defaultRate: 18 },
        type: "json",
        scope: "order",
        isPublic: true,
      });
      const product = await makeSimple({ price: 590, gstRate: 18 });
      const res = await sell({
        items: [{ productId: String(product._id), quantity: 1 }],
        charges: [{ code: "shipping", value: 118 }, { code: "gift_wrap" }],
      });
      expect(res.status).toBe(201);
      const { gst, totalAmount } = res.body.order;
      expect(totalAmount).toBe(738); // 590 + 118 + 30
      // Shipping ₹118 holds ₹18 GST; gift wrapping is not taxable
      expect(gst.chargesTax).toBe(18);
      expect(gst.chargesTaxableValue).toBe(100);
      expect(gst.totalTax).toBe(108); // 90 on the item + 18 on shipping
    });
  });
});
