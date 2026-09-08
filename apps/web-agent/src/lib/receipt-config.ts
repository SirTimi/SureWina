// The agent printer takes ISO B7 sheets: 88 x 125 mm, fixed height — not a
// continuous roll. That means the layout has a hard height budget, and a
// slip that overflows produces a second sheet rather than a longer one.
export const RECEIPT_PAGE_W_MM = 88;
export const RECEIPT_PAGE_H_MM = 125;

// Content width. Most thermal units lose 3-4mm at each edge, so the slip is
// inset from the sheet and centred within it.
export const RECEIPT_WIDTH_MM = 82;
export const RECEIPT_PAD_MM = 2;

// Base type size in px. Everything on the slip is sized from this, so one
// change here rescales the whole receipt.
export const RECEIPT_FONT_PX = 12.8;

// The three things a person actually reads off the slip: brand, agent code,
// ticket number. Held at one size so they stay visually equal.
export const RECEIPT_EMPHASIS_PX = 14.5;

// Logo square. The largest single consumer of the height budget after the
// QR code — the first thing to trim if the slip runs to a second sheet.
export const RECEIPT_LOGO_MM = 17.5;

// QR square. Encodes a lookup URL rather than the bare ticket ref, so a
// phone camera opens the result directly. A Code 128 barcode carrying the
// same URL would be about 90mm wide on 82mm of paper — QR fits it in a
// square instead.
export const RECEIPT_QR_MM = 20;

// Where a scanned ticket lands. Points at the customer site deliberately:
// the QR is printed on the customer's own ticket and they will scan it, so
// it must not lead to a staff login wall. Agents scan through the app,
// which reads the ref out of this URL rather than following it.
export const RECEIPT_LOOKUP_BASE =
  process.env.NEXT_PUBLIC_LOOKUP_BASE_URL ?? 'https://surewina.com/lookup';