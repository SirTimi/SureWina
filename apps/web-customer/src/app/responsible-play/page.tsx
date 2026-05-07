import Link from 'next/link';
import {
  ArrowRight,
  HeartHandshake,
  LifeBuoy,
  Lock,
  Phone,
  ShieldCheck,
  TimerReset,
  WalletCards,
} from 'lucide-react';
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
              A raffle should be entertainment, not a financial plan. Set limits, take a
              break, or block yourself completely. We enforce protection settings at the
              system level.
            </p>
          </div>
        </Container>
      </section>

      <section className="bg-[#F8FAF4]">
        <Container size="lg" className="max-w-[1400px] py-12 lg:py-16">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="lg:sticky lg:top-28 lg:self-start">
              <Card
                variant="default"
                className="overflow-hidden rounded-3xl border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.05)]"
              >
                <div className="bg-[#4E8F01] p-6 text-white">
                  <div className="flex h-12 w-12 items-center justify-center rounded-sm bg-[#A8E368] text-navy-950">
                    <HeartHandshake className="h-6 w-6" />
                  </div>

                  <h2 className="mt-5 font-display text-3xl font-black leading-tight tracking-[-0.03em]">
                    Keep play under control.
                  </h2>

                  <p className="mt-4 text-sm leading-relaxed text-white/75">
                    These tools exist for one reason: stop play from becoming pressure.
                  </p>
                </div>

                <div className="space-y-3 p-5">
                  <ProtectionPoint
                    icon={<WalletCards className="h-4 w-4" />}
                    title="Spend limit"
                    body="Set a weekly or monthly cap."
                  />
                  <ProtectionPoint
                    icon={<TimerReset className="h-4 w-4" />}
                    title="Take a break"
                    body="Pause ticket purchases for a fixed period."
                  />
                  <ProtectionPoint
                    icon={<Lock className="h-4 w-4" />}
                    title="System enforced"
                    body="Controls should be enforced beyond the UI."
                  />
                </div>
              </Card>

              <Card
                variant="default"
                className="mt-4 overflow-hidden rounded-3xl border-[#4E8F01]/15 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.04)]"
              >
                <div className="p-5">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-[#A8E368]/35 text-[#4E8F01]">
                      <LifeBuoy className="h-5 w-5" />
                    </div>

                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#4E8F01]">
                        Need support?
                      </p>

                      <p className="mt-2 text-sm leading-relaxed text-slate-600">
                        Contact support if you want help setting stronger restrictions on
                        your account.
                      </p>

                      <Link
                        href="/support"
                        className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-[#4E8F01] transition hover:text-[#3f7601]"
                      >
                        Contact support
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                </div>
              </Card>
            </aside>

            <div className="min-w-0">
              <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
                <InfoCard
                  icon={<WalletCards className="h-5 w-5" />}
                  title="Set spend limits"
                  body="Choose the maximum you can spend in a week or month."
                />
                <InfoCard
                  icon={<TimerReset className="h-5 w-5" />}
                  title="Take a break"
                  body="Pause your account for 7 days, 30 days, 6 months, or permanently."
                />
                <InfoCard
                  icon={<ShieldCheck className="h-5 w-5" />}
                  title="Protect yourself"
                  body="Use these controls before things feel out of hand."
                />
              </div>

              <div className="space-y-6">
                <SpendLimitForm />
                <TakeABreakForm />
              </div>

              <Card
                variant="default"
                className="mt-8 overflow-hidden rounded-3xl border-[#4E8F01]/15 bg-[#4E8F01] p-8 text-white shadow-[0_24px_70px_rgba(78,143,1,0.22)] sm:p-10"
              >
                <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div>
                    <div className="mb-4 inline-flex items-center gap-2 rounded-sm bg-[#A8E368] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-navy-950">
                      <Phone className="h-4 w-4" />
                      Need to talk?
                    </div>

                    <h3 className="font-display text-3xl font-black tracking-[-0.03em] text-white">
                      Help is available.
                    </h3>

                    <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/75">
                      If play is starting to feel stressful, chasing losses, or affecting
                      your money, talk to someone and use the exclusion tools immediately.
                    </p>
                  </div>

                  <a
                    href="mailto:help@surewina.ng"
                    className="inline-flex items-center justify-center gap-2 rounded-sm bg-[#A8E368] px-4 py-3 text-sm font-bold text-navy-950 transition hover:bg-[#B7EF79]"
                  >
                    <LifeBuoy className="h-4 w-4" />
                    help@surewina.ng
                  </a>
                </div>
              </Card>
            </div>
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
      className="rounded-2xl border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.04)]"
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

function ProtectionPoint({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-[#4E8F01]/15 bg-[#F8FAF4] p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-[#A8E368]/35 text-[#4E8F01]">
          {icon}
        </div>

        <div>
          <p className="text-sm font-black text-navy-950">{title}</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">{body}</p>
        </div>
      </div>
    </div>
  );
}