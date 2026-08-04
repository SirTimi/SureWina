// Manual harness: npx tsx apps/worker/src/sms-preview.ts
// Prints every purchase-SMS edge case with its segment count and exits
// non-zero if any exceeds one segment.
import { smsPlan, ticketPurchase } from './sms-templates';

const WED = '2026-08-05T18:00:00Z';
const SAT = '2026-08-08T18:00:00Z';
const REF = 'SW-DTUQ-TXZR';

const cases: Array<[string, Parameters<typeof ticketPurchase>[0]]> = [
  ['single standard', { drawCode: 'SW-DAILY-20260805', scheduledAt: WED, ticketRef: REF, faceValueNgn: 500 }],
  ['1 of 3 standard', { drawCode: 'SW-DAILY-20260805', scheduledAt: WED, ticketRef: REF, faceValueNgn: 500, sequence: { position: 1, total: 3 } }],
  ['1 of 12 standard', { drawCode: 'SW-DAILY-20260805', scheduledAt: WED, ticketRef: REF, faceValueNgn: 500, sequence: { position: 1, total: 12 } }],
  ['jackpot 1 of 3 @10k', { drawCode: 'SW-JACKPOT-20260808', scheduledAt: SAT, ticketRef: REF, faceValueNgn: 10_000, sequence: { position: 1, total: 3 } }],
  ['jackpot 10 of 12 @10k', { drawCode: 'SW-JACKPOT-20260808', scheduledAt: SAT, ticketRef: REF, faceValueNgn: 10_000, sequence: { position: 10, total: 12 } }],
  // Longest weekday + longest header + widest amount. Not a real draw, but
  // it is the ceiling the copy has to survive.
  ['synthetic worst case', { drawCode: 'SW-JACKPOT-20260805', scheduledAt: WED, ticketRef: REF, faceValueNgn: 100_000, sequence: { position: 10, total: 12 } }],
];

let overflow = 0;

for (const [name, args] of cases) {
  const message = ticketPurchase(args);
  const plan = smsPlan(message);
  const flag = plan.segments > 1 ? '  ❌ OVER' : '';
  if (plan.segments > 1) overflow += 1;

  console.log(`--- ${name}: ${plan.length}/160 ${plan.encoding}, ${plan.segments} segment${flag}`);
  console.log(message);
  console.log();
}

if (overflow > 0) {
  console.error(`${overflow} case(s) exceed one segment — copy needs shortening.`);
  process.exit(1);
}
console.log('All cases fit one segment.');