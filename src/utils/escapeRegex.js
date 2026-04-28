/**
 * Escapes a user-supplied string so it is treated as literal text inside a MongoDB $regex.
 * Without this, a value like "(a+)+" causes catastrophic backtracking (ReDoS).
 */
const escapeRegex = (str = "") =>
  String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

module.exports = escapeRegex;
