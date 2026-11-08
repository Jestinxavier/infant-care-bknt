// features/pos/pos.admin.controller.js
const posService = require("./pos.service");
const posCharges = require("./pos.charges");
const posSources = require("./pos.sources");
const logger = require("../../utils/logger");

const sendPosError = (res, err, fallbackMessage) => {
  if (err instanceof posService.PosError) {
    return res.status(err.status).json({
      success: false,
      errorCode: err.code,
      message: err.message,
      ...err.details,
    });
  }
  logger.error(fallbackMessage, { message: err?.message });
  return res.status(500).json({ success: false, message: fallbackMessage });
};

/** GET /admin/pos/config */
const getConfig = async (req, res) => {
  try {
    const config = await posService.getPosConfig();
    res.status(200).json({ success: true, ...config });
  } catch (err) {
    sendPosError(res, err, "Failed to load POS settings");
  }
};

/** GET /admin/pos/items?q= */
const searchItems = async (req, res) => {
  try {
    const result = await posService.searchSellableItems(req.query.q, req.query.limit, {
      browse: req.query.browse === "1",
      category: req.query.category,
    });
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    sendPosError(res, err, "Failed to search products");
  }
};

/** POST /admin/pos/sales */
const createSale = async (req, res) => {
  try {
    const { order, idempotent } = await posService.createPosSale({
      body: req.body,
      cashierId: req.user.id,
      cashierRole: req.user.role,
      idempotencyKey: req.headers["idempotency-key"],
    });
    res.status(idempotent ? 200 : 201).json({ success: true, order, idempotent });
  } catch (err) {
    sendPosError(res, err, "Failed to complete the sale");
  }
};

/** GET /admin/pos/charges — every charge type, including inactive ones */
const getCharges = async (req, res) => {
  try {
    res.status(200).json({ success: true, charges: await posCharges.getChargeTypes() });
  } catch (err) {
    sendPosError(res, err, "Failed to load POS charges");
  }
};

/** PUT /admin/pos/charges — replace the list of charge types */
const updateCharges = async (req, res) => {
  try {
    const charges = await posCharges.saveChargeTypes(req.body?.charges);
    logger.info("[POS] Charge types updated", { by: req.user.id, count: charges.length });
    res.status(200).json({ success: true, charges });
  } catch (err) {
    if (err instanceof posCharges.ChargeError) {
      return res.status(err.status).json({ success: false, errorCode: err.code, message: err.message });
    }
    sendPosError(res, err, "Failed to save POS charges");
  }
};

/** GET /admin/pos/sources — every customer source, including inactive ones */
const getSources = async (req, res) => {
  try {
    res.status(200).json({ success: true, sources: await posSources.getSources() });
  } catch (err) {
    sendPosError(res, err, "Failed to load customer sources");
  }
};

/** PUT /admin/pos/sources — replace the list of customer sources */
const updateSources = async (req, res) => {
  try {
    const sources = await posSources.saveSources(req.body?.sources);
    logger.info("[POS] Customer sources updated", { by: req.user.id, count: sources.length });
    res.status(200).json({ success: true, sources });
  } catch (err) {
    if (err instanceof posSources.SourceError) {
      return res.status(err.status).json({ success: false, errorCode: err.code, message: err.message });
    }
    sendPosError(res, err, "Failed to save customer sources");
  }
};

/** GET /admin/pos/source-options — every source, for order filters (view:orders) */
const getSourceOptions = async (req, res) => {
  try {
    res.status(200).json({ success: true, sources: await posSources.getSourceFilterOptions() });
  } catch (err) {
    sendPosError(res, err, "Failed to load customer sources");
  }
};

module.exports = {
  getSourceOptions,
  getConfig,
  searchItems,
  createSale,
  getCharges,
  updateCharges,
  getSources,
  updateSources,
};
