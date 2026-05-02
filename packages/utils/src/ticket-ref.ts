const TICKET_REF_REGEX = /^RD-(\d{8})-(\d{6})$/;

export interface ParsedTicketRef {
  full: string;
  dateString: string;
  date: Date;
  sequence: number;
}

export function parseTicketRef(ref: string): ParsedTicketRef | null {
  if (!ref) return null;
  const match = TICKET_REF_REGEX.exec(ref.toUpperCase());
  if (!match) return null;

  const dateString = match[1];
  const sequence = parseInt(match[2], 10);
  const year = parseInt(dateString.slice(0, 4), 10);
  const month = parseInt(dateString.slice(4, 6), 10);
  const day = parseInt(dateString.slice(6, 8), 10);

  if (year < 2025 || year > 2100) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return { full: ref.toUpperCase(), dateString, date, sequence };
}

export function isValidTicketRef(ref: string): boolean {
  return parseTicketRef(ref) !== null;
}

export function formatTicketRef(date: Date, sequence: number): string {
  if (sequence < 1 || sequence > 999999) {
    throw new RangeError(`Sequence must be 1-999999, got ${sequence}`);
  }
  const yyyy = date.getUTCFullYear().toString().padStart(4, '0');
  const mm = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = date.getUTCDate().toString().padStart(2, '0');
  const seq = sequence.toString().padStart(6, '0');
  return `RD-${yyyy}${mm}${dd}-${seq}`;
}