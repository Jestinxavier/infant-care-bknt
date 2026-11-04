// controllers/abandonedCartController.js
// Endpoints for abandoned-cart reminders: guest contact capture, the email's
// "Return to your cart" link, unsubscribe, and the admin list.

const Cart = require("../models/Cart");
const Order = require("../models/Order");
const User = require("../models/user");
const Coupon = require("../models/Coupon");
const logger = require("../utils/logger");
const { CART_ID } = require("../../resources/constants");
const {
  verifyCartRestoreToken,
  verifyUnsubscribeToken,
} = require("../utils/marketingTokens");
const {
  CATEGORY,
  getAbandonedCartSettings,
  setCartReminderOptOut,
  isUnsubscribed,
} = require("../services/abandonedCartService");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HOUR = 60 * 60 * 1000;
const frontendUrl = () =>
  (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");

/** a***@gmail.com — enough for the shopper to recognise, not for others. */
const maskEmail = (email) => {
  const [name, domain] = String(email).split("@");
  if (!domain) return "";
  return `${name.slice(0, 1)}${"*".repeat(Math.max(1, name.length - 1))}@${domain}`;
};

/**
 * POST /api/v1/cart/contact  { email, name? }
 * Saves the email a guest typed at checkout on their cart, so a reminder can
 * reach them if they leave. Logged-in carts use the account email instead.
 */
const saveCartContact = async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const name = String(req.body?.name || "").trim().slice(0, 80);
    if (!EMAIL_RE.test(email) || email.length > 254) {
      return res.status(400).json({ success: false, message: "Invalid email" });
    }
    const cart = req.cart;
    if (!cart || cart.status === "ordered") {
      // Nothing to attach to; not an error for the shopper
      return res.json({ success: true, saved: false });
    }
    await Cart.updateOne(
      { _id: cart._id },
      {
        $set: {
          "contact.email": email,
          ...(name ? { "contact.name": name } : {}),
          "contact.capturedAt": new Date(),
        },
      },
      // Capturing contact is not shopper activity: keep the reminder clock
      { timestamps: false },
    );
    return res.json({ success: true, saved: true });
  } catch (error) {
    logger.error("saveCartContact failed:", error);
    return res.status(500).json({ success: false, message: "Could not save contact" });
  }
};

/**
 * GET /api/v1/cart/restore?token=...
 * "Return to your cart" from the email. The email is often opened in another
 * browser than the one with the cart cookie, so set the cookie to that cart
 * and send the shopper to /cart.
 */
const restoreCart = async (req, res) => {
  const cartPage = `${frontendUrl()}/cart`;
  try {
    const { cartId } = verifyCartRestoreToken(String(req.query.token || ""));
    const cart = await Cart.findOne({ cartId }).select("cartId status userId").lean();
    // Logged-in carts come back when the shopper signs in; ordered/missing
    // carts just land on the cart page
    if (cart && !cart.userId && ["active", "checkout"].includes(cart.status)) {
      res.cookie(CART_ID, cart.cartId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 30 * 24 * HOUR,
        path: "/",
      });
    }
    return res.redirect(302, `${cartPage}?from=reminder`);
  } catch (error) {
    // Expired or tampered link: still take them to the shop
    return res.redirect(302, cartPage);
  }
};

/**
 * GET /api/v1/email/unsubscribe?token=...
 * Read-only status for the /unsubscribe page. GET never changes anything,
 * because mail scanners open links in advance.
 */
const getUnsubscribeStatus = async (req, res) => {
  try {
    const { email, category } = verifyUnsubscribeToken(String(req.query.token || ""));
    return res.json({
      success: true,
      email: maskEmail(email),
      category,
      unsubscribed: category === CATEGORY ? await isUnsubscribed(email) : false,
    });
  } catch {
    return res.status(400).json({ success: false, message: "This link is invalid or has expired" });
  }
};

/**
 * POST /api/v1/email/unsubscribe?token=... (page button, and Gmail/Yahoo
 * one-click unsubscribe, which POSTs to the List-Unsubscribe URL)
 */
const unsubscribe = async (req, res) => {
  try {
    const token = String(req.query.token || req.body?.token || "");
    const { email, category } = verifyUnsubscribeToken(token);
    if (category !== CATEGORY) throw new Error("Unknown category");
    await setCartReminderOptOut(email, true);
    return res.json({ success: true, unsubscribed: true });
  } catch {
    return res.status(400).json({ success: false, message: "This link is invalid or has expired" });
  }
};

/** POST /api/v1/email/resubscribe { token } — undo from the same page. */
const resubscribe = async (req, res) => {
  try {
    const token = String(req.query.token || req.body?.token || "");
    const { email, category } = verifyUnsubscribeToken(token);
    if (category !== CATEGORY) throw new Error("Unknown category");
    await setCartReminderOptOut(email, false);
    return res.json({ success: true, unsubscribed: false });
  } catch {
    return res.status(400).json({ success: false, message: "This link is invalid or has expired" });
  }
};

/**
 * GET /api/v1/admin/abandoned-carts?view=open|reminded|recovered&page=&limit=
 * - open: carts with items, idle past the first-reminder delay, not ordered
 * - reminded: carts that got at least one reminder (any status)
 * - recovered: reminded carts that went on to be ordered
 */
const listAbandonedCarts = async (req, res) => {
  try {
    const view = ["open", "reminded", "recovered"].includes(req.query.view)
      ? req.query.view
      : "open";
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const settings = await getAbandonedCartSettings();
    const since = new Date(Date.now() - 30 * 24 * HOUR);
    const idleBefore = new Date(Date.now() - settings.firstReminderHours * HOUR);

    const base = { "items.0": { $exists: true }, updatedAt: { $gte: since } };
    const queries = {
      open: { ...base, status: { $in: ["active", "checkout"] }, updatedAt: { $gte: since, $lte: idleBefore } },
      reminded: { ...base, "reminders.0": { $exists: true } },
      recovered: { ...base, "reminders.0": { $exists: true }, status: "ordered" },
    };

    const [carts, total, counts] = await Promise.all([
      Cart.find(queries[view])
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Cart.countDocuments(queries[view]),
      Promise.all([
        Cart.countDocuments(queries.open),
        Cart.countDocuments({
          ...queries.open,
          $or: [{ userId: { $ne: null } }, { "contact.email": { $ne: null } }],
        }),
        Cart.countDocuments(queries.reminded),
        Cart.find(queries.recovered).select("orderId").lean(),
      ]),
    ]);

    const [openCount, reachableCount, remindedCount, recoveredCarts] = counts;
    const recoveredOrders = await Order.find({
      _id: { $in: recoveredCarts.map((c) => c.orderId).filter(Boolean) },
    })
      .select("totalAmount")
      .lean();

    // Live cart values and owner emails for this page only
    const { calculateTotals } = require("./cart/hybridCartController");
    const userIds = carts.map((c) => c.userId).filter(Boolean);
    const users = userIds.length
      ? await User.find({ _id: { $in: userIds } }).select("email username").lean()
      : [];
    const usersById = new Map(users.map((u) => [String(u._id), u]));
    const orders = await Order.find({
      _id: { $in: carts.map((c) => c.orderId).filter(Boolean) },
    })
      .select("orderId totalAmount")
      .lean();
    const ordersById = new Map(orders.map((o) => [String(o._id), o]));

    const items = await Promise.all(
      carts.map(async (cart) => {
        const totals = await calculateTotals(cart.items).catch(() => null);
        const user = cart.userId ? usersById.get(String(cart.userId)) : null;
        const order = cart.orderId ? ordersById.get(String(cart.orderId)) : null;
        return {
          cartId: cart.cartId,
          status: cart.status,
          lastActivityAt: cart.updatedAt,
          customer: user
            ? { type: "account", email: user.email, name: user.username }
            : cart.contact?.email
              ? { type: "guest", email: cart.contact.email, name: cart.contact.name }
              : { type: "unknown" },
          value: totals?.discountedSubtotal ?? null,
          itemCount: cart.items.reduce((n, i) => n + (i.quantity || 0), 0),
          items: cart.items.slice(0, 4).map((i) => ({
            title: i.titleSnapshot,
            image: i.imageSnapshot,
            quantity: i.quantity,
          })),
          reminders: cart.reminders || [],
          order: order && cart.status === "ordered"
            ? { orderId: order.orderId, total: order.totalAmount }
            : null,
        };
      }),
    );

    return res.json({
      success: true,
      view,
      enabled: !!settings.enabled,
      summary: {
        last30Days: {
          open: openCount,
          reachable: reachableCount,
          reminded: remindedCount,
          recovered: recoveredCarts.length,
          recoveredRevenue: recoveredOrders.reduce((s, o) => s + (o.totalAmount || 0), 0),
          couponsIssued: await Coupon.countDocuments({
            source: "abandoned_cart",
            createdAt: { $gte: since },
          }),
        },
      },
      items,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error("listAbandonedCarts failed:", error);
    return res.status(500).json({ success: false, message: "Failed to load abandoned carts" });
  }
};

module.exports = {
  saveCartContact,
  restoreCart,
  getUnsubscribeStatus,
  unsubscribe,
  resubscribe,
  listAbandonedCarts,
};
