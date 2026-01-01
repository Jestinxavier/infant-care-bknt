const mongoose = require("mongoose");
const Order = require("../../models/Order");
const Address = require("../../models/Address");
const Payment = require("../../models/Payment");
const Product = require("../../models/Product");
const Cart = require("../../models/Cart");
const {
  PAYMENT_METHODS,
  CHECKOUT_SESSION_MS,
} = require("../../../resources/constants");
const { consumeCoupon } = require("../../utils/couponValidation");
const crypto = require("crypto");
const phonepeSDK = require("../../controllers/payment/phonepeSDK");

const generateOrderId = () =>
  crypto.randomBytes(4).toString("hex").toUpperCase();

/**
 * Create Order with MongoDB Transactions
 * POST /api/v1/orders/create
 */
const createOrder = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { userId, items, addressId, newAddress, paymentMethod, cartId } =
      req.body;

    // === VALIDATION ===
    if (!userId || !items || items.length === 0) {
      return res.status(400).json({
        success: false,
        errorCode: "INVALID_REQUEST",
        message: "User ID and order items are required",
      });
    }

    // === IDEMPOTENCY CHECK ===
    const existingOrder = await Order.findOne({
      userId,
      status: { $in: ["created", "confirmed", "processing"] },
    }).sort({ createdAt: -1 });

    if (existingOrder) {
      // Check if order is recent (within 5 min)
      const fiveMinAgo = new Date(Date.now() - CHECKOUT_SESSION_MS);
      if (existingOrder.createdAt > fiveMinAgo) {
        return res.status(200).json({
          success: true,
          order: existingOrder,
          idempotent: true,
          message: "Order already exists",
        });
      }
    }

    // === START TRANSACTION ===
    session.startTransaction();

    // Step 1: Load and validate cart (must be in checkout status)
    // Note: startCheckout finds/locks cart by userId, so we query the same way
    const cart = await Cart.findOne({ userId, status: "checkout" }).session(
      session
    );

    console.log(
      `🛒 Looking for checkout cart for user: ${userId}`,
      `Found: ${cart ? cart.cartId : "null"}`,
      `Coupon: ${cart ? JSON.stringify(cart.coupon) : "N/A"}`
    );

    if (!cart) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        errorCode: "CART_NOT_FOUND",
        message: "Cart not found",
      });
    }

    // STRICT: Cart must be in checkout status
    if (cart.status !== "checkout") {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        errorCode: "CHECKOUT_NOT_STARTED",
        message: "Call /cart/start-checkout first",
      });
    }

    // Check checkout expiry
    if (cart.checkoutExpiry < new Date()) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        errorCode: "CHECKOUT_EXPIRED",
        message: "Checkout session expired. Please restart checkout.",
      });
    }

    // Step 2: Validate stock & build order items
    let subtotal = 0;
    let totalAfterDiscount = 0;
    let totalQuantity = 0;
    const orderItems = [];
    const stockUpdates = [];

    for (const item of items) {
      const product = await Product.findById(item.productId).session(session);

      if (!product) {
        throw {
          code: "PRODUCT_NOT_FOUND",
          productId: item.productId,
          message: `Product not found: ${item.productId}`,
        };
      }

      let regularPrice, offerPrice, stock, variantData;

      if (item.variantId) {
        variantData = product.variants?.find(
          (v) => v.id === item.variantId || v._id?.toString() === item.variantId
        );

        if (!variantData) {
          throw {
            code: "VARIANT_NOT_FOUND",
            productId: item.productId,
            variantId: item.variantId,
            message: `Variant ${item.variantId} not found`,
          };
        }

        regularPrice = variantData.pricing?.price || variantData.price || 0;
        offerPrice = variantData.pricing?.discountPrice || regularPrice;
        stock = variantData.stockObj?.available ?? variantData.stock ?? 0;
      } else {
        regularPrice = product.pricing?.price || product.price || 0;
        offerPrice = product.pricing?.discountPrice || regularPrice;
        offerPrice = product.pricing?.discountPrice || regularPrice;
        stock = product.stockObj?.available ?? product.stock ?? 0;
      }

      // Find matching item in cart to get attributes
      const cartItem = cart.items.find((ci) => {
        const ciPid = ci.productId.toString();
        const iPid = item.productId;
        const ciVid = ci.variantId;
        const iVid = item.variantId;

        return ciPid === iPid && (ciVid === iVid || (!ciVid && !iVid));
      });

      const variantAttributes = cartItem ? cartItem.attributesSnapshot : null;

      // Validate stock BEFORE atomic update
      if (stock < item.quantity) {
        throw {
          code: "OUT_OF_STOCK",
          productId: item.productId,
          variantId: item.variantId,
          available: stock,
          requested: item.quantity,
          message: `Insufficient stock. Available: ${stock}, Requested: ${item.quantity}`,
        };
      }

      const itemQuantity = Number(item.quantity);

      subtotal += regularPrice * itemQuantity;
      totalAfterDiscount += offerPrice * itemQuantity;
      totalQuantity += itemQuantity;

      orderItems.push({
        productId: product._id,
        variantId: item.variantId || null,
        quantity: itemQuantity,
        price: offerPrice,
        regularPrice: regularPrice,

        // Product Snapshot
        name: product.name || product.title,
        sku: product.sku,
        image: product.images?.[0] || "",
        urlKey: product.url_key,

        // Variant Snapshot
        variantName: variantData ? variantData.name || variantData.label : null,
        variantSku: variantData ? variantData.sku : null,
        variantImage: variantData
          ? variantData.images?.[0] || product.images?.[0]
          : null,
        variantUrlKey: variantData
          ? variantData.url_key || product.url_key
          : null,
        variantAttributes: variantAttributes,
      });

      stockUpdates.push({
        productId: product._id,
        variantId: item.variantId || null,
        quantity: itemQuantity,
      });
    }

    // Step 3: Atomic stock decrement
    for (const update of stockUpdates) {
      if (update.variantId) {
        const result = await Product.findOneAndUpdate(
          {
            _id: update.productId,
            variants: {
              $elemMatch: {
                id: update.variantId,
                "stockObj.available": { $gte: update.quantity },
              },
            },
          },
          {
            $inc: {
              "variants.$.stockObj.available": -update.quantity,
              "variants.$.stock": -update.quantity,
            },
          },
          { session, new: true }
        );

        if (!result) {
          // Fetch product info for better error logging (include variants for variant SKU)
          const productInfo = await Product.findById(update.productId)
            .select("name sku variants")
            .session(session);
          const variantInfo = productInfo?.variants?.find(
            (v) => v.id === update.variantId
          );
          throw {
            code: "OUT_OF_STOCK",
            productId: update.productId,
            productName: productInfo?.name,
            productSku: productInfo?.sku,
            variantId: update.variantId,
            variantSku: variantInfo?.sku,
            message: `Stock exhausted for "${
              productInfo?.name || update.productId
            }" variant ${
              variantInfo?.sku || update.variantId
            } (race condition)`,
          };
        }
      } else {
        const result = await Product.findOneAndUpdate(
          {
            _id: update.productId,
            "stockObj.available": { $gte: update.quantity },
          },
          {
            $inc: {
              "stockObj.available": -update.quantity,
              stock: -update.quantity,
            },
          },
          { session, new: true }
        );

        if (!result) {
          // Fetch product info for better error logging
          const productInfo = await Product.findById(update.productId)
            .select("name sku")
            .session(session);
          throw {
            code: "OUT_OF_STOCK",
            productId: update.productId,
            productName: productInfo?.name,
            productSku: productInfo?.sku,
            message: `Stock exhausted for "${
              productInfo?.name || update.productId
            }" (race condition)`,
          };
        }
      }
    }

    // Step 4: Calculate pricing
    const SiteSetting = require("../../models/SiteSetting");
    const settings = await SiteSetting.find({ scope: "cart" });
    let freeThreshold = 1000;
    let shippingCost = 60;

    settings.forEach((s) => {
      if (s.key === "cart.shipping.freeThreshold")
        freeThreshold = Number(s.value);
      if (s.key === "cart.shipping.flat") shippingCost = Number(s.value);
    });

    const discountAmount = subtotal - totalAfterDiscount;
    const shippingAmount =
      totalAfterDiscount >= freeThreshold ? 0 : shippingCost;

    // Step 5: Atomic coupon consumption
    let couponDiscount = 0;
    let appliedCoupon = null;

    // Debug: Log cart coupon data
    console.log(`🎟️ Cart coupon checking:`, JSON.stringify(cart.coupon));

    if (cart.coupon && cart.coupon.code) {
      console.log(
        `🎟️ Attempting to consume coupon ${cart.coupon.code} with value ${totalAfterDiscount} (userId: ${userId})`
      );

      const consumption = await consumeCoupon(
        cart.coupon.code,
        totalAfterDiscount,
        userId,
        session
      );

      console.log(`🎟️ Consumption result:`, JSON.stringify(consumption));

      if (!consumption.success) {
        throw {
          code: consumption.error,
          message: consumption.message,
          couponFailed: true,
        };
      }

      couponDiscount = consumption.discount;
      appliedCoupon = {
        code: consumption.coupon.code,
        couponId: consumption.coupon._id,
        discountAmount: couponDiscount,
        applied: true,
      };

      console.log(
        `✅ Coupon ${cart.coupon.code} consumed atomically. Discount: ₹${couponDiscount}`
      );
    }

    const totalAmount = totalAfterDiscount + shippingAmount - couponDiscount;

    console.log(
      `💰 Order: Subtotal=${subtotal}, ProductDisc=${discountAmount}, CouponDisc=${couponDiscount}, Shipping=${shippingAmount}, Total=${totalAmount}`
    );

    // Step 6: Handle address
    let finalAddressId = addressId;
    let shippingAddressData = null;

    if (!addressId && newAddress) {
      const address = new Address({ userId, ...newAddress });
      const savedAddress = await address.save({ session });
      finalAddressId = savedAddress._id;
      shippingAddressData = savedAddress.toObject();
    } else if (addressId) {
      const existingAddress = await Address.findById(addressId).session(
        session
      );
      if (!existingAddress) {
        throw { code: "ADDRESS_NOT_FOUND", message: "Address not found" };
      }
      finalAddressId = existingAddress._id;
      shippingAddressData = existingAddress.toObject();
    } else {
      throw { code: "ADDRESS_REQUIRED", message: "Address is required" };
    }

    // Step 7: Create order with pricing snapshot
    if (!finalAddressId || !shippingAddressData) {
      return res
        .status(400)
        .json({ message: "Address ID or new address is required" });
    }

    // Step 3: Create Order
    const orderId = generateOrderId();

    const order = new Order({
      userId,
      orderId,
      orderId,
      items: orderItems,
      totalQuantity,
      subtotal,
      shippingCost: shippingAmount,
      discount: discountAmount + couponDiscount,
      coupon: appliedCoupon,
      totalAmount,
      totalAmount,
      // addressId removed
      shippingAddress: shippingAddressData,
      paymentMethod: paymentMethod,
      status: "pending",
      pricingSnapshot: {
        itemsSubtotal: subtotal,
        productDiscount: discountAmount,
        couponDiscount,
        shipping: shippingAmount,
        total: totalAmount,
        snapshotAt: new Date(),
      },
    });

    await order.save({ session });

    // Step 8: Create payment record
    const payment = new Payment({
      orderId: order._id,
      userId,
      amount: totalAmount,
      method: paymentMethod || PAYMENT_METHODS.COD,
      status: paymentMethod === PAYMENT_METHODS.COD ? "pending" : "initiated",
    });

    await payment.save({ session });

    // Step 9: Keep cart in checkout (NOT ordered yet - only on payment success)
    // Cart will be marked "ordered" by webhook on successful payment
    // Cart will be reverted to "active" on payment failure
    await Cart.findByIdAndUpdate(
      cart._id,
      {
        status: "checkout", // Keep in checkout, not ordered
        orderId: order._id,
        // completedAt will be set on payment success
      },
      { session }
    );

    // === COMMIT TRANSACTION ===
    await session.commitTransaction();

    console.log(
      `✅ Order ${order.orderId} created successfully in transaction`
    );

    // Step 10: Return response based on payment method
    if (paymentMethod === PAYMENT_METHODS.PHONEPE) {
      try {
        const response = await phonepeSDK.initiatePayment({
          orderId,
          amount: Math.round(totalAmount * 100),
        });
        if (response?.redirectUrl) {
          return res.status(200).json({
            success: true,
            message: "Redirecting to PhonePe payment gateway",
            paymentMode: "phonepe",
            ...response,
          });
        } else {
          throw new Error("Redirect URL missing from SDK response");
        }
      } catch (error) {
        console.error("❌ Error initiating PhonePe payment:", error);

        // === CLEANUP LONE ORDER (Case 3: Payment Init Failed) ===
        // Since transaction is already committed, we must manually undo changes.
        try {
          console.log(`⚠️ Cleaning up failed order ${order.orderId}...`);

          // 1. Cancel the order
          await Order.findByIdAndUpdate(order._id, {
            status: "cancelled",
            paymentStatus: "failed",
            "statusHistory.0.note":
              "Payment initiation failed - Auto-cancelled",
          });

          // 2. Release Stock
          for (const update of stockUpdates) {
            if (update.variantId) {
              await Product.findOneAndUpdate(
                { _id: update.productId, "variants.id": update.variantId },
                {
                  $inc: {
                    "variants.$.stockObj.available": update.quantity,
                    "variants.$.stock": update.quantity,
                  },
                }
              );
            } else {
              await Product.findOneAndUpdate(
                { _id: update.productId },
                {
                  $inc: {
                    "stockObj.available": update.quantity,
                    stock: update.quantity,
                  },
                }
              );
            }
          }

          // 3. Revert Cart (Make it active again for retry)
          await Cart.findByIdAndUpdate(cart._id, {
            status: "active",
            orderId: null,
            completedAt: null,
          });

          console.log(`✅ Cleanup successful for order ${order.orderId}`);
        } catch (cleanupError) {
          console.error(
            "🔥 CRITICAL: Failed to cleanup order after payment error:",
            cleanupError
          );
          // Alert admin/sentry here
        }

        return res.status(500).json({
          success: false,
          message: "Failed to initiate payment. Order cancelled.",
          error: error.message,
          orderCancelled: true,
        });
      }
    }

    if (paymentMethod === PAYMENT_METHODS.RAZORPAY) {
      try {
        // TODO: Implement Razorpay init
        return res.status(201).json({
          success: true,
          message:
            "Order placed successfully. Please initiate Razorpay payment.",
          requiresPayment: true,
          paymentMethod: PAYMENT_METHODS.RAZORPAY,
        });
      } catch (paymentError) {
        console.error("Razorpay init failed:", paymentError);
        return res.status(201).json({
          success: true,
          paymentInitFailed: true,
          message:
            "Order created, but payment initiation failed. Please try again.",
        });
      }
    }

    // COD or other methods
    return res.status(201).json({
      success: true,
      message: "Order placed successfully",
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("❌ Order creation failed:", error);

    // Structured error responses
    if (error.code === "OUT_OF_STOCK") {
      return res.status(400).json({
        success: false,
        errorCode: "OUT_OF_STOCK",
        message: error.message || "Insufficient stock",
        productId: error.productId,
        productName: error.productName,
        productSku: error.productSku,
        variantId: error.variantId,
        variantSku: error.variantSku,
      });
    }

    if (error.code === "COUPON_EXHAUSTED" || error.couponFailed) {
      return res.status(400).json({
        success: false,
        errorCode: error.code || "COUPON_FAILED",
        couponFailed: true,
        message: error.message || "Coupon has been fully redeemed",
      });
    }

    if (error.code === "CHECKOUT_NOT_STARTED") {
      return res.status(400).json({
        success: false,
        errorCode: "CHECKOUT_NOT_STARTED",
        message: error.message,
      });
    }

    if (error.code === "CHECKOUT_EXPIRED") {
      return res.status(400).json({
        success: false,
        errorCode: "CHECKOUT_EXPIRED",
        message: error.message,
      });
    }

    if (
      error.code === "ADDRESS_NOT_FOUND" ||
      error.code === "ADDRESS_REQUIRED"
    ) {
      return res.status(400).json({
        success: false,
        errorCode: error.code,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Order creation failed",
      error: error.message,
    });
  } finally {
    session.endSession();
  }
};

module.exports = createOrder;
