const Order = require("../../models/Order");
const Variant = require("../../models/Variant");
const Address = require("../../models/Address");
const Payment = require("../../models/Payment");
const Product = require("../../models/Product");

const createOrder = async (req, res) => {
  try {
    const { userId, items, addressId, newAddress, paymentMethod, shippingCost = 0, discount = 0 } = req.body;

    if (!userId || !items || items.length === 0) {
      return res.status(400).json({ message: "User ID and order items are required" });
    }

    // Step 1: Validate stock availability and build items with full data
    let subtotal = 0;
    const orderItems = [];
    const productsToUpdate = []; // We will update Product documents for both cases

    for (const item of items) {
      // Always find the Product first
      const product = await Product.findById(item.productId);
      if (!product) {
        return res.status(404).json({ message: `Product not found: ${item.productId}` });
      }

      let price, stock, variantData;

      if (item.variantId) {
        // Find variant inside product.variants array
        // Check both 'id' (custom) and '_id' (Mongoose)
        variantData = product.variants?.find(v => v.id === item.variantId || v._id?.toString() === item.variantId);

        if (!variantData) {
          return res.status(404).json({ message: `Variant ${item.variantId} not found in product ${product.name}` });
        }

        // Use variant pricing/stock
        price = variantData.pricing?.discountPrice || variantData.pricing?.price || variantData.price || 0;
        stock = variantData.stockObj?.available ?? variantData.stock ?? 0;

      } else {
        // Use Product pricing/stock
        price = product.pricing?.discountPrice || product.pricing?.price || product.price || 0;
        stock = product.stockObj?.available ?? product.stock ?? 0;
      }

      // Check stock availability
      if (stock < item.quantity) {
        return res.status(400).json({
          message: `Insufficient stock for ${product.name || product.title || 'product'}. Available: ${stock}, Requested: ${item.quantity}`
        });
      }

      subtotal += price * item.quantity;

      orderItems.push({
        productId: product._id,
        variantId: item.variantId || null,
        quantity: item.quantity,
        price
      });

      // Prepare stock update
      productsToUpdate.push({
        productId: product._id,
        variantId: item.variantId || null,
        quantity: item.quantity
      });
    }

    // Calculate total amount: subtotal + shipping - discount
    const finalDiscount = discount || 0;
    const finalShippingCost = shippingCost || 0;
    const totalAmount = subtotal + finalShippingCost - finalDiscount;

    // Step 2: Handle Address
    let finalAddressId = addressId;
    let shippingAddressData = null;

    if (!addressId && newAddress) {
      const address = new Address({ userId, ...newAddress });
      const savedAddress = await address.save();
      finalAddressId = savedAddress._id;
      shippingAddressData = savedAddress.toObject();
    } else if (addressId) {
      const existingAddress = await Address.findById(addressId);
      if (!existingAddress) {
        return res.status(404).json({ message: "Address not found" });
      }
      finalAddressId = existingAddress._id;
      shippingAddressData = existingAddress.toObject();
    }

    if (!finalAddressId || !shippingAddressData) {
      return res.status(400).json({ message: "Address ID or new address is required" });
    }

    // Step 3: Create Order
    const order = new Order({
      userId,
      items: orderItems,
      subtotal,
      shippingCost: finalShippingCost,
      discount: finalDiscount,
      totalAmount,
      addressId: finalAddressId,
      shippingAddress: shippingAddressData,
      paymentMethod: paymentMethod || "COD"
    });

    await order.save();

    // Step 4: Reduce stock
    for (const update of productsToUpdate) {
      if (update.variantId) {
        // Update specific variant stock inside Product
        await Product.findOneAndUpdate(
          { _id: update.productId, "variants.id": update.variantId },
          {
            $inc: {
              "variants.$.stock": -update.quantity,
              "variants.$.stockObj.available": -update.quantity
            }
          }
        );
      } else {
        // Update main product stock
        await Product.findByIdAndUpdate(
          update.productId,
          {
            $inc: {
              stock: -update.quantity,
              "stockObj.available": -update.quantity
            }
          }
        );
      }
    }

    // Step 5: Create Payment Record
    const payment = new Payment({
      orderId: order._id,
      userId,
      amount: totalAmount,
      method: paymentMethod,
      status: paymentMethod === "COD" ? "pending" : "pending"
    });

    await payment.save();

    // Step 6: Return response based on payment method
    if (paymentMethod === "PhonePe") {
      return res.status(201).json({
        success: true,
        message: "✅ Order created successfully. Please initiate PhonePe payment.",
        order,
        payment,
        requiresPayment: true,
        paymentMethod: "PhonePe"
      });
    }

    if (paymentMethod === "Razorpay") {
      return res.status(201).json({
        success: true,
        message: "✅ Order created successfully. Please initiate Razorpay payment.",
        order,
        payment,
        requiresPayment: true,
        paymentMethod: "Razorpay"
      });
    }

    // For COD or other methods
    res.status(201).json({
      success: true,
      message: "✅ Order created successfully",
      order,
      payment
    });

  } catch (err) {
    console.error("❌ Error creating order:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message
    });
  }
};

module.exports = createOrder;