// Re-exports from mediaServer so category routes don't need changes.
const { mediaParser: categoryImageUploader } = require('./mediaServer');
module.exports = { categoryImageUploader };
