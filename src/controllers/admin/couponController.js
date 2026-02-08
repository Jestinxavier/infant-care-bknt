const Coupon = require("../../models/Coupon");
const Order = require("../../models/Order");

/**
 * Create a new coupon
 * POST /api/v1/admin/coupons
 */
/**
 * Create a new coupon
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
    } = req.body;

    // 1. Basic Validation
    if (!code || !type || value === undefined || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    // 2. Date Validation
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid date format" });
    }
    if (start >= end) {
      return res
        .status(400)
        .json({ success: false, message: "End date must be after start date" });
    }
    if (end < new Date()) {
      return res
        .status(400)
        .json({ success: false, message: "End date cannot be in the past" });
    }

    // 3. Logic Validation
    if (value <= 0) {
      return res.status(400).json({
        success: false,
        message: "Discount value must be greater than 0",
      });
    }
    if (type === "percentage" && value > 100) {
      return res.status(400).json({
        success: false,
        message: "Percentage discount cannot exceed 100%",
      });
    }
    if (type === "percentage" && (!maxDiscount || maxDiscount <= 0)) {
      // Enterprise Rule: Percentage coupons often need a cap, but we can allow uncapped if intended.
      // Warn or allow? Standard is usually to allow unless business rules strictly forbid.
      // User requirement said: "maxDiscount present only when type === percentage"
    }
    if (type === "flat" && maxDiscount) {
      return res.status(400).json({
        success: false,
        message: "Max discount is not applicable for flat discounts",
      });
    }

    // 4. Uniqueness Check
    const existing = await Coupon.findOne({ code: code.toUpperCase() });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Coupon code already exists",
        errorCode: "DUPLICATE_CODE",
      });
    }

    // If first-order-only coupon, enforce perUserLimit = 1
    const effectivePerUserLimit = isNewUserOnly ? 1 : perUserLimit || 1;

    const coupon = await Coupon.create({
      code: code.toUpperCase(),
      type,
      value,
      minCartValue: minCartValue || 0,
      maxDiscount: type === "percentage" ? maxDiscount || null : null,
      startDate: start,
      endDate: end,
      usageLimit: usageLimit || null,
      perUserLimit: effectivePerUserLimit,
      isNewUserOnly: !!isNewUserOnly,
      createdBy: req.user._id,
    });

    res.status(201).json({
      success: true,
      coupon,
    });
  } catch (error) {
    console.error("❌ Error creating coupon:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * List all coupons
 * GET /api/v1/admin/coupons
 */
const listCoupons = async (req, res) => {
  try {
    const coupons = await Coupon.find().sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      coupons,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Update coupon
 * PATCH /api/v1/admin/coupons/:id
 */
/**
 * Update coupon
 * PATCH /api/v1/admin/coupons/:id
 * Rules:
 * - If usageCount > 0, critical fields (code, type, value, startDate) cannot be changed.
 * - isActive, endDate (extend only), usageLimit (increase only) can be changed.
 */
const updateCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const coupon = await Coupon.findById(id);
    if (!coupon) {
      return res
        .status(404)
        .json({ success: false, message: "Coupon not found" });
    }

    // Check if coupon has been used
    if (coupon.usageCount > 0) {
      const immutableFields = ["code", "type", "value", "startDate"];
      const attemptedChanges = Object.keys(updates).filter((field) =>
        immutableFields.includes(field)
      );

      // Check if values actually changed (sometimes frontend sends same data)
      const meaningfulChanges = attemptedChanges.filter((field) => {
        if (field === "startDate")
          return (
            new Date(updates[field]).getTime() !==
            new Date(coupon[field]).getTime()
          );
        return updates[field] !== coupon[field];
      });

      if (meaningfulChanges.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Cannot edit ${meaningfulChanges.join(
            ", "
          )} because this coupon has already been used.`,
          errorCode: "IMMUTABLE_FIELD",
        });
      }
    }

    // Ensure code remains uppercase if updated (and allowed)
    if (updates.code) {
      updates.code = updates.code.toUpperCase();
    }

    // If setting isNewUserOnly to true, enforce perUserLimit = 1
    if (updates.isNewUserOnly === true) {
      updates.perUserLimit = 1;
    }

    // Validate Dates if changing
    if (updates.startDate || updates.endDate) {
      const start = updates.startDate
        ? new Date(updates.startDate)
        : coupon.startDate;
      const end = updates.endDate ? new Date(updates.endDate) : coupon.endDate;

      if (start >= end) {
        return res.status(400).json({
          success: false,
          message: "End date must be after start date",
        });
      }
    }

    const updatedCoupon = await Coupon.findByIdAndUpdate(id, updates, {
      new: true,
    });

    res.status(200).json({
      success: true,
      coupon: updatedCoupon,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Delete coupon
 * DELETE /api/v1/admin/coupons/:id
 */
const deleteCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    await Coupon.findByIdAndDelete(id);
    res.status(200).json({
      success: true,
      message: "Coupon deleted",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  createCoupon,
  listCoupons,
  updateCoupon,
  deleteCoupon,
};
