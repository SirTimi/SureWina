'use client';

import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import type { AgentSalePrint } from '@surewina/api-client';
import {
  RECEIPT_FONT_PX,
  RECEIPT_PAD_MM,
  RECEIPT_WIDTH_MM,
} from '@/lib/receipt-config';

// Thermal receipt, one per ticket. Monospace and fixed width because that is
// what the printer renders predictably — this is not a responsive layout.
//
// Layout mirrors the Premier Lotto slip the client provided: centred identity
// block, a fixed-label-column data table with aligned colons, the stake line,
// the ticket number, then total, good luck, location, and a barcode.
//
// The data rows stay left-aligned on purpose. A column of values only reads
// as a table when every value starts at the same x; centring those rows would
// make the slip harder to scan, not easier.

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

  return (
    <div className="receipt">
      <div className="head">
        <div className="brand">SUREWINA</div>
        <div className="game">{sale.drawName.toUpperCase()}</div>
      </div>

      {/* Terminal and agent identify who sold this and from which device —
          the first thing anyone checks in a dispute, so they lead. */}
      <div className="ident">
        <div className="ident-row">
          <span className="ident-label">TERMINAL</span>
          <span className="ident-value">{sale.terminal}</span>
        </div>
        <div className="ident-row">
          <span className="ident-label">AGENT</span>
          <span className="ident-value">{agentCode}</span>
        </div>
      </div>

      <div className="rule" />

      <div className="rows">
        <Row label="Draw" value={`${sale.drawNumber}  ${watStamp(sale.scheduledAt)}`} />
        <Row label="Valid Until" value={watStamp(sale.cutoffAt)} />
        <Row label="Sale Date" value={watStamp(sale.soldAt, true)} />
      </div>

      <div className="rule" />

      {/* Where Premier prints "NAP2 at N 500" then the picked numbers, we
          print the game line then the ticket number. Same shape, and the
          ticket number is what our customer has to keep. */}
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

      <Barcode value={ticketRef} />
      <div className="barcode-text">{ticketRef}</div>
      <div className="serial-foot">{sale.saleReference}</div>

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
          /* Centres the slip if the paper is wider than the layout. */
          margin: 0 auto;
          padding: 3mm ${RECEIPT_PAD_MM}mm 4mm;
          background: #fff;
          color: #000;
          font-family: 'Courier New', Courier, monospace;
          font-size: ${RECEIPT_FONT_PX}px;
          line-height: 1.45;
        }
        .head {
          text-align: center;
          margin-bottom: 3mm;
        }
        .brand {
          font-weight: 700;
          font-size: ${RECEIPT_FONT_PX + 8}px;
          letter-spacing: 0.14em;
          line-height: 1.1;
        }
        .game {
          font-size: ${RECEIPT_FONT_PX + 1}px;
          letter-spacing: 0.08em;
          margin-top: 1mm;
        }
        .ident {
          text-align: center;
          margin-bottom: 2.5mm;
        }
        .ident-row {
          display: flex;
          justify-content: center;
          align-items: baseline;
          gap: 2.5mm;
        }
        .ident-label {
          font-size: ${RECEIPT_FONT_PX - 2}px;
          letter-spacing: 0.16em;
        }
        .ident-value {
          font-weight: 700;
          font-size: ${RECEIPT_FONT_PX + 5}px;
          letter-spacing: 0.06em;
        }
        /* Full-width rule, replacing the fixed-length "-+-+" string. */
        .rule {
          border-top: 1px dashed #000;
          margin: 2.5mm 0;
        }
        .rows {
          width: 100%;
        }
        .stake-line {
          font-size: ${RECEIPT_FONT_PX}px;
        }
        .ticket-ref {
          text-align: center;
          font-size: ${RECEIPT_FONT_PX + 7}px;
          font-weight: 700;
          letter-spacing: 0.08em;
          margin: 2mm 0 1mm;
          /* A ticket ref must never break mid-code. */
          white-space: nowrap;
        }
        .seq {
          text-align: center;
          font-size: ${RECEIPT_FONT_PX - 2}px;
          letter-spacing: 0.1em;
        }
        .good-luck {
          text-align: center;
          font-weight: 700;
          font-size: ${RECEIPT_FONT_PX + 2}px;
          margin-top: 2.5mm;
        }
        .location {
          text-align: center;
          font-size: ${RECEIPT_FONT_PX}px;
          letter-spacing: 0.1em;
        }
        .barcode-text {
          text-align: center;
          font-size: ${RECEIPT_FONT_PX - 2}px;
          letter-spacing: 0.18em;
          margin-top: 0.5mm;
        }
        .serial-foot {
          text-align: center;
          font-size: ${RECEIPT_FONT_PX - 3}px;
          margin-top: 1mm;
        }
        .promo {
          text-align: center;
          font-size: ${RECEIPT_FONT_PX - 3}px;
          margin-top: 2.5mm;
        }
      `}</style>
    </div>
  );
}

// Code 128 over the ticket ref. Drawn as SVG so it scales cleanly to the
// print resolution — a raster barcode at 203dpi blurs at the bar edges and
// scanners reject it.
function Barcode({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, value, {
        format: 'CODE128',
        width: 1.6,
        height: 46,
        displayValue: false,
        margin: 0,
        background: '#ffffff',
        lineColor: '#000000',
      });
    } catch {
      // Encoding failed: leave the SVG empty. The ref is printed in large
      // type above and again below, so the ticket is still usable.
    }
  }, [value]);

  return (
    <div className="barcode-wrap">
      <svg ref={ref} />
      <style jsx>{`
        .barcode-wrap {
          display: flex;
          justify-content: center;
          margin-top: 1mm;
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
          flex: 0 0 24mm;
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