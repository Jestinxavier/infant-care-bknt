// models/InvoiceCounter.js
// One document per financial year ("26-27") holding the last invoice sequence
// issued. Incremented atomically so invoice numbers never repeat.
const mongoose = require("mongoose");

const invoiceCounterSchema = new mongoose.Schema(
  {
    _id: { type: String }, // financial year label, e.g. "26-27"
    seq: { type: Number, default: 0 },
  },
  { collection: "invoiceCounters", versionKey: false },
);

module.exports = mongoose.model("InvoiceCounter", invoiceCounterSchema);
