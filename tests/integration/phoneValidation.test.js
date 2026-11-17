// Phones are Indian mobiles only, stored as the bare 10 digits.
const mongoose = require("mongoose");
const Address = require("../../src/models/Address");
const createAddress = require("../../src/controllers/address/addressController");
const updateAddress = require("../../src/controllers/address/updateAddress");
const updateProfile = require("../../src/controllers/auth/updateProfile");

function call(handler, { body = {}, params = {}, user }) {
  const req = { body, params, user };
  const res = {
    statusCode: 200,
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(obj) {
      res.body = obj;
      return res;
    },
  };
  return Promise.resolve(handler(req, res)).then(() => res);
}

const addressBody = (phone) => ({
  fullName: "Eldho Shaju",
  phone,
  houseName: "Flat 4B",
  street: "Green Residency, Kakkanad",
  city: "Kochi",
  state: "Kerala",
  pincode: "682030",
});

async function makeUser(phone) {
  const User = mongoose.model("User");
  return User.create({
    firstName: "Test",
    lastName: "User",
    username: `user${Date.now()}${Math.floor(Math.random() * 1000)}`,
    email: `u${Date.now()}${Math.floor(Math.random() * 1000)}@example.com`,
    password: "hashed",
    role: "user",
    phone,
  });
}

describe("Address phone validation", () => {
  const user = { id: new mongoose.Types.ObjectId().toString() };

  test.each([["+971 50 123 4567"], ["+1 415 555 2671"], ["12345"], ["5123456789"]])(
    "rejects %s",
    async (phone) => {
      const res = await call(createAddress, { body: addressBody(phone), user });
      expect(res.statusCode).toBe(400);
      expect(res.body.message).toBe("Enter a valid 10-digit Indian mobile number");
      expect(await Address.countDocuments({ userId: user.id })).toBe(0);
    },
  );

  test("requires a phone", async () => {
    const res = await call(createAddress, { body: addressBody(""), user });
    expect(res.statusCode).toBe(400);
  });

  test("saves a pasted +91 number as 10 digits", async () => {
    const res = await call(createAddress, { body: addressBody("+91 98765-43210"), user });
    expect(res.statusCode).toBe(201);
    expect(res.body.address.phone).toBe("9876543210");
  });

  test("update checks the phone only when it is part of the update", async () => {
    const created = await call(createAddress, { body: addressBody("9876543210"), user });
    const addressId = String(created.body.address._id);

    const setDefault = await call(updateAddress, { body: { isDefault: true }, params: { addressId }, user });
    expect(setDefault.statusCode).toBe(200);

    const bad = await call(updateAddress, { body: { phone: "+44 7911 123456" }, params: { addressId }, user });
    expect(bad.statusCode).toBe(400);

    const good = await call(updateAddress, { body: { phone: "0091 9123456789" }, params: { addressId }, user });
    expect(good.statusCode).toBe(200);
    expect(good.body.address.phone).toBe("9123456789");
  });
});

describe("Profile phone validation", () => {
  test("rejects a foreign number and keeps the old one", async () => {
    const u = await makeUser("9876543210");
    const res = await call(updateProfile, { body: { phone: "+971501234567" }, user: { id: String(u._id) } });
    expect(res.statusCode).toBe(400);
    const fresh = await mongoose.model("User").findById(u._id).lean();
    expect(fresh.phone).toBe("9876543210");
  });

  test("normalizes a pasted +91 number, and an empty value clears it", async () => {
    const u = await makeUser(null);
    const set = await call(updateProfile, { body: { phone: "+91 91234 56789" }, user: { id: String(u._id) } });
    expect(set.statusCode).toBe(200);
    expect((await mongoose.model("User").findById(u._id).lean()).phone).toBe("9123456789");

    const cleared = await call(updateProfile, { body: { phone: "" }, user: { id: String(u._id) } });
    expect(cleared.statusCode).toBe(200);
    expect((await mongoose.model("User").findById(u._id).lean()).phone).toBeNull();
  });
});
