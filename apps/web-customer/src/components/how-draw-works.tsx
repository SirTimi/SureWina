import { ExternalLink, Hash, Lock, Shield } from 'lucide-react';
import { Card } from '@surewina/ui';

interface HowDrawWorksProps {
  seedHash?: string;
  seedCommittedAt?: string;
}

const items = [
  {
    icon: Shield,
    title: 'Licensed under NLRC',
    body:
      'National Lottery Regulatory Commission, Licence #NL/2025/0241. Your ticket is a legally registered raffle entry.',
  },
  {
    icon: Hash,
    title: 'RNG seed published before draw',
    body:
      'The SHA-256 hash of the seed is committed before the draw, then the seed is revealed for verification.',
  },
  {
    icon: Lock,
    title: 'Tickets sold count is signed',
    body:
      'The live counter is signed regularly by our auditor. Tampering breaks the chain and shows in the archive.',
  },
  {
    icon: ExternalLink,
    title: 'Result is permanent + public',
    body:
      'Winning ticket reference is published to the results archive after the draw closes.',
  },
];

export function HowDrawWorks({ seedHash, seedCommittedAt }: HowDrawWorksProps) {
  return (
    <Card
      variant="default"
      className="rounded-3xl border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.05)]"
    >
      <div className="mb-6 flex items-center gap-2">
        <Shield className="h-4 w-4 text-[#4E8F01]" />
        <h2 className="text-[10px] font-black uppercase tracking-[0.14em] text-[#4E8F01]">
          How this draw works
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {items.map((item) => {
          const Icon = item.icon;

          return (
            <div
              key={item.title}
              className="rounded-2xl border border-[#4E8F01]/15 bg-[#F8FAF4] p-4"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-[#A8E368]/35 text-[#4E8F01]">
                  <Icon className="h-5 w-5" />
                </div>

                <div>
                  <h3 className="text-sm font-black text-navy-950">{item.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    {item.body}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {seedHash && (
        <div className="mt-6 border-t border-slate-100 pt-5">
          <div className="flex flex-col justify-between gap-4 rounded-2xl border border-[#4E8F01]/15 bg-white p-4 sm:flex-row sm:items-start">
            <div className="min-w-0">
              <p className="mb-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#4E8F01]">
                <Hash className="mr-1 inline h-3 w-3" />
                Tonight&apos;s seed hash{' '}
                {seedCommittedAt && (
                  <span className="font-normal text-slate-400">
                    · committed {seedCommittedAt}
                  </span>
                )}
              </p>

              <p className="break-all font-mono text-xs text-slate-700">{seedHash}</p>
            </div>

            <a
              href="#"
              className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-[#4E8F01] transition hover:text-[#3f7601]"
            >
              Verify <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      )}
    </Card>
  );
}