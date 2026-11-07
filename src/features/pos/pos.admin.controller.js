// features/pos/pos.admin.controller.js
const posService = require("./pos.service");
const posCharges = require("./pos.charges");
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
    const result = await posService.searchSellableItems(req.query.q, req.query.limit);
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

module.exports = { getConfig, searchItems, createSale, getCharges, updateCharges };
