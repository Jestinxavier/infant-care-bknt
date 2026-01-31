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
const bundleService = require("../../features/product/bundle.service");
const { PRODUCT_TYPES } = require("../../features/product/product.model");
const crypto = require("crypto");
const phonepeSDK = require("../../controllers/payment/phonepeSDK");
const { computeCartItemPricing } = require("../../utils/quantityPricingUtils");

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

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        errorCode: "INVALID_USER_ID",
        message: "Invalid User ID format",
      });
    }

    // === IDEMPOTENCY CHECK (Key-Based) ===
    const idempotencyKey = req.headers["idempotency-key"];

    if (!idempotencyKey) {
      return res.status(400).json({
        success: false,
        errorCode: "MISSING_IDEMPOTENCY_KEY",
        message: "Idempotency-Key header is required",
      });
    }

    // Check if order with this idempotency key already exists
    const existingOrder = await Order.findOne({ idempotencyKey });

    if (existingOrder) {
      console.log(
        `♻️ Idempotent order creation: Returning existing order ${existingOrder.orderId}`
      );
      return res.status(200).json({
        success: true,
        order: existingOrder,
        idempotent: true,
        message: "Order already exists with this idempotency key",
      });
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

    // RELAXED VALIDATION: Cart must exist and NOT be ordered
    // We allow retries, so if it's already in 'checkout' (or even 'active' if we want to be lenient), it's fine.
    // The critical thing is it must not be 'ordered'.
    if (cart.status === "ordered") {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        errorCode: "CART_ALREADY_ORDERED",
        message: "This cart has already been converted to an order",
      });
    }

    // Optional: Ensure checkout session is somehow valid if we care about TTL
    // But since startCheckout handles TTL, we might just check if it exists.
    // For now, we mainly block 'ordered'.

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
      let bundleChildDeductions = []; // For bundle child stock deductions
      let unitPrice; // Resolved price after quantity tiers (for non-bundles)

      // Handle BUNDLE products (use same logic as cart for offer pricing)
      if (product.product_type === PRODUCT_TYPES.BUNDLE) {
        const pricingResult = computeCartItemPricing(
          product,
          null,
          item.quantity
        );
        regularPrice = pricingResult.originalPrice;
        offerPrice = pricingResult.basePrice;
        unitPrice = pricingResult.unitPrice;

        // Compute bundle availability from children
        const bundleAvailability = await bundleService.getBundleAvailability(
          product.bundle_config
        );
        stock = bundleAvailability.availableQty;

        // Prepare child stock deductions
        bundleChildDeductions = bundleService.calculateBundleStockDeductions(
          product.bundle_config,
          item.quantity
        );
      } else if (item.variantId) {
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

        // Apply quantity-based tiered pricing for variants
        const pricingResult = computeCartItemPricing(
          product,
          variantData,
          item.quantity
        );
        unitPrice = pricingResult.unitPrice;
      } else {
        regularPrice = product.pricing?.price || product.price || 0;
        offerPrice = product.pricing?.discountPrice || regularPrice;
        stock = product.stockObj?.available ?? product.stock ?? 0;

        // Apply quantity-based tiered pricing for simple products
        const pricingResult = computeCartItemPricing(
          product,
          null,
          item.quantity
        );
        unitPrice = pricingResult.unitPrice;
      }

      // Find matching item in cart to get attributes and selectedGiftSku
      let cartItem = cart.items.find((ci) => {
        const ciPid = ci.productId.toString();
        const iPid = item.productId;
        const ciVid = ci.variantId;
        const iVid = item.variantId;
        const ciGift = ci.selectedGiftSku || null;
        const iGift = item.selectedGiftSku ?? null;

        return (
          ciPid === iPid &&
          (ciVid === iVid || (!ciVid && !iVid)) &&
          ciGift === iGift
        );
      });

      // Fallback: match by productId+variantId only (when frontend omits selectedGiftSku)
      // Use when exactly one cart item matches - ensures gift stock is deducted
      if (!cartItem) {
        const matches = cart.items.filter((ci) => {
          const ciPid = ci.productId.toString();
          const iPid = item.productId;
          const ciVid = ci.variantId ?? null;
          const iVid = item.variantId ?? null;
          return ciPid === iPid && ciVid === iVid;
        });
        if (matches.length === 1) cartItem = matches[0];
      }

      const variantAttributes = cartItem ? cartItem.attributesSnapshot : null;
      const selectedGiftSku =
        item.selectedGiftSku ?? (cartItem ? cartItem.selectedGiftSku : null);

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

      // Use regularPrice for subtotal (original price before discounts)
      subtotal += regularPrice * itemQuantity;
      // Use unitPrice (after quantity tiers) for final pricing
      totalAfterDiscount += unitPrice * itemQuantity;
      totalQuantity += itemQuantity;

      orderItems.push({
        productId: product._id,
        variantId: item.variantId || null,
        quantity: itemQuantity,
        price: unitPrice, // Resolved price after quantity tiers
        regularPrice: regularPrice, // Original price for display
        selectedGiftSku: selectedGiftSku, // Persist gift choice on main item

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

      // === EXPAND GIFT ITEM ===
      if (
        product.product_type === PRODUCT_TYPES.BUNDLE &&
        selectedGiftSku &&
        product.bundle_config?.gift_slot?.enabled
      ) {
        // Validate gift choice against config
        const isValidGift = product.bundle_config.gift_slot.options.some(
          (opt) => opt.sku === selectedGiftSku
        );

        if (isValidGift) {
          // Fetch gift product (Simple product)
          const giftProduct = await Product.findOne({
            sku: selectedGiftSku,
          }).session(session);

          if (!giftProduct) {
            throw {
              code: "GIFT_PRODUCT_NOT_FOUND",
              message: `Gift product with SKU ${selectedGiftSku} not found`,
            };
          }

          // Check gift stock
          const giftStock =
            giftProduct.stockObj?.available ?? giftProduct.stock ?? 0;
          if (giftStock < itemQuantity) {
            throw {
              code: "OUT_OF_STOCK",
              productId: giftProduct._id,
              productName: giftProduct.title,
              available: giftStock,
              requested: itemQuantity,
              message: `Free gift "${giftProduct.title}" is out of stock`,
            };
          }

          // Build selectedGift snapshot for the bundle item (for order details UI)
          const giftOption = product.bundle_config.gift_slot.options.find(
            (o) => o.sku === selectedGiftSku
          );
          const selectedGift = {
            sku: selectedGiftSku,
            label: giftOption?.label || giftProduct.title,
            image: giftProduct.images?.[0] || giftOption?.image || "",
            title: giftProduct.title || giftProduct.name,
          };

          // Update the bundle order item (last pushed) with selectedGift
          const bundleOrderItem = orderItems[orderItems.length - 1];
          if (bundleOrderItem) {
            bundleOrderItem.selectedGift = selectedGift;
          }

          // Add Gift Line Item (Free)
          orderItems.push({
            productId: giftProduct._id,
            quantity: itemQuantity,
            price: 0,
            regularPrice: giftProduct.pricing?.price || giftProduct.price || 0,
            name: `[Free Gift] ${giftProduct.title}`,
            sku: giftProduct.sku,
            image: giftProduct.images?.[0] || "",
            urlKey: giftProduct.url_key,
            isGift: true, // Marker for UI if needed
          });

          // Deduct Gift Stock
          stockUpdates.push({
            type: "REGULAR",
            productId: giftProduct._id,
            quantity: itemQuantity,
          });
        }
      }

      // For bundles, add child stock deductions; for others, add regular stock update
      if (
        product.product_type === PRODUCT_TYPES.BUNDLE &&
        bundleChildDeductions.length > 0
      ) {
        // Bundle: deduct from child SKUs
        for (const childDeduction of bundleChildDeductions) {
          stockUpdates.push({
            type: "BUNDLE_CHILD",
            sku: childDeduction.sku,
            quantity: childDeduction.qty,
            bundleProductId: product._id, // For error reporting
          });
        }
      } else {
        // Regular product or variant
        stockUpdates.push({
          type: "REGULAR",
          productId: product._id,
          variantId: item.variantId || null,
          quantity: itemQuantity,
        });
      }
    }

    // Step 3: Atomic stock decrement
    for (const update of stockUpdates) {
      // Handle bundle child SKU deductions
      if (update.type === "BUNDLE_CHILD") {
        // Find child product by SKU and deduct stock
        const result = await Product.findOneAndUpdate(
          {
            sku: update.sku,
            product_type: PRODUCT_TYPES.SIMPLE,
            $or: [
              { "stockObj.available": { $gte: update.quantity } },
              { stock: { $gte: update.quantity } },
            ],
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
          throw {
            code: "OUT_OF_STOCK",
            bundleProductId: update.bundleProductId,
            childSku: update.sku,
            message: `Bundle child SKU "${update.sku}" out of stock (race condition)`,
          };
        }
      } else if (update.variantId) {
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
        // Simple product (or gift) - handle both stockObj.available and legacy stock
        const result = await Product.findOneAndUpdate(
          {
            _id: update.productId,
            $or: [
              { "stockObj.available": { $gte: update.quantity } },
              { stock: { $gte: update.quantity } },
            ],
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
      userId: new mongoose.Types.ObjectId(userId),
      orderId,
      idempotencyKey, // Store idempotency key with order
      cartId: cart.cartId, // Store cartId for webhook reference
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
      orderStatus: "pending",
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

    // Step 9: Update cart status
    const cartUpdate = {
      orderId: order._id,
    };

    if (paymentMethod === PAYMENT_METHODS.COD) {
      cartUpdate.status = "ordered";
      cartUpdate.completedAt = new Date();
    } else {
      cartUpdate.status = "checkout";
    }

    await Cart.findByIdAndUpdate(cart._id, cartUpdate, { session });

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
            orderStatus: "cancelled",
            paymentStatus: "failed",
            "statusHistory.0.note":
              "Payment initiation failed - Auto-cancelled",
          });

          // 2. Release Stock
          for (const update of stockUpdates) {
            if (update.type === "BUNDLE_CHILD") {
              // Release bundle child SKU stock
              await Product.findOneAndUpdate(
                { sku: update.sku, product_type: PRODUCT_TYPES.SIMPLE },
                {
                  $inc: {
                    "stockObj.available": update.quantity,
                    stock: update.quantity,
                  },
                }
              );
            } else if (update.variantId) {
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

          // 3. DO NOT Revert Cart to Active
          // We keep the cart in 'checkout' state so the user can retry immediately.
          // The cart will eventually expire if not used, or be updated on success.
          /*
          await Cart.findByIdAndUpdate(cart._id, {
            status: "active",
            orderId: null,
            completedAt: null,
          });
          */

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

    // COD or other methods
    const { emitEvent } = require("../../services/socketService");
    emitEvent("newOrder", {
      orderId: order.orderId,
      totalAmount: order.totalAmount,
      customerName:
        shippingAddressData?.fullName ||
        shippingAddressData?.name ||
        "Customer",
      itemsCount: totalQuantity,
      createdAt: order.createdAt,
    });

    return res.status(201).json({
      success: true,
      message: "Order placed successfully",
      paymentMode: "cod",
      orderId: order.orderId,
      requiresPayment: false,
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
