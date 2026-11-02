const mongoose = require("mongoose");
const Order = require("../../src/models/Order");
const SiteSetting = require("../../src/models/SiteSetting");
const {
  buildOrderGst,
  ensureInvoiceNumber,
  normalizeGstSettings,
} = require("../../src/services/gstService");
const { financialYearLabel } = require("../../src/features/order/rules/gst.rules");

let seq = 0;

async function setGst(value) {
  await SiteSetting.findOneAndUpdate(
    { key: "tax.gst" },
    { key: "tax.gst", type: "json", scope: "tax", value },
    { upsert: true },
  );
}

async function setSellerAddress(value) {
  await SiteSetting.findOneAndUpdate(
    { key: "order.from_address" },
    { key: "order.from_address", type: "json", scope: "order", value },
    { upsert: true },
  );
}

async function createOrder(gst) {
  return Order.create({
    orderId: `GST-${Date.now()}-${seq++}`,
    items: [{ productId: new mongoose.Types.ObjectId(), quantity: 1, price: 590, name: "Bottle" }],
    totalQuantity: 1,
    totalAmount: 590,
    subtotal: 590,
    gst,
  });
}

describe("GST service", () => {
  it("returns null when GST is off, so orders are saved exactly as before", async () => {
    const result = await buildOrderGst({
      items: [{ price: 590, quantity: 1, gstRate: 18 }],
      couponDiscount: 0,
      shippingCost: 0,
      codCost: 0,
      customerState: "Kerala",
    });
    expect(result).toBeNull();
  });

  it("builds the snapshot from settings and the seller address", async () => {
    await setGst({ enabled: true, defaultRate: 12 });
    await setSellerAddress({ state: "Kerala", gstin: "32ABCDE1234F1Z5" });

    const result = await buildOrderGst({
      items: [
        { price: 590, quantity: 1, gstRate: 18, hsnCode: "3924" },
        { price: 112, quantity: 1, gstRate: null, hsnCode: "" },
      ],
      couponDiscount: 0,
      shippingCost: 0,
      codCost: 0,
      customerState: "TN_Tamil Nadu",
    });

    expect(result.gst).toMatchObject({
      sellerGstin: "32ABCDE1234F1Z5",
      sellerState: "Kerala",
      placeOfSupply: "Tamil Nadu",
      supplyType: "inter",
      totalTax: 102,
      igst: 102,
      invoiceNumber: null,
    });
    // The second item falls back to the 12% default.
    expect(result.items[1]).toMatchObject({ gstRate: 12, taxAmount: 12, taxableValue: 100 });
    expect(result.items[0].hsnCode).toBe("3924");
  });

  it("fills missing display choices from the defaults", () => {
    const s = normalizeGstSettings({ enabled: true, display: { email: { gstin: false } } });
    expect(s.display.email.gstin).toBe(false);
    expect(s.display.email.simple).toBe(true); // default kept
    expect(s.display.invoice.breakdown).toBe(true);
    expect(s.invoicePrefix).toBe("INV");
  });

  it("issues invoice numbers once per order, in sequence, per financial year", async () => {
    await setGst({ enabled: true, invoicePrefix: "INV" });
    const fy = financialYearLabel(new Date());
    const first = await createOrder({ supplyType: "intra", totalTax: 90 });
    const second = await createOrder({ supplyType: "intra", totalTax: 90 });
    const noGst = await createOrder(undefined);

    const a = await ensureInvoiceNumber(first._id);
    const again = await ensureInvoiceNumber(first._id);
    const b = await ensureInvoiceNumber(second._id);

    expect(a).toMatch(new RegExp(`^INV/${fy}/\\d{5}$`));
    expect(again).toBe(a); // never renumbered
    expect(Number(b.split("/")[2])).toBe(Number(a.split("/")[2]) + 1);
    expect(await ensureInvoiceNumber(noGst._id)).toBeNull();

    const saved = await Order.findById(first._id).lean();
    expect(saved.gst.invoiceNumber).toBe(a);
    expect(saved.gst.invoiceDate).toBeInstanceOf(Date);
  });
});
