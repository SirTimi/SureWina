const WAT_OFFSET_MS = 60 * 60 * 1000;

// Ticket sales run 09:00–19:00 WAT. At 19:00 each agent's financial record
// for the day is sealed, so a sale after that hour would land in a record
// that is already closed.
//
// NOTE: apps/worker/src/wat-day.util.ts holds the same close time for the
// sweep. Change both together.
export const SALES_OPEN_MINUTES_WAT = 9 * 60;
export const SALES_CLOSE_MINUTES_WAT = 19 * 60;

function watMinutes(instant: Date): number {
  const wat = new Date(instant.getTime() + WAT_OFFSET_MS);
  return wat.getUTCHours() * 60 + wat.getUTCMinutes();
}

export function isWithinSalesWindow(instant = new Date()): boolean {
  const m = watMinutes(instant);
  return m >= SALES_OPEN_MINUTES_WAT && m < SALES_CLOSE_MINUTES_WAT;
}

const hhmm = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

export function salesWindowMessage(instant = new Date()): string {
  const m = watMinutes(instant);
  return m < SALES_OPEN_MINUTES_WAT
    ? `Ticket sales open at ${hhmm(SALES_OPEN_MINUTES_WAT)}.`
    : `Ticket sales closed at ${hhmm(SALES_CLOSE_MINUTES_WAT)}. They reopen at ${hhmm(
        SALES_OPEN_MINUTES_WAT,
      )} tomorrow.`;
}

// Bounds of the business day whose record carries this period date. Must
// match businessDayOf() in apps/worker/src/wat-day.util.ts — if these drift,
// a day's listed tickets will not reconcile to its sealed figures.
export function businessDayBounds(periodDate: string | Date): {
  startUtc: Date;
  endUtc: Date;
} {
  const d = new Date(periodDate);
  d.setUTCHours(0, 0, 0, 0);
  const endUtc = new Date(
    d.getTime() + SALES_CLOSE_MINUTES_WAT * 60_000 - WAT_OFFSET_MS,
  );
  return { startUtc: new Date(endUtc.getTime() - 86_400_000), endUtc };
}