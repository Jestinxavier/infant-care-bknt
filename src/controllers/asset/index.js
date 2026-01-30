const { uploadAsset } = require("./uploadAsset");
const { getAssets } = require("./getAssets");
const { deleteAsset } = require("./deleteAsset");
const { promoteAsset } = require("./promoteAsset");
const { bulkDeleteAssets } = require("./bulkDeleteAssets");

module.exports = {
  uploadAsset,
  getAssets,
  deleteAsset,
  promoteAsset,
  bulkDeleteAssets,
};
