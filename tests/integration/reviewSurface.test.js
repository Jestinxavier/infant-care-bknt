const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../../src/app");
const Product = require("../../src/models/Product");
const Variant = require("../../src/models/Variant");
const Order = require("../../src/models/Order");
const Review = require("../../src/models/Review");
const {
  createVerifiedUser,
  accessTokenFor,
  uniqueEmail,
} = require("../helpers/authFixtures");

let counter = 0;
const unique = (prefix) => `${prefix}-${Date.now()}-${counter++}`;
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const missingId = () => new mongoose.Types.ObjectId().toString();

const makeProduct = async (overrides = {}) => {
  const suffix = unique("REVIEW");
  return Product.create({
    title: `Review product ${suffix}`,
    category: new mongoose.Types.ObjectId(),
    status: "published",
    variants: [],
    ...overrides,
  });
};

const makeVariant = async (product, overrides = {}) =>
  Variant.create({
    productId: product._id,
    price: 499,
    stock: 10,
    sku: unique("REVIEW-SKU"),
    color: "Blue",
    ...overrides,
  });

const makeOrder = async ({ user = null, variant, product, status = "delivered", guestInfo } = {}) =>
  Order.create({
    userId: user?._id || null,
    isGuestOrder: !user,
    guestInfo,
    orderId: unique("ORD"),
    items: [
      {
        productId: product._id,
        variantId: variant ? String(variant._id) : null,
        quantity: 1,
        price: 499,
        regularPrice: 599,
        name: product.title,
        sku: unique("ORDER-SKU"),
      },
    ],
    totalQuantity: 1,
    totalAmount: 499,
    subtotal: 499,
    orderStatus: status,
    paymentStatus: "paid",
    paymentMethod: "PHONEPE",
    placedAt: new Date(),
    statusHistory: [{ status, timestamp: new Date() }],
  });

const makeReview = async ({
  user = null,
  product,
  variant = null,
  order,
  rating = 5,
  title = "Great",
  review = "Lovely product",
  isApproved = true,
  isGuest = false,
  guestName,
  guestEmail,
} = {}) =>
  Review.create({
    userId: user?._id || null,
    productId: product._id,
    variantId: variant ? String(variant._id) : null,
    orderId: order?._id || new mongoose.Types.ObjectId(),
    title,
    rating,
    review,
    status: isApproved ? "approved" : "pending",
    isApproved,
    isGuest,
    guestName,
    guestEmail,
  });

describe("Review surface", () => {
  it("requires authentication for customer review routes", async () => {
    expect((await request(app).get("/api/v1/review/my-purchases")).status).toBe(401);
    expect((await request(app).get("/api/v1/review/my-reviews")).status).toBe(401);
    expect((await request(app).post("/api/v1/review/add")).status).toBe(401);
    expect(
      (await request(app).put(`/api/v1/review/my-review/${missingId()}`)).status,
    ).toBe(401);
    expect(
      (await request(app).delete(`/api/v1/review/my-review/${missingId()}`)).status,
    ).toBe(401);
  });

  it("returns an empty purchase list when the customer has no eligible orders", async () => {
    const user = await createVerifiedUser();

    const response = await request(app)
      .get("/api/v1/review/my-purchases")
      .set(auth(accessTokenFor(user)));

    expect(response.status).toBe(200);
    expect(response.body.purchasedProducts).toEqual([]);
    expect(response.body.message).toBe("No purchased products found");
  });

  it("lists purchased products with populated product and variant details", async () => {
    const user = await createVerifiedUser();
    const product = await makeProduct();
    const variant = await makeVariant(product, {
      color: "Red",
      attributes: new Map([
        ["size", "0-3 Months"],
        ["color", "Red"],
      ]),
    });
    const order = await makeOrder({ user, variant, product, status: "delivered" });
    const token = accessTokenFor(user);

    const response = await request(app)
      .get("/api/v1/review/my-purchases")
      .set(auth(token));

    expect(response.status).toBe(200);
    expect(response.body.totalPurchased).toBe(1);
    expect(response.body.purchasedProducts[0]).toEqual(
      expect.objectContaining({
        orderId: String(order._id),
        variantId: String(variant._id),
        productId: String(product._id),
        productName: product.title,
        quantity: 1,
        isReviewed: false,
        review: null,
      }),
    );
    expect(response.body.purchasedProducts[0].variantDetails).toEqual(
      expect.objectContaining({
        size: "0-3 Months",
        color: "Red",
        price: 499,
      }),
    );
  });

  it("validates authenticated review creation and enforces ownership, status, item, and duplicate rules", async () => {
    const user = await createVerifiedUser();
    const other = await createVerifiedUser();
    const product = await makeProduct();
    const variant = await makeVariant(product);
    const order = await makeOrder({ user, variant, product, status: "delivered" });
    const token = accessTokenFor(user);

    const missing = await request(app)
      .post("/api/v1/review/add")
      .set(auth(token))
      .send({ productId: product._id.toString() });
    expect(missing.status).toBe(400);

    const badRating = await request(app)
      .post("/api/v1/review/add")
      .set(auth(token))
      .send({
        productId: product._id.toString(),
        orderId: order._id.toString(),
        rating: 6,
        title: "Bad",
      });
    expect(badRating.status).toBe(400);

    const foreignOrder = await request(app)
      .post("/api/v1/review/add")
      .set(auth(accessTokenFor(other)))
      .send({
        productId: product._id.toString(),
        orderId: order._id.toString(),
        variantId: String(variant._id),
        rating: 5,
        title: "Mine?",
      });
    expect(foreignOrder.status).toBe(403);

    const pendingOrder = await makeOrder({
      user,
      variant,
      product,
      status: "processing",
    });
    const notDelivered = await request(app)
      .post("/api/v1/review/add")
      .set(auth(token))
      .send({
        productId: product._id.toString(),
        orderId: pendingOrder._id.toString(),
        variantId: String(variant._id),
        rating: 5,
        title: "Early",
      });
    expect(notDelivered.status).toBe(403);
    expect(notDelivered.body.message).toContain("shipped or delivered");

    const wrongVariant = await request(app)
      .post("/api/v1/review/add")
      .set(auth(token))
      .send({
        productId: product._id.toString(),
        orderId: order._id.toString(),
        variantId: missingId(),
        rating: 5,
        title: "Wrong variant",
      });
    expect(wrongVariant.status).toBe(403);
    expect(wrongVariant.body.message).toContain("not part of your order");

    const created = await request(app)
      .post("/api/v1/review/add")
      .set(auth(token))
      .send({
        productId: product._id.toString(),
        orderId: order._id.toString(),
        variantId: String(variant._id),
        rating: 5,
        title: "Excellent",
        review: "Fits perfectly",
      });
    expect(created.status).toBe(201);
    expect(created.body.review.title).toBe("Excellent");

    const duplicate = await request(app)
      .post("/api/v1/review/add")
      .set(auth(token))
      .send({
        productId: product._id.toString(),
        orderId: order._id.toString(),
        variantId: String(variant._id),
        rating: 4,
        title: "Again",
      });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.isExistingReview).toBe(true);

    const refreshedVariant = await Variant.findById(variant._id);
    const refreshedProduct = await Product.findById(product._id);
    expect(refreshedVariant.totalReviews).toBe(0);
    expect(refreshedProduct.totalReviews).toBe(0);
  });

  it("supports guest review validation, eligible-order checks, and successful submission", async () => {
    const product = await makeProduct();
    const guestEmail = uniqueEmail("guest");
    const guestOrder = await makeOrder({
      product,
      status: "delivered",
      guestInfo: { name: "Guest Parent", email: guestEmail },
    });
    const payload = {
      productId: product._id.toString(),
      orderId: guestOrder._id.toString(),
      rating: 5,
      title: "Guest review",
      guestName: "Guest Parent",
      guestEmail,
    };

    const missingTitle = await request(app)
      .post("/api/v1/review/guest/add")
      .send({ ...payload, title: "" });
    expect(missingTitle.status).toBe(400);

    const missingGuest = await request(app)
      .post("/api/v1/review/guest/add")
      .send({ ...payload, guestName: "" });
    expect(missingGuest.status).toBe(400);

    const unshippedOrder = await makeOrder({
      product,
      status: "processing",
      guestInfo: { name: "Guest Parent", email: guestEmail },
    });
    const unshipped = await request(app)
      .post("/api/v1/review/guest/add")
      .send({ ...payload, orderId: unshippedOrder._id.toString() });
    expect(unshipped.status).toBe(403);
    expect(unshipped.body.message).toContain("shipped or delivered");

    const foreignProduct = await makeProduct();
    const wrongProduct = await request(app)
      .post("/api/v1/review/guest/add")
      .send({ ...payload, productId: foreignProduct._id.toString() });
    expect(wrongProduct.status).toBe(403);

    const created = await request(app)
      .post("/api/v1/review/guest/add")
      .send(payload);
    expect(created.status).toBe(201);
    expect(created.body.review.isGuest).toBe(true);
    expect(created.body.review.isApproved).toBe(false);

    const duplicate = await request(app)
      .post("/api/v1/review/guest/add")
      .send(payload);
    expect(duplicate.status).toBe(400);
    expect(duplicate.body.message).toContain("already reviewed");

    const user = await createVerifiedUser();
    const memberOrder = await makeOrder({ user, product, status: "delivered" });
    const member = await request(app)
      .post("/api/v1/review/guest/add")
      .send({ ...payload, orderId: memberOrder._id.toString() });
    expect(member.status).toBe(403);
    expect(member.body.message).toContain("registered user");
  });

  it("reads, updates, and deletes only the customer's own reviews", async () => {
    const user = await createVerifiedUser();
    const other = await createVerifiedUser();
    const product = await makeProduct();
    const variant = await makeVariant(product);
    const order = await makeOrder({ user, variant, product });
    const review = await makeReview({ user, product, variant, order, rating: 3 });
    const foreign = await makeReview({
      user: other,
      product: await makeProduct(),
      order: await makeOrder({ user: other, variant: null, product: await makeProduct() }),
      rating: 5,
    });
    const token = accessTokenFor(user);

    const list = await request(app)
      .get("/api/v1/review/my-reviews")
      .set(auth(token));
    expect(list.status).toBe(200);
    expect(list.body.totalReviews).toBe(1);
    expect(list.body.reviews[0]._id).toBe(String(review._id));

    const invalidRating = await request(app)
      .put(`/api/v1/review/my-review/${review._id}`)
      .set(auth(token))
      .send({ rating: 9 });
    expect(invalidRating.status).toBe(400);

    const foreignUpdate = await request(app)
      .put(`/api/v1/review/my-review/${foreign._id}`)
      .set(auth(token))
      .send({ rating: 4 });
    expect(foreignUpdate.status).toBe(404);

    const updated = await request(app)
      .put(`/api/v1/review/my-review/${review._id}`)
      .set(auth(token))
      .send({ rating: 5, title: "Updated", review: "Even better" });
    expect(updated.status).toBe(200);
    expect(updated.body.review.title).toBe("Updated");
    expect(updated.body.review.rating).toBe(5);

    const foreignDelete = await request(app)
      .delete(`/api/v1/review/my-review/${foreign._id}`)
      .set(auth(token));
    expect(foreignDelete.status).toBe(404);

    const deleted = await request(app)
      .delete(`/api/v1/review/my-review/${review._id}`)
      .set(auth(token));
    expect(deleted.status).toBe(200);
    expect(await Review.findById(review._id)).toBeNull();
  });

  it("returns approved product reviews by id or SKU with pagination and average rating", async () => {
    const product = await makeProduct({ sku: unique("REVIEW-PRODUCT") });
    await makeReview({ product, rating: 5, title: "Five" });
    await makeReview({ product, rating: 4, title: "Four" });
    await makeReview({ product, rating: 1, title: "Pending", isApproved: false });

    const byId = await request(app)
      .get(`/api/v1/review/product/${product._id}`)
      .query({ page: 1, limit: 1 });
    expect(byId.status).toBe(200);
    expect(byId.body.totalReviews).toBe(2);
    expect(byId.body.averageRating).toBe(4.5);
    expect(byId.body.reviews).toHaveLength(1);
    expect(byId.body.pagination.totalPages).toBe(2);

    const bySku = await request(app).get(`/api/v1/review/product/${product.sku}`);
    expect(bySku.status).toBe(200);
    expect(bySku.body.totalReviews).toBe(2);

    const missing = await request(app).get("/api/v1/review/product/unknown-sku");
    expect(missing.status).toBe(404);
  });

  it("returns approved variant reviews with clamped pagination", async () => {
    const product = await makeProduct();
    const variant = await makeVariant(product);
    await makeReview({ product, variant, rating: 5 });
    await makeReview({ product, variant, rating: 3 });
    await makeReview({ product, variant, rating: 1, isApproved: false });

    const response = await request(app)
      .get(`/api/v1/review/variant/${variant._id}`)
      .query({ page: 0, limit: 500 });

    expect(response.status).toBe(200);
    expect(response.body.totalReviews).toBe(2);
    expect(response.body.averageRating).toBe(4);
    expect(response.body.pagination.limit).toBe(100);
    expect(response.body.pagination.page).toBe(1);
  });

  it("returns top approved reviews filtered by rating with formatted customer names", async () => {
    const named = await createVerifiedUser();
    const product = await makeProduct();
    const variant = await makeVariant(product);
    await makeReview({
      user: named,
      product,
      variant,
      rating: 5,
      review: "Superb",
    });
    await makeReview({ product, variant, rating: 5, title: "Anonymous" });
    await makeReview({ product, variant, rating: 3, title: "Low" });
    await makeReview({ product, variant, rating: 5, title: "Hidden", isApproved: false });

    const response = await request(app)
      .get("/api/v1/review/top")
      .query({ limit: 2, minRating: 5 });

    expect(response.status).toBe(200);
    expect(response.body.totalReviews).toBe(2);
    const namedReview = response.body.reviews.find(
      (item) => item.review === "Superb",
    );
    expect(namedReview).toEqual(
      expect.objectContaining({ name: named.username, rating: 5 }),
    );
    expect(
      response.body.reviews.some((item) => item.name === "Anonymous"),
    ).toBe(true);
  });
});
