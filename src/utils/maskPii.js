/**
 * Mask an email for logs: "eldho.shaju@gmail.com" -> "el***@gmail.com".
 * Enough to tell log lines apart, without storing the customer's address
 * in pm2/server logs.
 */
const maskEmail = (email) => {
  if (!email || typeof email !== "string") return "[none]";
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf("@");
  if (at < 1) return "***";
  const local = trimmed.slice(0, at);
  return `${local.slice(0, Math.min(2, local.length))}***${trimmed.slice(at)}`;
};

module.exports = { maskEmail };
