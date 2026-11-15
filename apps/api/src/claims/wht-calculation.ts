import { ClaimType } from '@prisma/client';

import type { SettingsService } from '../config/settings.service';

// WHT applies to CASH prizes at/above the threshold. Integer naira,
// rounded down in the winner's favour on the tax side.
//
// Shared by every route a cash prize can take — bank payout, wallet credit —
// so the same prize is taxed the same way whichever the winner chooses.
export async function computeWht(
  settings: SettingsService,
  grossNgn: number,
  path: ClaimType,
) {
  const rate = await settings.getNumber('WHT_RATE_PERCENT', 5);
  const threshold = await settings.getNumber('WHT_THRESHOLD_NGN', 0);

  if (path !== ClaimType.CASH || grossNgn < threshold || rate === 0) {
    return { whtApplicable: false, whtAmountNgn: 0, netPrizeValueNgn: grossNgn };
  }
  const whtAmountNgn = Math.floor((grossNgn * rate) / 100);
  return { whtApplicable: true, whtAmountNgn, netPrizeValueNgn: grossNgn - whtAmountNgn };
}
