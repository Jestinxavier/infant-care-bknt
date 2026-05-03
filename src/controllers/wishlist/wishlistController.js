const Wishlist = require("../../models/Wishlist");
const Product = require("../../models/Product");

/**
 * GET /wishlist
 * Returns the authenticated user's wishlist as an array of productId strings.
 */
const getWishlist = async (req, res) => {
  try {
    const wishlist = await Wishlist.findOne({ userId: req.user.id }).lean();
    const productIds = (wishlist?.productIds || []).map((id) => id.toString());
    res.json({ success: true, productIds });
  } catch (err) {
    console.error("getWishlist error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch wishlist" });
  }
};

/**
 * GET /wishlist/products
 * Returns enriched product cards for all items in the user's wishlist.
 */
const getWishlistProducts = async (req, res) => {
  try {
    const wishlist = await Wishlist.findOne({ userId: req.user.id }).lean();
    if (!wishlist || wishlist.productIds.length === 0) {
      return res.json({ success: true, items: [] });
    }

    const products = await Product.find(
      { _id: { $in: wishlist.productIds }, status: "published" },
      {
        _id: 1,
        title: 1,
        url_key: 1,
        images: 1,
        product_type: 1,
        "pricing.price": 1,
        "pricing.discountPrice": 1,
        "stockObj.available": 1,
        badge: 1,
      }
    ).lean();

    const items = products.map((p) => ({
      productId: p._id.toString(),
      title: p.title || "",
      url_key: p.url_key || "",
      image: Array.isArray(p.images) ? p.images[0] || "" : "",
      product_type: p.product_type || "SIMPLE",
      regular_price: p.pricing?.price || 0,
      offer_price: p.pricing?.discountPrice || null,
      stock: p.stockObj?.available ?? 0,
      badgeLabel: p.badge?.label || null,
      badgeColor: p.badge?.color || null,
      badgeLabelColor: p.badge?.labelColor || null,
    }));

    res.json({ success: true, items });
  } catch (err) {
    console.error("getWishlistProducts error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch wishlist products" });
  }
};

/**
 * POST /wishlist/toggle
 * Body: { productId }
 * Adds or removes the product from the wishlist. Returns { wishlisted: bool }.
 */
const toggleWishlist = async (req, res) => {
  const { productId } = req.body;
  if (!productId) {
    return res.status(400).json({ success: false, message: "productId is required" });
  }

  try {
    let wishlist = await Wishlist.findOne({ userId: req.user.id });

    if (!wishlist) {
      wishlist = new Wishlist({ userId: req.user.id, productIds: [productId] });
      await wishlist.save();
      return res.json({ success: true, wishlisted: true });
    }

    const idx = wishlist.productIds.findIndex(
      (id) => id.toString() === productId
    );

    if (idx === -1) {
      wishlist.productIds.push(productId);
      await wishlist.save();
      return res.json({ success: true, wishlisted: true });
    } else {
      wishlist.productIds.splice(idx, 1);
      await wishlist.save();
      return res.json({ success: true, wishlisted: false });
    }
  } catch (err) {
    console.error("toggleWishlist error:", err);
    res.status(500).json({ success: false, message: "Failed to update wishlist" });
  }
};

module.exports = { getWishlist, getWishlistProducts, toggleWishlist };
