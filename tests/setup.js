const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");

// Increase default timeout — MongoMemoryServer may need to download its binary
// on a cold cache, which can take several minutes on a slow connection.
jest.setTimeout(120000);

// Mock nanoid as it is ESM-only and causes issues with Jest in CJS projects.
// Use a counter to generate unique IDs — this prevents E11000 duplicate key errors
// when multiple carts are generated via generateCartId() in the same test run.
let _nanoidCounter = 0;
const _nanoidFn = () => {
  const id = String(_nanoidCounter++).padStart(21, "0");
  return id;
};
jest.mock("nanoid", () => ({
  customAlphabet: () => _nanoidFn,
  nanoid: _nanoidFn,
}));

// Mock emailService to provide predictable OTPs and prevent actual email sending
jest.mock("../src/services/emailService", () => ({
  generateOTP: () => "123456",
  sendOTPEmail: jest.fn().mockResolvedValue({ success: true }),
  sendWelcomeEmail: jest.fn().mockResolvedValue({ success: true }),
  sendPasswordResetEmail: jest.fn().mockResolvedValue({ success: true }),
  sendAdminCredentialsEmail: jest.fn().mockResolvedValue({ success: true }),
  sendShipmentEmail: jest.fn().mockResolvedValue({ success: true }),
  sendRefundInitiatedEmail: jest.fn().mockResolvedValue({ success: true }),
  sendOrderConfirmationEmail: jest.fn().mockResolvedValue({ success: true }),
}));

// Mock cloudinary
jest.mock("cloudinary", () => ({
  v2: {
    config: jest.fn(),
    api: {
      ping: jest.fn().mockResolvedValue({ status: "ok" }),
    },
    uploader: {
      upload: jest.fn().mockResolvedValue({
        secure_url: "https://res.cloudinary.com/test/image.jpg",
        public_id: "test-id",
      }),
      destroy: jest.fn().mockResolvedValue({ result: "ok" }),
      remove_tag: jest.fn().mockResolvedValue({ success: ["test-id"] }),
    },
  },
}));

// Mock multer-storage-cloudinary to return a simple memory storage for tests
jest.mock("multer-storage-cloudinary", () => {
  const multer = require("multer");
  return {
    CloudinaryStorage: jest
      .fn()
      .mockImplementation(() => multer.memoryStorage()),
  };
});

// meilisearch ships ESM-only builds (export/import) that Jest cannot parse.
// The app only constructs a client when MEILISEARCH_HOST is set, which never
// happens in tests, so a stub is enough for modules that require it.
jest.mock("meilisearch", () => {
  class Meilisearch {
    constructor() {}
    index() {
      return {
        updateSettings: jest.fn().mockResolvedValue({ taskUid: 0 }),
        addDocuments: jest.fn().mockResolvedValue({ taskUid: 0 }),
        updateDocuments: jest.fn().mockResolvedValue({ taskUid: 0 }),
        deleteDocuments: jest.fn().mockResolvedValue({ taskUid: 0 }),
        deleteAllDocuments: jest.fn().mockResolvedValue({ taskUid: 0 }),
        search: jest.fn().mockResolvedValue({ hits: [] }),
        getDocuments: jest.fn().mockResolvedValue([]),
      };
    }
  }
  return { Meilisearch };
});

// uuid v14 is ESM-only; provide a v4 stub (used by chatController).
jest.mock("uuid", () => {
  let _uuidCounter = 0;
  const v4 = () =>
    `00000000-0000-4000-8000-${String(_uuidCounter++).padStart(12, "0")}`;
  return { v4 };
});

let mongoServer;

/**
 * Pure-logic suites under tests/unit stub the models they touch and never
 * query, so booting mongod for them is wasted startup — and it makes the unit
 * suite fail outright when the MongoMemoryServer binary is missing or corrupt.
 * A suite can force the database on with a `@requires-mongodb` docblock.
 */
const suiteNeedsDatabase = () => {
  if (process.env.REQUIRE_MONGODB === "1") return true;
  const testPath = expect.getState().testPath || "";
  const name = testPath.split(/[\\/]/).pop() || "";
  const suiteDir = testPath.split(/[\\/]/).slice(-2, -1)[0] || "";
  if (suiteDir === "unit" && !name.includes("mongodb")) return false;
  return true;
};

// Connect to the in-memory database before running tests
beforeAll(async () => {
  if (!suiteNeedsDatabase()) return;

  // A cold cache means downloading ~200MB of mongod binary. The default hook
  // timeout is not always enough for that, and a half-finished download is
  // discarded, so the next run would start over. Give it its own budget.
  mongoServer = await MongoMemoryServer.create(undefined, undefined, {
    timeout: Number(process.env.MONGOMS_DOWNLOAD_TIMEOUT || 900000),
  });
  const uri = mongoServer.getUri();

  await mongoose.connect(uri);
}, Number(process.env.MONGOMS_DOWNLOAD_TIMEOUT || 900000));

// Clean up database between tests
afterEach(async () => {
  if (mongoose.connection.readyState === 1) {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      const collection = collections[key];
      await collection.deleteMany();
    }
  }
});

// Close connection and stop mongoServer after all tests
afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  }
  if (mongoServer) {
    await mongoServer.stop();
  }
});
