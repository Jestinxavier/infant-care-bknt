const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../../src/app");
const Product = require("../../src/models/Product");

let counter = 0;
const unique = (prefix) => `${prefix}-${Date.now()}-${counter++}`;

const romper = (overrides = {}, variants = []) =>
  Product.create({
    title: unique("Romper"),
    url_key: unique("romper").toLowerCase(),
    category: new mongoose.Types.ObjectId(),
    status: "published",
    product_type: "CONFIGURABLE",
    images: ["parent.jpg"],
    variants,
    ...overrides,
  });

const variant = (urlKey, available, price = 400, offerPrice) => ({
  id: unique("v"),
  url_key: urlKey,
  sku: unique("SKU").toUpperCase(),
  price,
  ...(offerPrice ? { offerPrice } : {}),
  stock: available,
  stockObj: { available, isInStock: available > 0 },
  images: [`${urlKey}.jpg`],
});

const lookup = (items) =>
  request(app).post("/api/v1/product/recently-viewed").send({ items });

describe("POST /product/recently-viewed", () => {
  beforeAll(async () => {
    await Product.init();
  });

  it("returns current details, drops deleted/unpublished products, and keeps the order", async () => {
    const inStock = await romper({}, [variant(unique("blue-3-6m").toLowerCase(), 3, 400, 320)]);
    const soldOut = await romper({}, [variant(unique("pink-0-3m").toLowerCase(), 0)]);
    const unpublished = await romper({ status: "draft" }, [variant(unique("x").toLowerCase(), 5)]);
    const deletedId = new mongoose.Types.ObjectId();

    const res = await lookup([
      { productId: String(soldOut._id), url_key: soldOut.variants[0].url_key },
      { productId: String(deletedId), url_key: "gone" },
      { productId: String(unpublished._id) },
      { productId: "not-an-id" },
      { productId: String(inStock._id), url_key: inStock.variants[0].url_key },
    ]);

    expect(res.status).toBe(200);
    // Deleted, unpublished and invalid entries are left out; order is kept.
    expect(res.body.items.map((i) => i.productId)).toEqual([
      String(soldOut._id),
      String(inStock._id),
    ]);

    const [sold, live] = res.body.items;
    // Sold-out items stay (it's the shopper's history), marked as sold out.
    expect(sold).toMatchObject({ inStock: false, url_key: soldOut.variants[0].url_key });
    // Live price/offer and the viewed variant's own link and image.
    expect(live).toMatchObject({
      inStock: true,
      regularPrice: 400,
      discountPrice: 320,
      url_key: inStock.variants[0].url_key,
      image: `${inStock.variants[0].url_key}.jpg`,
    });
  });

  it("falls back to the product's own page when the viewed variant was removed", async () => {
    const product = await romper({}, [variant(unique("white-0-3m").toLowerCase(), 2, 250)]);
    const res = await lookup([{ productId: String(product._id), url_key: "deleted-variant" }]);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      url_key: product.url_key,
      inStock: true,
      regularPrice: 250,
      image: "parent.jpg",
    });
  });

  it("handles an empty or malformed request without failing", async () => {
    expect((await lookup([])).body).toEqual({ success: true, items: [] });
    const bad = await request(app).post("/api/v1/product/recently-viewed").send({ items: "nope" });
    expect(bad.status).toBe(200);
    expect(bad.body.items).toEqual([]);
  });
});
