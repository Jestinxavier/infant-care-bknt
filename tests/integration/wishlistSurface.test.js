const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../../src/app");
const Product = require("../../src/models/Product");
const Wishlist = require("../../src/models/Wishlist");
const {
  createVerifiedUser,
  accessTokenFor,
} = require("../helpers/authFixtures");

let counter = 0;
const unique = (prefix) => `${prefix}-${Date.now()}-${counter++}`;
const auth = (token) => ({ Authorization: `Bearer ${token}` });

const makeProduct = async (overrides = {}) =>
  Product.create({
    title: `Wishlist product ${unique("WL")}`,
    category: new mongoose.Types.ObjectId(),
    status: "published",
    product_type: "SIMPLE",
    variants: [],
    images: ["https://cdn.example.com/wishlist.jpg"],
    ...overrides,
  });

describe("Wishlist surface", () => {
  it("requires authentication for every wishlist route", async () => {
    const responses = await Promise.all([
      request(app).get("/api/v1/wishlist"),
      request(app).get("/api/v1/wishlist/products"),
      request(app).post("/api/v1/wishlist/toggle").send({ productId: "x" }),
    ]);

    expect(responses.map((response) => response.statusCode)).toEqual([
      401, 401, 401,
    ]);
  });

  it("returns empty state for a user without a wishlist document", async () => {
    const user = await createVerifiedUser();
    const token = accessTokenFor(user);

    const list = await request(app)
      .get("/api/v1/wishlist")
      .set(auth(token));
    const products = await request(app)
      .get("/api/v1/wishlist/products")
      .set(auth(token));

    expect(list.statusCode).toBe(200);
    expect(list.body).toEqual({ success: true, productIds: [] });
    expect(products.statusCode).toBe(200);
    expect(products.body).toEqual({ success: true, items: [] });
  });

  it("toggles a product on and off and persists the change", async () => {
    const user = await createVerifiedUser();
    const token = accessTokenFor(user);
    const product = await makeProduct({
      price: 999,
      offerPrice: 799,
      offerStartAt: new Date(Date.now() - 60_000),
      offerEndAt: new Date(Date.now() + 60_000),
      stockObj: { available: 5 },
    });

    const added = await request(app)
      .post("/api/v1/wishlist/toggle")
      .set(auth(token))
      .send({ productId: product._id.toString() });

    expect(added.statusCode).toBe(200);
    expect(added.body).toEqual({ success: true, wishlisted: true });

    const listed = await request(app)
      .get("/api/v1/wishlist")
      .set(auth(token));
    expect(listed.body.productIds).toEqual([product._id.toString()]);

    const products = await request(app)
      .get("/api/v1/wishlist/products")
      .set(auth(token));
    expect(products.body.items).toHaveLength(1);
    expect(products.body.items[0]).toMatchObject({
      productId: product._id.toString(),
      title: product.title,
      url_key: product.url_key,
      image: "https://cdn.example.com/wishlist.jpg",
      regular_price: 999,
      offer_price: 799,
      stock: 5,
    });

    const removed = await request(app)
      .post("/api/v1/wishlist/toggle")
      .set(auth(token))
      .send({ productId: product._id.toString() });

    expect(removed.statusCode).toBe(200);
    expect(removed.body).toEqual({ success: true, wishlisted: false });

    const after = await request(app)
      .get("/api/v1/wishlist")
      .set(auth(token));
    expect(after.body.productIds).toEqual([]);
  });

  it("rejects a toggle without a product id", async () => {
    const user = await createVerifiedUser();
    const token = accessTokenFor(user);

    const response = await request(app)
      .post("/api/v1/wishlist/toggle")
      .set(auth(token))
      .send({});

    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({
      success: false,
      message: "productId is required",
    });
  });

  it("keeps wishlists isolated per user", async () => {
    const [userA, userB] = await Promise.all([
      createVerifiedUser(),
      createVerifiedUser(),
    ]);
    const product = await makeProduct();
    const tokenA = accessTokenFor(userA);
    const tokenB = accessTokenFor(userB);

    await request(app)
      .post("/api/v1/wishlist/toggle")
      .set(auth(tokenA))
      .send({ productId: product._id.toString() });

    const listA = await request(app)
      .get("/api/v1/wishlist")
      .set(auth(tokenA));
    const listB = await request(app)
      .get("/api/v1/wishlist")
      .set(auth(tokenB));

    expect(listA.body.productIds).toEqual([product._id.toString()]);
    expect(listB.body.productIds).toEqual([]);
  });

  it("enriches only published products and resolves offers and variant pricing", async () => {
    const user = await createVerifiedUser();
    const token = accessTokenFor(user);

    const [activeOffer, expiredOffer, draft, configurable] = await Promise.all([
      makeProduct({
        title: "Active offer",
        price: 500,
        offerPrice: 400,
        offerStartAt: new Date(Date.now() - 60_000),
        offerEndAt: new Date(Date.now() + 60_000),
        stockObj: { available: 2 },
      }),
      makeProduct({
        title: "Expired offer",
        price: 600,
        offerPrice: 450,
        offerStartAt: new Date(Date.now() - 120_000),
        offerEndAt: new Date(Date.now() - 60_000),
      }),
      makeProduct({ title: "Draft product", status: "draft" }),
      makeProduct({
        title: "Configurable product",
        product_type: "CONFIGURABLE",
        price: 0,
        variants: [
          {
            id: new mongoose.Types.ObjectId().toString(),
            price: 1200,
            offerPrice: 1100,
            offerStartAt: new Date(Date.now() - 60_000),
            offerEndAt: new Date(Date.now() + 60_000),
          },
        ],
      }),
    ]);

    await Wishlist.create({
      userId: user._id,
      productIds: [activeOffer, expiredOffer, draft, configurable].map(
        (product) => product._id
      ),
    });

    const response = await request(app)
      .get("/api/v1/wishlist/products")
      .set(auth(token));

    expect(response.statusCode).toBe(200);
    expect(response.body.items).toHaveLength(3);

    const byTitle = Object.fromEntries(
      response.body.items.map((item) => [item.title, item])
    );
    expect(byTitle["Draft product"]).toBeUndefined();
    expect(byTitle["Active offer"].offer_price).toBe(400);
    expect(byTitle["Expired offer"].offer_price).toBeNull();
    expect(byTitle["Configurable product"]).toMatchObject({
      regular_price: 1200,
      offer_price: 1100,
    });
  });
});
