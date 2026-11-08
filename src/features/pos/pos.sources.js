// features/pos/pos.sources.js
// Where a counter customer found the store (Walk-in, WhatsApp, Instagram...).
//
// The list lives in one site setting (`pos.sources`) that only roles with
// "manage:pos_settings" can change. Every POS sale must name an active source;
// the server stores a copy on the order so renaming a source later never
// rewrites old bills. Online orders don't use this (they come from the site).
const SiteSetting = require("../../models/SiteSetting");
const { SITE_SETTING_KEYS } = require("../../config/siteSettingRegistry");

const POS_SOURCES_KEY = SITE_SETTING_KEYS.POS_SOURCES;
const MAX_SOURCES = 20;
const MAX_NOTE = 60;
const CODE_RE = /^[a-z0-9_]{2,30}$/;

/** Used until an owner saves their own list. "other" asks for a short note. */
const DEFAULT_SOURCES = [
  { code: "walkin", name: "Walk-in", requiresNote: false, active: true },
  { code: "whatsapp", name: "WhatsApp", requiresNote: false, active: true },
  { code: "instagram", name: "Instagram", requiresNote: false, active: true },
  { code: "facebook", name: "Facebook", requiresNote: false, active: true },
  { code: "phone", name: "Phone call", requiresNote: false, active: true },
  { code: "other", name: "Other", requiresNote: true, active: true },
];

class SourceError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/** Validate a full list from the settings screen; list order = display order. */
function normalizeSources(raw) {
  if (!Array.isArray(raw)) throw new SourceError("INVALID_SOURCE", "Sources must be a list");
  if (raw.length > MAX_SOURCES) throw new SourceError("INVALID_SOURCE", `At most ${MAX_SOURCES} sources`);
  const seen = new Set();
  const list = raw.map((item) => {
    const code = typeof item?.code === "string" ? item.code.trim().toLowerCase() : "";
    const name = typeof item?.name === "string" ? item.name.trim().slice(0, 30) : "";
    if (!CODE_RE.test(code)) {
      throw new SourceError("INVALID_SOURCE", "Each source needs a code of 2-30 lowercase letters, digits or _");
    }
    if (seen.has(code)) throw new SourceError("INVALID_SOURCE", `Duplicate source code "${code}"`);
    seen.add(code);
    if (!name) throw new SourceError("INVALID_SOURCE", `Source "${code}" needs a name`);
    return { code, name, requiresNote: item?.requiresNote === true, active: item?.active !== false };
  });
  if (!list.some((s) => s.active)) {
    throw new SourceError("INVALID_SOURCE", "Keep at least one source active, or the till can't make a sale");
  }
  return list;
}

/** All sources, including inactive ones, for the settings screen. */
async function getSources() {
  const setting = await SiteSetting.findOne({ key: POS_SOURCES_KEY }).lean();
  if (!Array.isArray(setting?.value)) return DEFAULT_SOURCES.map((s) => ({ ...s }));
  try {
    return normalizeSources(setting.value);
  } catch {
    // A broken hand-edited value must not stop the till
    return DEFAULT_SOURCES.map((s) => ({ ...s }));
  }
}

async function saveSources(raw) {
  const value = normalizeSources(raw);
  await SiteSetting.findOneAndUpdate(
    { key: POS_SOURCES_KEY },
    {
      $set: { value },
      $setOnInsert: {
        type: "json",
        scope: "order",
        isPublic: false,
        description: "How counter customers found the store (Walk-in, WhatsApp, Instagram...).",
      },
    },
    { upsert: true, runValidators: true },
  );
  return value;
}

/**
 * Check the source sent with a sale.
 * @param {{code?:string, note?:string}|undefined} raw
 * @returns {{code:string, name:string, note:string}}
 */
function resolveSaleSource(raw, sources) {
  const code = typeof raw?.code === "string" ? raw.code.trim() : "";
  if (!code) throw new SourceError("SOURCE_REQUIRED", "Choose how the customer found the store");
  const def = sources.find((s) => s.active && s.code === code);
  if (!def) throw new SourceError("INVALID_SOURCE", "That customer source is no longer available");
  const note = typeof raw?.note === "string" ? raw.note.trim().slice(0, MAX_NOTE) : "";
  if (def.requiresNote && !note) {
    throw new SourceError("SOURCE_NOTE_REQUIRED", `Add a few words about "${def.name}"`);
  }
  return { code: def.code, name: def.name, note };
}

/**
 * Every source a report might filter by: the configured list (active or not)
 * plus any code still on past sales after it was deleted from the list.
 * @returns {Promise<Array<{code:string, name:string, active:boolean}>>}
 */
async function getSourceFilterOptions() {
  // Lazy require: Order pulls in a lot; only reports need it here
  const Order = require("../../models/Order");
  const [configured, used] = await Promise.all([
    getSources(),
    Order.aggregate([
      { $match: { channel: "pos", "pos.source.code": { $exists: true } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: "$pos.source.code", name: { $first: "$pos.source.name" } } },
    ]),
  ]);
  const options = configured.map((s) => ({ code: s.code, name: s.name, active: s.active }));
  const known = new Set(options.map((o) => o.code));
  for (const row of used) {
    if (row._id && !known.has(row._id)) {
      options.push({ code: row._id, name: row.name || row._id, active: false });
    }
  }
  return options;
}

module.exports = {
  getSourceFilterOptions,
  POS_SOURCES_KEY,
  DEFAULT_SOURCES,
  SourceError,
  normalizeSources,
  getSources,
  saveSources,
  resolveSaleSource,
};
