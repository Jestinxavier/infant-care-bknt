/**
 * Indian mobile numbers only. The store ships within India and couriers,
 * WhatsApp links and invoices all assume +91, so a phone is always stored as
 * the bare 10-digit number (India implied) and shown as "+91 98765 43210".
 *
 * Validation is applied where a phone is *saved* (controllers), not as a
 * schema rule: a schema validator would also re-check old documents on every
 * unrelated save (e.g. an order status change) and fail on legacy values.
 */

const INDIAN_MOBILE = /^[6-9]\d{9}$/;

const INVALID_PHONE_MESSAGE = "Enter a valid 10-digit Indian mobile number";

/**
 * Clean a phone as typed, pasted or autofilled: "+91 98765-43210",
 * "0091 9876543210", "09876543210" -> "9876543210". Only strips a country
 * code / trunk 0 when there are more than 10 digits, so a short (invalid)
 * number is left as typed and fails validation instead of being mangled.
 */
function normalizeIndianPhone(value) {
  if (value === undefined || value === null) return "";
  let digits = String(value).replace(/\D/g, "");
  if (digits.length > 10 && digits.startsWith("0091")) digits = digits.slice(4);
  if (digits.length > 10 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length > 10 && digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

const isValidIndianMobile = (digits) => INDIAN_MOBILE.test(String(digits ?? ""));

/**
 * Normalize and validate in one step.
 * @param {unknown} value raw input
 * @param {{ required?: boolean }} [options]
 * @returns {{ ok: true, phone: string } | { ok: false, message: string }}
 *   phone is "" when the value is empty and not required.
 */
function parseIndianPhone(value, { required = false } = {}) {
  const phone = normalizeIndianPhone(value);
  if (!phone) {
    return required
      ? { ok: false, message: "Phone number is required" }
      : { ok: true, phone: "" };
  }
  if (!isValidIndianMobile(phone)) return { ok: false, message: INVALID_PHONE_MESSAGE };
  return { ok: true, phone };
}

/** "9876543210" -> "+91 98765 43210"; anything else is returned unchanged. */
function formatIndianPhone(value) {
  const phone = normalizeIndianPhone(value);
  return isValidIndianMobile(phone) ? `+91 ${phone.slice(0, 5)} ${phone.slice(5)}` : String(value ?? "");
}

module.exports = {
  INVALID_PHONE_MESSAGE,
  normalizeIndianPhone,
  isValidIndianMobile,
  parseIndianPhone,
  formatIndianPhone,
};
