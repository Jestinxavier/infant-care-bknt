// GET /review/top feeds the CMS home-page reviews picker. Each review must be
// readable before an admin adds it: title, body, reviewer name and product.
const mongoose = require("mongoose");
const Product = require("../../src/models/Product");
const Review = require("../../src/models/Review");
require("../../src/models/user"); // populated as the reviewer account
const { getTopReviews } = require("../../src/controllers/review/review");

const call = (query) => {
  const res = {
    status() {
      return res;
    },
    json(obj) {
      res.body = obj;
    },
  };
  return getTopReviews({ query }, res).then(() => res.body);
};

let n = 0;
const makeProduct = () =>
  Product.create({
    title: `Sleep Suit ${Date.now()}-${n++}`,
    category: new mongoose.Types.ObjectId(),
    status: "published",
    variants: [],
  });

const makeReview = (product, overrides) =>
  Review.create({
    productId: product._id,
    orderId: new mongoose.Types.ObjectId(),
    rating: 5,
    title: "Lovely fabric",
    review: "",
    status: "approved",
    isApproved: true,
    ...overrides,
  });

describe("GET /review/top", () => {
  test("returns title, guest name and product for each review", async () => {
    const product = await makeProduct();
    await makeReview(product, { title: "super", review: "", isGuest: true, guestName: "Pinki Paswan" });
    await makeReview(product, { title: "Soft", review: "Very soft and gentle.", rating: 4 });

    const body = await call({ minRating: "1", limit: "50" });
    expect(body.success).toBe(true);

    const titleOnly = body.reviews.find((r) => r.title === "super");
    expect(titleOnly).toMatchObject({ name: "Pinki Paswan", review: "", rating: 5 });
    expect(titleOnly.productName).toBeTruthy();

    const withBody = body.reviews.find((r) => r.title === "Soft");
    expect(withBody).toMatchObject({ name: "Anonymous", review: "Very soft and gentle.", rating: 4 });
  });

  test("leaves out unapproved reviews and caps the page size at 100", async () => {
    const product = await makeProduct();
    await makeReview(product, { title: "hidden", status: "pending", isApproved: false });
    const body = await call({ minRating: "1", limit: "100000" });
    expect(body.reviews.some((r) => r.title === "hidden")).toBe(false);
    expect(body.reviews.length).toBeLessThanOrEqual(100);
  });
});
