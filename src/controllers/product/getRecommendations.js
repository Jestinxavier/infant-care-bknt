const mongoose = require("mongoose");
const Product = require("../../models/Product");

const getRecommendations = async (req, res) => {
  try {
    const { productId, category, limit = 8 } = req.query;

    if (!category) {
      return res
        .status(400)
        .json({ success: false, message: "category is required" });
    }

    const matchQuery = { status: "published" };

    if (mongoose.Types.ObjectId.isValid(category)) {
      matchQuery.category = new mongoose.Types.ObjectId(category);
    }

    if (productId && mongoose.Types.ObjectId.isValid(productId)) {
      matchQuery._id = { $ne: new mongoose.Types.ObjectId(productId) };
    }

    const parsedLimit = Math.min(parseInt(limit) || 8, 20);

    const products = await Product.aggregate([
      { $match: matchQuery },
      { $sort: { averageRating: -1, createdAt: -1 } },
      { $limit: parsedLimit },
      { $addFields: { firstVariant: { $arrayElemAt: ["$variants", 0] } } },
      {
        $project: {
          _id: 1,
          title: 1,
          url_key: 1,
          image: { $arrayElemAt: ["$images", 0] },
          price: {
            $ifNull: ["$firstVariant.price", { $ifNull: ["$price", 0] }],
          },
          offerPrice: {
            $ifNull: [
              "$firstVariant.offerPrice",
              { $ifNull: ["$offerPrice", null] },
            ],
          },
          discountPrice: {
            $let: {
              vars: {
                vPrice: {
                  $ifNull: ["$firstVariant.price", { $ifNull: ["$price", 0] }],
                },
                vOffer: {
                  $ifNull: [
                    "$firstVariant.offerPrice",
                    { $ifNull: ["$offerPrice", 0] },
                  ],
                },
              },
              in: {
                $cond: [
                  {
                    $and: [
                      { $gt: ["$$vOffer", 0] },
                      { $lt: ["$$vOffer", "$$vPrice"] },
                    ],
                  },
                  "$$vOffer",
                  null,
                ],
              },
            },
          },
        },
      },
    ]);

    return res.status(200).json({
      success: true,
      products: products.map((p) => ({
        id: p._id.toString(),
        parentId: p._id.toString(),
        title: p.title || "",
        url_key: p.url_key || "",
        slug: p.url_key || "",
        image: p.image || "",
        price: p.discountPrice || p.price || 0,
        discountPrice: p.discountPrice || null,
        regularPrice: p.price || 0,
      })),
    });
  } catch (err) {
    console.error("❌ Error fetching recommendations:", err);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error" });
  }
};

module.exports = getRecommendations;
