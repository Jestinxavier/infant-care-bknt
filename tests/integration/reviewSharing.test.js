const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../../src/app");
const Product = require("../../src/models/Product");
const Category = require("../../src/models/Category");
const Review = require("../../src/models/Review");

const makeProduct = (overrides) =>
  Product.create({
    title: overrides.title,
    category: overrides.category,
    status: overrides.status || "published",
    designId: overrides.designId,
    subCategories: overrides.subCategories,
  });

const makeReview = ({ productId, rating, isApproved = true, title = "Great" }) =>
  Review.create({
    userId: new mongoose.Types.ObjectId(),
    productId,
    orderId: new mongoose.Types.ObjectId(),
    title,
    rating,
    review: "Nice garment",
    status: isApproved ? "approved" : "pending",
    isApproved,
  });

describe("Review sharing by design family", () => {
  let designCategory;
  let otherCategory;

  beforeEach(async () => {
    designCategory = await Category.create({
      name: "Bodysuits",
      code: "bodysuits",
      isActive: true,
    });
    otherCategory = await Category.create({
      name: "Hats",
      code: "hats",
      isActive: true,
    });
  });

  it("returns shared reviews from same-design siblings in the same category", async () => {
    const target = await makeProduct({
      title: "Cotton Air Bodysuit - Blue",
      category: designCategory._id,
      designId: "cotton-air-bodysuit",
    });
    const sibling = await makeProduct({
      title: "Cotton Air Bodysuit - Pink",
      category: designCategory._id,
      designId: "cotton-air-bodysuit",
    });
    const otherCategorySibling = await makeProduct({
      title: "Cotton Air Hat",
      category: otherCategory._id,
      designId: "cotton-air-bodysuit",
    });
    const draftSibling = await makeProduct({
      title: "Cotton Air Bodysuit - Draft",
      category: designCategory._id,
      designId: "cotton-air-bodysuit",
      status: "draft",
    });

    // Own review on the target.
    await makeReview({ productId: target._id, rating: 5 });
    // Eligible shared review.
    await makeReview({ productId: sibling._id, rating: 3 });
    // Unapproved review on a sibling — must be excluded.
    await makeReview({ productId: sibling._id, rating: 1, isApproved: false });
    // Reviews on excluded products — must never surface.
    await makeReview({ productId: otherCategorySibling._id, rating: 4 });
    await makeReview({ productId: draftSibling._id, rating: 4 });

    const res = await request(app).get(
      `/api/v1/review/product/${target._id.toString()}`,
    );

    expect(res.status).toBe(200);
    // Own rating is untouched by shared siblings.
    expect(res.body.totalReviews).toBe(1);
    expect(res.body.averageRating).toBe(5);

    expect(res.body.shared).not.toBeNull();
    expect(res.body.shared.designId).toBe("cotton-air-bodysuit");
    expect(res.body.shared.totalReviews).toBe(1);
    expect(res.body.shared.averageRating).toBe(3);
    expect(res.body.shared.reviews).toHaveLength(1);
    expect(res.body.shared.reviews[0].rating).toBe(3);
    // Source product is populated so the storefront can link/caption it.
    expect(res.body.shared.reviews[0].productId.name).toBe(
      "Cotton Air Bodysuit - Pink",
    );
    expect(res.body.shared.reviews[0].productId.url_key).toBeTruthy();
  });

  it("aggregates multiple shared reviews across siblings without touching own", async () => {
    const target = await makeProduct({
      title: "Cotton Air Bodysuit - Blue",
      category: designCategory._id,
      designId: "cotton-air-bodysuit",
    });
    const siblingA = await makeProduct({
      title: "Cotton Air Bodysuit - Pink",
      category: designCategory._id,
      designId: "cotton-air-bodysuit",
    });
    const siblingB = await makeProduct({
      title: "Cotton Air Bodysuit - Green",
      category: designCategory._id,
      designId: "cotton-air-bodysuit",
    });

    await makeReview({ productId: target._id, rating: 2 });
    await makeReview({ productId: siblingA._id, rating: 5 });
    await makeReview({ productId: siblingB._id, rating: 1 });

    const res = await request(app).get(
      `/api/v1/review/product/${target._id.toString()}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.totalReviews).toBe(1);
    expect(res.body.averageRating).toBe(2);
    expect(res.body.shared.totalReviews).toBe(2);
    expect(res.body.shared.averageRating).toBe(3);
  });

  it("falls back to subCategories[0] when designId is missing", async () => {
    const target = await makeProduct({
      title: "Cotton Air Bodysuit - Blue",
      category: designCategory._id,
      subCategories: [designCategory._id],
    });
    const sibling = await makeProduct({
      title: "Cotton Air Bodysuit - Pink",
      category: designCategory._id,
      subCategories: [designCategory._id],
    });
    const otherSubCategory = await Category.create({
      name: "Sleepsuits",
      code: "sleepsuits",
      isActive: true,
    });
    const otherSubSibling = await makeProduct({
      title: "Different Style",
      category: designCategory._id,
      subCategories: [otherSubCategory._id],
    });

    await makeReview({ productId: sibling._id, rating: 4 });
    await makeReview({ productId: otherSubSibling._id, rating: 5 });

    const res = await request(app).get(
      `/api/v1/review/product/${target._id.toString()}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.shared).not.toBeNull();
    expect(res.body.shared.type).toBe("subCategory");
    expect(res.body.shared.totalReviews).toBe(1);
    expect(res.body.shared.averageRating).toBe(4);
  });

  it("prefers designId over subcategory fallback", async () => {
    const target = await makeProduct({
      title: "Cotton Air Bodysuit - Blue",
      category: designCategory._id,
      designId: "cotton-air-bodysuit",
      subCategories: [designCategory._id],
    });
    const siblingByDesign = await makeProduct({
      title: "Cotton Air Bodysuit - Pink",
      category: designCategory._id,
      designId: "cotton-air-bodysuit",
      subCategories: [designCategory._id],
    });
    const siblingBySubCategory = await makeProduct({
      title: "Other Romper",
      category: designCategory._id,
      subCategories: [designCategory._id],
    });

    await makeReview({ productId: siblingByDesign._id, rating: 5 });
    await makeReview({ productId: siblingBySubCategory._id, rating: 1 });

    const res = await request(app).get(
      `/api/v1/review/product/${target._id.toString()}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.shared.type).toBe("designId");
    expect(res.body.shared.designId).toBe("cotton-air-bodysuit");
    expect(res.body.shared.totalReviews).toBe(1);
    expect(res.body.shared.averageRating).toBe(5);
  });

  it("returns shared null for a product without a designId and without subCategories", async () => {
    const target = await makeProduct({
      title: "Standalone Bodysuit",
      category: designCategory._id,
    });

    const res = await request(app).get(
      `/api/v1/review/product/${target._id.toString()}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.shared).toBeNull();
  });

  it("returns shared null when no sibling product shares the design", async () => {
    const target = await makeProduct({
      title: "Lonely Design Bodysuit",
      category: designCategory._id,
      designId: "lonely-design",
    });

    const res = await request(app).get(
      `/api/v1/review/product/${target._id.toString()}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.shared).toBeNull();
  });
});
