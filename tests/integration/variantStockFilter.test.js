// Use the MongoDB search path: a locally running Meilisearch would otherwise
// answer with the dev index instead of this test's products.
jest.mock("../../src/config/meilisearch", () => ({
  ...jest.requireActual("../../src/config/meilisearch"),
  isMeilisearchEnabled: () => false,
}));

const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../../src/app");
const Product = require("../../src/models/Product");
const { clearVariantAttributeCache } = require("../../src/utils/variantFilterMatch");

let counter = 0;
const unique = (prefix) => `${prefix}-${Date.now()}-${counter++}`;

const variant = (size, color, available, price = 300) => ({
  id: unique("v"),
  url_key: unique(`${color}-${size}`).toLowerCase(),
  sku: unique("SKU").toUpperCase(),
  price,
  stock: available,
  stockObj: { available, isInStock: available > 0 },
  attributes: { size, color },
});

// filterAttributes hold the union of all variants' values — exactly what lets
// a product match a size filter when only another size is in stock.
const romper = (collection, title, variants) =>
  Product.create({
    title,
    category: new mongoose.Types.ObjectId(),
    status: "published",
    product_type: "CONFIGURABLE",
    collections: [collection],
    filterAttributes: {
      size: [...new Set(variants.map((v) => v.attributes.size))].map((s) =>
        s.toLowerCase().replace("m", "-months")
      ),
      color: [...new Set(variants.map((v) => v.attributes.color))],
      material: ["cotton"],
    },
    variants,
  });

const ids = (res) => res.body.items.map((item) => item.title).sort();
const facetCount = (res, key, value) => {
  const group = (res.body.filters || []).find((f) => f.key === key);
  return group?.options?.find((o) => o.value === value)?.count ?? 0;
};

describe("Size/color filters judge stock on the matching variant", () => {
  let collection;

  beforeAll(async () => {
    await Product.init();
  });

  beforeEach(async () => {
    clearVariantAttributeCache();
    collection = unique("col").toLowerCase();
    // 0-3M in stock, 3-6M sold out (stored with raw spellings like "3-6M").
    await romper(collection, "Partly sold out", [
      variant("0-3M", "white", 4),
      variant("3-6M", "white", 0),
    ]);
    // 3-6M in stock.
    await romper(collection, "Has 3-6M", [
      variant("0-3M", "blue", 0),
      variant("3-6M", "blue", 2),
    ]);
    // Everything sold out.
    await romper(collection, "All sold out", [
      variant("0-3M", "white", 0),
      variant("3-6M", "white", 0),
    ]);
    // Another in-stock 3-6M (keeps a 2-value color group when 3-6M is picked).
    // Priced ₹500 (the others ₹300), for the price-filter checks.
    await romper(collection, "Pink 3-6M", [variant("3-6M", "pink", 3, 500)]);
  });

  const listing = (query) =>
    request(app).get("/api/v1/product/all").query({ collection, ...query });
  const facets = (query) =>
    request(app).get("/api/v1/filter/all").query({ collection, ...query });

  it("hides a product whose chosen size is sold out, even if another size is in stock", async () => {
    // The storefront sends size as `age`.
    const res = await listing({ age: "3-6-months" });
    expect(res.status).toBe(200);
    expect(ids(res)).toEqual(["Has 3-6M", "Pink 3-6M"]);

    const other = await listing({ age: "0-3-months" });
    expect(ids(other)).toEqual(["Partly sold out"]);
  });

  it("without a size filter, lists every product with any size in stock (out of stock hidden by default)", async () => {
    const res = await listing({});
    expect(ids(res)).toEqual(["Has 3-6M", "Partly sold out", "Pink 3-6M"]);
  });

  it("matches size and color on the same variant", async () => {
    // White 3-6M exists only sold out; blue 3-6M is in stock.
    expect(ids(await listing({ age: "3-6-months", color: "white" }))).toEqual([]);
    expect(ids(await listing({ age: "3-6-months", color: "blue" }))).toEqual(["Has 3-6M"]);
  });

  it("product-level filters (not a variant attribute) still work as before", async () => {
    const res = await listing({ material: "cotton" });
    expect(ids(res)).toEqual(["Has 3-6M", "Partly sold out", "Pink 3-6M"]);
  });

  it("Out of Stock lists products with no in-stock variant of the chosen size", async () => {
    const res = await listing({ age: "3-6-months", inStock: "false" });
    expect(ids(res)).toEqual(["All sold out", "Partly sold out"]);

    // Without a size: only products with nothing in stock at all. (This used
    // to return nothing for configurable products.)
    const any = await listing({ inStock: "false" });
    expect(ids(any)).toEqual(["All sold out"]);
  });

  it("links each card to the variant matching the filter, so the PDP opens that size", async () => {
    const res = await listing({ age: "3-6-months" });
    const byTitle = Object.fromEntries(res.body.items.map((i) => [i.title, i]));
    // "Has 3-6M": its in-stock 3-6M (blue), not the sold-out 0-3M.
    expect(byTitle["Has 3-6M"].matchedVariantUrlKey).toMatch(/^blue-3-6m-/);
    expect(byTitle["Pink 3-6M"].matchedVariantUrlKey).toMatch(/^pink-3-6m-/);

    // Size + color: the variant matching both.
    const both = await listing({ age: "0-3-months", color: "white" });
    expect(both.body.items[0].matchedVariantUrlKey).toMatch(/^white-0-3m-/);

    // No size/color filter: cards keep their normal product link.
    const plain = await listing({});
    plain.body.items.forEach((item) => expect(item.matchedVariantUrlKey).toBeUndefined());
  });

  it("search results apply the same size rule (search uses this listing too)", async () => {
    expect(ids(await listing({ search: "Partly", age: "0-3-months" }))).toEqual(["Partly sold out"]);
    // Its 3-6M is sold out, so a 3-6M search finds nothing for it.
    expect(ids(await listing({ search: "Partly", age: "3-6-months" }))).toEqual([]);
  });

  it("search suggestions hide fully sold-out products, like the results page", async () => {
    const suggest = (q) => request(app).get("/api/v1/product/search/suggest").query({ q });
    const soldOut = await suggest("All sold out");
    expect(soldOut.status).toBe(200);
    expect(soldOut.body.products.map((p) => p.title)).not.toContain("All sold out");

    const inStock = await suggest("Pink 3-6M");
    expect(inStock.body.products.map((p) => p.title)).toContain("Pink 3-6M");
  });

  it("price, size and stock must all hold for the same variant", async () => {
    // ₹400–₹600 with 3-6M: only Pink's 3-6M (₹500) fits.
    expect(ids(await listing({ age: "3-6-months", price: "400,600" }))).toEqual(["Pink 3-6M"]);
    // ₹250–₹350 with 3-6M: Blue's 3-6M (₹300); Pink is out of range.
    expect(ids(await listing({ age: "3-6-months", price: "250,350" }))).toEqual(["Has 3-6M"]);
  });

  it("filter counts follow the price filter, but the price slider keeps its full range", async () => {
    const res = await facets({ price: "250,350" });
    // Pink (₹500) is outside the range: 3-6M counts only "Has 3-6M" now.
    expect(facetCount(res, "age", "3-6-months")).toBe(1);
    expect(facetCount(res, "age", "0-3-months")).toBe(1);
    // The slider still spans every in-stock price (₹300–₹500), not ₹250–₹350.
    const slider = (res.body.filters || []).find((f) => f.key === "priceRange");
    expect(slider).toMatchObject({ min: 300, max: 500 });
  });

  it("facet counts match what the listing shows", async () => {
    const all = await facets({});
    expect(all.status).toBe(200);
    // In stock: 0-3M only on "Partly sold out"; 3-6M on "Has 3-6M" and "Pink 3-6M".
    expect(facetCount(all, "age", "0-3-months")).toBe(1);
    expect(facetCount(all, "age", "3-6-months")).toBe(2);
    // Colors of in-stock variants only.
    expect(facetCount(all, "color", "white")).toBe(1);
    expect(facetCount(all, "color", "blue")).toBe(1);
    expect(facetCount(all, "color", "pink")).toBe(1);

    // With 3-6M picked, white (only sold out in 3-6M) no longer counts.
    const picked = await facets({ age: "3-6-months" });
    expect(facetCount(picked, "color", "blue")).toBe(1);
    expect(facetCount(picked, "color", "pink")).toBe(1);
    expect(facetCount(picked, "color", "white")).toBe(0);

    // Out of stock with 3-6M: the two products the listing shows.
    const soldOut = await facets({ age: "3-6-months", inStock: "false" });
    expect(facetCount(soldOut, "age", "3-6-months")).toBe(2);
  });

  it("each group's counts follow the OTHER selections, and keep its own options", async () => {
    // Blue is only in stock in 3-6M ("Has 3-6M").
    const blue = await facets({ color: "blue" });
    // Only one size is left, so the Size group (needs 2+ options) is hidden;
    // before this change it still showed both sizes.
    expect(facetCount(blue, "age", "0-3-months")).toBe(0);
    // The Color group ignores its own pick, so other colours stay selectable.
    expect(facetCount(blue, "color", "white")).toBe(1);
    expect(facetCount(blue, "color", "pink")).toBe(1);
    expect(facetCount(blue, "color", "blue")).toBe(1);

    // Two picks in one group widen the other groups (OR within a group).
    const blueOrWhite = await facets({ color: "blue,white" });
    expect(facetCount(blueOrWhite, "age", "0-3-months")).toBe(1);
    expect(facetCount(blueOrWhite, "age", "3-6-months")).toBe(1);

    // Every count equals what the listing shows when that value is added.
    for (const age of ["0-3-months", "3-6-months"]) {
      const listed = await listing({ color: "blue,white", age });
      expect(ids(listed)).toHaveLength(facetCount(blueOrWhite, "age", age));
    }
  });

  it("a product-level pick (material) narrows the variant groups too", async () => {
    await Product.create({
      title: "Wool romper",
      category: new mongoose.Types.ObjectId(),
      status: "published",
      product_type: "CONFIGURABLE",
      collections: [collection],
      filterAttributes: {
        size: ["0-3-months", "3-6-months"],
        color: ["green", "red"],
        material: ["wool"],
      },
      variants: [
        variant("0-3M", "green", 5),
        variant("3-6M", "red", 3),
        variant("0-3M", "yellow", 0),
      ],
    });
    clearVariantAttributeCache();

    const wool = await facets({ material: "wool" });
    // Only the wool romper's in-stock colours; the cotton ones drop out.
    expect(facetCount(wool, "color", "green")).toBe(1);
    expect(facetCount(wool, "color", "white")).toBe(0);
    expect(facetCount(wool, "color", "blue")).toBe(0);
    expect(facetCount(wool, "color", "red")).toBe(1);
    expect(facetCount(wool, "color", "yellow")).toBe(0); // sold out
    // The Material group still offers cotton alongside wool.
    expect(facetCount(wool, "material", "cotton")).toBe(3);
    expect(facetCount(wool, "material", "wool")).toBe(1);
  });
});

describe("Category facet group", () => {
  const Category = require("../../src/models/Category");

  it("stays on the all-products listing when a category is picked, but not on a category page", async () => {
    const tag = unique("cat").toLowerCase();
    const [a, b] = await Category.create([
      { name: `A ${tag}`, code: `a-${tag}`, slug: `a-${tag}`, isActive: true },
      { name: `B ${tag}`, code: `b-${tag}`, slug: `b-${tag}`, isActive: true },
    ]);
    const make = (title, category) =>
      Product.create({
        title,
        category: category._id,
        status: "published",
        product_type: "SIMPLE",
        sku: unique("SKU").toUpperCase(),
        price: 200,
        stock: 5,
        stockObj: { available: 5, isInStock: true },
        filterAttributes: { material: ["cotton"] },
      });
    await make(`In A ${tag}`, a);
    await make(`In B ${tag}`, b);

    const categoryValues = (res) =>
      ((res.body.filters || []).find((f) => f.key === "category")?.options || []).map(
        (o) => o.value
      );

    // All-products page with category A picked: the group still lists B,
    // so the shopper can add or switch categories.
    const picked = await request(app).get("/api/v1/filter/all").query({ category: a.code });
    expect(picked.status).toBe(200);
    expect(categoryValues(picked)).toEqual(expect.arrayContaining([a.code, b.code]));

    // Category page (category in the path): no Category group.
    const page = await request(app).get(`/api/v1/filter/${a.code}`);
    expect(page.status).toBe(200);
    expect(categoryValues(page)).toEqual([]);
  });
});
