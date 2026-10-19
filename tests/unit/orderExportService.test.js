const {
  formatDateIST,
  formatPaymentMethod,
  formatFullAddress,
  formatItemsSummary,
  formatItemSkus,
  mapOrderToSummaryRow,
  mapOrderToItemRows,
  exportOrdersToCSV,
} = require("../../src/services/orderExportService");
const Order = require("../../src/models/Order");

describe("Order Export Service", () => {
  const sampleOrder = {
    orderId: "ORD-998877",
    placedAt: new Date("2026-09-18T05:30:00.000Z"), // 11:00 AM IST
    orderStatus: "confirmed",
    paymentStatus: "paid",
    paymentMethod: "phonepe",
    phonepeTransactionId: "T260918110000",
    isGuestOrder: false,
    userId: {
      username: "Priya Sharma",
      email: "priya@example.com",
      phone: "9876543210",
    },
    shippingAddress: {
      fullName: "Priya Sharma",
      phone: "9876543210",
      houseName: "Flat 402",
      street: "Sunshine Heights",
      landmark: "Near City Hospital",
      city: "Mumbai",
      state: "Maharashtra",
      pincode: "400001",
      country: "India",
    },
    items: [
      {
        name: "Cotton Baby Romper",
        variantName: "0-3M / Blue",
        sku: "ROM-01",
        variantSku: "ROM-BLU-03M",
        quantity: 2,
        price: 499,
        regularPrice: 699,
      },
      {
        name: "Muslin Swaddle Wrap",
        variantName: "Yellow Stars",
        sku: "SWA-01",
        variantSku: "SWA-YEL-01",
        quantity: 1,
        price: 399,
        regularPrice: 499,
      },
    ],
    totalQuantity: 3,
    subtotal: 1397,
    discount: 100,
    coupon: { code: "WELCOME10", discountAmount: 100 },
    shippingCost: 50,
    codCost: 0,
    totalAmount: 1347,
    deliveryPartner: { name: "Delhivery", code: "delhivery" },
    trackingId: "AWB12345678",
    deliveryNote: "Leave at door",
  };

  describe("Formatting Helpers", () => {
    it("should format date in Indian Standard Time (IST)", () => {
      const formatted = formatDateIST("2026-09-18T05:30:00.000Z");
      expect(formatted).toMatch(/18\/09\/2026/);
      expect(formatted).toMatch(/11:00/);
    });

    it("should format payment methods properly", () => {
      expect(formatPaymentMethod("cod")).toBe("Cash on Delivery (COD)");
      expect(formatPaymentMethod("phonepe")).toBe("PhonePe");
      expect(formatPaymentMethod("razorpay")).toBe("Razorpay");
    });

    it("should format full address cleanly", () => {
      const addr = formatFullAddress(sampleOrder.shippingAddress);
      expect(addr).toContain("Flat 402");
      expect(addr).toContain("Sunshine Heights");
      expect(addr).toContain("Mumbai");
      expect(addr).toContain("Pincode: 400001");
    });

    it("should format items summary and SKUs", () => {
      const summary = formatItemsSummary(sampleOrder.items);
      expect(summary).toBe(
        "Cotton Baby Romper (0-3M / Blue) x 2 | Muslin Swaddle Wrap (Yellow Stars) x 1"
      );

      const skus = formatItemSkus(sampleOrder.items);
      expect(skus).toBe("ROM-BLU-03M, SWA-YEL-01");
    });
  });

  describe("mapOrderToSummaryRow", () => {
    it("should map order document to full order summary row with accurate fields", () => {
      const row = mapOrderToSummaryRow(sampleOrder);

      expect(row["Order ID"]).toBe("ORD-998877");
      expect(row["Order Status"]).toBe("Confirmed");
      expect(row["Payment Status"]).toBe("Paid");
      expect(row["Payment Method"]).toBe("PhonePe");
      expect(row["Transaction ID"]).toBe("T260918110000");
      expect(row["Customer Name"]).toBe("Priya Sharma");
      expect(row["Customer Email"]).toBe("priya@example.com");
      expect(row["Customer Phone"]).toBe("9876543210");
      expect(row["Total Items Count"]).toBe(3);
      expect(row["Subtotal (INR)"]).toBe("1397.00");
      expect(row["Discount Amount (INR)"]).toBe("100.00");
      expect(row["Coupon Code(s)"]).toBe("WELCOME10");
      expect(row["Shipping Fee (INR)"]).toBe("50.00");
      expect(row["Grand Total (INR)"]).toBe("1347.00");
      expect(row["Delivery Partner"]).toBe("Delhivery");
      expect(row["Tracking Number / AWB"]).toBe("AWB12345678");
    });

    it("should map COD order with COD fee and pending payment status", () => {
      const codOrder = {
        ...sampleOrder,
        orderId: "ORD-COD-1234",
        paymentMethod: "COD",
        paymentStatus: "pending",
        codCost: 40,
        phonepeTransactionId: null,
      };
      const row = mapOrderToSummaryRow(codOrder);
      expect(row["Order ID"]).toBe("ORD-COD-1234");
      expect(row["Payment Method"]).toBe("Cash on Delivery (COD)");
      expect(row["Payment Status"]).toBe("Pending");
      expect(row["COD Handling Fee (INR)"]).toBe("40.00");
      expect(row["Transaction ID"]).toBe("");
    });
  });

  describe("mapOrderToItemRows", () => {
    it("should map order document to individual item rows", () => {
      const rows = mapOrderToItemRows(sampleOrder);
      expect(rows.length).toBe(2);

      expect(rows[0]["Item Sequence"]).toBe(1);
      expect(rows[0]["Product Name"]).toBe("Cotton Baby Romper");
      expect(rows[0]["Variant Name"]).toBe("0-3M / Blue");
      expect(rows[0]["Item SKU"]).toBe("ROM-BLU-03M");
      expect(rows[0]["Quantity"]).toBe(2);
      expect(rows[0]["Unit Price (INR)"]).toBe("499.00");
      expect(rows[0]["Line Total (INR)"]).toBe("998.00");

      expect(rows[1]["Item Sequence"]).toBe(2);
      expect(rows[1]["Product Name"]).toBe("Muslin Swaddle Wrap");
      expect(rows[1]["Line Total (INR)"]).toBe("399.00");
    });
  });

  describe("exportOrdersToCSV", () => {
    it("should generate CSV with UTF-8 BOM", async () => {
      const mockFind = {
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([sampleOrder]),
      };
      const spy = jest.spyOn(Order, "find").mockReturnValue(mockFind);

      const csv = await exportOrdersToCSV({ filter: {}, type: "orders" });

      // Check BOM character
      expect(csv.startsWith("\uFEFF")).toBe(true);
      expect(csv).toContain('"Order ID"');
      expect(csv).toContain('"ORD-998877"');
      expect(csv).toContain('"Priya Sharma"');

      spy.mockRestore();
    });
  });
});
