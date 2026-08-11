'use client';

import type { AgentSalePrint } from '@surewina/api-client';
import { RECEIPT_PAD_MM, RECEIPT_WIDTH_MM } from '@/lib/receipt-config';

// Thermal receipt, one per ticket. Monospace and fixed width because that is
// what the printer renders predictably — this is not a responsive layout.
//
// Layout deliberately mirrors the Premier Lotto slip the client provided:
// identity block, a fixed-label-column data table with aligned colons, the
// stake line, the ticket number centred where Premier centres the picked
// numbers, then total, good luck, location, and a repeated reference line.
//
// Rules are CSS borders, not character strings — a fixed-length run of
// dashes can only ever span the width it was typed for.

function watStamp(iso: string, withSeconds = false) {
  const d = new Date(new Date(iso).getTime() + 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  const time = withSeconds
    ? `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`
    : `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${time}`;
}

const naira = (n: number) => `N ${n.toLocaleString('en-NG')}`;

export function TicketReceipt({
  sale,
  ticketRef,
  agentCode,
  stateCode,
  sequence,
}: {
  sale: AgentSalePrint;
  ticketRef: string;
  agentCode: string;
  stateCode: string;
  sequence?: { position: number; total: number };
}) {
  const isJackpot = sale.drawType === 'SATURDAY_JACKPOT';
  // Premier prints a terminal/serial line at the head and repeats it above
  // the barcode. Ours is the terminal plus the sale reference — the pair that
  // identifies this transaction in support and reconciliation.
  const serial = `${sale.terminal} - ${sale.saleReference}`;

  return (
    <div className="receipt">
      <div className="head">
        <div className="brand-small">SUREWINA LOTTO</div>
        <div className="brand">{sale.drawName.toUpperCase()}</div>
        <div className="serial">{serial}</div>
      </div>

      <div className="rows">
        <Row label="Terminal" value={sale.terminal} />
        <Row label="Agent" value={agentCode} />
        <Row label="Draw" value={`${sale.drawNumber}  ${watStamp(sale.scheduledAt)}`} />
        <Row label="Valid Until" value={watStamp(sale.cutoffAt)} />
        <Row label="Sale Date" value={watStamp(sale.soldAt, true)} />
      </div>

      <div className="rule" />

      {/* Where Premier prints "NAP2 at N 500" then the picked numbers, we
          print the game line then the ticket number. Same shape, and the
          ticket number is the thing our customer has to keep. */}
      <div className="stake-line">
        {sale.drawShortCode} at {naira(sale.ticketPriceNgn)}
      </div>
      <div className="ticket-ref">{ticketRef}</div>
      {sequence && sequence.total > 1 && (
        <div className="seq">
          TICKET {sequence.position} OF {sequence.total}
        </div>
      )}

      <div className="rule" />

      <div className="rows">
        <Row label="Total Stake" value={naira(sale.ticketPriceNgn)} />
      </div>

      <div className="good-luck">GOOD LUCK !!!</div>
      <div className="location">{stateCode.toUpperCase()}</div>

      <div className="rule" />

      <div className="serial-foot">{serial}</div>

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
          padding: 3mm ${RECEIPT_PAD_MM}mm 4mm;
          background: #fff;
          color: #000;
          font-family: 'Courier New', Courier, monospace;
          font-size: 10.5px;
          line-height: 1.32;
        }
        .head {
          text-align: center;
          margin-bottom: 2.5mm;
        }
        .brand-small {
          font-size: 9px;
          letter-spacing: 0.22em;
        }
        .brand {
          font-weight: 700;
          font-size: 15px;
          letter-spacing: 0.05em;
          margin-top: 0.5mm;
        }
        .serial {
          font-weight: 700;
          font-size: 11px;
          margin-top: 0.8mm;
        }
        .rows {
          width: 100%;
        }
        /* Full-width rule, replacing the fixed-length "-+-+" string. */
        .rule {
          border-top: 1px dashed #000;
          margin: 2mm 0;
        }
        .stake-line {
          font-size: 11px;
        }
        .ticket-ref {
          text-align: center;
          font-size: 17px;
          font-weight: 700;
          letter-spacing: 0.08em;
          margin: 1.5mm 0 0.5mm;
          /* A ticket ref must never break mid-code. */
          white-space: nowrap;
        }
        .seq {
          text-align: center;
          font-size: 9px;
          letter-spacing: 0.1em;
        }
        .good-luck {
          text-align: center;
          font-weight: 700;
          font-size: 12px;
          margin-top: 2mm;
        }
        .location {
          text-align: center;
          font-size: 11px;
          letter-spacing: 0.08em;
        }
        .serial-foot {
          text-align: center;
          font-size: 10px;
        }
        .promo {
          text-align: center;
          font-size: 8.5px;
          margin-top: 2mm;
        }
      `}</style>
    </div>
  );
}

// Fixed label column with an aligned colon, as on the reference slip. Values
// start at the same x on every row, which is what makes a monospace receipt
// read as a table rather than a list.
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="row">
      <span className="label">{label}</span>
      <span className="colon">:</span>
      <span className="value">{value}</span>
      <style jsx>{`
        .row {
          display: flex;
          align-items: baseline;
          width: 100%;
        }
        .label {
          flex: 0 0 22mm;
          white-space: nowrap;
          overflow: hidden;
        }
        .colon {
          flex: 0 0 3mm;
        }
        .value {
          flex: 1 1 auto;
          white-space: nowrap;
        }
      `}</style>
    </div>
  );
}