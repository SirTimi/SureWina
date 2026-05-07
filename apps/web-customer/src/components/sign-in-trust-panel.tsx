import { Check, ShieldCheck, Ticket } from 'lucide-react';

const items = [
  {
    title: 'Licensed and regulated',
    body: 'Operated under Nigerian lottery regulation with public draw records.',
  },
  {
    title: 'Verifiable draw process',
    body: 'Every draw publishes ticket references, timestamps, and RNG seed hash records.',
  },
  {
    title: 'Fast prize handling',
    body: 'Winners are guided through claim verification and payout or fulfilment.',
  },
];

export function SignInTrustPanel() {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-[#4E8F01] p-10 text-white shadow-[0_28px_80px_rgba(78,143,1,0.22)]">
      <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-[#A8E368]/30 blur-3xl" />
      <div className="absolute -bottom-24 left-1/3 h-72 w-72 rounded-full bg-white/10 blur-3xl" />

      <div className="relative">
        <div className="mb-6 inline-flex items-center gap-2 rounded-sm bg-[#A8E368] px-3 py-1.5 text-xs font-black uppercase tracking-[0.14em] text-navy-950">
          <ShieldCheck className="h-4 w-4" />
          NLRC Licence #NL/2025/0241
        </div>

        <h2 className="font-display text-5xl font-black leading-[0.98] tracking-[-0.05em] text-white">
          Real prizes.
          <br />
          Public records.
          <br />
          No password.
        </h2>

        <p className="mt-5 max-w-md text-base leading-relaxed text-white/75">
          Use your phone number to access tickets, claims, and draw records without
          managing another password.
        </p>

        <div className="mt-8 grid gap-3">
          {items.map((item) => (
            <div
              key={item.title}
              className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur"
            >
              <div className="flex items-start gap-3">
                <Check className="mt-0.5 h-5 w-5 shrink-0 text-[#A8E368]" />
                <div>
                  <p className="text-sm font-black text-white">{item.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-white/65">
                    {item.body}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#A8E368]">
                Ticket access
              </p>
              <p className="mt-1 text-sm font-bold text-white">
                SMS OTP only. No password required.
              </p>
            </div>

            <Ticket className="h-8 w-8 text-[#A8E368]" />
          </div>
        </div>
      </div>
    </div>
  );
}