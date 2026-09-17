// scripts/seed_chat_knowledge.js
// One-off / repeatable script: seeds a starter Knowledge Base so the AI chat
// can answer common questions out of the box.
//
//   pnpm seed:chat-kb                 # seed only when the KB is empty
//   pnpm seed:chat-kb -- --force      # wipe & re-seed with the defaults
//
// What the Knowledge Base is / how it works:
//   - Each entry is a {"question", "answer", "tags"} pair written the way a
//     customer would ask.
//   - When a customer chats, the AI picks the 3 most similar entries (MongoDB
//     text search over question/answer/tags) and uses them as ground-truth
//     context ("Relevant Knowledge from Our Team"). Its answers for order
//     status / returns / delivery thus come straight from these entries.
//   - Add more entries anytime from the dashboard:  Chats → "Know" tab → Add,
//     or resolve a chat with "Resolve & Save".
require("dotenv").config();
const mongoose = require("mongoose");
const KnowledgeBase = require("../src/models/KnowledgeBase");
const logger = require("../src/utils/logger");

const SAMPLE_ENTRIES = [
  {
    question: "How long does delivery take in India?",
    answer:
      "Delivery usually takes 3-7 working days depending on your pincode. Metro cities often get orders in 2-4 days; tier-2/3 locations can take up to 7 days. You'll get tracking details as soon as your order is dispatched.",
    tags: ["delivery", "shipping", "time", "dispatch"],
  },
  {
    question: "Do you deliver outside India / to my pincode?",
    answer:
      "We currently deliver across all Indian pincodes via our delivery partners. If your pincode isn't serviceable at checkout, contact us and we'll do our best to help.",
    tags: ["delivery", "pincode", "international", "shipping"],
  },
  {
    question: "Is Cash on Delivery (COD) available? What is COD cost?",
    answer:
      "Yes, Cash on Delivery is available on most orders. A small COD convenience fee is added at checkout. Please keep the exact change or pay by UPI at delivery. If you'd like to avoid the fee, prepay via card or UPI.",
    tags: ["cod", "cash on delivery", "payment", "fee"],
  },
  {
    question: "Which payment methods do you accept?",
    answer:
      "We accept UPI, Credit/Debit cards, net banking, and Cash on Delivery securely via our payment gateway.",
    tags: ["payment", "upi", "card", "methods", "cod"],
  },
  {
    question: "How do I track my order?",
    answer:
      "Once your order is dispatched, you'll receive an SMS/WhatsApp with the tracking link and a tracking ID. You can also see the status in your account under My Orders.",
    tags: ["track", "tracking", "order status", "where is my order"],
  },
  {
    question: "What is the return and exchange policy?",
    answer:
      "Unused products in original packing can be returned or exchanged within 7 days of delivery. Write 'return' in this chat or email us with your order ID and reason. Refunds to wallets/cards usually reflect within 5-7 business days after pickup.",
    tags: ["return", "exchange", "refund", "policy", "replacement"],
  },
  {
    question: "My order is late. What should I do?",
    answer:
      "Sorry for the delay! Share your order ID here and our team will check the latest transit status with the delivery partner and update you, usually within a few hours.",
    tags: ["late", "delay", "order", "delivery", "help"],
  },
  {
    question: "Can I cancel or change my order after placing it?",
    answer:
      "Orders can usually be cancelled before they are dispatched. Message us right away with your order ID and we'll try to help. Prepaid orders are refunded to the original payment method.",
    tags: ["cancel", "change", "modify", "order"],
  },
  {
    question: "What should I buy as a newborn gift?",
    answer:
      "For newborns (0-6 months) our best-sellers are sleep suits, rompers, nappy sets and soft towels. Tell us the baby's age and budget and we'll suggest a ready gift set.",
    tags: ["gift", "newborn", "suggest", "recommend"],
  },
  {
    question: "Are your products safe and gentle for babies?",
    answer:
      "Yes — all cloth and accessories are baby-safe, soft, and dermatologist-tested. Each product page lists fabric, size guide and care instructions.",
    tags: ["safe", "soft", "quality", "material", "tested"],
  },
  {
    question: "How do I choose the correct size for my baby?",
    answer:
      "Use the size chart on each product page. If you're between sizes, we suggest going one size up for growing babies. Tell us baby's age/weight and we'll recommend the right fit.",
    tags: ["size", "sizing", "fit", "guide"],
  },
  {
    question: "Do you have any discount or coupon codes?",
    answer:
      "Yes! Check the offers section on the homepage and during checkout for auto-applied deals. You can also ask this chat for current coupons and we'll show what's active.",
    tags: ["coupon", "discount", "offer", "promo", "code"],
  },
  {
    question: "Can I order in bulk for a shop, daycare or resale?",
    answer:
      "Yes, we support bulk and wholesale orders for shops, daycares and resellers. Write 'wholesale' in this chat and our team will share the bulk pricing and process.",
    tags: ["bulk", "wholesale", "resale", "shop", "b2b"],
  },
  {
    question: "How do I contact you?",
    answer:
      "You're in the right place! Keep chatting here and our team replies directly. For order-related issues, share your order ID so we can act faster.",
    tags: ["contact", "support", "help", "phone", "call"],
  },
];

async function seed({ force = false } = {}) {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set in .env");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 15000,
  });

  const existing = await KnowledgeBase.countDocuments({ active: true });
  if (existing > 0 && !force) {
    console.log(
      `Knowledge base already has ${existing} active entries — nothing to do. ` +
        "Run with --force to wipe and re-seed the defaults."
    );
    await mongoose.disconnect();
    return;
  }

  if (force) {
    await KnowledgeBase.deleteMany({});
    console.log("Cleared existing knowledge base entries.");
  }

  const inserted = await KnowledgeBase.insertMany(
    SAMPLE_ENTRIES.map((e) => ({ ...e })),
    { ordered: true }
  );
  console.log(`Seeded ${inserted.length} starter knowledge-base entries.`);
  console.log(
    "These answer common customer questions instantly and feed the AI chat. " +
      "Add/edit more from the dashboard: Chats → Know → Add."
  );

  // Ensure the text index used by $text search exists.
  await KnowledgeBase.syncIndexes();
  console.log("Text index ensured (question/answer/tags).");

  await mongoose.disconnect();
}

const argv = process.argv.slice(2);
seed({ force: argv.includes("--force") }).catch((err) => {
  logger.error("Seed failed", err);
  process.exit(1);
});