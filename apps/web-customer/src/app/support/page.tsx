import Link from 'next/link';
import {
  ArrowRight,
  HelpCircle,
  Mail,
  MessageCircle,
  Phone,
  ShieldCheck,
} from 'lucide-react';
import { Button, Card, Container } from '@surewina/ui';

const supportRoutes = [
  {
    icon: MessageCircle,
    title: 'Ticket or payment issue',
    body: 'Use this if you paid but did not receive an SMS, or your payment is stuck.',
    action: 'claims@surewina.ng',
    href: 'mailto:claims@surewina.ng',
  },
  {
    icon: ShieldCheck,
    title: 'Prize or claim issue',
    body: 'Use this for KYC, payout, product delivery, or claim verification problems.',
    action: 'claims@surewina.ng',
    href: 'mailto:claims@surewina.ng',
  },
  {
    icon: HelpCircle,
    title: 'General question',
    body: 'Use this for account access, draw rules, responsible play, or general support.',
    action: 'help@surewina.ng',
    href: 'mailto:help@surewina.ng',
  },
];

export default function SupportPage() {
  return (
    <main>
      <section className="relative overflow-hidden bg-[radial-gradient(circle_at_78%_28%,rgba(216,122,24,0.18)_0%,rgba(216,122,24,0.10)_28%,transparent_56%),linear-gradient(135deg,#ffffff_0%,#f4ffe8_48%,#E8F0FB_100%)] pb-20 pt-32 sm:pb-24 sm:pt-36 lg:pb-28 lg:pt-40">
        <div className="absolute right-[-8%] top-1/2 hidden h-[520px] w-[520px] -translate-y-1/2 rounded-full bg-navy-50 blur-3xl lg:block" />
        <div className="absolute bottom-[-120px] left-[18%] h-80 w-80 rounded-full bg-navy-50 blur-3xl" />

        <Container size="lg" className="relative max-w-[1400px]">
          <div className="max-w-4xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-sm border border-white/30 bg-navy-700/90 px-4 py-2 text-sm font-semibold text-white shadow-sm backdrop-blur">
              <ShieldCheck className="h-4 w-4 text-white" />
              Support
            </div>

            <h1 className="font-display text-5xl font-black leading-[0.98] tracking-[-0.05em] text-navy-950 sm:text-6xl lg:text-7xl">
              We’ll help you
              <br />
              <span className="text-navy-700">sort it out.</span>
            </h1>

            <p className="mt-6 max-w-2xl text-base leading-relaxed text-slate-700 sm:text-lg">
              Payment stuck, ticket missing, claim delayed, or just confused? Pick the
              right channel below so the right team sees it.
            </p>
          </div>
        </Container>
      </section>

      <section className="bg-[#F8FAF4]">
        <Container size="lg" className="max-w-[1400px] py-12 lg:py-16">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {supportRoutes.map((item) => {
              const Icon = item.icon;

              return (
                <Card
                  key={item.title}
                  variant="default"
                  className="rounded-3xl border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.05)]"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-sm bg-navy-50 text-navy-700">
                    <Icon className="h-6 w-6" />
                  </div>

                  <h2 className="mt-5 font-display text-2xl font-black tracking-[-0.03em] text-navy-950">
                    {item.title}
                  </h2>

                  <p className="mt-3 text-sm leading-relaxed text-slate-600">
                    {item.body}
                  </p>

                  <a
                    href={item.href}
                    className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-navy-700 transition hover:text-navy-800"
                  >
                    {item.action}
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </Card>
              );
            })}
          </div>

          <Card
            variant="default"
            className="mt-8 overflow-hidden rounded-3xl border-navy-100 bg-navy-800 p-8 text-white shadow-[0_24px_70px_rgba(14,42,71,0.18)] sm:p-10"
          >
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <div className="mb-4 inline-flex items-center gap-2 rounded-sm bg-amber-500 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-navy-950">
                  <Phone className="h-4 w-4" />
                  Urgent claims line
                </div>

                <h2 className="font-display text-3xl font-black tracking-[-0.03em] text-white">
                  Time-sensitive issue?
                </h2>

                <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/75">
                  For urgent claim issues, suspected fraud, or missed payment windows,
                  call the support line during working hours.
                </p>
              </div>

              <a href="tel:0700SUREWINA">
                <Button
                  variant="accent"
                  size="lg"
                  className="rounded-sm !border-transparent bg-amber-500 font-bold text-navy-950 hover:!border-transparent hover:bg-amber-400"
                >
                  <Phone className="h-4 w-4" />
                  0700-SUREWINA
                </Button>
              </a>
            </div>
          </Card>

          <div className="mt-8 rounded-2xl border border-navy-100 bg-white p-5">
            <p className="text-sm leading-relaxed text-slate-600">
              For formal complaints, use the{' '}
              <Link
                href="/disputes"
                className="font-bold text-navy-700 hover:underline"
              >
                dispute resolution page
              </Link>
              . For data/privacy requests, email{' '}
              <a
                href="mailto:privacy@surewina.ng"
                className="font-bold text-navy-700 hover:underline"
              >
                privacy@surewina.ng
              </a>
              .
            </p>
          </div>
        </Container>
      </section>
    </main>
  );
}