'use client';

import { Gift, Ticket } from 'lucide-react';
import { formatNaira } from '@surewina/utils';
import type { AdminCustomerDetail } from '@surewina/api-client';
import { SectionCard } from '@/components/section-card';
import { StatusPill, statusToTone } from '@/components/status-pill';

type Promotion = AdminCustomerDetail['promotion'];

function dateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-NG', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Lagos',
  });
}

export function CustomerJackpotOffers({
  promotion,
  lastTicketAt,
}: {
  promotion: Promotion;
  lastTicketAt: string | null;
}) {
  const items = [
    { label: 'Weekly regular tickets', value: promotion.weeklyRegularTickets },
    { label: 'Offers unlocked', value: promotion.offersUnlocked },
    { label: 'Available', value: promotion.available },
    { label: 'Claimed', value: promotion.claimed },
    { label: 'Declined', value: promotion.declined },
    {
      label: 'Next offer in',
      value: promotion.ticketsToNextOffer === null
        ? '—'
        : `${promotion.ticketsToNextOffer} ticket${promotion.ticketsToNextOffer === 1 ? '' : 's'}`,
    },
  ];

  return (
    <div className="space-y-4">
      <SectionCard
        title="Jackpot discount offers"
        description={
          promotion.activeCycle
            ? `Current cycle: ${promotion.jackpotDrawCode}. Every 10 regular tickets unlocks an optional ₦500 jackpot ticket.`
            : 'No active Saturday jackpot cycle. Past offers are retained below for support and audit.'
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {items.map((item) => (
            <div key={item.label} className="rounded-xl border border-slate-200 bg-[#F8FAF4] p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                {item.label}
              </p>
              <p className="mt-2 font-display text-xl font-black text-[#0B1220]">
                {item.value}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <Ticket className="h-4 w-4 text-navy-700" />
            {promotion.claiming} reservation(s) in progress
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Gift className="h-4 w-4 text-amber-700" />
            {promotion.expired} expired offer(s) this cycle
          </span>
          {lastTicketAt && (
            <span>Last regular ticket: {dateTime(lastTicketAt)}</span>
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="Offer history"
        description="All saved offers for this phone, including earlier jackpot weeks. Expired available offers are shown as EXPIRED."
        padded={false}
      >
        <div className="overflow-x-auto">
          <table className="min-w-[1120px] w-full text-left text-sm">
            <thead className="bg-[#F8FAF4] text-[10px] font-black uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Offer ID</th>
                <th className="px-4 py-3">Week / jackpot</th>
                <th className="px-4 py-3">Threshold</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Issued</th>
                <th className="px-4 py-3">Expires</th>
                <th className="px-4 py-3">Claimed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {promotion.offers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-500">
                    No jackpot discount offers have been unlocked by this phone number.
                  </td>
                </tr>
              ) : (
                promotion.offers.map((offer) => (
                  <tr key={offer.offerId}>
                    <td className="max-w-[210px] break-all px-4 py-3 font-mono text-xs text-[#0B1220]">
                      {offer.offerId}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="font-semibold text-[#0B1220]">{offer.jackpotDrawCode}</div>
                      <div className="mt-1 text-slate-500">{dateTime(offer.jackpotScheduledAt)}</div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="font-bold text-[#0B1220]">#{offer.thresholdNumber}</div>
                      <div className="mt-1 text-slate-500">At {offer.regularTicketsAtUnlock} tickets</div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="font-bold text-[#0B1220]">{formatNaira(offer.offerPriceNgn)}</div>
                      <div className="mt-1 text-slate-500">
                        Standard {formatNaira(offer.originalPriceNgn)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill tone={statusToTone(offer.status)}>
                        {offer.status}
                      </StatusPill>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs">{dateTime(offer.issuedAt)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs">{dateTime(offer.expiresAt)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs">{dateTime(offer.claimedAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
