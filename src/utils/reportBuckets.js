/**
 * Time buckets for report charts, in IST. Shared so every report buckets the
 * same way:
 *   - "hour"  for a single IST day (one daily bucket would be a one-dot chart)
 *   - "month" for ranges longer than ~3 months
 *   - "day"   otherwise
 * Keys: "YYYY-MM-DDTHH:00" (hour), "YYYY-MM-DD" (day), "YYYY-MM-01" (month).
 * Grouping with $year/$month/$dayOfMonth would use UTC, putting orders placed
 * 00:00-05:30 IST on the previous day; $dateToString with a timezone doesn't.
 */
const TZ = "Asia/Kolkata";
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const istYmd = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
const istHour = (d) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(d);

function pickGranularity(start, end, monthAfterDays = 95) {
  if (istYmd(start) === istYmd(end)) return "hour";
  const rangeDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS));
  return rangeDays > monthAfterDays ? "month" : "day";
}

/** Aggregation expression for the bucket key of `$createdAt`. */
const bucketIdExpr = (granularity) =>
  granularity === "month"
    ? { $concat: [{ $dateToString: { format: "%Y-%m", date: "$createdAt", timezone: TZ } }, "-01"] }
    : granularity === "hour"
      ? { $dateToString: { format: "%Y-%m-%dT%H:00", date: "$createdAt", timezone: TZ } }
      : { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: TZ } };

/**
 * Every bucket key in [start, end], including empty ones, so quiet periods
 * show as zero (and averages divide by calendar periods, not active ones).
 * Hourly buckets stop at the current hour rather than drawing future zeros.
 */
function bucketKeys(start, end, granularity) {
  const keys = [];
  const seen = new Set();
  const keyOf = (d) => {
    const ymd = istYmd(d);
    if (granularity === "month") return `${ymd.slice(0, 7)}-01`;
    if (granularity === "hour") return `${ymd}T${istHour(d)}:00`;
    return ymd;
  };
  const add = (d) => {
    const key = keyOf(d);
    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  };
  const last = granularity === "hour" ? Math.min(end.getTime(), Date.now()) : end.getTime();
  const step = granularity === "hour" ? HOUR_MS : DAY_MS;
  for (let t = start.getTime(); t <= last; t += step) add(new Date(t));
  add(new Date(last));
  return keys;
}

module.exports = { TZ, HOUR_MS, DAY_MS, istYmd, pickGranularity, bucketIdExpr, bucketKeys };
