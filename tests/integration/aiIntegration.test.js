process.env.SETTINGS_ENCRYPTION_KEY = "test-master-key-for-settings-encryption";

const request = require("supertest");
const app = require("../../src/app");
const IntegrationSecret = require("../../src/models/IntegrationSecret");
const { invalidateAiKey } = require("../../src/services/aiKeyService");
const {
  createVerifiedUser,
  accessTokenFor,
} = require("../helpers/authFixtures");

// Fake provider: keys starting "gsk_good" are accepted, anything else is
// rejected as expired. Remembers which key each chat call used.
jest.mock("groq-sdk", () => {
  const usedKeys = [];
  class Groq {
    constructor({ apiKey }) {
      this.apiKey = apiKey;
      this.models = {
        list: async () => {
          if (String(apiKey).startsWith("gsk_good")) return { data: [] };
          throw Object.assign(new Error("Invalid API Key"), {
            status: 401,
            error: { error: { code: "expired_api_key" } },
          });
        },
      };
      this.chat = {
        completions: {
          create: async () => {
            usedKeys.push(apiKey);
            return {
              choices: [{ message: { content: JSON.stringify({ reply: "Hello from the AI" }) } }],
            };
          },
        },
      };
    }
  }
  Groq.__usedKeys = usedKeys;
  return Groq;
});
const Groq = require("groq-sdk");

const GOOD_KEY = "gsk_good_0123456789abcdefghijWXYZ";
const auth = (user) => ({ Authorization: `Bearer ${accessTokenFor(user)}` });
const url = "/api/v1/admin/integrations/ai";

describe("Chat AI key from the dashboard", () => {
  let superAdmin;

  beforeEach(async () => {
    await IntegrationSecret.deleteMany({});
    invalidateAiKey();
    superAdmin = await createVerifiedUser({ role: "super-admin" });
  });

  it("is limited to super-admins", async () => {
    const admin = await createVerifiedUser({ role: "admin" });
    expect((await request(app).get(url).set(auth(admin))).status).toBe(403);
    expect(
      (await request(app).put(url).set(auth(admin)).send({ apiKey: GOOD_KEY })).status,
    ).toBe(403);
    expect((await request(app).get(url).set(auth(superAdmin))).status).toBe(200);
  });

  it("rejects bad keys without saving them", async () => {
    const short = await request(app).put(url).set(auth(superAdmin)).send({ apiKey: "abc" });
    expect(short.status).toBe(400);

    const expired = await request(app)
      .put(url)
      .set(auth(superAdmin))
      .send({ apiKey: "gsk_old_0123456789abcdefghijklmn" });
    expect(expired.status).toBe(400);
    expect(expired.body.message).toMatch(/expired/);
    expect(await IntegrationSecret.countDocuments()).toBe(0);
  });

  it("saves a working key encrypted, never returns it, and the chat uses it at once", async () => {
    const saved = await request(app).put(url).set(auth(superAdmin)).send({ apiKey: GOOD_KEY });
    expect(saved.status).toBe(200);
    expect(saved.body.ai).toMatchObject({ source: "dashboard", last4: "WXYZ" });
    expect(JSON.stringify(saved.body)).not.toContain(GOOD_KEY);

    const doc = await IntegrationSecret.findOne({ name: "groq" }).lean();
    expect(JSON.stringify(doc)).not.toContain(GOOD_KEY);
    expect(doc.lastCheck.ok).toBe(true);

    const view = await request(app).get(url).set(auth(superAdmin));
    expect(JSON.stringify(view.body)).not.toContain(GOOD_KEY);

    // No restart: the very next chat message uses the new key.
    await request(app)
      .post("/api/v1/chat/message")
      .send({ sessionId: `chat-${Date.now()}`, message: "hello there friend" });
    expect(Groq.__usedKeys.at(-1)).toBe(GOOD_KEY);
  });

  it("removing the dashboard key falls back to the server's key", async () => {
    await request(app).put(url).set(auth(superAdmin)).send({ apiKey: GOOD_KEY });
    const removed = await request(app).delete(url).set(auth(superAdmin));
    expect(removed.status).toBe(200);
    expect(removed.body.ai.source).toBe(process.env.GROQ_API_KEY ? "env" : "none");
    expect(await IntegrationSecret.countDocuments()).toBe(0);
  });

  it("Test now reports the status of the server's .env key too", async () => {
    const previous = process.env.GROQ_API_KEY;
    process.env.GROQ_API_KEY = "gsk_old_expired_env_key_0123456789";
    invalidateAiKey();
    try {
      const res = await request(app).post(`${url}/test`).set(auth(superAdmin));
      expect(res.status).toBe(200);
      expect(res.body.result.ok).toBe(false);
      expect(res.body.ai.source).toBe("env");
      expect(res.body.ai.lastCheck).toMatchObject({ ok: false, message: "Key rejected: expired" });
    } finally {
      process.env.GROQ_API_KEY = previous;
      invalidateAiKey();
    }
  });

  it("refuses to save when the server has no encryption key", async () => {
    const saved = process.env.SETTINGS_ENCRYPTION_KEY;
    delete process.env.SETTINGS_ENCRYPTION_KEY;
    try {
      const res = await request(app).put(url).set(auth(superAdmin)).send({ apiKey: GOOD_KEY });
      expect(res.status).toBe(503);
      expect(await IntegrationSecret.countDocuments()).toBe(0);
    } finally {
      process.env.SETTINGS_ENCRYPTION_KEY = saved;
    }
  });
});
