const Coupon = require("../../models/Coupon");
const Product = require("../../models/Product");
const Order = require("../../models/Order");
const escapeRegex = require("../../utils/escapeRegex");
const logger = require("../../utils/logger");

/**
 * POST /api/v1/admin/coupons
 */
const createCoupon = async (req, res) => {
  try {
    const {
      code,
      type,
      value,
      minCartValue,
      maxDiscount,
      startDate,
      endDate,
      usageLimit,
      perUserLimit,
      isNewUserOnly,
      applicableTo,
      applicableProductIds,
      applicableCategories,
      isPublic,
    } = req.body;

    if (!code || !type || !startDate || !endDate) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }
    if (type !== "free_gift" && value === undefined) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ success: false, message: "Invalid date format" });
    }
    if (start >= end) {
      return res.status(400).json({ success: false, message: "End date must be after start date" });
    }
    if (end < new Date()) {
      return res.status(400).json({ success: false, message: "End date cannot be in the past" });
    }
    if (type !== "free_gift") {
      if (value <= 0) {
        return res.status(400).json({ success: false, message: "Discount value must be greater than 0" });
      }
      if (type === "percentage" && value > 100) {
        return res.status(400).json({ success: false, message: "Percentage discount cannot exceed 100%" });
      }
      if (type === "flat" && maxDiscount) {
        return res.status(400).json({ success: false, message: "Max discount is not applicable for flat discounts" });
      }
    }

    // Validate free_gift-specific fields
    const { freeGift } = req.body;
    if (type === "free_gift") {
      if (!freeGift?.giftProductId) {
        return res.status(400).json({ success: false, message: "Gift product is required for free gift coupons" });
      }
      if (!freeGift?.triggerProductIds || freeGift.triggerProductIds.length === 0) {
        return res.status(400).json({ success: false, message: "At least one trigger product is required for free gift coupons" });
      }
    }

    const scope = ["specific_products", "category"].includes(applicableTo) ? applicableTo : "all";
    if (scope === "specific_products" && (!applicableProductIds || applicableProductIds.length === 0)) {
      return res.status(400).json({ success: false, message: "Select at least one product for a product-scoped coupon" });
    }
    if (scope === "category" && (!applicableCategories || applicableCategories.length === 0)) {
      return res.status(400).json({ success: false, message: "Select at least one category for a category-scoped coupon" });
    }

    const existing = await Coupon.findOne({ code: code.toUpperCase() });
    if (existing) {
      return res.status(400).json({ success: false, message: "Coupon code already exists", errorCode: "DUPLICATE_CODE" });
    }

    const effectivePerUserLimit = isNewUserOnly ? 1 : perUserLimit || 1;

    const coupon = await Coupon.create({
      code: code.toUpperCase(),
      type,
      value: type === "free_gift" ? 0 : value,
      minCartValue: minCartValue || 0,
      maxDiscount: type === "percentage" ? maxDiscount || null : null,
      freeGift: type === "free_gift" ? {
        triggerProductIds: freeGift.triggerProductIds,
        triggerMinQty: freeGift.triggerMinQty || 1,
        giftProductId: freeGift.giftProductId,
        giftQty: freeGift.giftQty || 1,
      } : undefined,
      startDate: start,
      endDate: end,
      usageLimit: usageLimit || null,
      perUserLimit: effectivePerUserLimit,
      isNewUserOnly: !!isNewUserOnly,
      applicableTo: scope,
      applicableCategories: scope === "category" ? applicableCategories : [],
      applicableProductIds: scope === "specific_products" ? applicableProductIds : [],
      isPublic: isPublic !== false,
      createdBy: req.user._id,
    });

    await coupon.populate("applicableProductIds", "title images sku");
    const populated = await coupon.populate("applicableCategories", "name code");

    res.status(201).json({ success: true, coupon: populated });
  } catch (error) {
    logger.error("❌ Error creating coupon:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/v1/admin/coupons
 */
const listCoupons = async (req, res) => {
  try {
    const coupons = await Coupon.find()
      .sort({ createdAt: -1 })
      .populate("applicableProductIds", "title images sku")
      .populate("applicableCategories", "name code");
    res.status(200).json({ success: true, coupons });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * PATCH /api/v1/admin/coupons/:id
 */
const updateCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const coupon = await Coupon.findById(id);
    if (!coupon) {
      return res.status(404).json({ success: false, message: "Coupon not found" });
    }

    if (coupon.usageCount > 0) {
      const immutableFields = ["code", "type", "value", "startDate"];
      const meaningfulChanges = immutableFields.filter((field) => {
        if (!(field in updates)) return false;
        if (field === "startDate")
          return new Date(updates[field]).getTime() !== new Date(coupon[field]).getTime();
        return updates[field] !== coupon[field];
      });

      if (meaningfulChanges.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Cannot edit ${meaningfulChanges.join(", ")} because this coupon has already been used.`,
          errorCode: "IMMUTABLE_FIELD",
        });
      }
    }

    if (updates.code) updates.code = updates.code.toUpperCase();
    if (updates.isNewUserOnly === true) updates.perUserLimit = 1;
    if (updates.type === "free_gift") updates.value = 0;

    // Validate free_gift fields on update
    if (updates.type === "free_gift" || (coupon.type === "free_gift" && updates.freeGift)) {
      const fg = updates.freeGift || coupon.freeGift;
      if (!fg?.giftProductId) {
        return res.status(400).json({ success: false, message: "Gift product is required for free gift coupons" });
      }
      if (!fg?.triggerProductIds || fg.triggerProductIds.length === 0) {
        return res.status(400).json({ success: false, message: "At least one trigger product is required for free gift coupons" });
      }
    }

    // Validate and normalize scope
    if (updates.applicableTo === "specific_products" && (!updates.applicableProductIds || updates.applicableProductIds.length === 0)) {
      return res.status(400).json({ success: false, message: "Select at least one product for a product-scoped coupon" });
    }
    if (updates.applicableTo === "category" && (!updates.applicableCategories || updates.applicableCategories.length === 0)) {
      return res.status(400).json({ success: false, message: "Select at least one category for a category-scoped coupon" });
    }
    if (updates.applicableTo === "all") {
      updates.applicableProductIds = [];
      updates.applicableCategories = [];
    }
    if (updates.applicableTo === "specific_products") {
      updates.applicableCategories = [];
    }
    if (updates.applicableTo === "category") {
      updates.applicableProductIds = [];
    }

    if (updates.startDate || updates.endDate) {
      const start = updates.startDate ? new Date(updates.startDate) : coupon.startDate;
      const end = updates.endDate ? new Date(updates.endDate) : coupon.endDate;
      if (start >= end) {
        return res.status(400).json({ success: false, message: "End date must be after start date" });
      }
    }

    const updatedCoupon = await Coupon.findByIdAndUpdate(id, updates, { new: true })
      .populate("applicableProductIds", "title images sku")
      .populate("applicableCategories", "name code");

    res.status(200).json({ success: true, coupon: updatedCoupon });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * DELETE /api/v1/admin/coupons/:id
 */
const deleteCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    await Coupon.findByIdAndDelete(id);
    res.status(200).json({ success: true, message: "Coupon deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/v1/admin/coupons/product-search?q=...
 * Lightweight product search for the coupon form product picker
 */
const searchProductsForCoupon = async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    const categoryId = (req.query.category || "").trim();

    const query = { status: "published" };
    if (q) query.title = { $regex: escapeRegex(q), $options: "i" };
    if (categoryId) query.category = categoryId;

    const products = await Product.find(query)
      .select("_id title images sku")
      .limit(50)
      .lean();

    res.status(200).json({
      success: true,
      products: products.map((p) => ({
        _id: p._id,
        title: p.title,
        image: p.images?.[0] || null,
        sku: p.sku || null,
      })),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  createCoupon,
  listCoupons,
  updateCoupon,
  deleteCoupon,
  searchProductsForCoupon,
};
