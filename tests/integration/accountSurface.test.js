const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../../src/app");
const Category = require("../../src/models/Category");
const Product = require("../../src/models/Product");
const {
  createVerifiedUser,
  accessTokenFor,
} = require("../helpers/authFixtures");

let counter = 0;
const uniqueToken = (prefix) => `${prefix}-${Date.now()}-${counter++}`;

const auth = (token) => ({ Authorization: `Bearer ${token}` });
const missingId = () => new mongoose.Types.ObjectId().toString();

const createPublishedProduct = async () => {
  const token = uniqueToken("account-product");
  const category = await Category.create({
    name: `Account Category ${token}`,
    code: `account-category-${token}`,
    isActive: true,
  });
  return Product.create({
    title: `Account product ${token}`,
    description: "Published product for account tests",
    category: category._id,
    categoryName: category.name,
    categoryCode: category.code,
    url_key: `account-product-${token}`,
    sku: `ACC-${token}`.toUpperCase(),
    status: "published",
    product_type: "SIMPLE",
    price: 250,
    stock: 4,
    stockObj: { available: 4, isInStock: true },
    images: ["https://example.com/account.jpg"],
  });
};

const addressPayload = (overrides = {}) => ({
  fullName: "Test Parent",
  phone: "9876543210",
  houseName: "Green Villa",
  street: "12 Main Street",
  additionalInstruction: "Near the park",
  city: "Kochi",
  state: "Kerala",
  pincode: "682001",
  country: "India",
  addressType: "Home",
  ...overrides,
});

describe("Account surface", () => {
  let userToken;
  let otherToken;

  beforeEach(async () => {
    const user = await createVerifiedUser();
    const other = await createVerifiedUser();
    userToken = accessTokenFor(user);
    otherToken = accessTokenFor(other);
  });

  it("requires authentication for addresses and wishlist", async () => {
    expect((await request(app).post("/api/v1/addresses")).status).toBe(401);
    expect(
      (await request(app).post("/api/v1/addresses/create").send({})).status,
    ).toBe(401);
    expect((await request(app).get("/api/v1/wishlist")).status).toBe(401);
    expect(
      (await request(app).post("/api/v1/wishlist/toggle").send({})).status,
    ).toBe(401);
  });

  it("creates, lists, de-duplicates, updates, and deletes addresses", async () => {
    const created = await request(app)
      .post("/api/v1/addresses/create")
      .set(auth(userToken))
      .send(addressPayload({ isDefault: true }));
    expect(created.status).toBe(201);
    expect(created.body.address.isDefault).toBe(true);
    const addressId = created.body.address._id;

    const duplicate = await request(app)
      .post("/api/v1/addresses/create")
      .set(auth(userToken))
      .send(addressPayload({ isDefault: false }));
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.isDuplicate).toBe(true);

    const listed = await request(app)
      .post("/api/v1/addresses")
      .set(auth(userToken))
      .send({});
    expect(listed.status).toBe(200);
    expect(listed.body.addresses).toHaveLength(1);

    const updated = await request(app)
      .put(`/api/v1/addresses/${addressId}`)
      .set(auth(userToken))
      .send({ city: "Thrissur", isDefault: true, userId: "attacker" });
    expect(updated.status).toBe(200);
    expect(updated.body.address.city).toBe("Thrissur");
    expect(updated.body.address.userId).not.toBe("attacker");

    const forbidden = await request(app)
      .put(`/api/v1/addresses/${addressId}`)
      .set(auth(otherToken))
      .send({ city: "Nope" });
    expect(forbidden.status).toBe(403);

    const missingUpdate = await request(app)
      .put(`/api/v1/addresses/${missingId()}`)
      .set(auth(userToken))
      .send({ city: "Nope" });
    expect(missingUpdate.status).toBe(404);

    const forbiddenDelete = await request(app)
      .delete(`/api/v1/addresses/${addressId}`)
      .set(auth(otherToken));
    expect(forbiddenDelete.status).toBe(403);

    const removed = await request(app)
      .delete(`/api/v1/addresses/${addressId}`)
      .set(auth(userToken));
    expect(removed.status).toBe(200);

    const listedAfter = await request(app)
      .post("/api/v1/addresses")
      .set(auth(userToken))
      .send({});
    expect(listedAfter.body.addresses).toHaveLength(0);

    const missingDelete = await request(app)
      .delete(`/api/v1/addresses/${missingId()}`)
      .set(auth(userToken));
    expect(missingDelete.status).toBe(404);
  });

  it("toggles wishlist items and returns enriched products", async () => {
    const product = await createPublishedProduct();
    const productId = product._id.toString();

    const empty = await request(app)
      .get("/api/v1/wishlist")
      .set(auth(userToken));
    expect(empty.status).toBe(200);
    expect(empty.body.productIds).toEqual([]);

    const added = await request(app)
      .post("/api/v1/wishlist/toggle")
      .set(auth(userToken))
      .send({ productId });
    expect(added.status).toBe(200);
    expect(added.body.wishlisted).toBe(true);

    const listed = await request(app)
      .get("/api/v1/wishlist")
      .set(auth(userToken));
    expect(listed.body.productIds).toEqual([productId]);

    const products = await request(app)
      .get("/api/v1/wishlist/products")
      .set(auth(userToken));
    expect(products.status).toBe(200);
    expect(products.body.items).toHaveLength(1);
    expect(products.body.items[0]).toMatchObject({
      productId,
      title: product.title,
      regular_price: 250,
      stock: 4,
    });

    const otherProducts = await request(app)
      .get("/api/v1/wishlist/products")
      .set(auth(otherToken));
    expect(otherProducts.body.items).toEqual([]);

    const removed = await request(app)
      .post("/api/v1/wishlist/toggle")
      .set(auth(userToken))
      .send({ productId });
    expect(removed.status).toBe(200);
    expect(removed.body.wishlisted).toBe(false);

    const after = await request(app)
      .get("/api/v1/wishlist/products")
      .set(auth(userToken));
    expect(after.body.items).toEqual([]);

    const invalid = await request(app)
      .post("/api/v1/wishlist/toggle")
      .set(auth(userToken))
      .send({});
    expect(invalid.status).toBe(400);
  });
});
