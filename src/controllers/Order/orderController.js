const Order = require("../../models/Order");
const Variant = require("../../models/Variant");
const Address = require("../../models/Address");
const Payment = require("../../models/Payment");
 
const createOrder = async (req, res) => {
  try {
    const { userId, items, addressId, newAddress, paymentMethod, shippingCost = 0, discount = 0 } = req.body;

    if (!userId || !items || items.length === 0) {
      return res.status(400).json({ message: "User ID and order items are required" });
    }

    // Step 1: Validate stock availability and build items with full data
    let subtotal = 0;
    const orderItems = [];
    const variantsToUpdate = [];

    for (const item of items) {
      const variant = await Variant.findById(item.variantId).populate("productId");
      if (!variant) {
        return res.status(404).json({ message: `Variant not found: ${item.variantId}` });
      }

      // Check stock availability
      if (variant.stock < item.quantity) {
        return res.status(400).json({ 
          message: `Insufficient stock for ${variant.productId?.name || 'product'}. Available: ${variant.stock}, Requested: ${item.quantity}` 
        });
      }

      const price = variant.price;
      subtotal += price * item.quantity;

      orderItems.push({
        productId: variant.productId._id,
        variantId: variant._id,
        quantity: item.quantity,
        price
      });

      // Store variant and quantity for stock update
      variantsToUpdate.push({
        variantId: variant._id,
        quantity: item.quantity,
        currentStock: variant.stock
      });
    }

    // Calculate total amount: subtotal + shipping - discount
    const finalDiscount = discount || 0;
    const finalShippingCost = shippingCost || 0;
    const totalAmount = subtotal + finalShippingCost - finalDiscount;

    // Step 2: Handle Address
    let finalAddressId = addressId;
    if (!addressId && newAddress) {
      const address = new Address({ userId, ...newAddress });
      const savedAddress = await address.save();
      finalAddressId = savedAddress._id;
    }

    if (!finalAddressId) {
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
      paymentMethod: paymentMethod || "COD"
    });

    await order.save();

    // Step 4: Reduce stock for all variants
    // Note: Stock is validated before order creation, but we use $inc for atomic decrement
    for (const item of variantsToUpdate) {
      const updatedVariant = await Variant.findByIdAndUpdate(
        item.variantId,
        { $inc: { stock: -item.quantity } }, // Decrement stock by ordered quantity
        { new: true }
      );
      
      // Safety check: Ensure stock doesn't go negative (shouldn't happen due to validation)
      if (updatedVariant && updatedVariant.stock < 0) {
        console.error(`⚠️ Warning: Stock went negative for variant ${item.variantId}. Stock: ${updatedVariant.stock}`);
        // In production, you might want to rollback the order here
      }
    }

    // Step 5: Create Payment Record
    const payment = new Payment({
      orderId: order._id,
      userId,
      amount: totalAmount,
      method: paymentMethod,
      status: paymentMethod === "COD" ? "pending" : "pending" // All online payments start as pending
    });

    await payment.save();

    // Step 6: If PhonePe or Razorpay, return order details for payment initialization
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