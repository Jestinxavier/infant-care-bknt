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

// The test setup mocks emailService for other suites; use the real one here.
const { sendAbandonedCartEmail } = jest.requireActual("../../src/services/emailService");

describe("Abandoned cart email", () => {
  beforeEach(() => {
    sent.length = 0;
  });

  it("renders items, coupon and one-click unsubscribe headers, escaping customer text", async () => {
    const cart = {
      items: [{ _id: "item1", titleSnapshot: "Muslin <Swaddle>", imageSnapshot: "https://x/y.jpg", quantity: 2 }],
    };
    await sendAbandonedCartEmail(
      { email: "parent@example.com", username: '<script>alert("x")</script>' },
      cart,
      {
        step: 2,
        lineTotals: new Map([["item1", 1598]]),
        cartTotal: 1598,
        restoreUrl: "https://infantscare.in/api/v1/cart/restore?token=abc",
        unsubscribeUrl: "https://infantscare.in/unsubscribe?token=def",
        oneClickUnsubscribeUrl: "https://infantscare.in/api/v1/email/unsubscribe?token=def",
        coupon: { code: "COMEBACK-ABC234", percent: 5, maxDiscount: 100, validHours: 48 },
      },
    );

    expect(sent).toHaveLength(1);
    const mail = sent[0];
    expect(mail.to).toBe("parent@example.com");
    expect(mail.subject).toBe("5% off your cart, for the next 48 hours");
    expect(mail.html).toContain("COMEBACK-ABC234");
    expect(mail.html).toContain("₹1,598");
    expect(mail.html).toContain("Muslin &lt;Swaddle&gt;");
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("https://infantscare.in/unsubscribe?token=def");
    expect(mail.list.unsubscribe.url).toBe("https://infantscare.in/api/v1/email/unsubscribe?token=def");
    expect(mail.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });

  it("reminder 1 has no coupon block", async () => {
    await sendAbandonedCartEmail(
      { email: "parent@example.com", username: "Anjali" },
      { items: [{ _id: "i", titleSnapshot: "Bib", quantity: 1 }] },
      {
        step: 1,
        lineTotals: new Map([["i", 199]]),
        cartTotal: 199,
        restoreUrl: "r",
        unsubscribeUrl: "u",
        oneClickUnsubscribeUrl: "o",
      },
    );
    expect(sent[0].subject).toBe("You left something in your cart");
    expect(sent[0].html).not.toContain("COMEBACK-");
    expect(sent[0].html).not.toContain("A little something to help you decide");
  });
});
