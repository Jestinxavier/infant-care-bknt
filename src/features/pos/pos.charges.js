// features/pos/pos.charges.js
// Extra charges at the counter (Shipping, Gift wrapping, ...).
//
// The store's charge types live in one site setting (`pos.charges`) that only
// roles with "manage:pos_settings" can change. A sale names the types it uses;
// the server looks each one up and works out the amount, so the cashier can't
// invent a charge or change a locked price.
const SiteSetting = require("../../models/SiteSetting");
const { SITE_SETTING_KEYS } = require("../../config/siteSettingRegistry");

const POS_CHARGES_KEY = SITE_SETTING_KEYS.POS_CHARGES;
const MAX_CHARGE_TYPES = 10;
const MAX_FLAT_AMOUNT = 100000; // ₹ per charge
const CODE_RE = /^[a-z0-9_]{2,30}$/;

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Used until an owner saves their own list. */
const DEFAULT_CHARGE_TYPES = [
  {
    code: "shipping",
    name: "Shipping",
    kind: "shipping", // stored in order.shippingCost, so invoices/reports show it
    type: "flat",
    value: 0,
    editable: true,
    taxable: true,
    active: true,
  },
];

class ChargeError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function checkValue(type, value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw new ChargeError("INVALID_CHARGE", `${label}: enter a valid amount`);
  }
  if (type === "percent" && value > 100) {
    throw new ChargeError("INVALID_CHARGE", `${label}: a percentage can't be more than 100`);
  }
  if (type === "flat" && value > MAX_FLAT_AMOUNT) {
    throw new ChargeError("INVALID_CHARGE", `${label}: can't be more than ₹${MAX_FLAT_AMOUNT}`);
  }
}

/**
 * Validate a full list of charge types from the settings screen.
 * @returns {Array} the cleaned list to store
 */
function normalizeChargeTypes(raw) {
  if (!Array.isArray(raw)) throw new ChargeError("INVALID_CHARGE", "Charges must be a list");
  if (raw.length > MAX_CHARGE_TYPES) {
    throw new ChargeError("INVALID_CHARGE", `At most ${MAX_CHARGE_TYPES} charge types`);
  }
  const seen = new Set();
  let shippingCount = 0;
  return raw.map((item) => {
    const code = typeof item?.code === "string" ? item.code.trim().toLowerCase() : "";
    const name = typeof item?.name === "string" ? item.name.trim().slice(0, 40) : "";
    if (!CODE_RE.test(code)) {
      throw new ChargeError("INVALID_CHARGE", "Each charge needs a code of 2-30 lowercase letters, digits or _");
    }
    if (seen.has(code)) throw new ChargeError("INVALID_CHARGE", `Duplicate charge code "${code}"`);
    seen.add(code);
    if (!name) throw new ChargeError("INVALID_CHARGE", `Charge "${code}" needs a name`);

    const kind = item?.kind === "shipping" ? "shipping" : "other";
    if (kind === "shipping" && ++shippingCount > 1) {
      throw new ChargeError("INVALID_CHARGE", "Only one charge can be the shipping charge");
    }
    const type = item?.type === "percent" ? "percent" : "flat";
    const value = round2(item?.value ?? 0);
    checkValue(type, Number(item?.value ?? 0), name);

    return {
      code,
      name,
      kind,
      type,
      value,
      editable: item?.editable !== false,
      taxable: item?.taxable !== false,
      active: item?.active !== false,
    };
  });
}

/** All charge types (including inactive ones), for the settings screen. */
async function getChargeTypes() {
  const setting = await SiteSetting.findOne({ key: POS_CHARGES_KEY }).lean();
  if (!Array.isArray(setting?.value)) return DEFAULT_CHARGE_TYPES.map((c) => ({ ...c }));
  try {
    return normalizeChargeTypes(setting.value);
  } catch {
    // A hand-edited, broken value must not take the till down
    return [];
  }
}

async function saveChargeTypes(raw) {
  const value = normalizeChargeTypes(raw);
  await SiteSetting.findOneAndUpdate(
    { key: POS_CHARGES_KEY },
    {
      $set: { value },
      $setOnInsert: {
        type: "json",
        scope: "order",
        isPublic: false,
        description: "Extra charges the POS can add to a bill (shipping, gift wrapping...).",
      },
    },
    { upsert: true, runValidators: true },
  );
  return value;
}

/**
 * Work out the charges on one bill.
 * @param {Array<{code:string, value?:number}>} rawCharges what the till sent
 * @param {Array} chargeTypes the store's charge types
 * @param {{ base:number, canOverride:boolean }} opts base = items total after
 *   the bill discount (percent charges apply to it)
 * @returns {{ charges:Array, shippingCost:number, otherCharges:number,
 *   taxableShipping:number, taxableOther:number, total:number }}
 */
function resolveBillCharges(rawCharges, chargeTypes, { base, canOverride }) {
  const empty = { charges: [], shippingCost: 0, otherCharges: 0, taxableShipping: 0, taxableOther: 0, total: 0 };
  if (rawCharges === undefined || rawCharges === null) return empty;
  if (!Array.isArray(rawCharges)) throw new ChargeError("INVALID_CHARGE", "Charges must be a list");
  if (rawCharges.length > MAX_CHARGE_TYPES) {
    throw new ChargeError("INVALID_CHARGE", `A bill can have at most ${MAX_CHARGE_TYPES} charges`);
  }

  const byCode = new Map(chargeTypes.filter((c) => c.active).map((c) => [c.code, c]));
  const used = new Set();
  const result = { ...empty, charges: [] };

  for (const raw of rawCharges) {
    const code = typeof raw?.code === "string" ? raw.code : "";
    const def = byCode.get(code);
    if (!def) throw new ChargeError("INVALID_CHARGE", "A charge on the bill is no longer available");
    if (used.has(code)) throw new ChargeError("INVALID_CHARGE", `"${def.name}" is on the bill twice`);
    used.add(code);

    let value = def.value;
    if (raw.value !== undefined && raw.value !== null && raw.value !== "") {
      const sent = round2(raw.value);
      if (sent !== def.value) {
        if (!def.editable && !canOverride) {
          throw new ChargeError("CHARGE_LOCKED", `"${def.name}" has a fixed amount and can't be changed`, 403);
        }
        checkValue(def.type, Number(raw.value), def.name);
        value = sent;
      }
    }

    const amount = def.type === "percent" ? round2((base * value) / 100) : value;
    if (amount === 0) continue; // a ₹0 charge is just noise on the receipt

    result.charges.push({
      code: def.code,
      name: def.name,
      kind: def.kind,
      type: def.type,
      value,
      amount,
      taxable: def.taxable,
    });
    if (def.kind === "shipping") {
      result.shippingCost = round2(result.shippingCost + amount);
      if (def.taxable) result.taxableShipping = round2(result.taxableShipping + amount);
    } else {
      result.otherCharges = round2(result.otherCharges + amount);
      if (def.taxable) result.taxableOther = round2(result.taxableOther + amount);
    }
  }
  result.total = round2(result.shippingCost + result.otherCharges);
  return result;
}

module.exports = {
  POS_CHARGES_KEY,
  DEFAULT_CHARGE_TYPES,
  ChargeError,
  normalizeChargeTypes,
  getChargeTypes,
  saveChargeTypes,
  resolveBillCharges,
};
