// Storefront search when Meilisearch is available: Meilisearch decides which
// products match and their order; MongoDB still applies filters and stock.
// Meilisearch itself is mocked: `mockSearch` stands in for index.search().
const mockSearch = jest.fn();

jest.mock("../../src/config/meilisearch", () => ({
  client: {},
  PRODUCTS_INDEX_NAME: "products",
  isMeilisearchEnabled: () => true,
  getProductsIndex: () => ({ search: mockSearch }),
}));

const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../../src/app");
const Product = require("../../src/models/Product");
const { categoryFirst } = require("../../src/services/productSearchService");

let counter = 0;
const makeProduct = async (overrides = {}) =>
  Product.create({
    title: `Meili product ${Date.now()}-${counter++}`,
    category: new mongoose.Types.ObjectId(),
    status: "published",
    stockObj: { available: 5, isInStock: true },
    variants: [],
    product_type: "SIMPLE",
    price: 100,
    ...overrides,
  });

const hit = (product, category = "", parentCategory = "") => ({
  id: String(product._id),
  category,
  parentCategory,
});

const listing = (query) => request(app).get("/api/v1/product/all").query(query);
const ids = (res) => res.body.items.map((i) => String(i.id));

describe("Product search via Meilisearch", () => {
  beforeAll(async () => {
    await Product.init();
  });

  beforeEach(() => {
    mockSearch.mockReset();
  });

  it("returns Meilisearch's products in its order, with filters applied in MongoDB", async () => {
    const tag = `m${counter++}`;
    const a = await makeProduct({ title: `Alpha ${tag}`, price: 300 });
    const b = await makeProduct({ title: `Bravo ${tag}`, price: 100 });
    const c = await makeProduct({ title: `Charlie ${tag}`, price: 200 });
    const outOfStock = await makeProduct({
      title: `Delta ${tag}`,
      stockObj: { available: 0, isInStock: false },
    });
    mockSearch.mockResolvedValue({
      hits: [hit(c), hit(outOfStock), hit(a), hit(b)],
    });

    const ranked = await listing({ search: "anything", inStock: "true", limit: 10 });
    expect(ranked.status).toBe(200);
    expect(ids(ranked)).toEqual([String(c._id), String(a._id), String(b._id)]);
    expect(ranked.body.total ?? ranked.body.pagination?.total).toBe(3);

    // The search runs on published products only, every word required
    expect(mockSearch).toHaveBeenCalledWith(
      "anything",
      expect.objectContaining({ filter: 'status = "published"', matchingStrategy: "all" })
    );

    // A chosen sort wins over relevance
    const cheapest = await listing({ search: "anything", inStock: "true", sort: "price_asc", limit: 10 });
    expect(ids(cheapest)).toEqual([String(b._id), String(c._id), String(a._id)]);
  });

  it("lists products from a matching category first", async () => {
    const set = await makeProduct({ title: `Jhabla Nappy Set ${counter++}` });
    const nappy = await makeProduct({ title: `Padded Nappy ${counter++}` });
    mockSearch.mockResolvedValue({
      hits: [hit(set, "Sets & Combos"), hit(nappy, "Padded Nappy", "Diapering & Nappies")],
    });

    const res = await listing({ search: "diaper", limit: 10 });
    expect(ids(res)).toEqual([String(nappy._id), String(set._id)]);
  });

  it("uses the MongoDB search when Meilisearch finds nothing or fails", async () => {
    const word = `qorvex${counter++}`;
    const product = await makeProduct({ title: `Button ${word}` });

    mockSearch.mockResolvedValue({ hits: [] });
    const empty = await listing({ search: word, limit: 10 });
    expect(ids(empty)).toEqual([String(product._id)]);

    mockSearch.mockRejectedValue(new Error("connection refused"));
    const down = await listing({ search: word, limit: 10 });
    expect(down.status).toBe(200);
    expect(ids(down)).toEqual([String(product._id)]);
  });

  it("searches only the text left after filter words ('girls frock' -> 'frock')", async () => {
    const frock = await makeProduct({ title: `A-Line Frock ${counter++}` });
    mockSearch.mockResolvedValue({ hits: [hit(frock)] });

    await listing({ search: "girls frock", limit: 10 });
    expect(mockSearch).toHaveBeenCalledWith("frock", expect.any(Object));
  });

  it("filter sidebar counts use the same Meilisearch products", async () => {
    const product = await makeProduct({ title: `Echo ${counter++}` });
    mockSearch.mockResolvedValue({ hits: [hit(product)] });

    const res = await request(app).get("/api/v1/filter/all").query({ search: "echo" });
    expect(res.status).toBe(200);
    expect(mockSearch).toHaveBeenCalledWith("echo", expect.any(Object));
  });
});

describe("categoryFirst", () => {
  it("keeps Meilisearch order inside each group", () => {
    const hits = [
      { id: "1", category: "Sets & Combos" },
      { id: "2", category: "Reusable Diaper", parentCategory: "Diapering & Nappies" },
      { id: "3", category: "Sleep Suits" },
      { id: "4", category: "Diapering & Nappies" },
    ];
    expect(categoryFirst(hits, "diaper").map((h) => h.id)).toEqual(["2", "4", "1", "3"]);
  });
});
