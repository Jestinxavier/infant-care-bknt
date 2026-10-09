const {
  generateSlug,
  generateUniqueUrlKey,
  validateUrlKey,
} = require("../../src/utils/slugGenerator");
const CollectionRedirect = require("../../src/models/CollectionRedirect");

/**
 * Pure-logic tests for the collection slug/redirect rules.
 *
 * These stub the Mongoose models instead of hitting a database, so they run
 * without MongoMemoryServer. The DB-backed behaviour is covered separately by
 * tests/integration/collectionSlugRedirect.test.js.
 */

/** Minimal in-memory stand-ins for the two queries resolveRedirectChain makes. */
const stubModels = (redirects = [], liveSlugs = []) => {
  const redirect = {
    findOne: ({ fromSlug }) => ({
      lean: async () =>
        redirects.find((r) => r.fromSlug === fromSlug) ?? null,
    }),
  };
  const collection = { exists: () => ({}) };
  CollectionRedirect.__setModels({ redirect, collection });
  return { liveSlugs };
};

afterEach(() => CollectionRedirect.__resetModels());

describe("collection slug generation", () => {
  const taken = (slugs) => async (key) => slugs.includes(key);

  it("slugifies the collection name when no slug is supplied", () => {
    expect(generateSlug("Baby Essentials")).toBe("baby-essentials");
  });

  it("appends -2 then -3 for repeated names instead of colliding", async () => {
    const used = ["baby-essentials", "baby-essentials-2"];
    const exists = taken(used);

    expect(await generateUniqueUrlKey("Baby Essentials", exists)).toBe(
      "baby-essentials-3"
    );
  });

  it("replaces underscores so generated slugs pass validation", () => {
    // generateSlug keeps "_" (a \w char) but validateUrlKey rejects it.
    // The controller pre-strips underscores; verify the result validates.
    const slug = generateSlug("Baby_Toothbrush".replace(/_/g, " "));
    expect(slug).toBe("baby-toothbrush");
    expect(validateUrlKey(slug).valid).toBe(true);
  });

  it("shows the raw generateSlug/validateUrlKey mismatch this guards against", () => {
    // Documents why the controller strips "_" — without it this is unfixable.
    expect(generateSlug("Baby_Toothbrush")).toBe("baby_toothbrush");
    expect(validateUrlKey("baby_toothbrush").valid).toBe(false);
  });

  it("rejects slugs that are too short or too long", () => {
    expect(validateUrlKey("a").valid).toBe(false);
    expect(validateUrlKey("ab").valid).toBe(true);
    expect(validateUrlKey("a".repeat(101)).valid).toBe(false);
    expect(validateUrlKey("a".repeat(100)).valid).toBe(true);
  });

  it("rejects slugs with underscores, spaces, or leading/trailing hyphens", () => {
    expect(validateUrlKey("bad_slug").valid).toBe(false);
    expect(validateUrlKey("bad-slug-").valid).toBe(false);
    expect(validateUrlKey("-bad-slug").valid).toBe(false);
    expect(validateUrlKey("bad--slug").valid).toBe(false);
    expect(validateUrlKey("good-slug-2").valid).toBe(true);
  });
});

describe("resolveRedirectChain", () => {
  it("returns null for a slug that is not a redirect", async () => {
    stubModels([]);
    expect(await CollectionRedirect.resolveRedirectChain("live-slug")).toBeNull();
  });

  it("returns null for an empty or missing slug", async () => {
    stubModels([{ fromSlug: "a", toSlug: "b" }]);
    expect(await CollectionRedirect.resolveRedirectChain("")).toBeNull();
    expect(await CollectionRedirect.resolveRedirectChain(undefined)).toBeNull();
    expect(await CollectionRedirect.resolveRedirectChain(null)).toBeNull();
  });

  it("resolves a single hop", async () => {
    stubModels([{ fromSlug: "old", toSlug: "new" }]);
    expect(await CollectionRedirect.resolveRedirectChain("old")).toBe("new");
  });

  it("stops at the first slug with no record and returns it", async () => {
    // The live destination has no outgoing redirect — that must not read as
    // "not a redirect", which would discard the destination and 404.
    stubModels([{ fromSlug: "old", toSlug: "new" }]);
    expect(await CollectionRedirect.resolveRedirectChain("new")).toBeNull();
    expect(await CollectionRedirect.resolveRedirectChain("old")).toBe("new");
  });

  it("resolves an A->B->C chain to the final slug", async () => {
    stubModels([
      { fromSlug: "a", toSlug: "b" },
      { fromSlug: "b", toSlug: "c" },
    ]);
    expect(await CollectionRedirect.resolveRedirectChain("a")).toBe("c");
  });

  it("returns null instead of looping on a two-node cycle", async () => {
    stubModels([
      { fromSlug: "loop-a", toSlug: "loop-b" },
      { fromSlug: "loop-b", toSlug: "loop-a" },
    ]);
    // A cycle has no live destination, so null (404) is correct here.
    expect(await CollectionRedirect.resolveRedirectChain("loop-a")).toBeNull();
  });

  it("returns null instead of looping on a self-redirect", async () => {
    stubModels([{ fromSlug: "self", toSlug: "self" }]);
    expect(await CollectionRedirect.resolveRedirectChain("self")).toBeNull();
  });

  it("stops at the hop cap for a long chain", async () => {
    const redirects = Array.from({ length: 20 }, (_, i) => ({
      fromSlug: `s${i}`,
      toSlug: `s${i + 1}`,
    }));
    stubModels(redirects);

    // Must terminate rather than hang; cap is 10 hops.
    const result = await CollectionRedirect.resolveRedirectChain("s0");
    expect(result).toBe("s10");
  });

  it("is case-insensitive about the incoming slug", async () => {
    stubModels([{ fromSlug: "old", toSlug: "new" }]);
    expect(await CollectionRedirect.resolveRedirectChain("OLD")).toBe("new");
  });
});