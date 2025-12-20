const { getCmsContent, getCmsContentByPage } = require("./getCmsContent");
const { updateCmsContent, deleteCmsContent } = require("./updateCmsContent");
const { updateCmsBlock } = require("./updateCmsBlock");

module.exports = {
  getCmsContent,
  getCmsContentByPage,
  updateCmsContent,
  deleteCmsContent,
  updateCmsBlock,
};
