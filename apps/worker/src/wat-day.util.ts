const WAT_OFFSET_MS = 60 * 60 * 1000;

// Sales close at 19:00 WAT and the day's records seal at the same moment.
// NOTE: apps/api/src/common/sales-window.util.ts holds the same close time
// for the sales guard. Change both together.
export const SALES_CLOSE_MINUTES_WAT = 19 * 60;

// A business day runs from one close to the next, not midnight to midnight.
// In normal operation this groups identically — sales only happen between
// 09:00 and 19:00 — but a sale that somehow lands after close falls into the
// next day's record instead of one that is already sealed.
export function businessDayOf(instant: Date): {
  periodDate: Date;
  startUtc: Date;
  endUtc: Date;
} {
  const wat = new Date(instant.getTime() + WAT_OFFSET_MS);
  const minutes = wat.getUTCHours() * 60 + wat.getUTCMinutes();

  // Past today's close, so we are already accruing into tomorrow's record.
  const shift = minutes >= SALES_CLOSE_MINUTES_WAT ? 1 : 0;

  const periodWat = new Date(wat);
  periodWat.setUTCHours(0, 0, 0, 0);
  periodWat.setUTCDate(periodWat.getUTCDate() + shift);

  const endUtc = new Date(
    periodWat.getTime() + SALES_CLOSE_MINUTES_WAT * 60_000 - WAT_OFFSET_MS,
  );

  return {
    periodDate: new Date(periodWat), // date-only semantics, matches @db.Date
    startUtc: new Date(endUtc.getTime() - 86_400_000),
    endUtc,
  };
}

// The most recent business day whose 19:00 close has passed — the one the
// sweep is allowed to seal.
export function lastClosedBusinessDay(instant: Date) {
  return businessDayOf(new Date(instant.getTime() - 86_400_000));
}