import { randomInt } from 'crypto';

// SW-XXXX-XXXX using an unambiguous alphabet (no 0/O/1/I) so refs can be
// read aloud over the phone without confusion.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateTicketRef(): string {
  const block = () =>
    Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  return `SW-${block()}-${block()}`;
}