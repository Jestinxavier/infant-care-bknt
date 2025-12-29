const request = require("supertest");
const app = require("../../src/app");
const mongoose = require("mongoose");
const User = require("../../src/models/user");

describe("CMS API", () => {
    let adminToken;
    let adminUser;

    beforeEach(async () => {
        // Re-create admin user before EACH test because setup.js clears it
        const email = `cmsadmin_${Date.now()}@example.com`;
        adminUser = await User.create({
            username: `cmsadmin_${Date.now()}`,
            email: email,
            password: "Password123!",
            role: "admin",
            isEmailVerified: true
        });

        // Login to get admin token
        const loginRes = await request(app)
            .post("/api/v1/auth/login")
            .send({
                email: email,
                password: "Password123!"
            });

        adminToken = loginRes.body.accessToken;
    });

    describe("Public CMS Access", () => {
        it("should return empty structure for non-existent page", async () => {
            const res = await request(app).get("/api/v1/cms/about");
            expect(res.statusCode).toEqual(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.content).toEqual([]);
        });
    });

    describe("Admin CMS Management", () => {
        it("should update and retrieve homepage blocks", async () => {
            const homepageContent = [
                {
                    block_type: "heroBanner",
                    enabled: true,
                    content: [
                        { order: 0, image_large: { url: "https://example.com/hero.jpg", alt: "Hero" } }
                    ]
                }
            ];

            // 1. Update homepage content
            const updateRes = await request(app)
                .post("/api/v1/admin/cms")
                .set("Authorization", `Bearer ${adminToken}`)
                .send({
                    page: "home",
                    content: homepageContent
                });

            if (updateRes.statusCode !== 200) {
                console.log("CMS Update Error:", JSON.stringify(updateRes.body, null, 2));
            }
            expect(updateRes.statusCode).toEqual(200);
            expect(updateRes.body.success).toBe(true);

            // 2. Retrieve public homepage content
            const publicRes = await request(app).get("/api/v1/cms/home");
            expect(publicRes.statusCode).toEqual(200);
            expect(publicRes.body.data.content[0]).toHaveProperty("block_type", "heroBanner");
        });

        it("should update and retrieve a policy by slug", async () => {
            const privacyPolicy = {
                slug: "privacy-policy",
                title: "Privacy Policy",
                content: "<h1>Our Privacy Policy</h1><p>We care about your data.</p>"
            };

            // 1. Update policy
            const updateRes = await request(app)
                .post("/api/v1/admin/cms")
                .set("Authorization", `Bearer ${adminToken}`)
                .send({
                    page: "policies",
                    content: privacyPolicy
                });

            if (updateRes.statusCode !== 200) {
                console.log("Policy Update Error:", JSON.stringify(updateRes.body, null, 2));
            }
            expect(updateRes.statusCode).toEqual(200);

            // 2. Retrieve specific policy
            const publicRes = await request(app).get("/api/v1/cms/policies?slug=privacy-policy");
            expect(publicRes.statusCode).toEqual(200);
            expect(publicRes.body.data.content).toContain("Our Privacy Policy");
            expect(publicRes.body.data.slug).toBe("privacy-policy");
        });
    });
});
