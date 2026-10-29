const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../../src/app");
const ChatSession = require("../../src/models/ChatSession");
const Category = require("../../src/models/Category");
const Product = require("../../src/models/Product");

jest.mock("groq-sdk", () => {
  const create = jest.fn();
  class Groq {
    constructor() {
      this.chat = { completions: { create } };
    }
  }
  Groq.__create = create;
  return Groq;
});

const Groq = require("groq-sdk");
const createCompletion = Groq.__create;

let counter = 0;
const unique = (prefix) => `${prefix}-${Date.now()}-${counter++}`;

const aiReply = (payload) => ({
  choices: [{ message: { content: JSON.stringify(payload) } }],
});

const makeSession = async (overrides = {}) =>
  ChatSession.create({
    sessionId: unique("chat"),
    customerName: "Chat Parent",
    customerEmail: "chat.parent@example.com",
    status: "active",
    ...overrides,
  });

describe("Chat surface", () => {
  beforeEach(() => {
    createCompletion.mockReset();
    createCompletion.mockResolvedValue(
      aiReply({ reply: "Happy to help!", search_for: null, escalate: false }),
    );
  });

  it("creates sessions only with a name and contact, then resumes and fills contact details", async () => {
    const noName = await request(app)
      .post("/api/v1/chat/session")
      .send({ customerEmail: "parent@example.com" });
    expect(noName.status).toBe(400);
    expect(noName.body.message).toContain("name");

    const noContact = await request(app)
      .post("/api/v1/chat/session")
      .send({ customerName: "Parent" });
    expect(noContact.status).toBe(400);
    expect(noContact.body.message).toContain("phone number or email");

    const sessionId = unique("chat-created");
    const created = await request(app).post("/api/v1/chat/session").send({
      sessionId,
      customerName: "  Parent One  ",
      customerEmail: "Parent@Example.com ",
    });
    expect(created.status).toBe(200);
    expect(created.body.sessionId).toBe(sessionId);
    expect(created.body.status).toBe("active");
    expect(created.body.messages).toEqual([]);

    const stored = await ChatSession.findOne({ sessionId });
    expect(stored.customerName).toBe("Parent One");
    expect(stored.customerEmail).toBe("parent@example.com");

    const resumed = await request(app)
      .post("/api/v1/chat/session")
      .send({ sessionId, customerPhone: "9876543210" });
    expect(resumed.status).toBe(200);
    expect(resumed.body.sessionId).toBe(sessionId);
    const updated = await ChatSession.findOne({ sessionId });
    expect(updated.customerPhone).toBe("9876543210");

    const again = await request(app).post("/api/v1/chat/session").send({ sessionId });
    expect(again.status).toBe(200);
    expect(again.body.messages).toEqual([]);
  });

  it("validates chat messages and persists AI replies with product suggestions", async () => {
    const category = await Category.create({
      name: "Rompers",
      code: unique("rompers"),
      isActive: true,
    });
    await Product.create({
      title: "Soft Cotton Romper",
      category: category._id,
      status: "published",
      stockObj: { available: 4, isInStock: true },
      variants: [{ id: unique("variant"), sku: unique("sku"), price: 499, stock: 4 }],
      images: ["https://cdn.example.com/romper.jpg"],
      url_key: unique("soft-cotton-romper"),
    });
    createCompletion.mockResolvedValue(
      aiReply({
        reply: "Here are some lovely rompers.",
        search_for: "Rompers",
        escalate: false,
      }),
    );

    const missingMessage = await request(app)
      .post("/api/v1/chat/message")
      .send({ sessionId: unique("chat") });
    expect(missingMessage.status).toBe(400);
    expect(missingMessage.body.message).toBe("Message is required");

    const missingSession = await request(app)
      .post("/api/v1/chat/message")
      .send({ message: "Hi" });
    expect(missingSession.status).toBe(400);
    expect(missingSession.body.message).toBe("sessionId is required");

    const invalidMessage = await request(app)
      .post("/api/v1/chat/message")
      .send({ sessionId: unique("chat"), message: "\u0000\u0001" });
    expect(invalidMessage.status).toBe(400);
    expect(invalidMessage.body.message).toBe("Invalid message content");

    const sessionId = unique("chat-message");
    const response = await request(app)
      .post("/api/v1/chat/message")
      .send({ sessionId, message: "Show me rompers" });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.reply).toBe("Here are some lovely rompers.");
    expect(response.body.escalated).toBe(false);
    expect(response.body.products[0]).toEqual(
      expect.objectContaining({ title: "Soft Cotton Romper", in_stock: true }),
    );

    const session = await ChatSession.findOne({ sessionId });
    expect(session.messages).toHaveLength(2);
    expect(session.messages[0].role).toBe("user");
    expect(session.messages[1].role).toBe("assistant");
    expect(session.messages[1].products).toHaveLength(1);
  });

  it("escalates AI replies and queues messages for already-escalated sessions", async () => {
    const sessionId = unique("chat-escalate");
    createCompletion.mockResolvedValue(
      aiReply({
        reply: "I will connect you to support.",
        escalate: true,
        escalate_reason: "Refund request",
        order_id: "IC12345",
      }),
    );

    const escalated = await request(app)
      .post("/api/v1/chat/message")
      .send({ sessionId, message: "I need a refund for order IC12345" });

    expect(escalated.status).toBe(200);
    expect(escalated.body).toEqual(
      expect.objectContaining({
        success: true,
        escalated: true,
        reply: "I will connect you to support.",
        staffUnavailable: true,
      }),
    );

    const session = await ChatSession.findOne({ sessionId });
    expect(session.status).toBe("escalated");
    expect(session.escalationReason).toBe("Refund request");
    expect(session.orderId).toBe("IC12345");

    const followUp = await request(app)
      .post("/api/v1/chat/message")
      .send({ sessionId, message: "Any update?" });
    expect(followUp.status).toBe(200);
    expect(followUp.body.reply).toBeNull();
    expect(followUp.body.escalated).toBe(true);
    expect(followUp.body.staffUnavailable).toBe(true);

    const refreshed = await ChatSession.findOne({ sessionId });
    expect(refreshed.messages.map((m) => m.content)).toEqual(
      expect.arrayContaining(["Any update?"]),
    );
    expect(createCompletion).toHaveBeenCalledTimes(1);
  });

  it("requests a human agent, handles missing sessions, and is idempotent", async () => {
    const missing = await request(app)
      .post(`/api/v1/chat/session/${unique("missing")}/request-human`);
    expect(missing.status).toBe(404);

    const session = await makeSession();
    const first = await request(app).post(
      `/api/v1/chat/session/${session.sessionId}/request-human`,
    );
    expect(first.status).toBe(200);
    expect(first.body.success).toBe(true);
    expect(first.body.staffUnavailable).toBe(true);
    expect(first.body.messages.at(-1).content).toContain("Connecting you");

    const refreshed = await ChatSession.findOne({ sessionId: session.sessionId });
    expect(refreshed.status).toBe("escalated");
    expect(refreshed.escalationReason).toBe("Customer requested human support");

    const second = await request(app).post(
      `/api/v1/chat/session/${session.sessionId}/request-human`,
    );
    expect(second.status).toBe(200);
    expect(second.body.staffUnavailable).toBe(true);
  });

  it("saves contact details with validation and not-found handling", async () => {
    const missingContact = await request(app)
      .post(`/api/v1/chat/session/${unique("missing")}/contact`)
      .send({ email: "parent@example.com" });
    expect(missingContact.status).toBe(404);

    const session = await makeSession({ customerEmail: null, customerPhone: null });
    const empty = await request(app)
      .post(`/api/v1/chat/session/${session.sessionId}/contact`)
      .send({});
    expect(empty.status).toBe(400);

    const saved = await request(app)
      .post(`/api/v1/chat/session/${session.sessionId}/contact`)
      .send({ name: "Updated Parent", email: "updated@example.com", phone: "9876543210" });
    expect(saved.status).toBe(200);
    expect(saved.body.success).toBe(true);

    const refreshed = await ChatSession.findOne({ sessionId: session.sessionId });
    expect(refreshed.customerName).toBe("Updated Parent");
    expect(refreshed.customerEmail).toBe("updated@example.com");
    expect(refreshed.customerPhone).toBe("9876543210");
  });

  it("ends chats, resolves once, and returns not-found for unknown sessions", async () => {
    const missing = await request(app).post(
      `/api/v1/chat/session/${unique("missing")}/end`,
    );
    expect(missing.status).toBe(404);

    const session = await makeSession();
    const ended = await request(app).post(
      `/api/v1/chat/session/${session.sessionId}/end`,
    );
    expect(ended.status).toBe(200);
    expect(ended.body.message).toBe("Chat ended");

    const refreshed = await ChatSession.findOne({ sessionId: session.sessionId });
    expect(refreshed.status).toBe("resolved");
    expect(refreshed.endedBy).toBe("customer");
    expect(refreshed.resolvedAt).toBeTruthy();
    expect(refreshed.messages.at(-1).content).toContain("You ended this chat");

    const again = await request(app).post(
      `/api/v1/chat/session/${session.sessionId}/end`,
    );
    expect(again.status).toBe(200);
    const unchanged = await ChatSession.findOne({ sessionId: session.sessionId });
    expect(unchanged.messages).toHaveLength(1);
  });
});
