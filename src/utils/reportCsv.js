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

function rowsToCsv(rows, columns) {
  const fields = columns.map((c) => ({
    label: c.header,
    value:
      typeof c.value === "function"
        ? c.value
        : (row) => {
            const v = row[c.field];
            return v === null || v === undefined ? "" : v;
          },
  }));
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

module.exports = { wantsCsv, rowsToCsv, sendReportCsv, sanitizeFilename };
