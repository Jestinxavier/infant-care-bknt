const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../../src/app");
const Asset = require("../../src/models/Asset");
const {
  createVerifiedUser,
  accessTokenFor,
} = require("../helpers/authFixtures");

jest.mock("../../src/config/mediaServer", () => {
  const actual = jest.requireActual("../../src/config/mediaServer");
  return {
    ...actual,
    uploadToMediaServer: jest.fn(),
    deleteFromMediaServer: jest.fn().mockResolvedValue(true),
  };
});

const { uploadToMediaServer } = require("../../src/config/mediaServer");

let counter = 0;
const unique = (prefix) => `${prefix}-${Date.now()}-${counter++}`;
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const missingId = () => new mongoose.Types.ObjectId().toString();

const makeAsset = async ({ user, overrides = {} } = {}) => {
  const suffix = unique("asset");
  return Asset.create({
    publicId: suffix,
    secureUrl: `https://cdn.example.com/${suffix}.jpg`,
    assetId: suffix,
    hash: `hash-${suffix}`,
    status: "temp",
    origin: { source: "product", sourceContext: "product-form" },
    uploadedBy: user._id,
    resourceType: "image",
    ...overrides,
  });
};

describe("Asset surface", () => {
  let user;
  let token;

  beforeEach(async () => {
    user = await createVerifiedUser();
    token = accessTokenFor(user);
    uploadToMediaServer.mockReset();
    uploadToMediaServer.mockResolvedValue({
      public_id: "uploaded-asset",
      url: "https://cdn.example.com/uploaded-asset.webp",
      width: 800,
      height: 600,
      format: "webp",
      size: 1234,
    });
  });

  it("requires authentication for every asset route", async () => {
    expect((await request(app).get("/api/v1/admin/assets")).status).toBe(401);
    expect(
      (await request(app).post("/api/v1/admin/assets/upload")).status,
    ).toBe(401);
    expect(
      (await request(app).delete(`/api/v1/admin/assets/${missingId()}`)).status,
    ).toBe(401);
    expect(
      (await request(app).post("/api/v1/admin/assets/bulk-delete")).status,
    ).toBe(401);
    expect(
      (await request(app).post("/api/v1/admin/assets/promote")).status,
    ).toBe(401);
    expect(
      (await request(app).post(`/api/v1/admin/assets/${missingId()}/promote`))
        .status,
    ).toBe(401);
    expect(
      (await request(app).post("/api/v1/admin/assets/cleanup")).status,
    ).toBe(401);
  });

  it("lists assets with filters, page/cursor pagination, and validation", async () => {
    const tempProduct = await makeAsset({ user });
    await makeAsset({
      user,
      overrides: {
        status: "permanent",
        origin: { source: "cms", sourceContext: "cms-editor" },
        publicId: "cms-searchable",
      },
    });
    await makeAsset({
      user,
      overrides: {
        status: "permanent",
        origin: { source: "product", sourceContext: "product-form" },
        publicId: "product-searchable",
      },
    });

    const filtered = await request(app)
      .get("/api/v1/admin/assets")
      .set(auth(token))
      .query({ status: "temp", origin: "product", limit: 1 });
    expect(filtered.status).toBe(200);
    expect(filtered.body.assets).toHaveLength(1);
    expect(filtered.body.assets[0]._id).toBe(String(tempProduct._id));
    expect(filtered.body.pagination.total).toBe(1);

    const searched = await request(app)
      .get("/api/v1/admin/assets")
      .set(auth(token))
      .query({ search: "searchable" });
    expect(searched.status).toBe(200);
    expect(searched.body.assets).toHaveLength(2);

    const cursor = await request(app)
      .get("/api/v1/admin/assets")
      .set(auth(token))
      .query({ limit: 1 });
    expect(cursor.status).toBe(200);
    expect(cursor.body.assets).toHaveLength(1);
    expect(cursor.body.hasMore).toBe(true);
    expect(cursor.body.nextCursor).toBeTruthy();

    const next = await request(app)
      .get("/api/v1/admin/assets")
      .set(auth(token))
      .query({ limit: 1, cursor: cursor.body.nextCursor });
    expect(next.status).toBe(200);
    expect(next.body.assets[0]._id).not.toBe(cursor.body.assets[0]._id);

    const invalidCursor = await request(app)
      .get("/api/v1/admin/assets")
      .set(auth(token))
      .query({ cursor: "not-an-object-id" });
    expect(invalidCursor.status).toBe(400);
    expect(invalidCursor.body.message).toBe("Invalid cursor");
  });

  it("deletes temp assets while protecting used and permanent assets", async () => {
    const temp = await makeAsset({ user });
    const used = await makeAsset({
      user,
      overrides: { usedBy: [{ entity: "product", id: new mongoose.Types.ObjectId() }] },
    });
    const permanent = await makeAsset({ user, overrides: { status: "permanent" } });

    const deleted = await request(app)
      .delete(`/api/v1/admin/assets/${temp._id}`)
      .set(auth(token));
    expect(deleted.status).toBe(200);
    expect(await Asset.findById(temp._id)).toBeNull();

    const inUse = await request(app)
      .delete(`/api/v1/admin/assets/${used._id}`)
      .set(auth(token));
    expect(inUse.status).toBe(403);
    expect(inUse.body.message).toBe("Cannot delete asset in use");

    const blocked = await request(app)
      .delete(`/api/v1/admin/assets/${permanent._id}`)
      .set(auth(token));
    expect(blocked.status).toBe(403);
    expect(blocked.body.message).toContain("force=true");

    const archived = await request(app)
      .delete(`/api/v1/admin/assets/${permanent._id}`)
      .set(auth(token))
      .query({ force: "true" });
    expect(archived.status).toBe(200);
    expect((await Asset.findById(permanent._id)).status).toBe("archived");

    const publicIdDelete = await request(app)
      .delete(`/api/v1/admin/assets/${used.publicId}`)
      .set(auth(token));
    expect(publicIdDelete.status).toBe(403);

    const missing = await request(app)
      .delete(`/api/v1/admin/assets/${missingId()}`)
      .set(auth(token));
    expect(missing.status).toBe(404);
  });

  it("bulk deletes temp assets, archives permanent assets with force, and reports failures", async () => {
    const temp = await makeAsset({ user });
    const permanent = await makeAsset({ user, overrides: { status: "permanent" } });

    const empty = await request(app)
      .post("/api/v1/admin/assets/bulk-delete")
      .set(auth(token))
      .send({ ids: [] });
    expect(empty.status).toBe(400);

    const response = await request(app)
      .post("/api/v1/admin/assets/bulk-delete")
      .set(auth(token))
      .send({
        ids: [String(temp._id), String(permanent._id), missingId()],
        force: true,
      });

    expect(response.status).toBe(200);
    expect(response.body.results.deleted).toContain(temp.publicId);
    expect(response.body.results.archived).toContain(permanent.publicId);
    expect(response.body.results.failed).toEqual([
      expect.objectContaining({ error: "Asset not found" }),
    ]);
    expect(await Asset.findById(temp._id)).toBeNull();
    expect((await Asset.findById(permanent._id)).status).toBe("archived");
  });

  it("promotes assets by publicId and by encoded path, including manual promotion", async () => {
    const asset = await makeAsset({ user });
    const pathAsset = await makeAsset({ user });
    const entityId = new mongoose.Types.ObjectId().toString();

    const missing = await request(app)
      .post("/api/v1/admin/assets/promote")
      .set(auth(token))
      .send({ publicId: asset.publicId });
    expect(missing.status).toBe(400);

    const notFound = await request(app)
      .post("/api/v1/admin/assets/promote")
      .set(auth(token))
      .send({ publicId: "missing", entity: "product", entityId });
    expect(notFound.status).toBe(404);

    const promoted = await request(app)
      .post("/api/v1/admin/assets/promote")
      .set(auth(token))
      .send({ publicId: asset.publicId, entity: "product", entityId });
    expect(promoted.status).toBe(200);
    expect(promoted.body.asset.status).toBe("permanent");
    expect(promoted.body.asset.usedBy[0].entity).toBe("product");

    const manual = await request(app)
      .post(`/api/v1/admin/assets/${encodeURIComponent(pathAsset.publicId)}/promote`)
      .set(auth(token))
      .send({ entityType: "Category", entityId: "not-an-object-id" });
    expect(manual.status).toBe(200);
    expect(manual.body.asset.status).toBe("permanent");
    expect(manual.body.asset.usedBy).toHaveLength(0);
  });

  it("uploads a new asset, rejects invalid metadata, and deduplicates by hash", async () => {
    const missingFile = await request(app)
      .post("/api/v1/admin/assets/upload")
      .set(auth(token))
      .field("origin", JSON.stringify({ source: "product", sourceContext: "product-form" }));
    expect(missingFile.status).toBe(400);

    const invalidOrigin = await request(app)
      .post("/api/v1/admin/assets/upload")
      .set(auth(token))
      .field("origin", "{not-json}")
      .attach("file", Buffer.from("image-bytes"), "photo.jpg");
    expect(invalidOrigin.status).toBe(400);

    const missingOrigin = await request(app)
      .post("/api/v1/admin/assets/upload")
      .set(auth(token))
      .attach("file", Buffer.from("image-bytes"), "photo.jpg");
    expect(missingOrigin.status).toBe(400);
    expect(missingOrigin.body.message).toContain("Origin metadata");

    const uploaded = await request(app)
      .post("/api/v1/admin/assets/upload")
      .set(auth(token))
      .field("origin", JSON.stringify({ source: "product", sourceContext: "product-form" }))
      .field("intendedFor", "product")
      .attach("file", Buffer.from("unique-image-bytes"), "photo.jpg");
    expect(uploaded.status).toBe(201);
    expect(uploaded.body.duplicate).toBe(false);
    expect(uploaded.body.asset.status).toBe("temp");
    expect(uploaded.body.asset.intendedFor).toBe("product");
    expect(uploadToMediaServer).toHaveBeenCalledTimes(1);

    const duplicate = await request(app)
      .post("/api/v1/admin/assets/upload")
      .set(auth(token))
      .field("origin", JSON.stringify({ source: "product", sourceContext: "product-form" }))
      .attach("file", Buffer.from("unique-image-bytes"), "photo.jpg");
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.duplicate).toBe(true);
    expect(uploadToMediaServer).toHaveBeenCalledTimes(1);
  });

  it("cleans up expired temp and archived assets in dry-run and real modes", async () => {
    const expiredTemp = await makeAsset({
      user,
      overrides: { expiresAt: new Date(Date.now() - 60_000) },
    });
    const archivedOld = await makeAsset({
      user,
      overrides: {
        status: "archived",
        archivedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      },
    });
    const archivedRecent = await makeAsset({
      user,
      overrides: { status: "archived", archivedAt: new Date() },
    });

    const dryRun = await request(app)
      .post("/api/v1/admin/assets/cleanup")
      .set(auth(token))
      .send({ dryRun: true });
    expect(dryRun.status).toBe(200);
    expect(dryRun.body.results.tempAssetsFound).toBe(1);
    expect(dryRun.body.results.archivedAssetsFound).toBe(1);
    expect(dryRun.body.results.deletedCount).toBe(0);
    expect(await Asset.findById(expiredTemp._id)).not.toBeNull();

    const real = await request(app)
      .post("/api/v1/admin/assets/cleanup")
      .set(auth(token))
      .send({ dryRun: false });
    expect(real.status).toBe(200);
    expect(real.body.results.deletedCount).toBe(2);
    expect(await Asset.findById(expiredTemp._id)).toBeNull();
    expect(await Asset.findById(archivedOld._id)).toBeNull();
    expect(await Asset.findById(archivedRecent._id)).not.toBeNull();
  });
});
