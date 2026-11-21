const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../../src/app");
const Product = require("../../src/models/Product");

let counter = 0;
const unique = (prefix) => `${prefix}-${Date.now()}-${counter++}`;

const makeProduct = async (overrides = {}) =>
  Product.create({
    title: `Search product ${unique("SEARCH")}`,
    category: new mongoose.Types.ObjectId(),
    status: "published",
    stockObj: { available: 5, isInStock: true },
    variants: [],
    ...overrides,
  });

describe("Product search surface", () => {
  beforeAll(async () => {
    await Product.init();
  });

  it("requires a non-empty search term", async () => {
    const missing = await request(app).get("/api/v1/product/search");
    expect(missing.status).toBe(400);
    expect(missing.body.message).toBe("Search term is required");

    const blank = await request(app).get("/api/v1/product/search").query({ q: "   " });
    expect(blank.status).toBe(400);
  });

  it("searches published in-stock products by title text and excludes drafts/out-of-stock items", async () => {
    await makeProduct({
      title: "Cotton Air Romper",
      variants: [],
    });
    await makeProduct({
      title: "Cotton Air Romper Draft",
      status: "draft",
      variants: [],
    });
    await makeProduct({
      title: "Cotton Air Romper Sold Out",
      stockObj: { available: 0, isInStock: false },
      variants: [],
    });

    const response = await request(app)
      .get("/api/v1/product/search")
      .query({ q: "Cotton Air Romper", limit: 10 });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].title).toBe("Cotton Air Romper");
    expect(response.body.pagination).toEqual(
      expect.objectContaining({ page: 1, total: 1 }),
    );
  });

  it("supports SKU-prefix matches and product-type filtering with pagination", async () => {
    const sku = unique("PFX").toUpperCase();
    await makeProduct({
      title: "Variant Search Product",
      product_type: "CONFIGURABLE",
      variants: [
        {
          id: unique("variant"),
          sku,
          price: 599,
          stock: 3,
          stockObj: { available: 3, isInStock: true },
        },
      ],
    });
    await makeProduct({
      title: "Bundle Search Product",
      product_type: "BUNDLE",
      variants: [],
    });
    await makeProduct({
      title: "Simple Search Product",
      product_type: "SIMPLE",
      variants: [],
    });

    const prefix = sku.slice(0, 8);
    const skuSearch = await request(app)
      .get("/api/v1/product/search")
      .query({ q: prefix });
    expect(skuSearch.status).toBe(200);
    expect(skuSearch.body.data).toHaveLength(1);
    expect(skuSearch.body.data[0].title).toBe("Variant Search Product");

    const bundleSearch = await request(app)
      .get("/api/v1/product/search")
      .query({ q: "Search Product", product_type: "BUNDLE", limit: 1 });
    expect(bundleSearch.status).toBe(200);
    expect(bundleSearch.body.data).toHaveLength(1);
    expect(bundleSearch.body.data[0].product_type).toBe("BUNDLE");
    expect(bundleSearch.body.pagination).toEqual(
      expect.objectContaining({ limit: 1 }),
    );
  });

  // Regression: suggest showed the SKU's product, but "View all"
  // (/product/all?search=<sku>) returned nothing or unrelated products.
  describe("exact SKU: suggest and /search listing agree", () => {
    const listing = (search, extra = {}) =>
      request(app).get("/api/v1/product/all").query({ search, ...extra });
    const facets = (search) =>
      request(app).get("/api/v1/filter/all").query({ search });
    const suggest = (q) =>
      request(app).get("/api/v1/product/search/suggest").query({ q });

    it("finds a SIMPLE product by its root SKU (case-insensitive)", async () => {
      const sku = `${Date.now()}`.slice(-6) + "o2eag1ix-17872180";
      const product = await makeProduct({
        title: "Root Sku Cord Set",
        product_type: "SIMPLE",
        sku,
        price: 250,
      });

      const s = await suggest(sku.toUpperCase());
      expect(s.body.exactMatch).toBe(true);
      expect(s.body.products.map((p) => p.id)).toEqual([String(product._id)]);

      const res = await listing(sku.toUpperCase());
      expect(res.status).toBe(200);
      expect(res.body.items.map((i) => String(i.id))).toEqual([
        String(product._id),
      ]);

      const f = await facets(sku);
      expect(f.status).toBe(200);
    });

    it("shows a sold-out SKU unless a stock filter is chosen, and ignores near-miss SKUs", async () => {
      const base = `NEW--PRMM-${Date.now()}`.toUpperCase();
      const soldOut = await makeProduct({
        title: "Mosquito Net Bedding Set",
        product_type: "CONFIGURABLE",
        stockObj: { available: 0, isInStock: false },
        variants: [
          {
            id: unique("variant"),
            sku: base,
            price: 999,
            stock: 0,
            stockObj: { available: 0, isInStock: false },
          },
        ],
      });
      // One-char-off SKU on a different, in-stock product.
      await makeProduct({
        title: "Carry Nest Pink",
        product_type: "SIMPLE",
        sku: `${base}1`,
        price: 800,
      });

      const s = await suggest(base);
      expect(s.body.exactMatch).toBe(true);
      expect(s.body.products[0].id).toBe(String(soldOut._id));

      const res = await listing(base);
      expect(res.body.items.map((i) => String(i.id))).toEqual([
        String(soldOut._id),
      ]);

      const inStockOnly = await listing(base, { inStock: "true" });
      expect(inStockOnly.body.items).toHaveLength(0);

      // Non-existent SKU: no fuzzy title matches in suggest or listing.
      const missing = `${base}ZZ9`;
      expect((await suggest(missing)).body.products).toHaveLength(0);
      const lm = await listing(missing);
      expect(lm.status).toBe(200);
      expect(lm.body.items).toHaveLength(0);
    });
  });
  // Regression: search also matches descriptions, and the default sort is
  // newest first, so newer products that merely mention the word (sleep suits
  // with "free knot Jabalas" promo text) filled page 1 ahead of real Jabalas.
  describe("search listing relevance", () => {
    const listing = (query) =>
      request(app).get("/api/v1/product/all").query(query);

    it("ranks title matches above description-only matches unless a sort is chosen", async () => {
      const word = `zorbix${counter++}`;
      const titled = await makeProduct({
        title: `Button ${word} Off White`,
        product_type: "SIMPLE",
        price: 100,
        createdAt: new Date("2026-01-01T00:00:00Z"),
      });
      const mentioned = await makeProduct({
        title: `Sleep Suit Promo ${counter++}`,
        description: `5 sleep suits + 5 free ${word}s`,
        product_type: "SIMPLE",
        price: 100,
        createdAt: new Date("2026-06-01T00:00:00Z"),
      });

      const ranked = await listing({ search: word, limit: 10 });
      expect(ranked.status).toBe(200);
      expect(ranked.body.items.map((i) => String(i.id))).toEqual([
        String(titled._id),
        String(mentioned._id),
      ]);

      // An explicit sort is respected: newest first puts the promo product first
      const newest = await listing({ search: word, sort: "newest", limit: 10 });
      expect(newest.body.items.map((i) => String(i.id))).toEqual([
        String(mentioned._id),
        String(titled._id),
      ]);
    });

    it("treats jabala / jhabla spellings as the same search", async () => {
      const tag = `${counter++}`;
      const product = await makeProduct({
        title: `Side Button Jhabla Grey ${tag}`,
        product_type: "SIMPLE",
        price: 100,
      });
      const res = await listing({ search: `jabala grey ${tag}`, limit: 10 });
      expect(res.body.items.map((i) => String(i.id))).toContain(String(product._id));
    });

    const ids = (res) => res.body.items.map((i) => String(i.id));

    it("matches short words exactly instead of one-letter variants", async () => {
      const tag = `${counter++}`;
      const bib = await makeProduct({ title: `Bib Pink ${tag}`, product_type: "SIMPLE", price: 100 });
      const big = await makeProduct({ title: `Big Teddy ${tag}`, product_type: "SIMPLE", price: 100 });

      const res = await listing({ search: `bib ${tag}`, limit: 10 });
      expect(ids(res)).toContain(String(bib._id));
      expect(ids(res)).not.toContain(String(big._id));
    });

    it("treats sleepsuit / sleep suit(s) as the same search", async () => {
      const tag = `${counter++}`;
      const joined = await makeProduct({ title: `Sleepsuit Star ${tag}`, product_type: "SIMPLE", price: 100 });
      const split = await makeProduct({ title: `Sleep Suit Moon ${tag}`, product_type: "SIMPLE", price: 100 });

      for (const search of [`sleepsuit ${tag}`, `sleep suits ${tag}`]) {
        const res = await listing({ search, limit: 10 });
        expect(ids(res)).toEqual(expect.arrayContaining([String(joined._id), String(split._id)]));
      }
    });

    it("matches -ies plurals (nappies -> nappy)", async () => {
      const tag = `${counter++}`;
      const nappy = await makeProduct({ title: `Velcro Nappy ${tag}`, product_type: "SIMPLE", price: 100 });
      const res = await listing({ search: `nappies ${tag}`, limit: 10 });
      expect(ids(res)).toContain(String(nappy._id));
    });

    it("'newborn' finds unsized newborn kits and newborn-size products", async () => {
      const tag = `${counter++}`;
      const kit = await makeProduct({
        title: `New Born Hospital Kit ${tag}`,
        product_type: "SIMPLE",
        price: 100,
      });
      const sized = await makeProduct({
        title: `Sleepsuit Plain ${tag}`,
        product_type: "SIMPLE",
        price: 100,
        filterAttributes: { size: ["newborn"] },
      });

      const all = await listing({ search: `newborn ${tag}`, limit: 10 });
      expect(ids(all)).toEqual(expect.arrayContaining([String(kit._id), String(sized._id)]));

      const kits = await listing({ search: `newborn kit ${tag}`, limit: 10 });
      expect(ids(kits)).toEqual([String(kit._id)]);
    });

    it("links nappy / diaper and lists the matching category before sets", async () => {
      const tag = `${counter++}`;
      const set = await makeProduct({
        title: `Jhabla Nappy Set ${tag}`,
        categoryName: "Sets & Combos",
        product_type: "SIMPLE",
        price: 100,
        createdAt: new Date("2026-06-01T00:00:00Z"),
      });
      const nappy = await makeProduct({
        title: `Padded Nappy ${tag}`,
        categoryName: "Diapering & Nappies",
        product_type: "SIMPLE",
        price: 100,
        createdAt: new Date("2026-01-01T00:00:00Z"),
      });
      const diaper = await makeProduct({
        title: `Reusable Diaper ${tag}`,
        categoryName: "Diapering & Nappies",
        product_type: "SIMPLE",
        price: 100,
        createdAt: new Date("2026-02-01T00:00:00Z"),
      });

      for (const word of ["diaper", "nappies"]) {
        const res = await listing({ search: `${word} ${tag}`, limit: 10 });
        // Diapering category first (newest first within it), the newer set last
        expect(ids(res)).toEqual([String(diaper._id), String(nappy._id), String(set._id)]);
      }
    });

    it("still forgives a typo in a 4-letter word (frok -> frock)", async () => {
      const tag = `${counter++}`;
      const frock = await makeProduct({ title: `A-Line Frock ${tag}`, product_type: "SIMPLE", price: 100 });
      const res = await listing({ search: `frok ${tag}`, limit: 10 });
      expect(ids(res)).toContain(String(frock._id));
    });
  });
  // The filter sidebar must count exactly what the listing shows.
  describe("search filter sidebar matches the listing", () => {
    const listing = (query) => request(app).get("/api/v1/product/all").query(query);
    const facetCount = async (search, key, value) => {
      const res = await request(app).get("/api/v1/filter/all").query({ search });
      expect(res.status).toBe(200);
      const facet = res.body.filters.find((f) => f.key === key);
      return facet?.options.find((o) => o.value === value)?.count ?? 0;
    };

    it("applies 'girls' as a gender filter in the counts, as the listing does", async () => {
      const tag = `zelk${counter++}`;
      const product = (gender) =>
        makeProduct({
          title: `Frock ${tag} ${gender}`,
          product_type: "SIMPLE",
          price: 100,
          // Two colours: a facet with a single option is hidden.
          filterAttributes: { gender: [gender], color: ["red", "blue"] },
        });
      await product("girls");
      await product("unisex");

      const search = `girls frock ${tag}`;
      const res = await listing({ search, limit: 10 });
      expect(res.body.items).toHaveLength(1);
      expect(await facetCount(search, "color", "red")).toBe(1);
    });

    it("counts { available: 0, isInStock: true } as out of stock, as the listing does", async () => {
      const tag = `vosk${counter++}`;
      await makeProduct({
        title: `Carry Nest ${tag}`,
        product_type: "SIMPLE",
        price: 100,
        stockObj: { available: 0, isInStock: true },
        filterAttributes: { color: ["green", "pink"] },
      });
      await makeProduct({
        title: `Carry Nest ${tag} In Stock`,
        product_type: "SIMPLE",
        price: 100,
        filterAttributes: { color: ["green", "yellow"] },
      });

      const res = await listing({ search: `carry nest ${tag}`, limit: 10 });
      expect(res.body.items).toHaveLength(1);
      expect(await facetCount(`carry nest ${tag}`, "color", "green")).toBe(1);
    });
  });
});
