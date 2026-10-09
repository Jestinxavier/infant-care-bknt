const request = require("supertest");
const app = require("../../src/app");
const Collection = require("../../src/models/Collection");
const CollectionRedirect = require("../../src/models/CollectionRedirect");
const User = require("../../src/models/user");

/**
 * Login returns the access token only as an HttpOnly cookie (see
 * controllers/auth/login.js), never in the response body — so pull it out of
 * Set-Cookie to use as a Bearer header.
 */
const extractAccessToken = (res) => {
  const cookies = res.headers["set-cookie"] || [];
  for (const cookie of cookies) {
    const match = cookie.match(/^(?:dashboard_)?access_token=([^;]+)/);
    if (match) return decodeURIComponent(match[1]);
  }
  return null;
};

/**
 * Collection slug contract:
 *  - auto-generated slugs de-dupe with a numeric suffix instead of 409
 *  - explicit slugs validate and 409 on collision
 *  - renames record a redirect so retired URLs keep resolving (301)
 *  - redirect chains collapse to the final live slug
 */
describe("Collection slug + redirect", () => {
  let adminToken;

  // tests/setup.js truncates every collection after each test, and
  // requireAdmin re-reads the user from the DB on every request — so the admin
  // account has to be recreated (and a fresh token issued) for each test.
  beforeEach(async () => {
    const adminUser = await User.create({
      username: "collectionadmin",
      email: "collectionadmin@example.com",
      password: "Password123!",
      role: "admin",
      isEmailVerified: true,
    });

    const loginRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: adminUser.email, password: "Password123!" });

    adminToken = extractAccessToken(loginRes);

    if (!adminToken) {
      throw new Error(
        `Could not read access_token cookie from login: ${JSON.stringify(
          loginRes.headers["set-cookie"]
        )}`
      );
    }
  });

  const create = (body) =>
    request(app)
      .post("/api/v1/admin/collections")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(body);

  const patch = (id, body) =>
    request(app)
      .patch(`/api/v1/admin/collections/${id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send(body);

  const get = (slug) => request(app).get(`/api/v1/collection/${slug}`);

  describe("slug generation", () => {
    it("slugifies the name when no slug is given", async () => {
      const res = await create({ name: "Baby Essentials" });
      expect(res.status).toBe(201);
      expect(res.body.item.slug).toBe("baby-essentials");
      expect(res.body.item.path).toBe("/collection/baby-essentials");
    });

    it("appends -2 then -3 for repeated names instead of 409-ing", async () => {
      const first = await create({ name: "Baby Essentials" });
      const second = await create({ name: "Baby Essentials" });
      const third = await create({ name: "Baby Essentials" });

      expect(second.status).toBe(201);
      expect(third.status).toBe(201);
      expect(second.body.item.slug).toBe("baby-essentials-2");
      expect(third.body.item.slug).toBe("baby-essentials-3");
      expect(first.body.item.slug).toBe("baby-essentials");
    });

    it("converts underscores to hyphens so generated slugs always validate", async () => {
      // generateSlug keeps "_" but validateUrlKey rejects it.
      const res = await create({ name: "Baby_Toothbrush" });
      expect(res.status).toBe(201);
      expect(res.body.item.slug).toBe("baby-toothbrush");
    });

    it("rejects a name that cannot produce a slug with 400, not 500", async () => {
      const res = await create({ name: "!!!" });
      expect(res.status).toBe(400);
    });
  });

  describe("explicit slug validation", () => {
    it("accepts a valid explicit slug", async () => {
      const res = await create({ name: "Anything", slug: "my-custom-slug" });
      expect(res.status).toBe(201);
      expect(res.body.item.slug).toBe("my-custom-slug");
    });

    it("409s when the explicit slug is taken", async () => {
      await create({ name: "First", slug: "shared-slug" });
      const res = await create({ name: "Second", slug: "shared-slug" });
      expect(res.status).toBe(409);
    });

    it("rejects a one-character explicit slug", async () => {
      const res = await create({ name: "Fine", slug: "a" });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/at least 2 characters/i);
    });

    it("rejects a slug with underscores", async () => {
      const res = await create({ name: "Fine", slug: "bad_slug" });
      expect(res.status).toBe(400);
    });
  });

  describe("storefront lookup", () => {
    it("returns the collection for a live slug with no redirect", async () => {
      await create({ name: "Baby Essentials" });
      const res = await get("baby-essentials");

      expect(res.status).toBe(200);
      expect(res.body.collection.slug).toBe("baby-essentials");
      expect(res.body.redirectedTo).toBeNull();
    });

    it("404s an unknown slug", async () => {
      const res = await get("never-existed");
      expect(res.status).toBe(404);
    });
  });

  describe("rename redirects", () => {
    it("keeps the slug when only the name changes", async () => {
      // Standard ecommerce behaviour: the URL is decoupled from the name so a
      // rename (typo fix, rebrand) never breaks existing links.
      const created = await create({ name: "Baby Essentials" });
      const id = created.body.item._id;

      const res = await patch(id, { name: "Newborn Essentials" });
      expect(res.status).toBe(200);
      expect(res.body.item.name).toBe("Newborn Essentials");
      expect(res.body.item.slug).toBe("baby-essentials");
      expect(await CollectionRedirect.countDocuments()).toBe(0);

      const lookup = await get("baby-essentials");
      expect(lookup.status).toBe(200);
      expect(lookup.body.redirectedTo).toBeNull();
    });

    it("records oldSlug -> newSlug and resolves the retired URL", async () => {
      const created = await create({ name: "Baby Essentials" });
      const id = created.body.item._id;

      // Slug changes are deliberate — renaming alone must not move the URL.
      const renamed = await patch(id, { slug: "newborn-essentials" });
      expect(renamed.status).toBe(200);
      expect(renamed.body.item.slug).toBe("newborn-essentials");

      const record = await CollectionRedirect.findOne({
        fromSlug: "baby-essentials",
      });
      expect(record.toSlug).toBe("newborn-essentials");

      const res = await get("baby-essentials");
      expect(res.status).toBe(200);
      expect(res.body.redirectedTo).toBe("newborn-essentials");
      expect(res.body.collection.slug).toBe("newborn-essentials");
    });

    it("does not create a redirect when the slug is unchanged", async () => {
      const created = await create({ name: "Stable" });
      await patch(created.body.item._id, { badgeLabel: "New" });

      expect(await CollectionRedirect.countDocuments()).toBe(0);
    });

    it("resolves an A->B->C chain to the final live slug", async () => {
      const created = await create({ name: "Alpha" });
      const id = created.body.item._id;

      await patch(id, { slug: "bravo" });
      await patch(id, { slug: "charlie" });

      const res = await get("alpha");
      expect(res.status).toBe(200);
      expect(res.body.redirectedTo).toBe("charlie");
      expect(res.body.collection.slug).toBe("charlie");
    });

    it("drops the redirect when the old slug is later reused by a live collection", async () => {
      const first = await create({ name: "Original" });
      const originalId = first.body.item._id;

      await patch(originalId, { slug: "renamed-original" });
      expect(await CollectionRedirect.countDocuments()).toBe(1);

      // Someone now creates a brand new collection claiming "original".
      const second = await create({ name: "Brand New", slug: "original" });
      expect(second.status).toBe(201);

      // Creating it must have cleared the retired slug's redirect, otherwise
      // the old row would still send "original" visitors to the renamed one.
      expect(
        await CollectionRedirect.findOne({ fromSlug: "original" })
      ).toBeNull();

      // "original" is live again, so it must resolve to itself, not redirect.
      const res = await get("original");
      expect(res.status).toBe(200);
      expect(res.body.redirectedTo).toBeNull();
      expect(res.body.collection.name).toBe("Brand New");
    });

    it("409s renaming onto another collection's live slug", async () => {
      await create({ name: "Keeper", slug: "keeper" });
      const other = await create({ name: "Mover" });

      const res = await patch(other.body.item._id, { slug: "keeper" });
      expect(res.status).toBe(409);
    });

    it("lets a collection keep its own slug on update", async () => {
      const created = await create({ name: "Keeper", slug: "keeper" });
      const res = await patch(created.body.item._id, {
        name: "Keeper Renamed",
      });
      expect(res.status).toBe(200);
      expect(res.body.item.slug).toBe("keeper");
    });
  });

  describe("redirect admin endpoints", () => {
    it("lists and deletes redirects", async () => {
      const created = await create({ name: "Listable" });
      await patch(created.body.item._id, { slug: "listable-renamed" });

      const list = await request(app)
        .get("/api/v1/admin/collections/redirects")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(list.status).toBe(200);
      expect(list.body.items).toHaveLength(1);
      expect(list.body.items[0].fromSlug).toBe("listable");

      const del = await request(app)
        .delete(`/api/v1/admin/collections/redirects/${list.body.items[0]._id}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(del.status).toBe(200);
      expect(await CollectionRedirect.countDocuments()).toBe(0);
    });
  });

  describe("cycle safety", () => {
    it("resolveRedirectChain returns null for a cycle", async () => {
      await CollectionRedirect.create({ fromSlug: "loop-a", toSlug: "loop-b" });
      await CollectionRedirect.create({ fromSlug: "loop-b", toSlug: "loop-a" });

      const result = await CollectionRedirect.resolveRedirectChain("loop-a");
      expect(result).toBeNull();
    });

    it("resolveRedirectChain returns null for an unknown slug", async () => {
      const result = await CollectionRedirect.resolveRedirectChain("nope");
      expect(result).toBeNull();
    });
  });
});