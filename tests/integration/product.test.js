const request = require("supertest");
const app = require("../../src/app");
const mongoose = require("mongoose");
const Category = require("../../src/models/Category");
const User = require("../../src/models/user");

describe("Product API", () => {
    let adminToken;
    let testCategory;

    beforeAll(async () => {
        // 1. Create a test category
        testCategory = await Category.create({
            name: "Test Category",
            code: "test-category",
            isActive: true
        });

        // 2. Create an admin user for private route testing
        const adminUser = await User.create({
            username: "adminuser",
            email: "admin@example.com",
            password: "Password123!",
            role: "admin",
            isEmailVerified: true
        });

        // 3. Login to get admin token
        const loginRes = await request(app)
            .post("/api/v1/auth/login")
            .send({
                email: "admin@example.com",
                password: "Password123!"
            });

        adminToken = loginRes.body.accessToken;
    });

    describe("POST /api/v1/product/create", () => {
        it("should create a product with variants as an admin", async () => {
            const productData = {
                title: "Test Product",
                description: "A wonderful test product",
                category: testCategory._id.toString(),
                sku: "TEST-SKU-001",
                status: "published",
                price: 999,
                stock: 50,
                variants: JSON.stringify([
                    { sku: "VAR-001", price: 1099, stock: 10, attributes: { color: "Red", size: "M" } }
                ])
            };

            const res = await request(app)
                .post("/api/v1/product/create")
                .set("Authorization", `Bearer ${adminToken}`)
                .field("title", productData.title)
                .field("description", productData.description)
                .field("category", productData.category)
                .field("sku", productData.sku)
                .field("status", productData.status)
                .field("price", productData.price)
                .field("stock", productData.stock)
                .field("variants", productData.variants);

            if (res.statusCode !== 201) {
                console.log("Create Error Body:", JSON.stringify(res.body, null, 2));
            }
            expect(res.statusCode).toEqual(201);
            expect(res.body.success).toBe(true);
            expect(res.body.product).toHaveProperty("title", productData.title);
        });

        it("should fail to create a product without authorization", async () => {
            const res = await request(app)
                .post("/api/v1/product/create")
                .send({ title: "Unauthorized Product" });

            expect(res.statusCode).toEqual(401);
        });
    });

    describe("GET /api/v1/product/all", () => {
        it("should return a list of products", async () => {
            const res = await request(app).get("/api/v1/product/all");

            expect(res.statusCode).toEqual(200);
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.items)).toBe(true);
        });
    });

    describe("GET /api/v1/product/search-index", () => {
        it("should return search index data", async () => {
            const res = await request(app).get("/api/v1/product/search-index");

            if (res.statusCode !== 200 || !res.body.success || !Array.isArray(res.body.products)) {
                console.log("Search Index Body:", JSON.stringify(res.body, null, 2));
            }
            expect(res.statusCode).toEqual(200);
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.products)).toBe(true);
        });
    });
});
