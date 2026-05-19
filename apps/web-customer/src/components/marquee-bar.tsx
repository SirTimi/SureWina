import { Banknote, Sparkles, Trophy } from 'lucide-react';

const items = [
  { icon: Sparkles, text: '₦4,000,000 up for grabs this Saturday' },
  { icon: Trophy, text: "Tonight's prize: brand new Samsung Galaxy A55 5G" },
  { icon: Banknote, text: 'One ticket. ₦500. Could be yours.' },
  { icon: Sparkles, text: 'Someone wins every single day at 20:00 WAT' },
  { icon: Trophy, text: '₦86,000,000 already paid out this year' },
  { icon: Banknote, text: 'Ten daily tickets = a free shot at ₦4M' },
  { icon: Sparkles, text: 'The next millionaire is one ticket away' },
  { icon: Trophy, text: 'Real prizes. Shipped to your door. Paid to your bank.' },
  { icon: Banknote, text: 'No app, no account, no password. Just play.' },
  { icon: Sparkles, text: 'Tomorrow morning, somebody wakes up ₦4M richer' },
];

export function MarqueeBar() {
  return (
    <div className="relative overflow-hidden border-y border-white/5 bg-navy-900 py-4">
      <style>
        {`
          @keyframes surewina-marquee {
            from { transform: translateX(0); }
            to { transform: translateX(-50%); }
          }
        `}
      </style>

      <div
        className="flex gap-12 whitespace-nowrap"
        style={{ animation: 'surewina-marquee 40s linear infinite' }}
      >
        {/* Render twice so the loop is seamless */}
        {[...items, ...items].map((item, i) => {
          const Icon = item.icon;
          return (
            <div
              key={i}
              className="flex shrink-0 items-center gap-3 text-sm font-semibold uppercase tracking-[0.14em] text-white/80"
            >
              <Icon className="h-4 w-4 text-amber-400" />
              <span>{item.text}</span>
              <span aria-hidden className="text-amber-400/60">●</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}