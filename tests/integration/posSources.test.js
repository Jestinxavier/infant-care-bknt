const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../../src/app");
const Product = require("../../src/models/Product");
const Order = require("../../src/models/Order");
const SiteSetting = require("../../src/models/SiteSetting");
const { createVerifiedUser, accessTokenFor } = require("../helpers/authFixtures");

let counter = 0;
const token = (prefix) => `${prefix}-${Date.now()}-${counter++}`;
const auth = (t) => ({ Authorization: `Bearer ${t}` });

async function makeSimple({ price = 400, stock = 10 } = {}) {
  const key = token("pos-src");
  return Product.create({
    title: `POS Source ${key}`,
    category: new mongoose.Types.ObjectId(),
    url_key: key,
    sku: key.toUpperCase(),
    status: "published",
    product_type: "SIMPLE",
    price,
    stock,
    stockObj: { available: stock, isInStock: true },
  });
}

describe("POS customer sources", () => {
  let adminToken;
  let ownerToken;

  beforeEach(async () => {
    adminToken = accessTokenFor(await createVerifiedUser({ role: "admin" }));
    ownerToken = accessTokenFor(await createVerifiedUser({ role: "super-admin" }));
  });

  const saveSources = (sources, t = ownerToken) =>
    request(app).put("/api/v1/admin/pos/sources").set(auth(t)).send({ sources });

  const sell = async (source, extra = {}) => {
    const product = await makeSimple();
    return request(app)
      .post("/api/v1/admin/pos/sales")
      .set(auth(adminToken))
      .set("Idempotency-Key", token("idem"))
      .send({
        items: [{ productId: String(product._id), quantity: 1 }],
        paymentMethod: "CASH",
        ...(source === undefined ? {} : { source }),
        ...extra,
      });
  };

  describe("managing the list (RBAC)", () => {
    it("starts with the default sources for owners", async () => {
      const res = await request(app).get("/api/v1/admin/pos/sources").set(auth(ownerToken));
      expect(res.status).toBe(200);
      expect(res.body.sources.map((s) => s.code)).toEqual([
        "walkin", "whatsapp", "instagram", "facebook", "phone", "other",
      ]);
      expect(res.body.sources.find((s) => s.code === "other").requiresNote).toBe(true);
    });

    it("does not let a plain admin read or change the list", async () => {
      expect((await request(app).get("/api/v1/admin/pos/sources").set(auth(adminToken))).status).toBe(403);
      expect((await saveSources([{ code: "walkin", name: "Walk-in" }], adminToken)).status).toBe(403);
    });

    it("blocks the generic settings routes from editing pos.sources", async () => {
      await saveSources([{ code: "walkin", name: "Walk-in" }]);
      const put = await request(app)
        .put("/api/v1/admin/settings/pos.sources")
        .set(auth(adminToken))
        .send({ value: [] });
      expect(put.status).toBe(403);
      const del = await request(app).delete("/api/v1/admin/settings/pos.sources").set(auth(adminToken));
      expect(del.status).toBe(403);
    });

    it("validates the list", async () => {
      const bad = [
        [{ code: "Bad Code", name: "x" }],
        [{ code: "walkin", name: "A" }, { code: "walkin", name: "B" }],
        [{ code: "walkin", name: "  " }],
        [{ code: "walkin", name: "Walk-in", active: false }], // none active
        "not-a-list",
      ];
      for (const sources of bad) {
        const res = await saveSources(sources);
        expect(res.status).toBe(400);
        expect(res.body.errorCode).toBe("INVALID_SOURCE");
      }
    });

    it("gives the till only active sources, in the owner's order", async () => {
      await saveSources([
        { code: "instagram", name: "Instagram" },
        { code: "google", name: "Google search" },
        { code: "walkin", name: "Walk-in", active: false },
      ]);
      const res = await request(app).get("/api/v1/admin/pos/config").set(auth(adminToken));
      expect(res.body.sources.map((s) => s.code)).toEqual(["instagram", "google"]);
    });
  });

  describe("source on a sale", () => {
    it("requires a source (no default)", async () => {
      for (const source of [undefined, null, {}, { code: "" }]) {
        const res = await sell(source);
        expect(res.status).toBe(400);
        expect(res.body.errorCode).toBe("SOURCE_REQUIRED");
      }
      expect(await Order.countDocuments({ channel: "pos" })).toBe(0);
    });

    it("rejects unknown and inactive sources", async () => {
      await saveSources([
        { code: "walkin", name: "Walk-in" },
        { code: "instagram", name: "Instagram", active: false },
      ]);
      for (const code of ["made_up", "instagram"]) {
        const res = await sell({ code });
        expect(res.status).toBe(400);
        expect(res.body.errorCode).toBe("INVALID_SOURCE");
      }
    });

    it("needs a note for 'Other', and stores it", async () => {
      const missing = await sell({ code: "other", note: "   " });
      expect(missing.status).toBe(400);
      expect(missing.body.errorCode).toBe("SOURCE_NOTE_REQUIRED");

      const ok = await sell({ code: "other", note: "  Baby expo 2026  " });
      expect(ok.status).toBe(201);
      expect(ok.body.order.pos.source).toEqual({ code: "other", name: "Other", note: "Baby expo 2026" });
    });

    it("keeps the source name on old bills after a rename", async () => {
      const res = await sell({ code: "instagram" });
      expect(res.status).toBe(201);
      await saveSources([{ code: "instagram", name: "Insta DM" }, { code: "walkin", name: "Walk-in" }]);
      const order = await Order.findById(res.body.order._id).lean();
      expect(order.pos.source.name).toBe("Instagram");
    });

    it("filters the admin order list by source and shows it", async () => {
      await sell({ code: "instagram" });
      await sell({ code: "whatsapp" });
      const res = await request(app)
        .post("/api/v1/admin/orders")
        .set(auth(adminToken))
        .send({ source: "instagram", channel: "pos" });
      expect(res.status).toBe(200);
      const orders = res.body.orders || res.body.data || [];
      expect(orders).toHaveLength(1);
      expect(orders[0].source).toBe("Instagram");
    });
  });

  describe("filter options for reports", () => {
    it("lists inactive and deleted sources that past sales used", async () => {
      expect((await sell({ code: "facebook" })).status).toBe(201);
      expect((await sell({ code: "phone" })).status).toBe(201);
      // Facebook switched off; Phone call deleted from the list entirely
      await saveSources([
        { code: "walkin", name: "Walk-in" },
        { code: "facebook", name: "Facebook", active: false },
      ]);
      const res = await request(app).get("/api/v1/admin/pos/source-options").set(auth(adminToken));
      expect(res.status).toBe(200);
      expect(res.body.sources).toEqual([
        { code: "walkin", name: "Walk-in", active: true },
        { code: "facebook", name: "Facebook", active: false },
        { code: "phone", name: "Phone call", active: false },
      ]);
    });

    it("is refused to non-admins", async () => {
      const userToken = accessTokenFor(await createVerifiedUser());
      const res = await request(app).get("/api/v1/admin/pos/source-options").set(auth(userToken));
      expect(res.status).toBe(403);
    });
  });

  afterAll(async () => {
    await SiteSetting.deleteMany({ key: "pos.sources" });
  });
});
