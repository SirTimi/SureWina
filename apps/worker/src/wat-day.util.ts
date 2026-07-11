const WAT_OFFSET_MS = 60 * 60 * 1000;

// The WAT calendar date (as a UTC-midnight Date, matching @db.Date) for a
// given instant, and the UTC bounds of that WAT day.
export function watDayOf(instant: Date): { periodDate: Date; startUtc: Date; endUtc: Date } {
  const wat = new Date(instant.getTime() + WAT_OFFSET_MS);
  wat.setUTCHours(0, 0, 0, 0);
  const startUtc = new Date(wat.getTime() - WAT_OFFSET_MS);
  return {
    periodDate: new Date(wat), // date-only semantics
    startUtc,
    endUtc: new Date(startUtc.getTime() + 86_400_000),
  };
}

export function previousWatDay(instant: Date) {
  return watDayOf(new Date(instant.getTime() - 86_400_000));
}