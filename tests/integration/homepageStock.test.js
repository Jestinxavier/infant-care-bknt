const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../../src/app");
const Product = require("../../src/models/Product");
const Homepage = require("../../src/models/Homepage");

const configurable = (title, available) =>
  Product.create({
    title,
    category: new mongoose.Types.ObjectId(),
    status: "published",
    product_type: "CONFIGURABLE",
    // Product-level stockObj left at its default (isInStock: true) — as on
    // real configurable products, whose stock lives on the variants.
    variants: [
      {
        id: `v-${title}`,
        sku: `SKU-${title}-${Date.now()}`.toUpperCase().replace(/\s/g, ""),
        price: 300,
        stock: available,
        stockObj: { available, isInStock: available > 0 },
      },
    ],
  });

describe("Homepage hand-picked product widgets hide sold-out products", () => {
  beforeEach(async () => {
    await Homepage.deleteMany({});
  });

  it("filters both product sliders and editor's picks", async () => {
    const inStock = await configurable("Picked In Stock", 5);
    const soldOut = await configurable("Picked Sold Out", 0);
    const items = [inStock, soldOut].map((p) => ({ _id: String(p._id), title: p.title }));

    await Homepage.create([
      { block_type: "productSlider", enabled: true, order: 1, title: "Slider", content: items },
      { block_type: "editorPicks", enabled: true, order: 2, title: "Picks", content: items },
    ]);

    const res = await request(app).get("/api/v1/homepage");
    expect(res.status).toBe(200);
    const byType = Object.fromEntries(res.body.data.map((w) => [w.block_type, w]));
    expect(byType.productSlider.content.map((i) => i.title)).toEqual(["Picked In Stock"]);
    // Editor's picks used to skip the stock check entirely.
    expect(byType.editorPicks.content.map((i) => i.title)).toEqual(["Picked In Stock"]);
  });
});
