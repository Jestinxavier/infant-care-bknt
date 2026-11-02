const {
  calculateOrderGst,
  taxInsideInclusive,
  financialYearLabel,
  formatInvoiceNumber,
  displayState,
} = require("../../src/features/order/rules/gst.rules");

describe("GST rules", () => {
  it("extracts GST from inclusive prices", () => {
    expect(taxInsideInclusive(590, 18)).toBe(90);
    expect(taxInsideInclusive(105, 5)).toBe(5);
    expect(taxInsideInclusive(100, 0)).toBe(0);
  });

  it("splits same-state tax into CGST + SGST and keeps the total intact", () => {
    const gst = calculateOrderGst({
      items: [
        { price: 590, quantity: 1, gstRate: 18 },
        { price: 105, quantity: 2, gstRate: 5 },
      ],
      sellerState: "Kerala",
      customerState: "KL_Kerala",
    });
    expect(gst.supplyType).toBe("intra");
    expect(gst.items.map((i) => i.taxAmount)).toEqual([90, 10]);
    expect(gst.totalTax).toBe(100);
    expect(gst.cgst + gst.sgst).toBe(100);
    expect(gst.igst).toBe(0);
    // Taxable value + tax always equals what the customer paid.
    expect(gst.taxableValue + gst.totalTax).toBe(800);
  });

  it("uses IGST for a different state", () => {
    const gst = calculateOrderGst({
      items: [{ price: 590, quantity: 1, gstRate: 18 }],
      sellerState: "Kerala",
      customerState: "Tamil Nadu",
    });
    expect(gst.supplyType).toBe("inter");
    expect(gst.igst).toBe(90);
    expect(gst.cgst).toBe(0);
  });

  it("reduces the taxable value by the coupon, spread by item value", () => {
    const gst = calculateOrderGst({
      items: [
        { price: 600, quantity: 1, gstRate: 18 },
        { price: 400, quantity: 1, gstRate: 5 },
      ],
      couponDiscount: 100,
    });
    // ₹60 of the coupon on the first line, ₹40 on the second.
    expect(gst.items[0].taxableValue + gst.items[0].taxAmount).toBe(540);
    expect(gst.items[1].taxableValue + gst.items[1].taxAmount).toBe(360);
    expect(gst.taxableValue + gst.totalTax).toBe(900);
  });

  it("taxes shipping and the COD fee at the highest item rate", () => {
    const gst = calculateOrderGst({
      items: [
        { price: 100, quantity: 1, gstRate: 5 },
        { price: 100, quantity: 1, gstRate: 12 },
      ],
      shippingCost: 50,
      codCost: 6,
    });
    expect(gst.chargesRate).toBe(12);
    expect(gst.chargesTax).toBe(taxInsideInclusive(56, 12));
    expect(gst.taxableValue + gst.totalTax).toBeCloseTo(256, 2);
  });

  it("falls back to the store default rate and ignores free gifts", () => {
    const gst = calculateOrderGst({
      items: [
        { price: 112, quantity: 1, gstRate: null },
        { price: 0, quantity: 1, gstRate: 28, isGift: true },
      ],
      defaultRate: 12,
      shippingCost: 112,
    });
    expect(gst.items[0].gstRate).toBe(12);
    expect(gst.items[0].taxAmount).toBe(12);
    // The free gift's 28% must not set the shipping rate.
    expect(gst.chargesRate).toBe(12);
  });

  it("flags a missing seller state and treats it as same-state", () => {
    const gst = calculateOrderGst({
      items: [{ price: 118, quantity: 1, gstRate: 18 }],
      customerState: "Delhi",
    });
    expect(gst.sellerStateMissing).toBe(true);
    expect(gst.supplyType).toBe("intra");
  });

  it("formats invoice numbers by Indian financial year", () => {
    expect(financialYearLabel(new Date("2026-11-01T10:00:00+05:30"))).toBe("26-27");
    expect(financialYearLabel(new Date("2027-03-31T23:00:00+05:30"))).toBe("26-27");
    expect(financialYearLabel(new Date("2027-04-01T00:30:00+05:30"))).toBe("27-28");
    expect(formatInvoiceNumber("INV", "26-27", 42)).toBe("INV/26-27/00042");
    expect(displayState("KL_Kerala")).toBe("Kerala");
  });
});
