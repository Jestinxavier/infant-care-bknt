const request = require("supertest");
const app = require("../../src/app");
const Cart = require("../../src/models/Cart");
const Category = require("../../src/models/Category");
const Coupon = require("../../src/models/Coupon");
const Product = require("../../src/models/Product");
const { generateCartId } = require("../../src/utils/cartIdGenerator");
const {
  createVerifiedUser,
  accessTokenFor,
} = require("../helpers/authFixtures");

const BASE = "/api/v1/cart";

let counter = 0;
const uniqueToken = (prefix) => `${prefix}-${Date.now()}-${counter++}`;
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const cartHeader = (cartId) => ({ "x-cart-id": cartId });
const futureDate = () => new Date(Date.now() + 24 * 60 * 60 * 1000);
const pastDate = () => new Date(Date.now() - 24 * 60 * 60 * 1000);

async function createPublishedProduct(overrides = {}) {
  const token = uniqueToken("cart");
  const category = await Category.create({
    name: `Cart Category ${token}`,
    code: `cart-category-${token}`,
    isActive: true,
  });

  return Product.create({
    title: `Cart Product ${token}`,
    description: "A published product for cart surface tests",
    category: category._id,
    categoryName: category.name,
    categoryCode: category.code,
    url_key: `cart-product-${token}`,
    sku: `CART-${token}`.toUpperCase(),
    status: "published",
    product_type: "SIMPLE",
    price: 500,
    stock: 20,
    stockObj: { available: 20, isInStock: true },
    images: ["https://example.com/cart-product.jpg"],
    ...overrides,
  });
}

function makeItem(product, overrides = {}) {
  return {
    productId: product._id,
    variantId: null,
    quantity: 2,
    titleSnapshot: product.title,
    imageSnapshot: product.images?.[0] || "",
    skuSnapshot: product.sku,
    ...overrides,
  };
}

async function createCart({ items = [], userId = null, status = "active" } = {}) {
  return Cart.create({
    cartId: generateCartId(),
    userId,
    status,
    items,
  });
}

describe("Cart surface", () => {
  it("creates carts and validates cart sessions over POST and HEAD", async () => {
    const cartId = generateCartId();

    const created = await request(app).post(`${BASE}/create`).send({ cartId });
    expect(created.status).toBe(201);
    expect(created.body.success).toBe(true);
    expect(created.body.cart.cartId).toBe(cartId);
    expect(
      created.headers["set-cookie"].some((cookie) =>
        cookie.startsWith("cart_id="),
      ),
    ).toBe(true);

    const existing = await request(app).post(`${BASE}/create`).send({ cartId });
    expect(existing.status).toBe(200);
    expect(existing.body.cart.cartId).toBe(cartId);

    const invalid = await request(app)
      .post(`${BASE}/create`)
      .send({ cartId: "not-a-cart" });
    expect(invalid.status).toBe(400);

    const missingHead = await request(app).head(`${BASE}/get`);
    expect(missingHead.status).toBe(404);

    const existingHead = await request(app)
      .head(`${BASE}/get`)
      .set(cartHeader(cartId));
    expect(existingHead.status).toBe(200);

    const missingGet = await request(app).post(`${BASE}/get`);
    expect(missingGet.status).toBe(200);
    expect(missingGet.body.cart).toBeNull();

    const existingGet = await request(app)
      .post(`${BASE}/get`)
      .set(cartHeader(cartId));
    expect(existingGet.status).toBe(200);
    expect(existingGet.body.cart.cartId).toBe(cartId);
  });

  it("serves empty cart summaries without a cart", async () => {
    const count = await request(app).get(`${BASE}/count`);
    expect(count.status).toBe(200);
    expect(count.body.count).toBe(0);

    const items = await request(app).post(`${BASE}/items`);
    expect(items.status).toBe(200);
    expect(items.body.items).toEqual([]);

    const priceSummary = await request(app).get(`${BASE}/price-summary`);
    expect(priceSummary.status).toBe(200);
    expect(priceSummary.body.priceSummary.payable.amount).toBe(0);

    const priceSummaryPost = await request(app).post(`${BASE}/price-summary`);
    expect(priceSummaryPost.status).toBe(200);
    expect(priceSummaryPost.body.priceSummary.payable.amount).toBe(0);

    const productData = await request(app).post(`${BASE}/product-data`);
    expect(productData.status).toBe(200);
    expect(productData.body.productData).toEqual([]);

    const summary = await request(app).get(`${BASE}/summary`);
    expect(summary.status).toBe(200);
    expect(summary.body.summary.count).toBe(0);

    const summaryPost = await request(app).post(`${BASE}/summary`);
    expect(summaryPost.status).toBe(200);
    expect(summaryPost.body.summary.count).toBe(0);
  });

  it("adds, reads, updates, removes, and clears cart items", async () => {
    const product = await createPublishedProduct();
    const cart = await createCart();

    const added = await request(app)
      .post(`${BASE}/add-item`)
      .set(cartHeader(cart.cartId))
      .send({ item: { productId: product._id.toString(), quantity: 2 } });
    expect(added.status).toBe(200);
    expect(added.body.cart.items).toHaveLength(1);
    expect(added.body.cart.items[0]).toMatchObject({
      productId: product._id.toString(),
      quantity: 2,
      unitPrice: 500,
      lineTotal: 1000,
    });
    const sku = added.body.cart.items[0].skuSnapshot;

    const missingProduct = await request(app)
      .post(`${BASE}/add-item`)
      .set(cartHeader(cart.cartId))
      .send({ item: { quantity: 1 } });
    expect(missingProduct.status).toBe(400);

    const countGet = await request(app)
      .get(`${BASE}/count`)
      .set(cartHeader(cart.cartId));
    expect(countGet.body.count).toBe(2);

    const countPost = await request(app)
      .post(`${BASE}/count`)
      .set(cartHeader(cart.cartId));
    expect(countPost.body.count).toBe(2);

    const itemsGet = await request(app)
      .get(`${BASE}/items`)
      .set(cartHeader(cart.cartId));
    expect(itemsGet.body.items).toHaveLength(1);

    const itemsPost = await request(app)
      .post(`${BASE}/items`)
      .set(cartHeader(cart.cartId));
    expect(itemsPost.body.items).toHaveLength(1);

    const priceSummary = await request(app)
      .get(`${BASE}/price-summary`)
      .set(cartHeader(cart.cartId));
    expect(priceSummary.status).toBe(200);
    expect(priceSummary.body.priceSummary.payable.amount).toBe(1000);

    const priceSummaryPost = await request(app)
      .post(`${BASE}/price-summary`)
      .set(cartHeader(cart.cartId));
    expect(priceSummaryPost.status).toBe(200);
    expect(priceSummaryPost.body.priceSummary.payable.amount).toBe(1000);

    const productData = await request(app)
      .post(`${BASE}/product-data`)
      .set(cartHeader(cart.cartId));
    expect(productData.status).toBe(200);
    expect(productData.body.productData[0].productId).toBe(
      product._id.toString(),
    );

    const productDataGet = await request(app)
      .get(`${BASE}/product-data`)
      .set(cartHeader(cart.cartId));
    expect(productDataGet.status).toBe(200);
    expect(productDataGet.body.productData).toHaveLength(1);

    const summary = await request(app)
      .get(`${BASE}/summary`)
      .set(cartHeader(cart.cartId));
    expect(summary.status).toBe(200);
    expect(summary.body.summary.count).toBe(2);

    const summaryPost = await request(app)
      .post(`${BASE}/summary`)
      .set(cartHeader(cart.cartId));
    expect(summaryPost.status).toBe(200);
    expect(summaryPost.body.summary.count).toBe(2);

    const missingSku = await request(app)
      .patch(`${BASE}/update-item`)
      .set(cartHeader(cart.cartId))
      .send({ changes: { quantity: 3 } });
    expect(missingSku.status).toBe(400);

    const updated = await request(app)
      .patch(`${BASE}/update-item`)
      .set(cartHeader(cart.cartId))
      .send({ sku, changes: { quantity: 3 } });
    expect(updated.status).toBe(200);
    expect(updated.body.cart.items[0].quantity).toBe(3);

    const removed = await request(app)
      .delete(`${BASE}/remove-item`)
      .set(cartHeader(cart.cartId))
      .send({ sku });
    expect(removed.status).toBe(200);
    expect(removed.body.cart.items).toHaveLength(0);

    const reAdded = await request(app)
      .post(`${BASE}/add-item`)
      .set(cartHeader(cart.cartId))
      .send({ item: { productId: product._id.toString(), quantity: 1 } });
    expect(reAdded.status).toBe(200);

    const cleared = await request(app)
      .post(`${BASE}/clear`)
      .set(cartHeader(cart.cartId));
    expect(cleared.status).toBe(200);
    expect(cleared.body.cart.items).toHaveLength(0);

    const missingUpdate = await request(app)
      .patch(`${BASE}/update-item`)
      .send({ sku, changes: { quantity: 1 } });
    expect(missingUpdate.status).toBe(404);
  });

  it("merges guest carts and restores checkout sessions", async () => {
    const product = await createPublishedProduct();
    const user = await createVerifiedUser();
    const userToken = accessTokenFor(user);

    const guestCart = await createCart({
      items: [makeItem(product)],
    });

    const unauthorized = await request(app).post(`${BASE}/merge`);
    expect(unauthorized.status).toBe(401);

    const merged = await request(app)
      .post(`${BASE}/merge`)
      .set(auth(userToken))
      .set("x-guest-cart-id", guestCart.cartId);
    expect(merged.status).toBe(200);
    expect(merged.body.cart.cartId).toBe(guestCart.cartId);
    expect(merged.body.cart.userId).toBe(user._id.toString());

    const lockedCart = await createCart({
      userId: user._id,
      status: "checkout",
      items: [makeItem(product)],
    });

    const recovered = await request(app)
      .post(`${BASE}/recover`)
      .set(auth(userToken))
      .set(cartHeader(lockedCart.cartId));
    expect(recovered.status).toBe(200);
    expect(recovered.body.cart.cartId).not.toBe(lockedCart.cartId);
    expect(recovered.body.cart.items).toHaveLength(1);
    expect((await Cart.findById(lockedCart._id)).status).toBe("abandoned");

    const recoveredCart = await Cart.findOne({
      cartId: recovered.body.cart.cartId,
    });
    expect(recoveredCart.status).toBe("active");

    const emptyUser = await createVerifiedUser();
    const emptyRecovery = await request(app)
      .post(`${BASE}/recover`)
      .set(auth(accessTokenFor(emptyUser)));
    expect(emptyRecovery.status).toBe(201);
    expect(emptyRecovery.body.cart.items).toHaveLength(0);
  });

  it("locks carts for checkout and rejects empty or guest carts", async () => {
    const product = await createPublishedProduct();
    const user = await createVerifiedUser();
    const userToken = accessTokenFor(user);
    const cart = await createCart({
      userId: user._id,
      items: [makeItem(product)],
    });

    const started = await request(app)
      .post(`${BASE}/start-checkout`)
      .set(auth(userToken))
      .send({ cartId: cart.cartId });
    expect(started.status).toBe(200);
    expect(started.body.checkoutToken).toMatch(/^chk_/);

    const repeated = await request(app)
      .post(`${BASE}/start-checkout`)
      .set(auth(userToken))
      .send({ cartId: cart.cartId });
    expect(repeated.status).toBe(200);
    expect(repeated.body.checkoutToken).toBe(started.body.checkoutToken);

    const guest = await request(app).post(`${BASE}/start-checkout`).send({});
    expect(guest.status).toBe(400);
    expect(guest.body.errorCode).toBe("MISSING_CART");

    const emptyUser = await createVerifiedUser();
    const empty = await request(app)
      .post(`${BASE}/start-checkout`)
      .set(auth(accessTokenFor(emptyUser)))
      .send({});
    expect(empty.status).toBe(400);
    expect(empty.body.errorCode).toBe("EMPTY_CART");
  });

  it("lists and applies coupons to carts", async () => {
    const product = await createPublishedProduct();
    const cart = await createCart();
    const code = `CART${Date.now()}${counter++}`;

    await Coupon.create({
      code,
      type: "percentage",
      value: 10,
      maxDiscount: 200,
      minCartValue: 100,
      startDate: pastDate(),
      endDate: futureDate(),
      isActive: true,
      isPublic: true,
    });

    await Coupon.create({
      code: `HIDDEN${Date.now()}${counter++}`,
      type: "flat",
      value: 50,
      minCartValue: 0,
      startDate: pastDate(),
      endDate: futureDate(),
      isActive: true,
      isPublic: false,
    });

    const added = await request(app)
      .post(`${BASE}/add-item`)
      .set(cartHeader(cart.cartId))
      .send({ item: { productId: product._id.toString(), quantity: 1 } });
    expect(added.status).toBe(200);

    const available = await request(app).get(`${BASE}/coupons`);
    expect(available.status).toBe(200);
    expect(available.body.coupons.map((coupon) => coupon.code)).toContain(code);
    expect(
      available.body.coupons.some((coupon) => coupon.code.startsWith("HIDDEN")),
    ).toBe(false);

    const missingCode = await request(app)
      .post(`${BASE}/apply-coupon`)
      .set(cartHeader(cart.cartId))
      .send({});
    expect(missingCode.status).toBe(400);

    const invalid = await request(app)
      .post(`${BASE}/apply-coupon`)
      .set(cartHeader(cart.cartId))
      .send({ code: "DOES-NOT-EXIST" });
    expect(invalid.status).toBe(400);

    const applied = await request(app)
      .post(`${BASE}/apply-coupon`)
      .set(cartHeader(cart.cartId))
      .send({ code: code.toLowerCase() });
    expect(applied.status).toBe(200);
    expect(applied.body.cart.coupons).toHaveLength(1);
    expect(applied.body.cart.coupons[0]).toMatchObject({
      code,
      type: "percentage",
      discountAmount: 50,
    });

    const duplicate = await request(app)
      .post(`${BASE}/apply-coupon`)
      .set(cartHeader(cart.cartId))
      .send({ code });
    expect(duplicate.status).toBe(400);
    expect(duplicate.body.errorCode).toBe("DUPLICATE_COUPON");

    const removed = await request(app)
      .delete(`${BASE}/remove-coupon`)
      .set(cartHeader(cart.cartId))
      .send({ code });
    expect(removed.status).toBe(200);
    expect(removed.body.cart.coupons).toHaveLength(0);

    const missingCart = await request(app)
      .delete(`${BASE}/remove-coupon`)
      .send({ code });
    expect(missingCart.status).toBe(404);
  });
});
