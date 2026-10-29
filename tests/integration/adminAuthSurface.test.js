const request = require("supertest");
const app = require("../../src/app");
const inventory = require("../../docs/testing/route-inventory.json");

const protectedRoutes = inventory.backend.filter(
  (route) => route.access === "admin" || route.access.startsWith("permission:")
);

const concretePath = (routePath) =>
  routePath
    .replace(/:[A-Za-z0-9_]+/g, "000000000000000000000000")
    .replace(/\*/g, "test");

describe("Admin route auth surface", () => {
  it("rejects unauthenticated requests to every protected admin route", async () => {
    const failures = [];

    for (const route of protectedRoutes) {
      const method = route.method.toLowerCase();
      const response = await request(app)
        [method](concretePath(route.path))
        .send({});

      if (![401, 403].includes(response.statusCode)) {
        failures.push(
          `${route.id} ${route.method} ${route.path} -> ${response.statusCode} ${response.body?.message || ""}`
        );
      }
    }

    expect(failures).toEqual([]);
  }, 120000);
});
