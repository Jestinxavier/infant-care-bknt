// features/pos/pos.service.js
// In-store point of sale: item lookup and counter sales. A POS sale is saved
// as a normal Order (channel "pos", already paid and handed over) so stock,
// GST invoices and every report treat it like any other sale.
const { generateOrderId, isOrderIdCollision, ORDER_ID_ATTEMPTS } = require("../../utils/orderId");
const { backfillLegacyStock } = require("../../utils/legacyStockBackfill");
const Order = require("../../models/Order");
const Payment = require("../../models/Payment");
const Product = require("../../models/Product");
const User = require("../../models/user");
const { PRODUCT_TYPES } = require("../product/product.model");
const { computeCartItemPricing } = require("../../utils/quantityPricingUtils");
const escapeRegex = require("../../utils/escapeRegex");
const {
  buildOrderGst,
  getGstSettings,
  getSellerAddress,
  ensureInvoiceNumber,
} = require("../../services/gstService");
const {
  invalidateOrderReportCaches,
} = require("../../controllers/admin/orderCacheInvalidation");
const { POS_PAYMENT_METHODS, PAYMENT_METHODS } = require("../../../resources/constants");
const { hasPermission } = require("../../../resources/permissions");
const logger = require("../../utils/logger");
const { ChargeError, getChargeTypes, resolveBillCharges } = require("./pos.charges");
const { SourceError, getSources, resolveSaleSource } = require("./pos.sources");

const MAX_LINES = 100;
const MAX_LINE_QTY = 999;
const WALK_IN_NAME = "Walk-in customer";

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

class PosError extends Error {
  constructor(code, message, status = 400, details = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const availableStock = (source) => source?.stockObj?.available ?? source?.stock ?? 0;

/**
 * What sets a variant apart, e.g. "0-3M · Beige", using the store's option
 * labels. The variant's stored name repeats the product title ("Sleep Suit -
 * Beige / 0-3M"), which is redundant next to the title and gets truncated.
 */
function variantLabel(product, variant) {
  const raw = variant.attributes || variant.options || {};
  const attrs = raw instanceof Map ? Object.fromEntries(raw) : raw;
  const norm = (v) => String(v ?? "").trim().toLowerCase();
  const labels = (product.variantOptions || [])
    .map((option) => {
      const value = attrs[option.code];
      if (!value) return null;
      const match = (option.values || []).find((v) => norm(v.value) === norm(value));
      return match?.label || value;
    })
    .filter(Boolean);
  if (labels.length) return labels.join(" · ");
  // No option data: fall back to the name without the product title in front.
  const name = String(variant.name || "");
  return name.toLowerCase().startsWith(norm(product.title))
    ? name.slice(product.title.length).replace(/^[\s\-–/]+/, "")
    : name;
}

/** One sellable line (a simple product, or one variant of a configurable). */
function toSellable(product, variant) {
  const pricing = computeCartItemPricing(product, variant, 1);
  const source = variant || product;
  const quantityRules =
    variant?.quantityRules?.length > 0 ? variant.quantityRules : product.quantityRules || [];
  return {
    key: variant ? `${product._id}:${variant.id}` : String(product._id),
    productId: String(product._id),
    variantId: variant ? variant.id : null,
    title: product.title,
    variantName: variant ? variantLabel(product, variant) : "",
    sku: source.sku || product.sku || "",
    image: source.images?.[0] || product.images?.[0] || "",
    // Price at qty 1 after any live offer; tiers below apply from minQty up
    price: pricing.unitPrice,
    regularPrice: pricing.originalPrice,
    quantityRules: quantityRules.map((r) => ({ minQty: r.minQty, price: r.price })),
    stock: availableStock(source),
  };
}

/**
 * Find sellable lines by title or SKU. An exact SKU (a barcode scan) returns
 * just that line, so the dashboard can add it to the bill straight away.
 */
async function searchSellableItems(rawQuery, limit = 20, { browse = false, category } = {}) {
  const q = typeof rawQuery === "string" ? rawQuery.trim() : "";
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);
  const sellableTypes = [PRODUCT_TYPES.SIMPLE, PRODUCT_TYPES.CONFIGURABLE];
  const base = { status: "published", product_type: { $in: sellableTypes } };

  // Browse (no search text): show products straight away, optionally for one
  // category, so the cashier can tap common items without typing
  if (q.length < 2) {
    if (!browse) return { items: [], exactMatch: false };
    const filter = { ...base };
    if (typeof category === "string" && /^[a-f0-9]{24}$/i.test(category)) {
      filter.category = category;
    }
    const products = await Product.find(filter).sort({ updatedAt: -1 }).limit(safeLimit).lean();
    const items = [];
    for (const product of products) {
      if (product.product_type === PRODUCT_TYPES.CONFIGURABLE) {
        for (const variant of product.variants || []) items.push(toSellable(product, variant));
      } else {
        items.push(toSellable(product, null));
      }
    }
    items.sort((a, b) => Number(b.stock > 0) - Number(a.stock > 0));
    return { items: items.slice(0, safeLimit * 2), exactMatch: false };
  }

  const exactSku = new RegExp(`^${escapeRegex(q)}$`, "i");
  const exact = await Product.findOne({
    ...base,
    $or: [{ sku: exactSku }, { "variants.sku": exactSku }],
  }).lean();

  if (exact) {
    const variant =
      exact.product_type === PRODUCT_TYPES.CONFIGURABLE
        ? exact.variants?.find((v) => exactSku.test(v.sku || ""))
        : null;
    // A configurable's own SKU matched: offer all its variants instead
    if (exact.product_type !== PRODUCT_TYPES.CONFIGURABLE || variant) {
      return { items: [toSellable(exact, variant)], exactMatch: true };
    }
  }

  const regex = new RegExp(escapeRegex(q), "i");
  const products = await Product.find({
    ...base,
    $or: [{ title: regex }, { sku: regex }, { "variants.sku": regex }],
  })
    .limit(safeLimit)
    .lean();

  const items = [];
  for (const product of products) {
    if (product.product_type === PRODUCT_TYPES.CONFIGURABLE) {
      for (const variant of product.variants || []) items.push(toSellable(product, variant));
    } else {
      items.push(toSellable(product, null));
    }
  }
  // Sellable lines first, so sold-out variants never crowd them past the cap
  items.sort((a, b) => Number(b.stock > 0) - Number(a.stock > 0));
  return { items: items.slice(0, safeLimit * 4), exactMatch: false };
}

/** Store details and GST display flags the receipt needs. */
async function getPosConfig() {
  const [seller, gst, chargeTypes, sources, categories] = await Promise.all([
    getSellerAddress(),
    getGstSettings(),
    getChargeTypes(),
    getSources(),
    getBrowseCategories(),
  ]);
  return {
    store: {
      businessName: seller.businessName || "",
      addressLines: [
        [seller.houseName, seller.street].filter(Boolean).join(", "),
        [seller.city, seller.state, seller.pincode].filter(Boolean).join(", "),
      ].filter(Boolean),
      phone: seller.phone || "",
      email: seller.email || "",
      gstin: seller.gstin || "",
    },
    gst: { enabled: gst.enabled, display: gst.display.invoice },
    paymentMethods: POS_PAYMENT_METHODS,
    // Only the ones the till can use right now
    charges: chargeTypes.filter((c) => c.active),
    // Customer sources the cashier picks from (one is required per sale)
    sources: sources.filter((s) => s.active),
    // Category chips for browsing: the ones with the most sellable products
    categories,
  };
}

/** Up to 12 categories with the most sellable products, biggest first. */
async function getBrowseCategories() {
  const rows = await Product.aggregate([
    {
      $match: {
        status: "published",
        product_type: { $in: [PRODUCT_TYPES.SIMPLE, PRODUCT_TYPES.CONFIGURABLE] },
        category: { $ne: null },
      },
    },
    { $group: { _id: "$category", fallbackName: { $first: "$categoryName" }, count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 12 },
    { $lookup: { from: "categories", localField: "_id", foreignField: "_id", as: "cat" } },
  ]);
  return rows
    .map((r) => ({
      id: String(r._id),
      name: String(r.cat?.[0]?.name || r.fallbackName || "").trim(),
      count: r.count,
    }))
    .filter((c) => c.name);
}

function parseLines(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new PosError("ITEMS_REQUIRED", "Add at least one item to the bill");
  }
  if (rawItems.length > MAX_LINES) {
    throw new PosError("TOO_MANY_ITEMS", `A bill can have at most ${MAX_LINES} lines`);
  }

  // Merge repeated lines so stock is checked against the combined quantity
  const merged = new Map();
  for (const raw of rawItems) {
    const productId = typeof raw?.productId === "string" ? raw.productId : "";
    const variantId = typeof raw?.variantId === "string" && raw.variantId ? raw.variantId : null;
    const quantity = Number(raw?.quantity);
    if (!/^[a-f0-9]{24}$/i.test(productId)) {
      throw new PosError("INVALID_ITEM", "Invalid product in the bill");
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_LINE_QTY) {
      throw new PosError("INVALID_QUANTITY", `Quantity must be between 1 and ${MAX_LINE_QTY}`);
    }
    const key = `${productId}:${variantId || ""}`;
    const line = merged.get(key) || { productId, variantId, quantity: 0 };
    line.quantity += quantity;
    if (line.quantity > MAX_LINE_QTY) {
      throw new PosError("INVALID_QUANTITY", `Quantity must be between 1 and ${MAX_LINE_QTY}`);
    }
    merged.set(key, line);
  }
  return [...merged.values()];
}

function parseBillDiscount(raw, itemsTotal) {
  if (!raw || raw.value === undefined || raw.value === null || raw.value === "") return null;
  const type = raw.type === "percent" ? "percent" : raw.type === "flat" ? "flat" : null;
  const value = Number(raw.value);
  if (!type || !Number.isFinite(value) || value < 0) {
    throw new PosError("INVALID_DISCOUNT", "Enter a valid discount");
  }
  if (value === 0) return null;
  if (type === "percent" && value > 100) {
    throw new PosError("INVALID_DISCOUNT", "Discount can't be more than 100%");
  }
  const amount = type === "percent" ? round2((itemsTotal * value) / 100) : round2(value);
  if (amount > itemsTotal) {
    throw new PosError("INVALID_DISCOUNT", "Discount can't be more than the bill total");
  }
  return { type, value, amount };
}

/** Price every line from the database; the client's prices are never trusted. */
async function priceLines(lines) {
  const ids = [...new Set(lines.map((l) => l.productId))];
  const products = await Product.find({ _id: { $in: ids } }).lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));

  let subtotal = 0;
  let itemsTotal = 0;
  const orderItems = [];

  for (const line of lines) {
    const product = byId.get(line.productId);
    if (!product || product.status !== "published") {
      throw new PosError("PRODUCT_NOT_AVAILABLE", "A product in the bill is no longer available");
    }
    if (product.product_type === PRODUCT_TYPES.BUNDLE) {
      throw new PosError("BUNDLE_NOT_SUPPORTED", `"${product.title}" is a bundle and can't be sold at the counter`);
    }

    let variant = null;
    if (product.product_type === PRODUCT_TYPES.CONFIGURABLE) {
      variant = product.variants?.find((v) => v.id === line.variantId);
      if (!variant) {
        throw new PosError("VARIANT_REQUIRED", `Pick a size/colour for "${product.title}"`);
      }
    } else if (line.variantId) {
      throw new PosError("INVALID_ITEM", `"${product.title}" has no variants`);
    }

    const stock = availableStock(variant || product);
    if (stock < line.quantity) {
      throw new PosError(
        "OUT_OF_STOCK",
        `Only ${stock} left of "${product.title}${variant?.name ? ` - ${variant.name}` : ""}"`,
        409,
        { productId: line.productId, variantId: line.variantId, available: stock },
      );
    }

    const pricing = computeCartItemPricing(product, variant, line.quantity);
    subtotal += pricing.originalPrice * line.quantity;
    itemsTotal += pricing.unitPrice * line.quantity;

    orderItems.push({
      productId: product._id,
      variantId: variant ? variant.id : null,
      quantity: line.quantity,
      price: pricing.unitPrice,
      regularPrice: pricing.originalPrice,
      gstRate: product.gstRate ?? null,
      hsnCode: product.hsnCode || "",
      name: product.title || product.name,
      sku: product.sku,
      image: product.images?.[0] || "",
      urlKey: product.url_key,
      variantName: variant ? variant.name || null : null,
      variantSku: variant ? variant.sku : null,
      variantImage: variant ? variant.images?.[0] || product.images?.[0] : null,
      variantUrlKey: variant ? variant.url_key || product.url_key : null,
      variantAttributes: variant?.attributes || undefined,
    });
  }

  return { orderItems, subtotal: round2(subtotal), itemsTotal: round2(itemsTotal) };
}

function stockUpdateFor(item, direction) {
  const qty = direction * item.quantity;
  if (item.variantId) {
    return {
      filter: { _id: item.productId, "variants.id": item.variantId },
      update: { $inc: { "variants.$.stockObj.available": qty, "variants.$.stock": qty } },
    };
  }
  return {
    filter: { _id: item.productId },
    update: { $inc: { "stockObj.available": qty, stock: qty } },
  };
}

/** Put back stock taken for a sale that didn't go through. */
async function releaseStock(items) {
  if (items.length === 0) return;
  await Product.bulkWrite(
    items.map((item) => ({ updateOne: stockUpdateFor(item, 1) })),
    { ordered: false },
  );
}

/**
 * Take stock for every line. Each decrement only matches while enough stock
 * is left, so two tills can't sell the last unit twice; if any line fails,
 * the lines already taken are put back.
 */
async function reserveStock(orderItems) {
  // Items that only carry the legacy `stock` count are shown as in stock;
  // copy that count into stockObj.available so the decrement can match it
  await backfillLegacyStock(
    orderItems.map((item) => ({ productId: item.productId, variantId: item.variantId || null })),
  );
  const taken = [];
  try {
    for (const item of orderItems) {
      const { update } = stockUpdateFor(item, -1);
      const filter = item.variantId
        ? {
            _id: item.productId,
            variants: {
              $elemMatch: { id: item.variantId, "stockObj.available": { $gte: item.quantity } },
            },
          }
        : { _id: item.productId, "stockObj.available": { $gte: item.quantity } };

      const result = await Product.updateOne(filter, update);
      if (result.modifiedCount !== 1) {
        throw new PosError("OUT_OF_STOCK", `"${item.name}" just sold out`, 409, {
          productId: String(item.productId),
          variantId: item.variantId,
        });
      }
      taken.push(item);
    }
  } catch (err) {
    await releaseStock(taken);
    throw err;
  }
  return taken;
}

function parseCustomer(raw) {
  const name = typeof raw?.name === "string" ? raw.name.trim().slice(0, 100) : "";
  const phone = typeof raw?.phone === "string" ? raw.phone.replace(/[\s-]/g, "") : "";
  if (phone && !/^\+?\d{7,15}$/.test(phone)) {
    throw new PosError("INVALID_PHONE", "Enter a valid phone number");
  }
  return { name, phone };
}

/**
 * Ring up a counter sale.
 * @returns {Promise<{ order: object, idempotent: boolean }>}
 */
async function createPosSale({ body, cashierId, cashierRole, idempotencyKey }) {
  if (!idempotencyKey || typeof idempotencyKey !== "string") {
    throw new PosError("MISSING_IDEMPOTENCY_KEY", "Idempotency-Key header is required");
  }
  // A retried request (double click, network retry) returns the first sale
  const existing = await Order.findOne({ idempotencyKey }).lean();
  if (existing) {
    if (existing.channel !== "pos") {
      throw new PosError("IDEMPOTENCY_CONFLICT", "This key belongs to another order", 409);
    }
    return { order: existing, idempotent: true };
  }

  const paymentMethod = body?.paymentMethod;
  if (!POS_PAYMENT_METHODS.includes(paymentMethod)) {
    throw new PosError("INVALID_PAYMENT_METHOD", "Choose Cash, UPI or Card");
  }

  const lines = parseLines(body?.items);
  const customer = parseCustomer(body?.customer);
  // How the customer found the store: required, no default, so the numbers
  // reflect what the cashier actually asked
  let source;
  try {
    source = resolveSaleSource(body?.source, await getSources());
  } catch (err) {
    if (err instanceof SourceError) throw new PosError(err.code, err.message, err.status);
    throw err;
  }
  const { orderItems, subtotal, itemsTotal } = await priceLines(lines);
  const billDiscount = parseBillDiscount(body?.discount, itemsTotal);
  const billDiscountAmount = billDiscount?.amount || 0;
  const afterDiscount = round2(itemsTotal - billDiscountAmount);

  // Charges come after the discount (a discount never reduces shipping) and
  // are priced from the store's settings, not from what the till sent.
  let billCharges;
  try {
    billCharges = resolveBillCharges(body?.charges, await getChargeTypes(), {
      base: afterDiscount,
      canOverride: hasPermission(cashierRole, "override:pos_charges"),
    });
  } catch (err) {
    if (err instanceof ChargeError) throw new PosError(err.code, err.message, err.status);
    throw err;
  }
  const totalAmount = round2(afterDiscount + billCharges.total);

  // The cashier collects what the screen showed; refuse if the server's total
  // moved (an offer ended, a price was edited) so the drawer never comes up short.
  if (body?.expectedTotal !== undefined && body.expectedTotal !== null) {
    const expected = Number(body.expectedTotal);
    if (!Number.isFinite(expected) || Math.abs(expected - totalAmount) > 0.01) {
      throw new PosError("TOTAL_CHANGED", `Prices changed: the bill total is now ₹${totalAmount}. Please review and charge again.`, 409, { totalAmount });
    }
  }

  let amountTendered = null;
  let changeDue = null;
  if (paymentMethod === PAYMENT_METHODS.CASH) {
    amountTendered = round2(body?.amountTendered ?? totalAmount);
    if (!Number.isFinite(amountTendered) || amountTendered < totalAmount) {
      throw new PosError("INSUFFICIENT_TENDER", "Cash received is less than the bill total");
    }
    changeDue = round2(amountTendered - totalAmount);
  }
  const paymentReference =
    typeof body?.paymentReference === "string" ? body.paymentReference.trim().slice(0, 100) : "";
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 500) : "";

  const [cashier, seller] = await Promise.all([
    User.findById(cashierId).select("username email").lean(),
    getSellerAddress(),
  ]);

  // Sold over the counter, so the place of supply is the store's own state
  const gstResult = await buildOrderGst({
    items: orderItems,
    couponDiscount: billDiscountAmount,
    // Only taxable charges carry GST (inclusive, at the highest item rate)
    shippingCost: billCharges.taxableShipping,
    codCost: 0,
    otherCharges: billCharges.taxableOther,
    customerState: seller.state,
  });

  const taken = await reserveStock(orderItems);

  let order;
  try {
    const now = new Date();
    const orderDoc = {
      channel: "pos",
      userId: null,
      isGuestOrder: false,
      idempotencyKey,
      items: gstResult ? gstResult.items : orderItems,
      gst: gstResult ? gstResult.gst : undefined,
      totalQuantity: orderItems.reduce((sum, i) => sum + i.quantity, 0),
      subtotal,
      shippingCost: billCharges.shippingCost,
      codCost: 0,
      otherCharges: billCharges.otherCharges,
      discount: round2(subtotal - itemsTotal + billDiscountAmount),
      totalAmount,
      shippingAddress: {
        fullName: customer.name || WALK_IN_NAME,
        name: customer.name || WALK_IN_NAME,
        phone: customer.phone,
        city: seller.city || "",
        state: seller.state || "",
        pincode: seller.pincode || "",
        country: seller.country || "",
      },
      paymentMethod,
      paymentStatus: "paid",
      orderStatus: "delivered",
      placedAt: now,
      statusHistory: [
        { status: "delivered", timestamp: now, note: "In-store sale (POS)", updatedBy: cashierId },
      ],
      pos: {
        cashierId,
        cashierName: cashier?.username || cashier?.email || "",
        billDiscount: billDiscount || undefined,
        amountTendered,
        changeDue,
        paymentReference,
        note,
        charges: billCharges.charges.length ? billCharges.charges : undefined,
        source,
      },
    };

    // An 8-character order number can collide with an existing one; pick a
    // fresh number instead of failing the sale at the counter
    for (let attempt = 1; ; attempt += 1) {
      try {
        order = await Order.create({ ...orderDoc, orderId: generateOrderId() });
        break;
      } catch (createErr) {
        if (!isOrderIdCollision(createErr) || attempt >= ORDER_ID_ATTEMPTS) throw createErr;
      }
    }

    await Payment.create({
      orderId: order._id,
      userId: null,
      amount: totalAmount,
      method: paymentMethod,
      status: "success",
      transactionId: paymentReference || undefined,
    });
  } catch (err) {
    if (order) await Order.deleteOne({ _id: order._id }).catch(() => {});
    await releaseStock(taken);
    // Lost a race with a retry carrying the same key: hand back that sale
    if (err?.code === 11000 && err?.keyPattern?.idempotencyKey) {
      const winner = await Order.findOne({ idempotencyKey }).lean();
      if (winner) return { order: winner, idempotent: true };
    }
    throw err;
  }

  invalidateOrderReportCaches("pos sale");

  if (order.gst) {
    try {
      await ensureInvoiceNumber(order._id);
    } catch (err) {
      logger.error("[POS] Invoice number not assigned", { orderId: order.orderId, message: err.message });
    }
  }

  return { order: await Order.findById(order._id).lean(), idempotent: false };
}

module.exports = {
  PosError,
  searchSellableItems,
  getPosConfig,
  createPosSale,
};
