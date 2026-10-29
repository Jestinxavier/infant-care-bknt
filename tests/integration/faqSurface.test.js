const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../../src/app");
const FAQ = require("../../src/models/FAQ");
const FAQCategory = require("../../src/models/FAQCategory");
const {
  createVerifiedUser,
  accessTokenFor,
} = require("../helpers/authFixtures");

let counter = 0;
const uniqueToken = (prefix) => `${prefix}-${Date.now()}-${counter++}`;

const auth = (token) => ({ Authorization: `Bearer ${token}` });
const missingId = () => new mongoose.Types.ObjectId().toString();

const createCategory = (overrides = {}) =>
  FAQCategory.create({
    name: `FAQ Category ${uniqueToken("cat")}`,
    displayOrder: 0,
    isActive: true,
    ...overrides,
  });

const createFaq = (categoryId, overrides = {}) =>
  FAQ.create({
    question: `Question ${uniqueToken("faq")}`,
    answer: "A useful answer",
    category: categoryId,
    displayOrder: 0,
    isActive: true,
    ...overrides,
  });

describe("FAQ surface", () => {
  let adminToken;

  beforeEach(async () => {
    const admin = await createVerifiedUser({ role: "admin" });
    adminToken = accessTokenFor(admin);
  });

  it("lists FAQ categories publicly", async () => {
    const category = await createCategory();
    const res = await request(app).get("/api/v1/admin/faq-categories");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.categories.map((item) => item._id)).toContain(
      category._id.toString(),
    );
  });

  it("creates categories, auto-increments order, and rejects duplicates", async () => {
    const first = await request(app)
      .post("/api/v1/admin/faq-categories")
      .set(auth(adminToken))
      .send({ name: `Category ${uniqueToken("one")}` });
    expect(first.status).toBe(201);
    expect(first.body.category.displayOrder).toBe(0);

    const second = await request(app)
      .post("/api/v1/admin/faq-categories")
      .set(auth(adminToken))
      .send({ name: `Category ${uniqueToken("two")}` });
    expect(second.status).toBe(201);
    expect(second.body.category.displayOrder).toBe(1);

    const duplicate = await request(app)
      .post("/api/v1/admin/faq-categories")
      .set(auth(adminToken))
      .send({ name: first.body.category.name });
    expect(duplicate.status).toBe(400);
  });

  it("updates categories and 404s missing categories", async () => {
    const category = await createCategory();
    const updated = await request(app)
      .put(`/api/v1/admin/faq-categories/${category._id}`)
      .set(auth(adminToken))
      .send({ name: `Renamed ${uniqueToken("cat")}`, displayOrder: 5, isActive: false });
    expect(updated.status).toBe(200);
    expect(updated.body.category.displayOrder).toBe(5);
    expect(updated.body.category.isActive).toBe(false);

    const missing = await request(app)
      .put(`/api/v1/admin/faq-categories/${missingId()}`)
      .set(auth(adminToken))
      .send({ name: "Nope" });
    expect(missing.status).toBe(404);
  });

  it("deletes empty categories and blocks categories containing FAQs", async () => {
    const empty = await createCategory();
    const removed = await request(app)
      .delete(`/api/v1/admin/faq-categories/${empty._id}`)
      .set(auth(adminToken));
    expect(removed.status).toBe(200);

    const populated = await createCategory();
    await createFaq(populated._id);
    const blocked = await request(app)
      .delete(`/api/v1/admin/faq-categories/${populated._id}`)
      .set(auth(adminToken));
    expect(blocked.status).toBe(400);
    expect(blocked.body.message).toMatch(/cannot delete/i);

    const missing = await request(app)
      .delete(`/api/v1/admin/faq-categories/${missingId()}`)
      .set(auth(adminToken));
    expect(missing.status).toBe(404);
  });

  it("reorders and fixes category display order", async () => {
    const first = await createCategory({ displayOrder: 9 });
    const second = await createCategory({ displayOrder: 7 });

    const reordered = await request(app)
      .put("/api/v1/admin/faq-categories/reorder")
      .set(auth(adminToken))
      .send({
        items: [
          { id: first._id.toString(), displayOrder: 2 },
          { id: second._id.toString(), displayOrder: 1 },
        ],
      });
    expect(reordered.status).toBe(200);

    const reloaded = await FAQCategory.findById(first._id).lean();
    expect(reloaded.displayOrder).toBe(2);

    const fixed = await request(app)
      .put("/api/v1/admin/faq-categories/fix-display-order")
      .set(auth(adminToken));
    expect(fixed.status).toBe(200);
    expect(fixed.body.totalCategories).toBe(2);

    const invalid = await request(app)
      .put("/api/v1/admin/faq-categories/reorder")
      .set(auth(adminToken))
      .send({ items: "nope" });
    expect(invalid.status).toBe(400);
  });

  it("lists FAQs with category and active filters", async () => {
    const category = await createCategory();
    const active = await createFaq(category._id, { isActive: true });
    await createFaq(category._id, { isActive: false });

    const all = await request(app).get("/api/v1/faqs");
    expect(all.status).toBe(200);
    expect(all.body.count).toBe(2);

    const filtered = await request(app).get(
      `/api/v1/faqs?categoryId=${category._id}&isActive=true`,
    );
    expect(filtered.status).toBe(200);
    expect(filtered.body.faqs).toHaveLength(1);
    expect(filtered.body.faqs[0]._id).toBe(active._id.toString());

    const byName = await request(app).get(
      `/api/v1/faqs?category=${encodeURIComponent(category.name)}`,
    );
    expect(byName.status).toBe(200);
    expect(byName.body.count).toBe(2);
  });

  it("creates and updates FAQs", async () => {
    const category = await createCategory();
    const created = await request(app)
      .post("/api/v1/faqs")
      .set(auth(adminToken))
      .send({
        question: "How do I wash this?",
        answer: "Machine wash cold.",
        category: category._id.toString(),
        displayOrder: 3,
      });
    expect(created.status).toBe(201);
    expect(created.body.faq.displayOrder).toBe(3);

    const updated = await request(app)
      .put(`/api/v1/faqs/${created.body.faq._id}`)
      .set(auth(adminToken))
      .send({ answer: "Hand wash cold.", isActive: false, displayOrder: 1 });
    expect(updated.status).toBe(200);
    expect(updated.body.faq.answer).toBe("Hand wash cold.");
    expect(updated.body.faq.isActive).toBe(false);

    const missing = await request(app)
      .put(`/api/v1/faqs/${missingId()}`)
      .set(auth(adminToken))
      .send({ answer: "Nope" });
    expect(missing.status).toBe(404);
  });

  it("deletes FAQs and 404s missing FAQs", async () => {
    const category = await createCategory();
    const faq = await createFaq(category._id);

    const removed = await request(app)
      .delete(`/api/v1/faqs/${faq._id}`)
      .set(auth(adminToken));
    expect(removed.status).toBe(200);

    const missing = await request(app)
      .delete(`/api/v1/faqs/${missingId()}`)
      .set(auth(adminToken));
    expect(missing.status).toBe(404);
  });

  it("reorders FAQs and validates payloads", async () => {
    const category = await createCategory();
    const first = await createFaq(category._id, { displayOrder: 5 });
    const second = await createFaq(category._id, { displayOrder: 6 });

    const reordered = await request(app)
      .put("/api/v1/faqs/reorder")
      .set(auth(adminToken))
      .send({
        items: [
          { id: first._id.toString(), displayOrder: 2 },
          { id: second._id.toString(), displayOrder: 1 },
        ],
      });
    expect(reordered.status).toBe(200);

    const reloaded = await FAQ.findById(first._id).lean();
    expect(reloaded.displayOrder).toBe(2);

    const invalid = await request(app)
      .put("/api/v1/faqs/reorder")
      .set(auth(adminToken))
      .send({ items: "nope" });
    expect(invalid.status).toBe(400);
  });
});
