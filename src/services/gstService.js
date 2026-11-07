// services/gstService.js
// GST settings, the per-order GST snapshot, and invoice numbering.
const SiteSetting = require("../models/SiteSetting");
const Order = require("../models/Order");
const InvoiceCounter = require("../models/InvoiceCounter");
const logger = require("../utils/logger");
const {
  SITE_SETTING_KEYS,
  GST_DISPLAY_PLACES,
  GST_DISPLAY_FIELDS,
  DEFAULT_GST_DISPLAY,
  getDefaultSiteSettingValue,
} = require("../config/siteSettingRegistry");
const {
  calculateOrderGst,
  displayState,
  financialYearLabel,
  formatInvoiceNumber,
} = require("../features/order/rules/gst.rules");

/**
 * Merge a stored GST setting with defaults so every place/field is a boolean,
 * whatever partial value the dashboard saved.
 */
function normalizeGstSettings(raw) {
  const defaults = getDefaultSiteSettingValue(SITE_SETTING_KEYS.TAX_GST);
  const value = raw && typeof raw === "object" ? raw : {};
  const display = {};
  for (const place of GST_DISPLAY_PLACES) {
    const stored = value.display?.[place] || {};
    display[place] = {};
    for (const field of GST_DISPLAY_FIELDS) {
      display[place][field] =
        typeof stored[field] === "boolean" ? stored[field] : DEFAULT_GST_DISPLAY[place][field];
    }
  }
  const rate = Number(value.defaultRate);
  return {
    enabled: value.enabled === true,
    defaultRate: Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : defaults.defaultRate,
    invoicePrefix:
      typeof value.invoicePrefix === "string" && value.invoicePrefix.trim()
        ? value.invoicePrefix.trim()
        : defaults.invoicePrefix,
    display,
  };
}

async function getGstSettings() {
  const setting = await SiteSetting.findOne({ key: SITE_SETTING_KEYS.TAX_GST }).lean();
  return normalizeGstSettings(setting?.value);
}

async function getSellerAddress() {
  const setting = await SiteSetting.findOne({
    key: SITE_SETTING_KEYS.ORDER_FROM_ADDRESS,
  }).lean();
  return setting?.value || {};
}

/**
 * Work out the GST snapshot for a new order. Returns null when GST is off, so
 * the order is saved exactly as before.
 *
 * @param {object} params
 * @param {Array} params.items Order items; each carries `gstRate` / `hsnCode`
 *   copied from its product.
 * @returns {Promise<null | { gst: object, items: Array }>} `items` are the
 *   same items with taxableValue/taxAmount/gstRate filled in.
 */
async function buildOrderGst({ items, couponDiscount, shippingCost, codCost, otherCharges = 0, customerState }) {
  const settings = await getGstSettings();
  if (!settings.enabled) return null;

  const seller = await getSellerAddress();
  const result = calculateOrderGst({
    items,
    couponDiscount,
    shippingCost,
    codCost,
    otherCharges,
    defaultRate: settings.defaultRate,
    sellerState: seller.state,
    customerState,
  });

  if (result.sellerStateMissing) {
    logger.warn(
      "[GST] Invoice From Address has no state; treating orders as same-state (CGST + SGST).",
    );
  }

  return {
    gst: {
      pricesIncludeTax: true,
      sellerGstin: seller.gstin || "",
      sellerState: displayState(seller.state || ""),
      placeOfSupply: displayState(customerState || ""),
      supplyType: result.supplyType,
      taxableValue: result.taxableValue,
      totalTax: result.totalTax,
      cgst: result.cgst,
      sgst: result.sgst,
      igst: result.igst,
      chargesRate: result.chargesRate,
      chargesTaxableValue: result.chargesTaxableValue,
      chargesTax: result.chargesTax,
      invoiceNumber: null,
      invoiceDate: null,
    },
    items: items.map((item, i) => ({
      ...item,
      gstRate: result.items[i].gstRate,
      taxableValue: result.items[i].taxableValue,
      taxAmount: result.items[i].taxAmount,
    })),
  };
}

/**
 * Give a GST order its invoice number the first time an invoice is issued
 * (invoice email or PDF). Numbers run per Indian financial year and never
 * repeat. Orders without a GST snapshot get none.
 *
 * @returns {Promise<string|null>} the order's invoice number
 */
async function ensureInvoiceNumber(orderId) {
  const order = await Order.findById(orderId).select("gst").lean();
  if (!order?.gst) return null;
  if (order.gst.invoiceNumber) return order.gst.invoiceNumber;

  const settings = await getGstSettings();
  const now = new Date();
  const fy = financialYearLabel(now);
  const counter = await InvoiceCounter.findOneAndUpdate(
    { _id: fy },
    { $inc: { seq: 1 } },
    { new: true, upsert: true },
  );
  const invoiceNumber = formatInvoiceNumber(settings.invoicePrefix, fy, counter.seq);

  // Only set it if no concurrent call got there first.
  const updated = await Order.findOneAndUpdate(
    { _id: orderId, "gst.invoiceNumber": null },
    { $set: { "gst.invoiceNumber": invoiceNumber, "gst.invoiceDate": now } },
    { new: true },
  ).select("gst.invoiceNumber").lean();

  if (updated) return updated.gst.invoiceNumber;

  // Lost the race: the other call's number stands. This one leaves a gap in
  // the series, which is logged so it can be explained to an accountant.
  logger.warn(`[GST] Invoice number ${invoiceNumber} unused (concurrent assignment)`, {
    orderId: String(orderId),
  });
  const current = await Order.findById(orderId).select("gst.invoiceNumber").lean();
  return current?.gst?.invoiceNumber || null;
}

module.exports = {
  normalizeGstSettings,
  getGstSettings,
  getSellerAddress,
  buildOrderGst,
  ensureInvoiceNumber,
};
