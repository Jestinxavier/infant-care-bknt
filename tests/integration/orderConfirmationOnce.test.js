const mongoose = require("mongoose");

// Capture outgoing mail instead of sending it.
const sent = [];
let mockFailNext = false;
jest.mock("nodemailer", () => ({
  createTransport: () => ({
    sendMail: async (mail) => {
      if (mockFailNext) {
        mockFailNext = false;
        throw new Error("SMTP down");
      }
      sent.push(mail);
      return { messageId: "test" };
    },
  }),
}));

const Order = require("../../src/models/Order");
// The test setup mocks emailService for other suites; use the real one here.
const { sendOrderConfirmationEmail } = jest.requireActual(
  "../../src/services/emailService",
);

let seq = 0;

const createOrder = () =>
  Order.create({
    orderId: `CONFIRM-ONCE-${Date.now()}-${seq++}`,
    items: [
      {
        productId: new mongoose.Types.ObjectId(),
        quantity: 1,
        price: 499,
        name: "Muslin Swaddle",
      },
    ],
    totalQuantity: 1,
    totalAmount: 499,
    subtotal: 499,
    paymentStatus: "paid",
    orderStatus: "confirmed",
    guestInfo: { email: "parent@example.com", name: "Anjali" },
    shippingAddress: { fullName: "Anjali", state: "Kerala" },
  });

describe("Order confirmation email is sent once", () => {
  beforeEach(() => {
    sent.length = 0;
    mockFailNext = false;
  });

  it("sends one email when payment callbacks race (redirect + webhook + retry)", async () => {
    const order = (await createOrder()).toObject();

    await Promise.all([
      sendOrderConfirmationEmail(order, { onlyOnce: true }),
      sendOrderConfirmationEmail(order, { onlyOnce: true }),
      sendOrderConfirmationEmail(order, { onlyOnce: true }),
    ]);
    // A late retry after the fact is also ignored
    await sendOrderConfirmationEmail(order, { onlyOnce: true });

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toContain("parent@example.com");
    const saved = await Order.findById(order._id).lean();
    expect(saved.confirmationEmailSentAt).toBeInstanceOf(Date);
  });

  it("releases the claim when sending fails, so a later callback can send it", async () => {
    const order = (await createOrder()).toObject();

    mockFailNext = true;
    await expect(
      sendOrderConfirmationEmail(order, { onlyOnce: true }),
    ).rejects.toThrow("SMTP down");
    expect((await Order.findById(order._id).lean()).confirmationEmailSentAt).toBeNull();

    await sendOrderConfirmationEmail(order, { onlyOnce: true });
    expect(sent).toHaveLength(1);
  });

  it("keeps sending when not asked to dedupe (admin resend path)", async () => {
    const order = (await createOrder()).toObject();

    await sendOrderConfirmationEmail(order, { onlyOnce: true });
    await sendOrderConfirmationEmail(order);

    expect(sent).toHaveLength(2);
  });
});
