const request = require("supertest");
const app = require("../../src/app");
const Category = require("../../src/models/Category");
const { createVerifiedUser, accessTokenFor } = require("../helpers/authFixtures");

let counter = 0;
const unique = (p) => `${p}-${Date.now()}-${counter++}`;
const auth = (t) => ({ Authorization: `Bearer ${t}` });

const makeCategory = (extra = {}) => {
  const name = unique("Cat");
  return Category.create({ name, code: name.toLowerCase(), isActive: true, ...extra });
};

describe("Category reorder", () => {
  let adminToken;
  let customerToken;
  let parent;
  let kids;

  beforeEach(async () => {
    adminToken = accessTokenFor(await createVerifiedUser({ role: "admin" }));
    customerToken = accessTokenFor(await createVerifiedUser({ role: "user" }));
    parent = await makeCategory();
    kids = [];
    for (let i = 0; i < 3; i += 1) {
      kids.push(await makeCategory({ parentCategory: parent._id, displayOrder: i }));
    }
  });

  const reorder = (token, body) =>
    request(app).put("/api/v1/admin/categories/reorder").set(auth(token)).send(body);

  it("saves the new subcategory order and the storefront list follows it", async () => {
    const newOrder = [kids[2], kids[0], kids[1]].map((k) => String(k._id));
    const res = await reorder(adminToken, { parentId: String(parent._id), orderedIds: newOrder });
    expect(res.status).toBe(200);

    const stored = await Category.find({ _id: { $in: newOrder } }).lean();
    const orderOf = Object.fromEntries(stored.map((c) => [String(c._id), c.displayOrder]));
    expect(newOrder.map((id) => orderOf[id])).toEqual([0, 1, 2]);

    const list = await request(app).get("/api/v1/category");
    const childIds = list.body.categories
      .filter((c) => String(c.parentCategory?._id) === String(parent._id))
      .map((c) => String(c._id));
    expect(childIds).toEqual(newOrder);
  });

  it("refuses a list that isn't exactly that parent's subcategories", async () => {
    const outsider = await makeCategory();
    const missingOne = kids.slice(0, 2).map((k) => String(k._id));
    expect((await reorder(adminToken, { parentId: String(parent._id), orderedIds: missingOne })).status).toBe(409);

    const withOutsider = [...kids.map((k) => String(k._id)), String(outsider._id)];
    expect((await reorder(adminToken, { parentId: String(parent._id), orderedIds: withOutsider })).status).toBe(409);

    const dupes = [String(kids[0]._id), String(kids[0]._id), String(kids[1]._id)];
    expect((await reorder(adminToken, { parentId: String(parent._id), orderedIds: dupes })).status).toBe(400);

    expect((await reorder(adminToken, { parentId: "{$ne:null}", orderedIds: [] })).status).toBe(400);
  });

  it("is admin-only", async () => {
    const ids = kids.map((k) => String(k._id));
    expect((await reorder(customerToken, { parentId: String(parent._id), orderedIds: ids })).status).toBe(403);
    expect(
      (await request(app).put("/api/v1/admin/categories/reorder").send({ parentId: null, orderedIds: ids })).status,
    ).toBe(401);
  });
});

describe("Public category routes", () => {
  it("don't let a signed-in customer create, edit or delete categories", async () => {
    const customerToken = accessTokenFor(await createVerifiedUser({ role: "user" }));
    const victim = await makeCategory();

    const create = await request(app)
      .post("/api/v1/category")
      .set(auth(customerToken))
      .send({ name: unique("Hacked"), code: unique("hacked") });
    expect(create.status).toBe(403);

    const edit = await request(app)
      .put(`/api/v1/category/${victim._id}`)
      .set(auth(customerToken))
      .send({ name: "Hacked" });
    expect(edit.status).toBe(403);

    const del = await request(app).delete(`/api/v1/category/${victim._id}`).set(auth(customerToken));
    expect(del.status).toBe(403);

    const bulk = await request(app)
      .post("/api/v1/category/bulk-delete")
      .set(auth(customerToken))
      .send({ categoryIds: [String(victim._id)] });
    expect(bulk.status).toBe(403);

    const stillThere = await Category.findById(victim._id).lean();
    expect(stillThere?.name).toBe(victim.name);
  });
});
