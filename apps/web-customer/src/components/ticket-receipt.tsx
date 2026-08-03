'use client';

import type { TicketReceipt as ReceiptData } from '@surewina/api-client';

const DIVIDER = '-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-';
const WAT_OFFSET_MS = 60 * 60 * 1000;

const DAYS = [
  { name: 'SURE SUNDAY', code: 'SSUN' },
  { name: 'SURE MONDAY', code: 'SMON' },
  { name: 'SURE TUESDAY', code: 'STUE' },
  { name: 'SURE WEDNESDAY', code: 'SWED' },
  { name: 'SURE THURSDAY', code: 'STHU' },
  { name: 'SURE FRIDAY', code: 'SFRI' },
  { name: 'SURE SATURDAY', code: 'SSAT' },
] as const;

function wat(iso: string) {
  return new Date(new Date(iso).getTime() + WAT_OFFSET_MS);
}

function stamp(iso: string) {
  const d = wat(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} – ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}Hrs`;
}

function naming(drawType: string, scheduledAt: string) {
  if (drawType === 'SATURDAY_JACKPOT') return { name: 'JACKPOT DAY', code: 'JACK-D' };
  return DAYS[wat(scheduledAt).getUTCDay()];
}

export function TicketReceipt({
  receipt,
  ticketRef,
}: {
  receipt: ReceiptData;
  ticketRef: string;
}) {
  const { name, code } = naming(receipt.drawType, receipt.scheduledAt);
  const isJackpot = receipt.drawType === 'SATURDAY_JACKPOT';

  return (
    <div className="receipt">
      <div className="center">
        <div className="logo">🎁</div>
        <div className="brand">SUREWINA LOTTO</div>
        <div className="draw-name">
          {name} ({code})
        </div>
      </div>

      <Row label="Terminal:" value={receipt.terminal} />
      <Row label={`Draw: ${receipt.drawNumber}`} value={stamp(receipt.scheduledAt)} />
      <Row label="Valid Until:" value={stamp(receipt.cutoffAt)} />
      <Row label="Sale Date:" value={stamp(receipt.soldAt)} />

      <div className="divider">{DIVIDER}</div>

      <div className="price-line">
        {code} @ N{receipt.ticketPriceNgn.toLocaleString('en-NG')}
      </div>
      <Row label="Ticket Number:" value={ticketRef} />

      <div className="divider">{DIVIDER}</div>

      <div className="block">
        <div className="bold">Weekday Tickets:</div>
        <div>SSUN | SMON | STUE | SWED | STHU | SFRI @ N500</div>
      </div>

      <div className="divider">{DIVIDER}</div>

      <div className="bold block">
        Any 10 Combination Weekday Tickets gives 1 Jackpot Ticket
      </div>

      <div className="divider">{DIVIDER}</div>

      <div className="block">
        <div>Jackpot Play is Every Saturday.</div>
        <div>Jackpot Single Ticket @ N5,000</div>
      </div>

      <div className="divider">{DIVIDER}</div>

      {isJackpot && (
        <>
          <div className="center">
            <span className="amount-oval">
              N{receipt.ticketPriceNgn.toLocaleString('en-NG')}.00
            </span>
          </div>
          <div className="divider">{DIVIDER}</div>
        </>
      )}

      <div className="center good-luck">GOOD LUCK !!!</div>

      <style jsx>{`
        .receipt {
          width: 75mm;
          padding: 4mm 3mm;
          background: #fff;
          color: #000;
          font-family: 'Courier New', Courier, monospace;
          font-size: 10px;
          line-height: 1.45;
        }
        .center { text-align: center; }
        .logo { font-size: 22px; line-height: 1; margin-bottom: 2px; }
        .brand { font-weight: 700; font-size: 13px; letter-spacing: 0.02em; }
        .draw-name { font-size: 11px; margin-bottom: 6px; }
        .divider {
          overflow: hidden;
          white-space: nowrap;
          margin: 4px 0;
          letter-spacing: -0.5px;
        }
        .price-line { margin-bottom: 2px; }
        .block { margin: 2px 0; }
        .bold { font-weight: 700; }
        .amount-oval {
          display: inline-block;
          padding: 2px 14px;
          border: 1.5px solid #000;
          border-radius: 50%;
          font-weight: 700;
          font-size: 13px;
        }
        .good-luck { font-style: italic; font-size: 13px; margin-top: 4px; }
      `}</style>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="row">
      <span>{label}</span>
      <span>{value}</span>
      <style jsx>{`
        .row { display: flex; justify-content: space-between; gap: 8px; }
        span:last-child { text-align: right; }
      `}</style>
    </div>
  );
}