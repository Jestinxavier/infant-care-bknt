// features/pos/pos.admin.controller.js
const posService = require("./pos.service");
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
      idempotencyKey: req.headers["idempotency-key"],
    });
    res.status(idempotent ? 200 : 201).json({ success: true, order, idempotent });
  } catch (err) {
    sendPosError(res, err, "Failed to complete the sale");
  }
};

module.exports = { getConfig, searchItems, createSale };
