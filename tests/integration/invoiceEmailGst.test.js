const mongoose = require("mongoose");

// Capture outgoing mail instead of sending it.
const sent = [];
jest.mock("nodemailer", () => ({
  createTransport: () => ({
    sendMail: async (mail) => {
      sent.push(mail);
      return { messageId: "test" };
    },
  }),
}));

const Order = require("../../src/models/Order");
const SiteSetting = require("../../src/models/SiteSetting");
// The test setup mocks emailService for other suites; use the real one here.
const { sendInvoiceEmail } = jest.requireActual("../../src/services/emailService");

let seq = 0;

async function setSetting(key, scope, value) {
  await SiteSetting.findOneAndUpdate(
    { key },
    { key, scope, type: "json", value },
    { upsert: true },
  );
}

async function createGstOrder() {
  return Order.create({
    orderId: `EMAIL-GST-${Date.now()}-${seq++}`,
    items: [
      {
        productId: new mongoose.Types.ObjectId(),
        quantity: 1,
        price: 590,
        name: "Feeding Bottle",
        hsnCode: "3924",
        gstRate: 18,
        taxableValue: 500,
        taxAmount: 90,
      },
    ],
    totalQuantity: 1,
    totalAmount: 590,
    subtotal: 590,
    shippingAddress: { fullName: "Anjali", state: "Kerala" },
    gst: {
      sellerGstin: "32ABCDE1234F1Z5",
      placeOfSupply: "Kerala",
      supplyType: "intra",
      taxableValue: 500,
      totalTax: 90,
      cgst: 45,
      sgst: 45,
    },
  });
}

describe("Invoice email with GST", () => {
  beforeEach(() => {
    sent.length = 0;
  });

  it("shows the ticked GST lines and issues an invoice number", async () => {
    await setSetting("tax.gst", "tax", {
      enabled: true,
      display: {
        email: { gstin: false, simple: true, breakdown: true, hsn: true, taxable: false, pos: false, invno: true },
      },
    });
    const order = await createGstOrder();

    await sendInvoiceEmail({ email: "parent@example.com", username: "Anjali" }, order.toObject());

    expect(sent).toHaveLength(1);
    const html = sent[0].html;
    expect(html).toContain("CGST");
    expect(html).toContain("SGST");
    expect(html).toContain("Includes GST of");
    expect(html).toContain("HSN 3924");
    // Unticked for the email: GST number and price before GST.
    expect(html).not.toContain("32ABCDE1234F1Z5");
    expect(html).not.toContain("Price before GST");
    // No template placeholders left behind.
    expect(html).not.toMatch(/\{\{[#/]?\w/);

    const saved = await Order.findById(order._id).lean();
    expect(saved.gst.invoiceNumber).toMatch(/^INV\/\d{2}-\d{2}\/\d{5}$/);
    expect(html).toContain(saved.gst.invoiceNumber);
  });

  it("shows no GST for orders placed before GST was enabled", async () => {
    await setSetting("tax.gst", "tax", { enabled: true });
    const order = await Order.create({
      orderId: `EMAIL-OLD-${Date.now()}-${seq++}`,
      items: [{ productId: new mongoose.Types.ObjectId(), quantity: 1, price: 590, name: "Bottle" }],
      totalQuantity: 1,
      totalAmount: 590,
      subtotal: 590,
    });

    await sendInvoiceEmail({ email: "parent@example.com", username: "Anjali" }, order.toObject());

    const html = sent[0].html;
    expect(html).not.toContain("CGST");
    expect(html).not.toContain("Invoice No.");
    expect(html).not.toMatch(/\{\{[#/]?\w/);
  });
});
