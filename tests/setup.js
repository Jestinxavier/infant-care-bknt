const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");

// Increase default timeout for hooks
jest.setTimeout(30000);

// Mock nanoid as it is ESM-only and causes issues with Jest in CJS projects
jest.mock("nanoid", () => ({
    customAlphabet: () => () => "test-nanoid-id",
    nanoid: () => "test-nanoid-id"
}));

// Mock emailService to provide predictable OTPs and prevent actual email sending
jest.mock("../src/services/emailService", () => ({
    generateOTP: () => "123456",
    sendOTPEmail: jest.fn().mockResolvedValue({ success: true }),
    sendWelcomeEmail: jest.fn().mockResolvedValue({ success: true }),
    sendPasswordResetEmail: jest.fn().mockResolvedValue({ success: true }),
    sendAdminCredentialsEmail: jest.fn().mockResolvedValue({ success: true }),
    sendShipmentEmail: jest.fn().mockResolvedValue({ success: true }),
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
        CloudinaryStorage: jest.fn().mockImplementation(() => multer.memoryStorage()),
    };
});

let mongoServer;

// Connect to the in-memory database before running tests
beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();

    await mongoose.connect(uri);
});

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
