/**
 * Parse a product's GST fields from a create/update request. Values arrive as
 * multipart form strings: an empty rate means "use the store default" (null).
 * Returns only the fields that were sent, so updates leave others untouched.
 * An invalid rate throws a Mongoose-shaped ValidationError, which the product
 * controllers already turn into a 400.
 */
function parseGstFields({ gstRate, hsnCode }) {
  const out = {};
  if (gstRate !== undefined) {
    if (gstRate === null || gstRate === "" || gstRate === "null") {
      out.gstRate = null;
    } else {
      const rate = Number(gstRate);
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
        const message = "GST rate must be a number between 0 and 100";
        const error = new Error(message);
        error.name = "ValidationError";
        error.errors = { gstRate: { message } };
        throw error;
      }
      out.gstRate = rate;
    }
  }
  if (hsnCode !== undefined) {
    out.hsnCode = hsnCode === null ? "" : String(hsnCode).trim().slice(0, 16);
  }
  return out;
}

module.exports = { parseGstFields };
