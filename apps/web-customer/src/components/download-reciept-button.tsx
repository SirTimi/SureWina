'use client';

import { Download } from 'lucide-react';
import { formatNaira, formatPhoneForDisplay } from '@surewina/utils';

interface DownloadReceiptButtonProps {
  ticketRefs: string[];
  drawCode: string;
  phone: string;
  paidNgn: number;
}

export function DownloadReceiptButton({
  ticketRefs,
  drawCode,
  phone,
  paidNgn,
}: DownloadReceiptButtonProps) {
  const handleDownload = () => {
    const issuedAt = new Date().toLocaleString('en-NG', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    const refRows = ticketRefs
      .map(
        (ref, i) => `
          <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:12px;">${i + 1}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-family:ui-monospace,Menlo,monospace;font-weight:700;letter-spacing:0.5px;">${ref}</td>
          </tr>`,
      )
      .join('');

    const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Surewina receipt — ${drawCode}</title>
</head>
<body style="margin:0;padding:32px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;">
  <div style="max-width:560px;margin:0 auto;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
    <div style="background:#1e3a8a;color:#ffffff;padding:20px 24px;">
      <div style="font-size:20px;font-weight:900;letter-spacing:-0.5px;">Surewina</div>
      <div style="font-size:11px;opacity:0.85;margin-top:2px;">Ticket purchase receipt</div>
    </div>

    <div style="padding:24px;">
      <table style="width:100%;font-size:13px;border-collapse:collapse;margin-bottom:20px;">
        <tr>
          <td style="padding:4px 0;color:#64748b;">Draw</td>
          <td style="padding:4px 0;text-align:right;font-family:ui-monospace,Menlo,monospace;font-weight:700;">${drawCode}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#64748b;">Buyer phone</td>
          <td style="padding:4px 0;text-align:right;font-weight:600;">${formatPhoneForDisplay(phone)}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#64748b;">Tickets</td>
          <td style="padding:4px 0;text-align:right;font-weight:600;">${ticketRefs.length}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#64748b;">Total paid</td>
          <td style="padding:4px 0;text-align:right;font-weight:900;font-size:15px;">${formatNaira(paidNgn)}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#64748b;">Issued</td>
          <td style="padding:4px 0;text-align:right;">${issuedAt}</td>
        </tr>
      </table>

      <div style="font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:1.5px;color:#1e3a8a;margin-bottom:8px;">
        Ticket references
      </div>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;font-size:13px;">
        ${refRows}
      </table>

      <p style="font-size:11px;color:#64748b;line-height:1.6;margin-top:20px;">
        Keep these references safe — you need them to check results and claim prizes.
        Winners are published by ticket reference only, never by name. Verify any draw
        at any time from the public results archive.
      </p>
    </div>
  </div>
  <script>window.onload = function () { window.print(); };</script>
</body>
</html>`;

    // Print via a hidden iframe: the browser's print dialog offers
    // "Save as PDF" everywhere, with zero dependencies.
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    iframe.srcdoc = html;
    // Clean up after the print dialog has had time to open.
    setTimeout(() => document.body.removeChild(iframe), 60_000);
  };

  return (
    <button
      type="button"
      onClick={handleDownload}
      className="text-navy-800 hover:text-navy-700 font-medium inline-flex items-center gap-1"
    >
      <Download className="w-3 h-3" />
      Download receipt
    </button>
  );
}