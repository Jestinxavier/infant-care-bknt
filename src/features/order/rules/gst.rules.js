/**
 * GST Rules
 * Pure calculation of the GST contained in an order. Prices in this store
 * already include GST, so tax is worked out from inside what the customer
 * pays; it never changes the order total.
 *
 * - Coupon discounts reduce the taxable value. They are spread across items in
 *   proportion to each item's value.
 * - Shipping and the COD fee are taxed at the highest rate among the order's
 *   (non-free) items.
 * - Same state as the seller → CGST + SGST (half each); otherwise IGST.
 */

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Normalise a state for comparison. Shipping addresses may store
 * "KL_Kerala"-style values, while the seller address is free text.
 */
function normalizeState(state) {
  if (!state || typeof state !== "string") return "";
  const value = state.includes("_") ? state.split("_").slice(1).join("_") : state;
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Display form of a state ("KL_Kerala" → "Kerala"). */
function displayState(state) {
  if (!state || typeof state !== "string") return "";
  return (state.includes("_") ? state.split("_").slice(1).join("_") : state).trim();
}

/** Valid GST rate or null. */
function toRate(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

/**
 * Tax contained in a GST-inclusive amount, rounded to paise.
 * ₹590 at 18% → ₹90.
 */
function taxInsideInclusive(amount, rate) {
  if (!rate || amount <= 0) return 0;
  return round2((amount * rate) / (100 + rate));
}

/**
 * @param {object} params
 * @param {Array<{price:number, quantity:number, gstRate?:number|null, isGift?:boolean}>} params.items
 *   Unit `price` is what the customer pays per unit before coupons.
 * @param {number} params.couponDiscount Total coupon discount on the order.
 * @param {number} params.shippingCost
 * @param {number} params.codCost
 * @param {number} [params.otherCharges] Other taxable charges (POS gift wrap,
 *   packing...). Taxed like shipping: GST-inclusive, at the highest item rate.
 * @param {number} params.defaultRate Store default for items without their own rate.
 * @param {string} params.sellerState
 * @param {string} params.customerState
 * @returns {{
 *   supplyType: "intra"|"inter", sellerStateMissing: boolean,
 *   items: Array<{gstRate:number, taxableValue:number, taxAmount:number}>,
 *   chargesRate: number, chargesTaxableValue: number, chargesTax: number,
 *   taxableValue: number, totalTax: number, cgst: number, sgst: number, igst: number
 * }}
 */
function calculateOrderGst({
  items = [],
  couponDiscount = 0,
  shippingCost = 0,
  codCost = 0,
  otherCharges = 0,
  defaultRate = 0,
  sellerState = "",
  customerState = "",
}) {
  const fallbackRate = toRate(defaultRate) ?? 0;
  const lineValues = items.map((item) =>
    item.isGift ? 0 : round2((Number(item.price) || 0) * (Number(item.quantity) || 0)),
  );
  const itemsValue = lineValues.reduce((a, v) => a + v, 0);
  const coupon = Math.min(Math.max(Number(couponDiscount) || 0, 0), itemsValue);

  // Spread the coupon by value; the last paying line takes the rounding
  // remainder so the shares add up to the coupon exactly.
  const lastPaying = lineValues.reduce((last, v, i) => (v > 0 ? i : last), -1);
  let couponLeft = coupon;
  const lines = items.map((item, i) => {
    const rate = toRate(item.gstRate) ?? fallbackRate;
    let share = 0;
    if (lineValues[i] > 0 && itemsValue > 0) {
      share = i === lastPaying ? couponLeft : round2((coupon * lineValues[i]) / itemsValue);
      couponLeft = round2(couponLeft - share);
    }
    const net = round2(lineValues[i] - share);
    const taxAmount = taxInsideInclusive(net, rate);
    return { gstRate: rate, taxableValue: round2(net - taxAmount), taxAmount };
  });

  const chargesRate = lines.reduce(
    (max, line, i) => (lineValues[i] > 0 && line.gstRate > max ? line.gstRate : max),
    0,
  );
  const charges = round2(
    (Number(shippingCost) || 0) + (Number(codCost) || 0) + (Number(otherCharges) || 0),
  );
  const chargesTax = taxInsideInclusive(charges, chargesRate);
  const chargesTaxableValue = round2(charges - chargesTax);

  const totalTax = round2(lines.reduce((a, l) => a + l.taxAmount, 0) + chargesTax);
  const taxableValue = round2(
    lines.reduce((a, l) => a + l.taxableValue, 0) + chargesTaxableValue,
  );

  // Without a seller state we can't tell inter- from intra-state; treat it as
  // intra-state and flag it so the dashboard can ask for the state.
  const seller = normalizeState(sellerState);
  const customer = normalizeState(customerState);
  const sellerStateMissing = !seller;
  const supplyType = !seller || !customer || seller === customer ? "intra" : "inter";

  const cgst = supplyType === "intra" ? round2(totalTax / 2) : 0;
  const sgst = supplyType === "intra" ? round2(totalTax - cgst) : 0;
  const igst = supplyType === "inter" ? totalTax : 0;

  return {
    supplyType,
    sellerStateMissing,
    items: lines,
    chargesRate,
    chargesTaxableValue,
    chargesTax,
    taxableValue,
    totalTax,
    cgst,
    sgst,
    igst,
  };
}

/** Indian financial year label for a date, in IST: Nov 2026 → "26-27". */
function financialYearLabel(date = new Date()) {
  const [y, m] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
  })
    .format(date)
    .split("-")
    .map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${String(start).slice(-2)}-${String(start + 1).slice(-2)}`;
}

/** INV/26-27/00042 */
function formatInvoiceNumber(prefix, fyLabel, sequence) {
  const cleanPrefix = String(prefix || "INV").trim().replace(/\s+/g, "") || "INV";
  return `${cleanPrefix}/${fyLabel}/${String(sequence).padStart(5, "0")}`;
}

module.exports = {
  calculateOrderGst,
  taxInsideInclusive,
  normalizeState,
  displayState,
  financialYearLabel,
  formatInvoiceNumber,
};
