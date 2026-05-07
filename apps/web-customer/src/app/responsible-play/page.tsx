import { Phone, ShieldCheck, TimerReset, WalletCards } from 'lucide-react';
import { Card, Container } from '@surewina/ui';
import { SpendLimitForm } from '@/components/spend-limit-form';
import { TakeABreakForm } from '@/components/take-a-break-form';

export default function ResponsiblePlayPage() {
  return (
    <main>
      <section className="relative overflow-hidden bg-[radial-gradient(circle_at_78%_28%,rgba(168,227,104,0.42)_0%,rgba(168,227,104,0.24)_28%,transparent_56%),linear-gradient(135deg,#ffffff_0%,#f4ffe8_48%,#A8E368_100%)] pb-20 pt-32 sm:pb-24 sm:pt-36 lg:pb-28 lg:pt-40">
        <div className="absolute right-[-8%] top-1/2 hidden h-[520px] w-[520px] -translate-y-1/2 rounded-full bg-[#A8E368]/30 blur-3xl lg:block" />
        <div className="absolute bottom-[-120px] left-[18%] h-80 w-80 rounded-full bg-[#4E8F01]/10 blur-3xl" />

        <Container size="lg" className="relative max-w-[1400px]">
          <div className="max-w-4xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-sm border border-white/30 bg-[#4E8F01]/85 px-4 py-2 text-sm font-semibold text-white shadow-sm backdrop-blur">
              <ShieldCheck className="h-4 w-4 text-white" />
              For your protection
            </div>

            <h1 className="font-display text-5xl font-black leading-[0.98] tracking-[-0.05em] text-navy-950 sm:text-6xl lg:text-7xl">
              Responsible
              <br />
              <span className="text-[#4E8F01]">play.</span>
            </h1>

            <p className="mt-6 max-w-2xl text-base leading-relaxed text-slate-700 sm:text-lg">
              A raffle should be entertainment, not a financial plan. Set limits, take
              a break, or block yourself completely. We enforce it server-side.
            </p>
          </div>
        </Container>
      </section>

      <section className="bg-[#F8FAF4]">
        <Container size="lg" className="max-w-[1400px] py-12 lg:py-16">
          <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
            <InfoCard
              icon={<WalletCards className="h-5 w-5" />}
              title="Set spend limits"
              body="Choose how much you are allowed to spend weekly or monthly."
            />
            <InfoCard
              icon={<TimerReset className="h-5 w-5" />}
              title="Take a break"
              body="Pause yourself for a fixed period. No ticket purchase during the break."
            />
            <InfoCard
              icon={<ShieldCheck className="h-5 w-5" />}
              title="Server enforced"
              body="Limits are enforced by the backend, not just hidden in the UI."
            />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="space-y-6">
              <SpendLimitForm />
              <TakeABreakForm />
            </div>

            <aside className="self-start rounded-3xl border border-[#4E8F01]/15 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm bg-[#A8E368]/35 text-[#4E8F01]">
                  <Phone className="h-5 w-5" />
                </div>

                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#4E8F01]">
                    Need to talk?
                  </p>

                  <h2 className="mt-2 font-display text-2xl font-black tracking-[-0.03em] text-navy-950">
                    Help is available.
                  </h2>

                  <p className="mt-3 text-sm leading-relaxed text-slate-600">
                    The Federal Ministry of Health runs a free, confidential helpline
                    for problem gambling.
                  </p>

                  <p className="mt-5 font-mono text-xl font-black text-[#4E8F01]">
                    0800 GAMBLE
                  </p>

                  <p className="mt-1 text-xs text-slate-500">
                    0800 426253 · 24/7 · free from Nigerian networks
                  </p>
                </div>
              </div>
            </aside>
          </div>
        </Container>
      </section>
    </main>
  );
}

function InfoCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <Card
      variant="default"
      className="rounded-2xl border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)]"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-[#A8E368]/35 text-[#4E8F01]">
          {icon}
        </div>

        <div>
          <h3 className="text-sm font-black text-navy-950">{title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-slate-500">{body}</p>
        </div>
      </div>
    </Card>
  );
}