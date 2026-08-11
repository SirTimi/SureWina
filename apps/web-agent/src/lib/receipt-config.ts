// Printable width of the agent's thermal roll, in millimetres.
//   80mm roll → 72mm printable
//   58mm roll → 48mm printable
// Wrong value here is the difference between a full-width slip and a driver
// shrink-to-fit that looks narrow and runs long. Confirm against the actual
// printer before treating a print test as a failure of the layout.
export const RECEIPT_WIDTH_MM = 72;

// Side padding. Thermal heads lose the outermost ~2mm on most units.
export const RECEIPT_PAD_MM = 3;

// Base type size in px. Everything else on the slip is sized relative to
// this, so one change here rescales the whole receipt.
export const RECEIPT_FONT_PX = 16;