const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../../src/app");
const {
  createVerifiedUser,
  accessTokenFor,
} = require("../helpers/authFixtures");

let counter = 0;
const uniqueToken = (prefix) => `${prefix}-${Date.now()}-${counter++}`;

const auth = (token) => ({ Authorization: `Bearer ${token}` });
const missingId = () => new mongoose.Types.ObjectId().toString();

describe("CMS surface", () => {
  let adminToken;

  beforeEach(async () => {
    const admin = await createVerifiedUser({ role: "admin" });
    adminToken = accessTokenFor(admin);
  });

  it("lists CMS content for admins", async () => {
    await request(app)
      .post("/api/v1/admin/cms")
      .set(auth(adminToken))
      .send({ page: "header", content: { logo: "https://example.com/logo.png" } });

    const res = await request(app)
      .get("/api/v1/admin/cms")
      .set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.map((item) => item.page)).toContain("header");
  });

  it("creates CMS content and serves it publicly", async () => {
    const content = [
      {
        block_type: "heroBanner",
        enabled: true,
        content: [
          {
            order: 0,
            image_large: { url: "https://example.com/hero.jpg", alt: "Hero" },
          },
        ],
      },
    ];

    const created = await request(app)
      .post("/api/v1/admin/cms")
      .set(auth(adminToken))
      .send({ page: "home", content });
    expect(created.status).toBe(200);
    expect(created.body.success).toBe(true);

    const adminRead = await request(app)
      .get("/api/v1/admin/cms/home")
      .set(auth(adminToken));
    expect(adminRead.status).toBe(200);
    expect(adminRead.body.data.content[0].block_type).toBe("heroBanner");

    const publicRead = await request(app).get("/api/v1/cms/home");
    expect(publicRead.status).toBe(200);
    expect(publicRead.body.success).toBe(true);
    expect(publicRead.body.data.content[0].block_type).toBe("heroBanner");
  });

  it("updates CMS content by page", async () => {
    const content = [
      { block_type: "heroBanner", enabled: true, content: [] },
    ];
    const res = await request(app)
      .put("/api/v1/admin/cms/about")
      .set(auth(adminToken))
      .send({ content });
    expect(res.status).toBe(200);
    expect(res.body.data.content[0].block_type).toBe("heroBanner");

    const invalid = await request(app)
      .put("/api/v1/admin/cms/about")
      .set(auth(adminToken))
      .send({ content: "not-an-array" });
    expect(invalid.status).toBe(422);
  });

  it("updates a single CMS block", async () => {
    await request(app)
      .post("/api/v1/admin/cms")
      .set(auth(adminToken))
      .send({
        page: "home",
        content: [{ block_type: "heroBanner", enabled: true, content: [] }],
      });

    const res = await request(app)
      .patch("/api/v1/admin/cms/home/block/heroBanner")
      .set(auth(adminToken))
      .send({
        block_type: "heroBanner",
        enabled: false,
        content: [{ order: 0, title: "Updated banner" }],
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const empty = await request(app)
      .patch("/api/v1/admin/cms/home/block/heroBanner")
      .set(auth(adminToken))
      .send({});
    expect(empty.status).toBe(400);
  });

  it("deletes CMS content and 404s missing pages", async () => {
    await request(app)
      .post("/api/v1/admin/cms")
      .set(auth(adminToken))
      .send({
        page: "policies",
        content: {
          slug: "privacy-policy",
          title: "Privacy",
          content: "<h1>Privacy</h1>",
        },
      });

    const removed = await request(app)
      .delete("/api/v1/admin/cms/policies")
      .set(auth(adminToken));
    expect(removed.status).toBe(200);

    const missing = await request(app)
      .delete("/api/v1/admin/cms/policies")
      .set(auth(adminToken));
    expect(missing.status).toBe(404);
  });

  it("manages landing pages and serves enabled pages publicly", async () => {
    const slug = uniqueToken("landing");

    const created = await request(app)
      .post("/api/v1/admin/cms/landings")
      .set(auth(adminToken))
      .send({ slug, title: "Landing", enabled: true });
    expect(created.status).toBe(201);
    expect(created.body.data.slug).toBe(slug);

    const list = await request(app)
      .get("/api/v1/admin/cms/landings")
      .set(auth(adminToken));
    expect(list.status).toBe(200);
    expect(list.body.data.map((item) => item.slug)).toContain(slug);

    const detail = await request(app)
      .get(`/api/v1/admin/cms/landings/${slug}`)
      .set(auth(adminToken));
    expect(detail.status).toBe(200);
    expect(detail.body.data.title).toBe("Landing");

    const publicRead = await request(app).get(
      `/api/v1/cms/block-pages/${slug}`,
    );
    expect(publicRead.status).toBe(200);
    expect(publicRead.body.data.slug).toBe(slug);

    const updated = await request(app)
      .put(`/api/v1/admin/cms/landings/${slug}`)
      .set(auth(adminToken))
      .send({ enabled: false, title: "Hidden landing" });
    expect(updated.status).toBe(200);
    expect(updated.body.data.enabled).toBe(false);

    const hidden = await request(app).get(`/api/v1/cms/block-pages/${slug}`);
    expect(hidden.status).toBe(404);

    const duplicate = await request(app)
      .post("/api/v1/admin/cms/landings")
      .set(auth(adminToken))
      .send({ slug, title: "Duplicate" });
    expect(duplicate.status).toBe(400);

    const removed = await request(app)
      .delete(`/api/v1/admin/cms/landings/${slug}`)
      .set(auth(adminToken));
    expect(removed.status).toBe(200);

    const missing = await request(app).get(
      `/api/v1/cms/block-pages/${slug}`,
    );
    expect(missing.status).toBe(404);
  });

  it("manages draft and published static pages", async () => {
    const slug = uniqueToken("page");

    const created = await request(app)
      .post("/api/v1/admin/pages")
      .set(auth(adminToken))
      .send({ slug, title: "Static Page" });
    expect(created.status).toBe(201);
    const pageId = created.body.data.id;

    const duplicate = await request(app)
      .post("/api/v1/admin/pages")
      .set(auth(adminToken))
      .send({ slug, title: "Duplicate" });
    expect(duplicate.status).toBe(409);

    const list = await request(app)
      .get(`/api/v1/admin/pages?query=${slug}`)
      .set(auth(adminToken));
    expect(list.status).toBe(200);
    expect(list.body.data.map((item) => item.id)).toContain(pageId);

    const detail = await request(app)
      .get(`/api/v1/admin/pages/${pageId}`)
      .set(auth(adminToken));
    expect(detail.status).toBe(200);
    expect(detail.body.data.slug).toBe(slug);

    const draft = await request(app)
      .put(`/api/v1/admin/pages/${pageId}`)
      .set(auth(adminToken))
      .send({
        title: "Static Page Draft",
        blocks: [
          {
            type: "richText",
            enabled: true,
            order: 0,
            data: { body: "Hello <strong>world</strong>" },
          },
        ],
      });
    expect(draft.status).toBe(200);
    expect(draft.body.data.draft.blocks).toHaveLength(1);

    const unpublished = await request(app).get(`/api/v1/cms/pages/${slug}`);
    expect(unpublished.status).toBe(404);

    const published = await request(app)
      .post(`/api/v1/admin/pages/${pageId}/publish`)
      .set(auth(adminToken));
    expect(published.status).toBe(200);
    expect(published.body.data.status).toBe("published");

    const publicRead = await request(app).get(`/api/v1/cms/pages/${slug}`);
    expect(publicRead.status).toBe(200);
    expect(publicRead.body.data.slug).toBe(slug);
    expect(publicRead.body.data.blocks[0].type).toBe("richText");

    const invalidDraft = await request(app)
      .put(`/api/v1/admin/pages/${pageId}`)
      .set(auth(adminToken))
      .send({ blocks: [{ type: "unknown", data: {} }] });
    expect(invalidDraft.status).toBe(400);

    const removed = await request(app)
      .delete(`/api/v1/admin/pages/${pageId}`)
      .set(auth(adminToken));
    expect(removed.status).toBe(200);

    const missing = await request(app)
      .get(`/api/v1/admin/pages/${missingId()}`)
      .set(auth(adminToken));
    expect(missing.status).toBe(404);
  });
});
