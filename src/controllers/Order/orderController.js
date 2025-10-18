const Order = require("../../models/Order");
const Variant = require("../../models/Variant");
const Address = require("../../models/Address");
const Payment = require("../../models/Payment");
 
const createOrder = async (req, res) => {
  try {
    const { userId, items, addressId, newAddress, paymentMethod } = req.body;

    if (!userId || !items || items.length === 0) {
      return res.status(400).json({ message: "User ID and order items are required" });
    }

    // Step 1: Build items with full data and calculate total
    let totalAmount = 0;
    const orderItems = [];

    for (const item of items) {
      const variant = await Variant.findById(item.variantId).populate("productId");
      if (!variant) {
        return res.status(404).json({ message: `Variant not found: ${item.variantId}` });
      }

      const price = variant.price;
      totalAmount += price * item.quantity;

      orderItems.push({
        productId: variant.productId._id,
        variantId: variant._id,
        quantity: item.quantity,
        price
      });
    }

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
      totalAmount,
      addressId: finalAddressId,
      paymentMethod
    });

    await order.save();

    // Step 4: Create Payment Record
    const payment = new Payment({
      orderId: order._id,
      userId,
      amount: totalAmount,
      method: paymentMethod,
      status: paymentMethod === "COD" ? "pending" : "pending" // All online payments start as pending
    });

    await payment.save();

    // Step 5: If PhonePe or Razorpay, return order details for payment initialization
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