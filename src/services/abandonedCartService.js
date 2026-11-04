// services/abandonedCartService.js
// Abandoned-cart reminders:
//   - every 30 minutes, find open carts (active/checkout) with items whose last
//     change is older than the reminder delay
//   - only carts we can reach: a logged-in owner's account email, or the email
//     a guest typed at checkout (POST /cart/contact)
//   - skip if the shopper unsubscribed, already ordered since, or the cart is
//     too old / too small
//   - reminder 1: plain nudge; reminder 2: optional private one-time coupon
// Everything is controlled by the "marketing.abandoned_cart" site setting and
// is OFF by default.

const crypto = require("crypto");
const Cart = require("../models/Cart");
const Order = require("../models/Order");
const User = require("../models/user");
const Coupon = require("../models/Coupon");
const SiteSetting = require("../models/SiteSetting");
const EmailPreference = require("../models/EmailPreference");
const {
  SITE_SETTING_KEYS,
  getDefaultSiteSettingValue,
} = require("../config/siteSettingRegistry");
const {
  createCartRestoreToken,
  createUnsubscribeToken,
} = require("../utils/marketingTokens");
const logger = require("../utils/logger");
const { PAYMENT_METHODS } = require("../../resources/constants");

const CATEGORY = "cart_reminders";
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const BATCH_LIMIT = 100; // per run; keeps a backlog from flooding the mailbox

const frontendUrl = () =>
  (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");

/** Setting merged over defaults (one level deep for `coupon`). */
async function getAbandonedCartSettings() {
  const defaults = getDefaultSiteSettingValue(
    SITE_SETTING_KEYS.MARKETING_ABANDONED_CART,
  );
  const doc = await SiteSetting.findOne({
    key: SITE_SETTING_KEYS.MARKETING_ABANDONED_CART,
  }).lean();
  const value = doc?.value && typeof doc.value === "object" ? doc.value : {};
  return {
    ...defaults,
    ...value,
    coupon: { ...defaults.coupon, ...(value.coupon || {}) },
  };
}

async function isUnsubscribed(email) {
  const pref = await EmailPreference.findOne({ email: String(email).toLowerCase() })
    .select("unsubscribed")
    .lean();
  return !!pref?.unsubscribed?.includes(CATEGORY);
}

/** Account email for logged-in carts, else the email captured at checkout. */
async function resolveRecipient(cart) {
  if (cart.userId) {
    const user = await User.findById(cart.userId).select("email username").lean();
    if (user?.email) return { email: user.email.toLowerCase(), username: user.username };
  }
  if (cart.contact?.email) {
    return { email: cart.contact.email, username: cart.contact.name || "" };
  }
  return null;
}

/**
 * Did this shopper complete an order after the cart was last changed? Only
 * paid or COD orders count: an online order whose payment failed or was never
 * finished is exactly the shopper worth reminding.
 */
async function hasOrderedSince(cart, email) {
  const who = [{ "guestInfo.email": email }];
  if (cart.userId) who.push({ userId: cart.userId });
  return !!(await Order.exists({
    $and: [
      { $or: who },
      { $or: [{ paymentStatus: "paid" }, { paymentMethod: PAYMENT_METHODS.COD }] },
    ],
    orderStatus: { $ne: "cancelled" },
    createdAt: { $gte: cart.updatedAt },
  }));
}

const randomCode = () =>
  // 6 chars from an unambiguous alphabet (no 0/O/1/I)
  Array.from(crypto.randomBytes(6))
    .map((b) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32])
    .join("");

/** Private, single-use, short-lived coupon for one reminder. */
async function createRecoveryCoupon(cart, email, couponSettings) {
  const now = Date.now();
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const coupon = await Coupon.create({
        code: `COMEBACK-${randomCode()}`,
        description: "Abandoned cart reminder",
        type: "percentage",
        value: couponSettings.percent,
        maxDiscount: couponSettings.maxDiscount,
        minCartValue: couponSettings.minCartValue,
        startDate: new Date(now),
        endDate: new Date(now + couponSettings.validHours * HOUR),
        usageLimit: 1,
        perUserLimit: 1,
        isActive: true,
        isPublic: false,
        applicableTo: "all",
        source: "abandoned_cart",
        issuedToEmail: email,
        issuedForCartId: cart.cartId,
      });
      return coupon;
    } catch (error) {
      if (error?.code !== 11000) throw error; // retry only on duplicate code
    }
  }
  throw new Error("Could not generate a unique recovery coupon code");
}

/** Coupon only in reminder 2, above the value floor, once per cooldown. */
async function shouldOfferCoupon(step, cartValue, email, settings) {
  const c = settings.coupon;
  if (step !== 2 || !c.enabled || cartValue < c.minCartValue) return false;
  const recent = await Coupon.exists({
    source: "abandoned_cart",
    issuedToEmail: email,
    createdAt: { $gte: new Date(Date.now() - c.cooldownDays * DAY) },
  });
  return !recent;
}

/**
 * Sends reminder `step` (1 or 2) for one cart if it still qualifies.
 * Returns a short outcome string for logging/tests.
 */
async function processCart(cart, step, settings) {
  const recipient = await resolveRecipient(cart);
  if (!recipient) return "no-contact";
  if (await isUnsubscribed(recipient.email)) return "unsubscribed";
  if (await hasOrderedSince(cart, recipient.email)) return "ordered";

  // Live prices: cart items store no price
  const { calculateTotals } = require("../controllers/cart/hybridCartController");
  const totals = await calculateTotals(cart.items);
  const cartValue = totals.discountedSubtotal;
  if (!cartValue || cartValue < (settings.minCartValue || 0)) return "below-minimum";

  // Claim the step atomically so overlapping runs can't double-send. Writing
  // with timestamps off keeps updatedAt (= last shopper activity) unchanged.
  const claimed = await Cart.updateOne(
    { _id: cart._id, "reminders.step": { $ne: step } },
    { $push: { reminders: { step, sentAt: new Date(), email: recipient.email } } },
    { timestamps: false },
  );
  if (!claimed.modifiedCount) return "already-sent";

  let coupon = null;
  try {
    if (await shouldOfferCoupon(step, cartValue, recipient.email, settings)) {
      const doc = await createRecoveryCoupon(cart, recipient.email, settings.coupon);
      coupon = {
        code: doc.code,
        percent: settings.coupon.percent,
        maxDiscount: settings.coupon.maxDiscount,
        validHours: settings.coupon.validHours,
      };
    }

    const api = `${frontendUrl()}/api/v1`;
    const unsubscribeToken = encodeURIComponent(
      createUnsubscribeToken(recipient.email, CATEGORY),
    );
    const lineTotals = new Map(
      [...totals.itemPrices.entries()].map(([id, pricing]) => [id, pricing.lineTotal]),
    );

    const emailService = require("./emailService");
    await emailService.sendAbandonedCartEmail(recipient, cart, {
      step,
      coupon,
      lineTotals,
      cartTotal: cartValue,
      restoreUrl: `${api}/cart/restore?token=${encodeURIComponent(
        createCartRestoreToken(cart.cartId),
      )}`,
      unsubscribeUrl: `${frontendUrl()}/unsubscribe?token=${unsubscribeToken}`,
      oneClickUnsubscribeUrl: `${api}/email/unsubscribe?token=${unsubscribeToken}`,
    });

    if (coupon) {
      await Cart.updateOne(
        { _id: cart._id, "reminders.step": step },
        { $set: { "reminders.$.couponCode": coupon.code } },
        { timestamps: false },
      );
    }
    return coupon ? "sent-with-coupon" : "sent";
  } catch (error) {
    // Release the claim so the next run can retry; drop an unsent coupon
    await Cart.updateOne(
      { _id: cart._id },
      { $pull: { reminders: { step } } },
      { timestamps: false },
    ).catch(() => {});
    if (coupon?.code) await Coupon.deleteOne({ code: coupon.code }).catch(() => {});
    logger.error(`[AbandonedCart] Failed reminder ${step} for cart ${cart.cartId}: ${error.message}`);
    return "failed";
  }
}

/** One pass over eligible carts. Safe to run repeatedly. */
async function runAbandonedCartJob({ now = Date.now() } = {}) {
  const settings = await getAbandonedCartSettings();
  if (!settings.enabled) return { skipped: "disabled" };

  const oldest = new Date(now - settings.maxCartAgeDays * DAY);
  const steps = [
    { step: 1, idleBefore: new Date(now - settings.firstReminderHours * HOUR) },
    { step: 2, idleBefore: new Date(now - settings.secondReminderHours * HOUR) },
  ];

  const outcomes = {};
  for (const { step, idleBefore } of steps) {
    const query = {
      status: { $in: ["active", "checkout"] },
      "items.0": { $exists: true },
      updatedAt: { $lte: idleBefore, $gte: oldest },
      $or: [{ userId: { $ne: null } }, { "contact.email": { $ne: null } }],
      "reminders.step": { $ne: step },
    };
    // Reminder 2 only after reminder 1 went out
    if (step === 2) query["reminders.step"] = { $eq: 1, $ne: 2 };

    const carts = await Cart.find(query).sort({ updatedAt: 1 }).limit(BATCH_LIMIT).lean();
    for (const cart of carts) {
      const result = await processCart(cart, step, settings);
      outcomes[`step${step}:${result}`] = (outcomes[`step${step}:${result}`] || 0) + 1;
    }
  }
  if (Object.keys(outcomes).length) {
    logger.info(`[AbandonedCart] Run complete ${JSON.stringify(outcomes)}`);
  }
  return outcomes;
}

function startAbandonedCartCron() {
  const cron = require("node-cron");
  const expr = process.env.ABANDONED_CART_CRON || "*/30 * * * *";
  cron.schedule(expr, () => {
    runAbandonedCartJob().catch((error) =>
      logger.error(`[AbandonedCart] Run failed: ${error.message}`),
    );
  });
  logger.info(`[AbandonedCart] Reminder job scheduled: ${expr}`);
}

/** Unsubscribe / resubscribe an address from cart reminders. */
async function setCartReminderOptOut(email, optOut) {
  const normalized = String(email).trim().toLowerCase();
  await EmailPreference.updateOne(
    { email: normalized },
    optOut
      ? { $addToSet: { unsubscribed: CATEGORY } }
      : { $pull: { unsubscribed: CATEGORY } },
    { upsert: true },
  );
}

module.exports = {
  CATEGORY,
  getAbandonedCartSettings,
  runAbandonedCartJob,
  startAbandonedCartCron,
  setCartReminderOptOut,
  isUnsubscribed,
  // exported for tests
  processCart,
};
