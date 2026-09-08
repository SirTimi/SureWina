'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { AgentSalePrint } from '@surewina/api-client';
import {
  RECEIPT_EMPHASIS_PX,
  RECEIPT_FONT_PX,
  RECEIPT_LOGO_MM,
  RECEIPT_LOOKUP_BASE,
  RECEIPT_PAD_MM,
  RECEIPT_PAGE_H_MM,
  RECEIPT_QR_MM,
  RECEIPT_WIDTH_MM,
} from '@/lib/receipt-config';

// Thermal receipt, one per ticket, sized for an ISO B7 sheet (88 x 125mm).
// Monospace and fixed width because that is what the printer renders
// predictably — this is not a responsive layout.
//
// The slip is pinned to the exact sheet height with overflow hidden, so a
// second page is impossible by construction rather than by careful counting.
// The trade is that overflow is silently clipped — which is why the footer
// sits last and is pushed to the bottom: if anything is ever lost it is the
// closing boilerplate, never the QR code or the ticket number.

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
  sequence,
}: {
  sale: AgentSalePrint;
  ticketRef: string;
  agentCode: string;
  sequence?: { position: number; total: number };
}) {
  const isJackpot = sale.drawType === 'SATURDAY_JACKPOT';

  return (
    <div className="receipt">
      <div className="head">
        {/* Colour raster on a 1-bit print head: this will dither. Replace
            with a pure black-and-white asset when one exists. */}
        <img className="logo" src="/surewina-icon.webp" alt="" />
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

      <div className="good-luck">GOOD LUCK !!!</div>

      <div className="rule" />

      <TicketQr ticketRef={ticketRef} />
      <div className="qr-caption">SCAN TO CHECK</div>
      <div className="barcode-text">{ticketRef}</div>
      <div className="serial-foot">{sale.saleReference}</div>

      <div className="promo">
        {isJackpot
          ? 'Sure Jackpot draws every Saturday'
          : 'Any 10 weekday tickets = 1 free Jackpot entry'}
      </div>

      {/* Pushed to the foot of the sheet by margin-top:auto. The B7 sheet is
          a fixed 125mm and prints whether it carries anything or not, so this
          space answers the questions a customer would otherwise call about. */}
      <div className="footer">
        <div className="rule" />
        <div className="footer-line">Check results at www.surewina.com</div>
        <div className="footer-line">or ask any Surewina agent</div>
        <div className="footer-gap" />
        <div className="footer-line">Keep this ticket. It is required to claim.</div>
        <div className="footer-line">Customer care: 080 8000 9000</div>
        <div className="footer-gap" />
        <div className="footer-line">Terms &amp; Conditions apply.</div>
        <div className="footer-line">Play responsibly. 18+</div>
      </div>

      <style jsx>{`
        .receipt {
          box-sizing: border-box;
          width: ${RECEIPT_WIDTH_MM}mm;
          /* Exactly one sheet. overflow:hidden is what makes a second page
             impossible; without it a stray line of copy silently costs a
             whole extra sheet per ticket sold. */
          height: ${RECEIPT_PAGE_H_MM}mm;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          /* Centres the slip on the B7 sheet. */
          margin: 0 auto;
          padding: 2.5mm ${RECEIPT_PAD_MM}mm 3mm;
          background: #fff;
          color: #000;
          font-family: 'Courier New', Courier, monospace;
          font-size: ${RECEIPT_FONT_PX}px;
          line-height: 1.4;
        }
        .head {
          text-align: center;
          margin-bottom: 2mm;
        }
        .logo {
          display: block;
          width: ${RECEIPT_LOGO_MM}mm;
          height: ${RECEIPT_LOGO_MM}mm;
          margin: 0 auto 1mm;
          object-fit: contain;
        }
        .brand {
          font-weight: 700;
          font-size: ${RECEIPT_EMPHASIS_PX + 4}px;
          letter-spacing: 0.18em;
          line-height: 1.1;
        }
        .game {
          font-size: ${RECEIPT_FONT_PX}px;
          letter-spacing: 0.08em;
          margin-top: 0.8mm;
        }
        .ident {
          text-align: center;
          margin-bottom: 2mm;
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
          font-size: ${RECEIPT_EMPHASIS_PX}px;
          letter-spacing: 0.04em;
          /* A code broken across two lines reads as two codes. */
          white-space: nowrap;
        }
        .rule {
          border-top: 1px dashed #000;
          margin: 2mm 0;
        }
        .rows {
          width: 100%;
        }
        .stake-line {
          font-size: ${RECEIPT_FONT_PX}px;
        }
        .ticket-ref {
          text-align: center;
          font-size: ${RECEIPT_EMPHASIS_PX}px;
          font-weight: 700;
          letter-spacing: 0.1em;
          margin: 1.5mm 0 0.8mm;
          white-space: nowrap;
        }
        .seq {
          text-align: center;
          font-size: ${RECEIPT_FONT_PX - 3}px;
          letter-spacing: 0.1em;
        }
        .good-luck {
          text-align: center;
          font-weight: 700;
          font-size: ${RECEIPT_FONT_PX + 2}px;
        }
        /* Tells the customer the square is for them, not just for staff.
           Without it most people ignore a bare QR on a printed slip. */
        .qr-caption {
          text-align: center;
          font-size: ${RECEIPT_FONT_PX - 3}px;
          letter-spacing: 0.14em;
          margin-top: 0.6mm;
        }
        .barcode-text {
          text-align: center;
          font-size: ${RECEIPT_FONT_PX - 1}px;
          letter-spacing: 0.18em;
          margin-top: 0.5mm;
        }
        /* Held at 10px deliberately. The sale reference is ~43 characters;
           at 11px it exceeds the usable width and the tail gets clipped. */
        .serial-foot {
          text-align: center;
          font-size: 10px;
          margin-top: 0.8mm;
          white-space: nowrap;
        }
        .promo {
          text-align: center;
          font-size: ${RECEIPT_FONT_PX - 2}px;
          margin-top: 2mm;
        }
        .footer {
          /* Absorbs whatever height is left, so the boilerplate sits at the
             foot of the sheet instead of floating mid-page. */
          margin-top: auto;
          text-align: center;
          font-size: ${RECEIPT_FONT_PX - 2}px;
          line-height: 1.5;
        }
        .footer-line {
          white-space: nowrap;
        }
        .footer-gap {
          height: 1.5mm;
        }
      `}</style>
    </div>
  );
}

// QR over a lookup URL, drawn as SVG so it scales cleanly to print
// resolution — a raster code at 203dpi blurs at the module edges and
// scanners reject it.
//
// A URL rather than the bare ticket ref: a phone camera opens the result
// directly, where a bare ref would just show the customer a string they
// still have to type in somewhere. Code 128 could not carry the URL — 43
// characters would be about 90mm wide on 82mm of paper.
//
// Error correction is deliberately low. Thermal slips are read within
// minutes of printing, not recovered from damage months later, and a lower
// level keeps the code smaller with larger modules — which matters more on
// a 203dpi head than redundancy does.
function TicketQr({ ticketRef }: { ticketRef: string }) {
  const [svg, setSvg] = useState('');

  useEffect(() => {
    let active = true;
    QRCode.toString(`${RECEIPT_LOOKUP_BASE}?ref=${encodeURIComponent(ticketRef)}`, {
      type: 'svg',
      errorCorrectionLevel: 'L',
      margin: 0,
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then((out) => {
        if (active) setSvg(out);
      })
      .catch(() => {
        // Encoding failed: leave it blank. The ref is printed in large type
        // above and again below, so the ticket is still usable by hand.
      });
    return () => {
      active = false;
    };
  }, [ticketRef]);

  if (!svg) return null;

  return (
    <div className="qr-wrap">
      <div className="qr" dangerouslySetInnerHTML={{ __html: svg }} />
      <style jsx>{`
        .qr-wrap {
          display: flex;
          justify-content: center;
          margin-top: 0.8mm;
        }
        .qr :global(svg) {
          width: ${RECEIPT_QR_MM}mm;
          height: ${RECEIPT_QR_MM}mm;
          display: block;
        }
      `}</style>
    </div>
  );
}

// Fixed label column with an aligned colon. min-width rather than a fixed
// basis: a label longer than the column pushes its value right instead of
// being clipped, which is what turned "Valid Until" into "Valid Unt".
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
          flex: 0 0 auto;
          min-width: 25mm;
          white-space: nowrap;
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