const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../../src/app");
const User = require("../../src/models/user");
const AdminAuditLog = require("../../src/models/AdminAuditLog");
const {
  createVerifiedUser,
  accessTokenFor,
} = require("../helpers/authFixtures");
const { sendAdminCredentialsEmail } = require("../../src/services/emailService");

let counter = 0;
const unique = (prefix) => `${prefix}-${Date.now()}-${counter++}`;
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const missingId = () => new mongoose.Types.ObjectId().toString();

const makeAdmin = async (role = "admin") =>
  createVerifiedUser({
    username: unique("admin"),
    email: `${unique("admin")}@example.com`,
    role,
    active: true,
  });

const actorToken = async (role = "super-admin") => {
  const actor = await makeAdmin(role);
  return { actor, token: accessTokenFor(actor) };
};

describe("Admin user management surface", () => {
  it("lists only admin-role users with search, pagination, and safe fields", async () => {
    const { actor, token } = await actorToken("super-admin");
    const [admin, developer] = await Promise.all([
      makeAdmin("admin"),
      makeAdmin("developer"),
    ]);
    await createVerifiedUser({ username: unique("customer"), role: "user" });
    await makeAdmin("admin");
    await makeAdmin("admin");

    const response = await request(app)
      .get("/api/v1/admin/users?limit=2&page=2")
      .set(auth(token));

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveLength(2);
    expect(response.body.pagination).toMatchObject({
      page: 2,
      limit: 2,
      total: 5,
      totalPages: 3,
    });
    expect(response.body.meta.superAdminCount).toBe(1);
    expect(response.body.data[0]).not.toHaveProperty("password");
    expect(response.body.data[0]).not.toHaveProperty("resetPasswordToken");

    const search = await request(app)
      .get(`/api/v1/admin/users?search=${encodeURIComponent(admin.email)}`)
      .set(auth(token));
    expect(search.body.data).toHaveLength(1);
    expect(search.body.data[0]._id).toBe(admin._id.toString());

    const roles = await request(app)
      .get("/api/v1/admin/users?limit=100")
      .set(auth(token));
    expect(roles.body.data.map((user) => user._id)).toEqual(
      expect.arrayContaining([
        actor._id.toString(),
        admin._id.toString(),
        developer._id.toString(),
      ])
    );
    expect(roles.body.data.some((user) => user.role === "user")).toBe(false);
  });

  it("validates, creates, audits, and rejects duplicate admin accounts", async () => {
    const { token } = await actorToken("super-admin");
    const email = `${unique("newadmin")}@example.com`;

    const missing = await request(app)
      .post("/api/v1/admin/users")
      .set(auth(token))
      .send({ email });
    expect(missing.statusCode).toBe(400);

    const invalidRole = await request(app)
      .post("/api/v1/admin/users")
      .set(auth(token))
      .send({ username: "badrole", email: `${unique("bad")}@example.com`, role: "user" });
    expect(invalidRole.statusCode).toBe(400);
    expect(invalidRole.body.message).toMatch(/role must be one of/i);

    const created = await request(app)
      .post("/api/v1/admin/users")
      .set(auth(token))
      .send({ username: "New Admin", email, phone: "9876543210", role: "admin" });

    expect(created.statusCode).toBe(201);
    expect(created.body.data).toMatchObject({
      username: "newAdmin",
      email,
      phone: "9876543210",
      role: "admin",
      active: true,
      isEmailVerified: true,
    });
    expect(created.body.data).not.toHaveProperty("password");
    expect(sendAdminCredentialsEmail).toHaveBeenCalledWith(
      { email, username: "newAdmin" },
      expect.any(String)
    );

    const persisted = await User.findOne({ email });
    expect(persisted).toBeTruthy();
    expect(persisted.role).toBe("admin");
    expect(persisted.active).toBe(true);

    const audit = await AdminAuditLog.findOne({
      action: "create",
      targetId: persisted._id,
    });
    expect(audit).toBeTruthy();
    expect(audit.targetUsername).toBe("newAdmin");
    expect(audit.actorRole).toBe("super-admin");

    const duplicate = await request(app)
      .post("/api/v1/admin/users")
      .set(auth(token))
      .send({ username: "other", email, role: "admin" });
    expect(duplicate.statusCode).toBe(409);
  });

  it("updates roles and suspension state with self and last-super-admin guards", async () => {
    const { actor, token } = await actorToken("super-admin");
    const target = await makeAdmin("admin");

    const noFields = await request(app)
      .patch(`/api/v1/admin/users/${target._id}`)
      .set(auth(token))
      .send({});
    expect(noFields.statusCode).toBe(400);

    const invalidId = await request(app)
      .patch("/api/v1/admin/users/not-an-id")
      .set(auth(token))
      .send({ role: "admin" });
    expect(invalidId.statusCode).toBe(400);

    const invalidRole = await request(app)
      .patch(`/api/v1/admin/users/${target._id}`)
      .set(auth(token))
      .send({ role: "user" });
    expect(invalidRole.statusCode).toBe(400);

    const updated = await request(app)
      .patch(`/api/v1/admin/users/${target._id}`)
      .set(auth(token))
      .send({ role: "developer", active: false });

    expect(updated.statusCode).toBe(200);
    expect(updated.body.data).toMatchObject({
      _id: target._id.toString(),
      role: "developer",
      active: false,
    });

    const audit = await AdminAuditLog.find({ targetId: target._id }).sort({
      createdAt: 1,
    });
    expect(audit.map((entry) => entry.action)).toEqual([
      "update_role",
      "suspend",
    ]);

    await makeAdmin("super-admin");
    const self = await request(app)
      .patch(`/api/v1/admin/users/${actor._id}`)
      .set(auth(token))
      .send({ role: "admin" });
    expect(self.statusCode).toBe(400);
    expect(self.body.message).toMatch(/your own account/i);
  });

  it("blocks suspending or deleting the last active super-admin", async () => {
    const developer = await makeAdmin("developer");
    const soleSuperAdmin = await makeAdmin("super-admin");
    const token = accessTokenFor(developer);

    const suspend = await request(app)
      .patch(`/api/v1/admin/users/${soleSuperAdmin._id}`)
      .set(auth(token))
      .send({ active: false });
    expect(suspend.statusCode).toBe(400);
    expect(suspend.body.message).toMatch(/last active super administrator/i);

    const remove = await request(app)
      .delete(`/api/v1/admin/users/${soleSuperAdmin._id}`)
      .set(auth(token));
    expect(remove.statusCode).toBe(400);
    expect(remove.body.message).toMatch(/last active super administrator/i);
  });

  it("guards deletion of self, last super-admin, and non-admin accounts", async () => {
    const { actor, token } = await actorToken("super-admin");
    const admin = await makeAdmin("admin");
    const customer = await createVerifiedUser({ role: "user" });

    const self = await request(app)
      .delete(`/api/v1/admin/users/${actor._id}`)
      .set(auth(token));
    expect(self.statusCode).toBe(400);
    expect(self.body.message).toMatch(/your own account/i);

    const lastSuper = await request(app)
      .delete(`/api/v1/admin/users/${actor._id}`)
      .set(auth(token));
    expect(lastSuper.statusCode).toBe(400);

    const nonAdmin = await request(app)
      .delete(`/api/v1/admin/users/${customer._id}`)
      .set(auth(token));
    expect(nonAdmin.statusCode).toBe(404);

    const removed = await request(app)
      .delete(`/api/v1/admin/users/${admin._id}`)
      .set(auth(token));
    expect(removed.statusCode).toBe(200);
    expect(removed.body).toEqual({
      success: true,
      message: "Admin user deleted",
    });
    expect(await User.findById(admin._id)).toBeNull();

    const audit = await AdminAuditLog.findOne({
      action: "delete",
      targetId: admin._id,
    });
    expect(audit).toBeTruthy();
  });

  it("returns the newest audit entries up to the requested limit", async () => {
    const { actor, token } = await actorToken("super-admin");
    const targets = await Promise.all([
      makeAdmin("admin"),
      makeAdmin("admin"),
      makeAdmin("developer"),
    ]);

    await AdminAuditLog.create(
      targets.map((target, index) => ({
        actorId: actor._id,
        actorUsername: actor.username,
        actorRole: actor.role,
        action: "update_role",
        targetId: target._id,
        targetUsername: target.username,
        targetRole: target.role,
        details: { index },
        createdAt: new Date(Date.now() + index * 1000),
      }))
    );

    const response = await request(app)
      .get("/api/v1/admin/users/audit?limit=2")
      .set(auth(token));

    expect(response.statusCode).toBe(200);
    expect(response.body.data).toHaveLength(2);
    expect(response.body.data[0].details.index).toBe(2);
    expect(response.body.data[1].details.index).toBe(1);
  });

  it("denies admin users without role/user-management permissions", async () => {
    const admin = await makeAdmin("admin");
    const token = accessTokenFor(admin);

    const list = await request(app)
      .get("/api/v1/admin/users")
      .set(auth(token));
    const create = await request(app)
      .post("/api/v1/admin/users")
      .set(auth(token))
      .send({ username: "x", email: "x@example.com", role: "admin" });

    expect(list.statusCode).toBe(403);
    expect(create.statusCode).toBe(403);
  });
});
