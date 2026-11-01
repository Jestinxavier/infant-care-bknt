const { Parser } = require("json2csv");

function wantsCsv(req) {
  return String(req.query?.format || "").toLowerCase() === "csv";
}

function sanitizeFilename(name, fallback = "report") {
  const cleaned = String(name || "")
    .replace(/\.csv$/i, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return `${cleaned || fallback}.csv`;
}

/**
 * Spreadsheet apps run a cell starting with = + - @ (or tab / CR) as a
 * formula, so customer-controlled text like a name of `=HYPERLINK(...)` would
 * execute when an admin opens the export. Prefix those with a quote so they
 * show as plain text. Numbers are left alone, so negative amounts stay numeric.
 */
function neutralizeCsvFormula(value) {
  if (typeof value !== "string") return value;
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function rowsToCsv(rows, columns) {
  const fields = columns.map((c) => {
    const getValue =
      typeof c.value === "function"
        ? c.value
        : (row) => {
            const v = row[c.field];
            return v === null || v === undefined ? "" : v;
          };
    return {
      label: c.header,
      value: (row) => neutralizeCsvFormula(getValue(row)),
    };
  });
  if (!rows.length) return columns.map((c) => c.header).join(",");
  return new Parser({ fields }).parse(rows);
}

function sendReportCsv(res, rows, columns, filename) {
  const csv = "\uFEFF" + rowsToCsv(rows, columns);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${sanitizeFilename(filename)}"`,
  );
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Row-Count", String(rows.length));
  res.status(200).send(csv);
}

module.exports = {
  wantsCsv,
  rowsToCsv,
  sendReportCsv,
  sanitizeFilename,
  neutralizeCsvFormula,
};
