const mongoose = require("mongoose");
const Order = require("./src/models/Order");
require("dotenv").config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  // May 11, 2026 in IST corresponds to:
  // Start: 2026-05-10T18:30:00.000Z
  // End: 2026-05-11T18:29:59.999Z
  const startDate = new Date("2026-05-10T18:30:00.000Z");
  const endDate = new Date("2026-05-11T18:29:59.999Z");
  
  const orders = await Order.find({
    createdAt: { $gte: startDate, $lte: endDate }
  });
  
  let totalAll = 0;
  let totalPaid = 0;
  let totalCOD = 0;
  let totalPaidOrCOD = 0;
  
  for (let o of orders) {
    if (o.orderStatus !== "cancelled" && o.orderStatus !== "returned") {
      totalAll += o.totalAmount;
      if (o.paymentStatus === "paid") {
        totalPaid += o.totalAmount;
      }
      if (o.paymentMethod === "COD") {
        totalCOD += o.totalAmount;
      }
      if (o.paymentStatus === "paid" || o.paymentMethod === "COD") {
         totalPaidOrCOD += o.totalAmount;
      }
    }
  }
  
  console.log("IST Date Range Total All:", totalAll);
  console.log("Total Paid:", totalPaid);
  console.log("Total COD:", totalCOD);
  
  await mongoose.disconnect();
}
run();
