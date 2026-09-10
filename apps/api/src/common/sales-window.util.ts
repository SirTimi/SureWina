const WAT_OFFSET_MS = 60 * 60 * 1000;

// The sales window guard that used to live here has been removed. It was a
// second, hardcoded opinion about when selling is allowed, sitting in front
// of the check that actually matters — agent-sales.service already refuses a
// sale once draw.cutoffAt has passed, and that cutoff comes from the draw
// template an admin controls. With both in place, changing the template
// silently did nothing: the guard refused the sale before the draw was ever
// consulted.
//
// What remains is the business-day boundary, which the daily record needs and
// the draw does not provide directly.

// Bounds of the business day whose record carries this period date. The close
// time is passed in rather than fixed, because it is the daily draw's own
// sales cutoff — set on the template, changeable by an admin, and the same
// value the sweep seals on. Must match businessDayOf() in
// apps/worker/src/wat-day.util.ts: if these drift, a day's listed tickets
// will not reconcile to its sealed figures.
export function businessDayBounds(
  periodDate: string | Date,
  closeMinutesWat: number,
): {
  startUtc: Date;
  endUtc: Date;
} {
  const d = new Date(periodDate);
  d.setUTCHours(0, 0, 0, 0);
  const endUtc = new Date(
    d.getTime() + closeMinutesWat * 60_000 - WAT_OFFSET_MS,
  );
  return { startUtc: new Date(endUtc.getTime() - 86_400_000), endUtc };
}