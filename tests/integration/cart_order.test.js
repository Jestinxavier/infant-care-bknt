const request = require("supertest");
const app = require("../../src/app");
const mongoose = require("mongoose");
const Category = require("../../src/models/Category");
const Product = require("../../src/models/Product");
const User = require("../../src/models/user");
const Cart = require("../../src/models/Cart");

describe("Cart & Orders API", () => {
    let userToken;
    let userId;
    let testProduct;
    let testCategory;
    let cartId = "cart_0123456789abcdefghijk";

    beforeEach(async () => {
        testCategory = await Category.create({
            name: "Cart Category",
            code: "cart-category",
            isActive: true
        });

        testProduct = await Product.create({
            title: "Cart Test Product",
            category: testCategory._id,
            sku: "CART-SKU-001",
            status: "published",
            images: ["https://example.com/image.jpg"],
            pricing: { price: 500 },
            variants: [
                {
                    id: "v1",
                    sku: "CART-SKU-001-V1",
                    url_key: "cart-test-product-v1",
                    images: ["https://example.com/variant-image.jpg"],
                    pricing: { price: 500 },
                    stockObj: { available: 100, isInStock: true },
                    attributes: { color: "Blue" }
                }
            ]
        });

        const user = await User.create({
            username: "cartuser" + Date.now(),
            email: "cart" + Date.now() + "@example.com",
            password: "Password123!",
            isEmailVerified: true
        });
        userId = user._id.toString();

        const loginRes = await request(app)
            .post("/api/v1/auth/login")
            .send({
                email: user.email,
                password: "Password123!"
            });
        userToken = loginRes.body.accessToken;
    });

    it("Full Checkout Flow: Create Cart -> Add Item -> Get Summary -> Create Order", async () => {
        // 1. Create Cart
        let res = await request(app)
            .post("/api/v1/cart/create")
            .send({ cartId });
        expect(res.statusCode).toEqual(201);

        // 2. Add Item
        res = await request(app)
            .post("/api/v1/cart/add-item")
            .set("x-cart-id", cartId)
            .send({
                item: {
                    productId: testProduct._id.toString(),
                    variantId: "v1",
                    quantity: 2
                }
            });

        if (res.statusCode !== 200) {
            console.log("Add Item Error Details:", JSON.stringify(res.body, null, 2));
        }
        expect(res.statusCode).toEqual(200);

        // 3. Get Summary
        res = await request(app)
            .get("/api/v1/cart/summary")
            .set("x-cart-id", cartId);
        expect(res.statusCode).toEqual(200);
        expect(res.body.summary.count).toBe(2);
        expect(res.body.summary.priceSummary.total).toBe(1000);

        // 4. Create Order
        res = await request(app)
            .post("/api/v1/orders/create")
            .set("Authorization", `Bearer ${userToken}`)
            .send({
                userId: userId,
                items: [
                    {
                        productId: testProduct._id.toString(),
                        variantId: "v1",
                        quantity: 1
                    }
                ],
                paymentMethod: "COD",
                newAddress: {
                    fullName: "John Doe",
                    phone: "9876543210",
                    addressLine1: "123 Test St",
                    city: "Test City",
                    state: "Test State",
                    pincode: "123456",
                    country: "India"
                }
            });

        if (res.statusCode !== 201) {
            console.log("Full Flow Order Error:", JSON.stringify(res.body, null, 2));
        }
        expect(res.statusCode).toEqual(201);
        expect(res.body.success).toBe(true);

        // 5. Get User Orders
        res = await request(app)
            .get("/api/v1/orders")
            .set("Authorization", `Bearer ${userToken}`);
        expect(res.statusCode).toEqual(200);
        expect(res.body.orders.length).toBe(1);
    });
});
