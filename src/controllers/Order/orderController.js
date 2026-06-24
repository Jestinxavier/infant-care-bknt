const mongoose = require("mongoose");
const Order = require("../../models/Order");
const Address = require("../../models/Address");
const Payment = require("../../models/Payment");
const Product = require("../../models/Product");
const Cart = require("../../models/Cart");
const { PAYMENT_METHODS } = require("../../../resources/constants");
const { consumeCoupon } = require("../../utils/couponValidation");
const bundleService = require("../../features/product/bundle.service");
const { PRODUCT_TYPES } = require("../../features/product/product.model");
const crypto = require("crypto");
const phonepeSDK = require("../../controllers/payment/phonepeSDK");
const razorpaySDK = require("../../controllers/payment/razorpaySDK");
const logger = require("../../utils/logger");
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
    const { guestInfo, items, addressId, newAddress, paymentMethod, cartId } =
      req.body;

    // Authenticated users: always use token identity, never body userId
    // Guests: force null — never accept a userId from an unauthenticated request
    const userId = req.user?.id || null;
    const isGuest = !userId;

    // === VALIDATION ===
    if (!items || items.length === 0) {
      return res.status(400).json({
        success: false,
        errorCode: "INVALID_REQUEST",
        message: "Order items are required",
      });
    }

    if (userId && !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        errorCode: "INVALID_USER_ID",
        message: "Invalid User ID format",
      });
    }

    // Guest orders require guestInfo
    if (isGuest) {
      if (!guestInfo?.name || !guestInfo?.email || !guestInfo?.phone) {
        return res.status(400).json({
          success: false,
          errorCode: "GUEST_INFO_REQUIRED",
          message: "Name, email, and phone are required for guest checkout",
        });
      }
      // Basic email validation
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestInfo.email)) {
        return res.status(400).json({
          success: false,
          errorCode: "INVALID_EMAIL",
          message: "Please provide a valid email address",
        });
      }
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
      logger.info(
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
    // Guests: look up by cartId only (no userId). Auth users: prefer cartId if provided.
    let cartQuery;
    if (isGuest) {
      if (!cartId) {
        return res.status(400).json({
          success: false,
          errorCode: "CART_ID_REQUIRED",
          message: "Cart ID is required for guest checkout",
        });
      }
      cartQuery = { cartId, status: "checkout" };
    } else {
      cartQuery = { userId, status: "checkout" };
      if (cartId) cartQuery.cartId = cartId;
    }
    const cart = await Cart.findOne(cartQuery).session(session);

    logger.info(
      `🛒 Looking for checkout cart`,
      isGuest ? `[guest] cartId: ${cartId}` : `userId: ${userId}`,
      `Found: ${cart ? cart.cartId : "null"}`,
      `Coupons: ${cart ? JSON.stringify(cart.coupons) : "N/A"}`
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
    if (cart.status === "ordered") {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        errorCode: "CART_ALREADY_ORDERED",
        message: "This cart has already been converted to an order",
      });
    }

    // Check checkout expiry only when set (null/undefined = not yet set, e.g. legacy)
    if (cart.checkoutExpiry != null && cart.checkoutExpiry < new Date()) {
      // Release the cart back to active so the user can restart checkout seamlessly
      await Cart.findByIdAndUpdate(cart._id, {
        $set: {
          status: "active",
          checkoutToken: null,
          checkoutStartedAt: null,
          checkoutExpiry: null,
        },
      }).session(session);
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

      if (product.status !== "published") {
        throw {
          code: "PRODUCT_NOT_AVAILABLE",
          productId: item.productId,
          message: "This product is no longer available",
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
      const isFreeGiftCouponItem = cartItem?.isFreeGiftCoupon === true;

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

      const MAX_ORDER_QTY = 99;
      const itemQuantity = Number(item.quantity);
      if (!Number.isInteger(itemQuantity) || itemQuantity < 1 || itemQuantity > MAX_ORDER_QTY) {
        throw {
          code: "INVALID_QUANTITY",
          message: `Item quantity must be between 1 and ${MAX_ORDER_QTY}`,
        };
      }

      // Free gift coupon items are zero-priced and don't contribute to subtotal
      const effectiveUnitPrice = isFreeGiftCouponItem ? 0 : unitPrice;
      if (!isFreeGiftCouponItem) {
        subtotal += regularPrice * itemQuantity;
        totalAfterDiscount += unitPrice * itemQuantity;
      }
      totalQuantity += itemQuantity;

      orderItems.push({
        productId: product._id,
        variantId: item.variantId || null,
        quantity: itemQuantity,
        price: effectiveUnitPrice,
        regularPrice: isFreeGiftCouponItem ? regularPrice : regularPrice,
        isGift: isFreeGiftCouponItem,
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
        // Try SIMPLE product first (root sku)
        let result = await Product.findOneAndUpdate(
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

        // Fallback: variant SKU (CONFIGURABLE product)
        if (!result) {
          result = await Product.findOneAndUpdate(
            {
              variants: {
                $elemMatch: {
                  sku: update.sku,
                  $or: [
                    { "stockObj.available": { $gte: update.quantity } },
                    { stock: { $gte: update.quantity } },
                  ],
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
        }

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

    // Step 5: Atomic coupon consumption (supports stacked coupons)
    let couponDiscount = 0;
    let appliedCoupon = null;
    const appliedCoupons = [];

    const cartCoupons = cart.coupons?.length > 0 ? cart.coupons : [];
    logger.info(`🎟️ Cart coupons:`, JSON.stringify(cartCoupons));

    for (const cartCoupon of cartCoupons) {
      const couponMin = cartCoupon.minCartValue ?? 0;
      if (couponMin > 0 && totalAfterDiscount < couponMin) {
        throw {
          code: "COUPON_MIN_NOT_MET",
          couponFailed: true,
          message: `Coupon ${cartCoupon.code} requires a minimum cart value of ₹${couponMin}`,
        };
      }

      logger.info(`🎟️ Consuming coupon ${cartCoupon.code} (value=${totalAfterDiscount}, userId=${userId || "guest"})`);

      const consumption = await consumeCoupon(cartCoupon.code, totalAfterDiscount, userId || null, session);

      logger.info(`🎟️ Consumption result:`, JSON.stringify(consumption));

      if (!consumption.success) {
        throw {
          code: consumption.error,
          message: consumption.message,
          couponFailed: true,
        };
      }

      couponDiscount += consumption.discount;
      appliedCoupons.push({
        code: consumption.coupon.code,
        couponId: consumption.coupon._id,
        discountAmount: consumption.discount,
      });

      logger.info(`✅ Coupon ${cartCoupon.code} consumed. Discount: ₹${consumption.discount}`);
    }

    // Primary coupon for backward compat (first one, or highest discount)
    if (appliedCoupons.length > 0) {
      appliedCoupon = { ...appliedCoupons[0], applied: true };
    }

    // Shipping is decided after all discounts (product + coupon) so the threshold
    // is checked against what the customer actually pays, not the pre-coupon amount.
    const payableBeforeShipping = totalAfterDiscount - couponDiscount;
    const shippingAmount = payableBeforeShipping >= freeThreshold ? 0 : shippingCost;

    // Fetch COD cost if selected
    let codCost = 0;
    if (paymentMethod === PAYMENT_METHODS.COD) {
      const paymentSetting = await SiteSetting.findOne({ key: "payment_methods" }).session(session);
      const codMethod = paymentSetting?.value?.methods?.find(m => m.code === "COD");
      if (codMethod && codMethod.deliveryCodCost) {
        codCost = Number(codMethod.deliveryCodCost) || 0;
      }
    }

    const totalAmount = payableBeforeShipping + shippingAmount + codCost;

    logger.info(
      `💰 Order: Subtotal=${subtotal}, ProductDisc=${discountAmount}, CouponDisc=${couponDiscount}, Shipping=${shippingAmount}, CODFee=${codCost}, Total=${totalAmount}`
    );

    // Step 6: Handle address
    let finalAddressId = addressId;
    let shippingAddressData = null;

    if (isGuest) {
      // Guests always use newAddress (no saved addresses)
      if (!newAddress) {
        throw { code: "ADDRESS_REQUIRED", message: "Shipping address is required for guest checkout" };
      }
      shippingAddressData = newAddress;
      finalAddressId = null;
    } else if (!addressId && newAddress) {
      const address = new Address({ userId, ...newAddress });
      const savedAddress = await address.save({ session });
      finalAddressId = savedAddress._id;
      shippingAddressData = savedAddress.toObject();
    } else if (addressId) {
      const existingAddress = await Address.findOne({ _id: addressId, userId }).session(session);
      if (!existingAddress) {
        throw { code: "ADDRESS_NOT_FOUND", message: "Address not found or does not belong to this account" };
      }
      finalAddressId = existingAddress._id;
      shippingAddressData = existingAddress.toObject();
    } else {
      throw { code: "ADDRESS_REQUIRED", message: "Address is required" };
    }

    // Step 7: Create order with pricing snapshot
    // Guests have finalAddressId = null (intentional), so only check shippingAddressData
    if (!shippingAddressData || (!isGuest && !finalAddressId)) {
      return res
        .status(400)
        .json({ message: "Address ID or new address is required" });
    }

    // Step 3: Create Order
    const orderId = generateOrderId();

    const order = new Order({
      userId: userId ? new mongoose.Types.ObjectId(userId) : null,
      isGuestOrder: isGuest,
      guestInfo: isGuest ? {
        name: guestInfo.name,
        email: guestInfo.email.toLowerCase().trim(),
        phone: guestInfo.phone,
      } : undefined,
      orderId,
      idempotencyKey, // Store idempotency key with order
      cartId: cart.cartId, // Store cartId for webhook reference
      items: orderItems,
      totalQuantity,
      subtotal,
      shippingCost: shippingAmount,
      codCost: codCost,
      discount: discountAmount + couponDiscount,
      coupon: appliedCoupon,
      coupons: appliedCoupons,
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
        codCost: codCost,
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

    logger.info(
      `✅ Order ${order.orderId} created successfully in transaction`
    );

    // Step 10: Return response based on payment method
    if (paymentMethod === PAYMENT_METHODS.RAZORPAY) {
      try {
        const response = await razorpaySDK.initiatePayment({
          orderId,
          amount: Math.round(totalAmount * 100),
        });
        if (response?.razorpayOrderId) {
          return res.status(200).json({
            success: true,
            message: "Razorpay order created successfully",
            paymentMode: "razorpay",
            orderId,
            ...response,
          });
        } else {
          throw new Error("Razorpay Order ID missing from response");
        }
      } catch (error) {
        logger.error("❌ Error initiating Razorpay payment:", { message: error.message, stack: error.stack });

        // === CLEANUP LONE ORDER (Case 3: Payment Init Failed) ===
        // Since transaction is already committed, we must manually undo changes.
        try {
          logger.info(`⚠️ Cleaning up failed order ${order.orderId}...`);

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

          // 3. Reset cart to active so the user can restart checkout from the cart page.
          await Cart.findByIdAndUpdate(cart._id, {
            $set: { status: "active", completedAt: null },
            $unset: { orderId: "" },
          });

          logger.info(`✅ Cleanup successful for order ${order.orderId}`);
        } catch (cleanupError) {
          logger.error(
            "🔥 CRITICAL: Failed to cleanup order after Razorpay payment error:",
            cleanupError
          );
        }

        return res.status(500).json({
          success: false,
          message: "Failed to initiate payment. Order cancelled.",
          orderCancelled: true,
        });
      }
    }

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
        logger.error("❌ Error initiating PhonePe payment:", { message: error.message, stack: error.stack });

        // === CLEANUP LONE ORDER (Case 3: Payment Init Failed) ===
        // Since transaction is already committed, we must manually undo changes.
        try {
          logger.info(`⚠️ Cleaning up failed order ${order.orderId}...`);

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

          // 3. Reset cart to active so the user can restart checkout from the cart page.
          await Cart.findByIdAndUpdate(cart._id, {
            $set: { status: "active", completedAt: null },
            $unset: { orderId: "" },
          });

          logger.info(`✅ Cleanup successful for order ${order.orderId}`);
        } catch (cleanupError) {
          logger.error(
            "🔥 CRITICAL: Failed to cleanup order after payment error:",
            cleanupError
          );
          // Alert admin/sentry here
        }

        return res.status(500).json({
          success: false,
          message: "Failed to initiate payment. Order cancelled.",
                    orderCancelled: true,
        });
      }
    }

    // COD or other methods
    const { emitEvent } = require("../../services/socketService");
    const { createOrderNotification } = require("../admin/notificationController");

    const notificationPayload = {
      orderId: order.orderId,
      orderDbId: order._id,
      totalAmount: order.totalAmount,
      customerName:
        shippingAddressData?.fullName ||
        shippingAddressData?.name ||
        guestInfo?.name ||
        "Customer",
      itemsCount: totalQuantity,
      createdAt: order.createdAt,
    };

    emitEvent("newOrder", notificationPayload);

    // Persist notification to DB (fire-and-forget — don't block order response)
    createOrderNotification(notificationPayload).catch((err) =>
      logger.error("❌ Failed to persist notification:", err)
    );

    // Send order confirmation invoice to all customers (guest and registered)
    const { sendOrderConfirmationEmail } = require("../../services/emailService");
    sendOrderConfirmationEmail(order).catch((err) =>
      logger.error("❌ Failed to send order confirmation email:", { message: err.message, stack: err.stack })
    );

    return res.status(201).json({
      success: true,
      message: "Order placed successfully",
      paymentMode: "cod",
      orderId: order.orderId,
      isGuestOrder: isGuest,
      requiresPayment: false,
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error("❌ Order creation failed:", error);

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

    if (error.code === "INVALID_QUANTITY") {
      return res.status(400).json({
        success: false,
        errorCode: "INVALID_QUANTITY",
        message: error.message,
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

    if (error.code === "PRODUCT_NOT_AVAILABLE") {
      return res.status(400).json({
        success: false,
        errorCode: "PRODUCT_NOT_AVAILABLE",
        message: error.message || "This product is no longer available",
        productId: error.productId,
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
          });
  } finally {
    session.endSession();
  }
};

module.exports = createOrder;
