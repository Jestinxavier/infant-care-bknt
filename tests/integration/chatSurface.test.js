const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../../src/app");
const ChatSession = require("../../src/models/ChatSession");
const Category = require("../../src/models/Category");
const Product = require("../../src/models/Product");
const Notification = require("../../src/models/Notification");
const { remindWaitingChats } = require("../../src/jobs/chatWaitingReminder");
const { closeIdleChats } = require("../../src/jobs/chatAutoClose");
const {
  createVerifiedUser,
  accessTokenFor,
} = require("../helpers/authFixtures");

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

  it("hides chats with no messages from the admin list and counts", async () => {
    const admin = await createVerifiedUser({ role: "admin" });
    const auth = { Authorization: `Bearer ${accessTokenFor(admin)}` };
    const empty = await makeSession({ customerName: unique("Empty") });
    const real = await makeSession({
      customerName: unique("Real"),
      messages: [{ role: "user", content: "Is this in stock?" }],
    });

    const list = await request(app)
      .get("/api/v1/chat/admin/sessions?status=all&limit=100")
      .set(auth);
    expect(list.status).toBe(200);
    const ids = list.body.sessions.map((s) => s.sessionId);
    expect(ids).toContain(real.sessionId);
    expect(ids).not.toContain(empty.sessionId);

    const counts = await request(app).get("/api/v1/chat/admin/sessions/counts").set(auth);
    expect(counts.body.counts.all).toBe(
      await ChatSession.countDocuments({ "messages.0": { $exists: true } }),
    );
  });

  it("records escalation time and reminds once for chats nobody joined", async () => {
    const session = await makeSession({
      messages: [{ role: "user", content: "Where is my order?" }],
    });
    await request(app).post(`/api/v1/chat/session/${session.sessionId}/request-human`);
    const escalated = await ChatSession.findOne({ sessionId: session.sessionId });
    expect(escalated.escalatedAt).toBeInstanceOf(Date);

    // Not waiting long enough yet: no reminder.
    await remindWaitingChats();
    expect(
      (await ChatSession.findOne({ sessionId: session.sessionId })).waitingReminderAt,
    ).toBeNull();

    await ChatSession.updateOne(
      { sessionId: session.sessionId },
      { $set: { escalatedAt: new Date(Date.now() - 15 * 60 * 1000) } },
    );
    await remindWaitingChats();
    const reminded = await ChatSession.findOne({ sessionId: session.sessionId });
    expect(reminded.waitingReminderAt).toBeInstanceOf(Date);
    const bell = await Notification.findOne({
      type: "chat_escalation",
      sessionId: session.sessionId,
    }).lean();
    expect(bell.message).toMatch(/Still waiting for a reply/);

    // Only once per chat.
    const firstReminder = reminded.waitingReminderAt.getTime();
    await remindWaitingChats();
    expect(
      (await ChatSession.findOne({ sessionId: session.sessionId })).waitingReminderAt.getTime(),
    ).toBe(firstReminder);
  });

  it("tracks unread live chats and marks them read or unread, one or in bulk", async () => {
    const admin = await createVerifiedUser({ role: "admin" });
    const auth = { Authorization: `Bearer ${accessTokenFor(admin)}` };
    const unreadCount = async () =>
      (await request(app).get("/api/v1/chat/admin/sessions/counts").set(auth)).body
        .counts.unread;

    const before = await unreadCount();
    const a = await makeSession({ messages: [{ role: "user", content: "Help please" }] });
    const b = await makeSession({ messages: [{ role: "user", content: "Order issue" }] });
    await request(app).post(`/api/v1/chat/session/${a.sessionId}/request-human`);
    await request(app).post(`/api/v1/chat/session/${b.sessionId}/request-human`);
    expect(await unreadCount()).toBe(before + 2);

    const list = await request(app)
      .get("/api/v1/chat/admin/sessions?status=escalated&limit=100")
      .set(auth);
    const row = list.body.sessions.find((s) => s.sessionId === a.sessionId);
    expect(row.unreadCount).toBeGreaterThan(0);

    // Opening one chat (mark read) drops the count by one.
    const one = await request(app)
      .post("/api/v1/chat/admin/sessions/read")
      .set(auth)
      .send({ sessionIds: [a.sessionId], read: true });
    expect(one.status).toBe(200);
    expect(await unreadCount()).toBe(before + 1);

    // Mark unread again, then mark everything in the Live tab read.
    await request(app)
      .post("/api/v1/chat/admin/sessions/read")
      .set(auth)
      .send({ sessionIds: [a.sessionId], read: false });
    expect(await unreadCount()).toBe(before + 2);
    await request(app)
      .post("/api/v1/chat/admin/sessions/read")
      .set(auth)
      .send({ all: true, status: "escalated", read: true });
    expect(await unreadCount()).toBe(0);

    // A new customer message makes the chat unread again.
    await request(app)
      .post("/api/v1/chat/message")
      .send({ sessionId: b.sessionId, message: "Any update?" });
    expect(await unreadCount()).toBe(1);

    const empty = await request(app)
      .post("/api/v1/chat/admin/sessions/read")
      .set(auth)
      .send({ sessionIds: [] });
    expect(empty.status).toBe(400);
  });

  it("lets only super-admins delete chats, removing their notifications", async () => {
    const admin = await createVerifiedUser({ role: "admin" });
    const superAdmin = await createVerifiedUser({ role: "super-admin" });
    const chat = await makeSession({ messages: [{ role: "user", content: "Hi" }] });
    await request(app).post(`/api/v1/chat/session/${chat.sessionId}/request-human`);
    expect(
      await Notification.countDocuments({ type: "chat_escalation", sessionId: chat.sessionId }),
    ).toBe(1);

    const denied = await request(app)
      .post("/api/v1/chat/admin/sessions/delete")
      .set({ Authorization: `Bearer ${accessTokenFor(admin)}` })
      .send({ sessionIds: [chat.sessionId] });
    expect(denied.status).toBe(403);
    expect(await ChatSession.countDocuments({ sessionId: chat.sessionId })).toBe(1);

    const superAuth = { Authorization: `Bearer ${accessTokenFor(superAdmin)}` };
    const empty = await request(app)
      .post("/api/v1/chat/admin/sessions/delete")
      .set(superAuth)
      .send({ sessionIds: [] });
    expect(empty.status).toBe(400);

    const deleted = await request(app)
      .post("/api/v1/chat/admin/sessions/delete")
      .set(superAuth)
      .send({ sessionIds: [chat.sessionId] });
    expect(deleted.status).toBe(200);
    expect(deleted.body.deleted).toBe(1);
    expect(await ChatSession.countDocuments({ sessionId: chat.sessionId })).toBe(0);
    expect(
      await Notification.countDocuments({ type: "chat_escalation", sessionId: chat.sessionId }),
    ).toBe(0);
  });

  it("closes idle chats into Done and leaves recent ones alone", async () => {
    const hoursAgo = (h) => new Date(Date.now() - h * 60 * 60 * 1000);
    const staleAi = await makeSession({ status: "active" });
    const freshAi = await makeSession({ status: "active" });
    const staleLive = await makeSession({ status: "escalated" });
    const recentLive = await makeSession({ status: "escalated" });
    const setUpdatedAt = (s, at) =>
      ChatSession.collection.updateOne({ _id: s._id }, { $set: { updatedAt: at } });
    await setUpdatedAt(staleAi, hoursAgo(25));
    await setUpdatedAt(freshAi, hoursAgo(2));
    await setUpdatedAt(staleLive, hoursAgo(8 * 24));
    await setUpdatedAt(recentLive, hoursAgo(3 * 24));

    await closeIdleChats();

    const statusOf = async (s) =>
      (await ChatSession.findById(s._id).lean()).status;
    expect(await statusOf(staleAi)).toBe("resolved");
    expect(await statusOf(freshAi)).toBe("active");
    expect(await statusOf(staleLive)).toBe("resolved");
    expect(await statusOf(recentLive)).toBe("escalated");

    // Closing isn't activity: the chat keeps its place in the list.
    const closed = await ChatSession.findById(staleAi._id).lean();
    expect(closed.autoClosedAt).toBeInstanceOf(Date);
    expect(closed.updatedAt.getTime()).toBeLessThan(hoursAgo(24).getTime());
  });
});
