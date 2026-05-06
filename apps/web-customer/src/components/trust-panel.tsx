import { ExternalLink, Hash, ShieldCheck } from 'lucide-react';
import { Card } from '@surewina/ui';

const items = [
  {
    icon: ShieldCheck,
    title: 'Regulated under Nigerian lottery law',
    body:
      'Operated under licence from the National Lottery Regulatory Commission (NLRC). Licence #NL/2025/0241.',
    tone: 'from-emerald-50 to-white text-emerald-700 border-emerald-100',
  },
  {
    icon: Hash,
    title: 'Audited draws with public RNG seed hashes',
    body:
      'Every draw publishes a SHA-256 seed hash before it runs. After the draw, the seed is revealed so anyone can verify.',
    tone: 'from-blue-50 to-white text-blue-700 border-blue-100',
  },
  {
    icon: ExternalLink,
    title: 'Public results archive',
    body:
      'Every winner, every draw, every reference number — kept on the public record forever, not buried in a feed.',
    tone: 'from-violet-50 to-white text-violet-700 border-violet-100',
  },
];

export function TrustPanel() {
  return (
    <Card
      variant="default"
      className="overflow-hidden rounded-2xl border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)]"
    >
      <div className="border-b border-slate-100 px-5 py-4">
        <div className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.12em] text-navy-800">
          <ShieldCheck className="h-4 w-4 text-blue-700" />
          Why you can trust this draw
        </div>
      </div>

      <div className="grid grid-cols-1 divide-y divide-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {items.map((item) => {
          const Icon = item.icon;

          return (
            <div key={item.title} className="p-5">
              <div className="flex items-start gap-4">
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border bg-gradient-to-br ${item.tone}`}
                >
                  <Icon className="h-6 w-6" />
                </div>

                <div>
                  <h3 className="text-sm font-black leading-snug text-navy-950">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-slate-600">
                    {item.body}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}