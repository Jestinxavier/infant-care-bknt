// Re-exports from mediaServer so avatar routes don't need changes.
const { mediaParser: avatarParser } = require('./mediaServer');
module.exports = { avatarParser };
