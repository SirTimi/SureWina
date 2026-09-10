const WAT_OFFSET_MS = 60 * 60 * 1000;

// A business day runs from one sales close to the next, not midnight to
// midnight. The close time is passed in rather than fixed: it is the daily
// draw's own cutoff, which an admin sets on the draw template. Hardcoding it
// meant changing the template moved the draw but not the day it belonged to.
//
// Wrapping past midnight is handled by construction — the window is always
// the 24 hours ending at the close, wherever that falls.
export function businessDayOf(
  instant: Date,
  closeMinutesWat: number,
): {
  periodDate: Date;
  startUtc: Date;
  endUtc: Date;
} {
  const wat = new Date(instant.getTime() + WAT_OFFSET_MS);
  const minutes = wat.getUTCHours() * 60 + wat.getUTCMinutes();

  // Past today's close, so we are already accruing into tomorrow's record.
  const shift = minutes >= closeMinutesWat ? 1 : 0;

  const periodWat = new Date(wat);
  periodWat.setUTCHours(0, 0, 0, 0);
  periodWat.setUTCDate(periodWat.getUTCDate() + shift);

  const endUtc = new Date(
    periodWat.getTime() + closeMinutesWat * 60_000 - WAT_OFFSET_MS,
  );

  return {
    periodDate: new Date(periodWat), // date-only semantics, matches @db.Date
    startUtc: new Date(endUtc.getTime() - 86_400_000),
    endUtc,
  };
}

// The most recent business day whose close has passed — the one the sweep is
// allowed to seal.
export function lastClosedBusinessDay(instant: Date, closeMinutesWat: number) {
  return businessDayOf(
    new Date(instant.getTime() - 86_400_000),
    closeMinutesWat,
  );
}