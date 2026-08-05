'use client';

import type { AgentSalePrint } from '@surewina/api-client';
import { RECEIPT_PAD_MM, RECEIPT_WIDTH_MM } from '@/lib/receipt-config';

// Thermal receipt, one per ticket. Monospace and fixed width because that is
// what the printer renders predictably — this is not a responsive layout.
//
// Structure follows the Premier Lotto slip the client showed us: identity,
// then four aligned data rows, then the ticket number as the dominant
// element, then the amount. Rules are CSS borders, not character strings —
// a fixed-length string of dashes cannot span a width it does not know.

function watParts(iso: string) {
  const d = new Date(new Date(iso).getTime() + 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`,
    time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
  };
}

function stamp(iso: string) {
  const { date, time } = watParts(iso);
  return `${date} ${time}`;
}

export function TicketReceipt({
  sale,
  ticketRef,
  sequence,
}: {
  sale: AgentSalePrint;
  ticketRef: string;
  sequence?: { position: number; total: number };
}) {
  const isJackpot = sale.drawType === 'SATURDAY_JACKPOT';

  return (
    <div className="receipt">
      <div className="head">
        <div className="brand">SUREWINA LOTTO</div>
        <div className="draw-name">
          {sale.drawName.toUpperCase()} ({sale.drawShortCode})
        </div>
        {sequence && sequence.total > 1 && (
          <div className="seq">
            TICKET {sequence.position} OF {sequence.total}
          </div>
        )}
      </div>

      <div className="rule" />

      <div className="rows">
        <Row label="Terminal" value={sale.terminal} />
        <Row label={`Draw ${sale.drawNumber}`} value={stamp(sale.scheduledAt)} />
        <Row label="Valid Until" value={stamp(sale.cutoffAt)} />
        <Row label="Sale Date" value={stamp(sale.soldAt)} />
      </div>

      <div className="rule" />

      {/* The reason the customer keeps the slip. Everything else on here is
          supporting detail, so it gets the size. */}
      <div className="ticket-block">
        <div className="ticket-label">TICKET NUMBER</div>
        <div className="ticket-ref">{ticketRef}</div>
      </div>

      <div className="rows">
        <Row
          label={`${sale.drawShortCode} @ N${sale.ticketPriceNgn.toLocaleString('en-NG')}`}
          value={`N${sale.ticketPriceNgn.toLocaleString('en-NG')}.00`}
        />
      </div>

      <div className="rule" />

      <div className="good-luck">GOOD LUCK !!!</div>

      {/* One promo line, not four blocks. This prints on every ticket now,
          so anything here is paid for once per ticket sold. */}
      <div className="promo">
        {isJackpot
          ? 'Sure Jackpot draws every Saturday'
          : 'Any 10 weekday tickets = 1 free Jackpot entry'}
      </div>

      <style jsx>{`
        .receipt {
          box-sizing: border-box;
          width: ${RECEIPT_WIDTH_MM}mm;
          padding: 3mm ${RECEIPT_PAD_MM}mm 5mm;
          background: #fff;
          color: #000;
          font-family: 'Courier New', Courier, monospace;
          font-size: 11px;
          line-height: 1.35;
        }
        .head {
          text-align: center;
          margin-bottom: 2mm;
        }
        .brand {
          font-weight: 700;
          font-size: 15px;
          letter-spacing: 0.04em;
        }
        .draw-name {
          font-size: 12px;
          margin-top: 1px;
        }
        .seq {
          font-size: 11px;
          font-weight: 700;
          margin-top: 1px;
        }
        /* Full-width rule. Replaces the fixed-length "-+-+" string, which
           could only ever span the width it happened to be typed for. */
        .rule {
          border-top: 1px dashed #000;
          margin: 2mm 0;
        }
        .rows {
          width: 100%;
        }
        .ticket-block {
          text-align: center;
          margin: 2mm 0 3mm;
        }
        .ticket-label {
          font-size: 10px;
          letter-spacing: 0.14em;
        }
        .ticket-ref {
          font-size: 20px;
          font-weight: 700;
          letter-spacing: 0.06em;
          margin-top: 1mm;
          /* Thermal heads render bold monospace cleanly; a long ref must not
             wrap mid-code, so shrink rather than break. */
          white-space: nowrap;
        }
        .good-luck {
          text-align: center;
          font-style: italic;
          font-weight: 700;
          font-size: 13px;
        }
        .promo {
          text-align: center;
          font-size: 10px;
          margin-top: 2mm;
        }
      `}</style>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="row">
      <span className="label">{label}</span>
      <span className="value">{value}</span>
      <style jsx>{`
        .row {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 4mm;
          width: 100%;
        }
        .label {
          white-space: nowrap;
        }
        .value {
          text-align: right;
          white-space: nowrap;
        }
      `}</style>
    </div>
  );
}