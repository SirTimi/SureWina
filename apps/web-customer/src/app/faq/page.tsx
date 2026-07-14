import { Metadata } from 'next';
import Link from 'next/link';
import {
  ChevronRight,
  CircleHelp,
  CreditCard,
  Mail,
  Phone,
  ShieldCheck,
  Sparkles,
  Ticket,
  Trophy,
  UserCheck,
} from 'lucide-react';
import { Card, Container } from '@surewina/ui';
import { LegalPageHeader } from '@/components/legal-page-header';

export const metadata: Metadata = {
  title: 'FAQ · Surewina',
  description:
    'Common questions about Surewina draws, tickets, claims, and KYC. Phrased the way real players ask.',
};

const categories = [
  {
    id: 'getting-started',
    title: 'Getting started',
    icon: Ticket,
    questions: [
      {
        q: 'Do I need an account to play?',
        a: 'No. You can buy a ticket with just your phone number and your state. Your ticket reference is sent by SMS and that is your proof of entry. An account is optional and only useful if you want a dashboard to track your tickets across draws.',
      },
      {
        q: 'How much does a ticket cost?',
        a: 'Daily draw tickets are ₦500 each. Saturday jackpot tickets are ₦5,000 each. Or you can earn one free Saturday jackpot entry by buying 10 daily tickets — no extra cost.',
      },
      {
        q: 'When are the draws?',
        a: 'Daily draws happen at 20:00 WAT every day except Saturday. The jackpot draw is at 21:00 WAT every Saturday. Ticket sales close one hour before each draw.',
      },
      {
        q: 'Can I play from outside Nigeria?',
        a: 'No. Surewina is licensed under Nigerian lottery law and we only accept players resident in Nigeria with a Nigerian phone number. Players from outside Nigeria are not legally permitted by our licence.',
      },
    ],
  },
  {
    id: 'paying',
    title: 'Paying for tickets',
    icon: CreditCard,
    questions: [
      {
        q: 'Which payment methods do you accept?',
        a: 'Card, bank transfer, USSD, and supported wallet options. Payments are handled through secure payment processors. Surewina does not store your card details.',
      },
      {
        q: 'Are there transaction fees?',
        a: 'No. The ticket price you see is what you pay. Surewina absorbs standard payment processor fees.',
      },
      {
        q: 'Can I get a refund?',
        a: 'Tickets are non-refundable except where the draw is cancelled or a verified duplicate charge/payment error occurred. For payment issues, email payments@surewina.ng with the transaction reference.',
      },
    ],
  },
  {
    id: 'winning',
    title: 'Winning and claims',
    icon: Trophy,
    questions: [
      {
        q: 'How do I know if I won?',
        a: "You'll get an SMS within minutes of the draw if you won. You can also check the public results archive at /results and search by your ticket reference any time.",
      },
      {
        q: 'How long do I have to claim?',
        a: 'You have 7 days from the draw to start your claim. If you choose cash, you may need to complete KYC before payout.',
      },
      {
        q: 'Can I take cash instead of the product?',
        a: 'Yes, where cash conversion is available. If you choose cash, withholding tax may apply depending on prize value and applicable Nigerian law.',
      },
      {
        q: 'Can I change my mind after I choose?',
        a: 'You may be able to switch your claim option within the stated claim window. After the final confirmation window closes, your choice becomes final.',
      },
      {
        q: 'How long does cash payout take?',
        a: 'After KYC is approved, payout is initiated to your verified bank account. Bank processing times can vary.',
      },
      {
        q: 'How is the product delivered?',
        a: 'Product prize delivery or collection instructions appear in your claim flow. We verify the ticket, confirm your details, then fulfil the prize.',
      },
    ],
  },
  {
    id: 'fairness',
    title: 'Fairness and the draw',
    icon: ShieldCheck,
    questions: [
      {
        q: 'How do I know the draw is fair?',
        a: 'Every draw publishes a seed hash before it runs and reveals verification data after. This allows the result to be checked against the public audit trail. See /audit for the full method.',
      },
      {
        q: 'Has anyone audited Surewina?',
        a: 'Surewina is designed around public auditability: ticket references, draw timestamps, seed commitments, and result archives are made available for verification.',
      },
      {
        q: 'What if I think the draw was rigged?',
        a: 'Send your evidence to compliance@surewina.ng. If the public verification data does not match the published result, that is treated as a serious dispute.',
      },
    ],
  },
  {
    id: 'agents',
    title: 'Agents',
    icon: UserCheck,
    questions: [
      {
        q: 'What is an agent?',
        a: 'Agents are approved sellers who can help customers buy tickets. The ticket belongs to the customer whose phone number is attached to the purchase.',
      },
      {
        q: 'Are tickets bought from agents legitimate?',
        a: 'Yes, provided the agent is registered and the ticket reference is issued by Surewina. You can always check a ticket reference on the check-ticket page.',
      },
      {
        q: 'How do I become an agent?',
        a: 'Agent applications open through the agent onboarding route when available. Approved agents complete training, KYC, and agreement checks.',
      },
    ],
  },
  {
    id: 'safety',
    title: 'Responsible play',
    icon: Sparkles,
    questions: [
      {
        q: 'Can I limit how much I spend?',
        a: 'Yes. You can set spending limits from responsible play settings. Once a limit is active, purchases above the limit are blocked.',
      },
      {
        q: 'I want to take a break — can I?',
        a: 'Yes. You can self-exclude for a fixed period. During exclusion, you cannot buy tickets.',
      },
      {
        q: 'I think I have a gambling problem. Where can I get help?',
        a: 'Use the responsible play page or contact support. You can request self-exclusion and account-level purchase blocking.',
      },
    ],
  },
];

const featuredQuestions = [
  'Do I need an account to play?',
  'How do I know if I won?',
  'How do I know the draw is fair?',
];

export default function FaqPage() {
  return (
    <main>
      <LegalPageHeader
        eyebrow="Help · FAQ"
        title="The questions everyone asks."
        subtitle="Honest answers to the things real players want to know. If yours isn't here, tell us at help@surewina.ng and we'll add it."
      />

      <section className="bg-[#F8FAF4]">
        <Container size="lg" className="max-w-[1400px] py-12 lg:py-16">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="lg:sticky lg:top-28 lg:self-start">
              <Card
                variant="default"
                className="overflow-hidden rounded-3xl border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.05)]"
              >
                <div className="border-b border-slate-100 bg-navy-800 p-5 text-white">
                  <div className="flex h-12 w-12 items-center justify-center rounded-sm bg-amber-500 text-navy-950">
                    <CircleHelp className="h-6 w-6" />
                  </div>

                  <p className="mt-5 text-[10px] font-black uppercase tracking-[0.16em] text-amber-400">
                    FAQ categories
                  </p>

                  <p className="mt-2 text-sm leading-relaxed text-white/70">
                    Jump to the part that answers your question fastest.
                  </p>
                </div>

                <nav className="space-y-1 p-3">
                  {categories.map((cat) => {
                    const Icon = cat.icon;

                    return (
                      <Link
                        key={cat.id}
                        href={`#${cat.id}`}
                        className="flex items-center gap-3 rounded-sm px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-amber-50 hover:text-navy-700"
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {cat.title}
                      </Link>
                    );
                  })}
                </nav>
              </Card>

              <Card
                variant="default"
                className="mt-4 rounded-3xl border-navy-100 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.04)]"
              >
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
                  Fast answers
                </p>

                <div className="mt-4 space-y-2">
                  {featuredQuestions.map((q) => (
                    <div
                      key={q}
                      className="rounded-2xl border border-navy-100 bg-[#F8FAF4] p-3 text-sm font-semibold text-navy-950"
                    >
                      {q}
                    </div>
                  ))}
                </div>
              </Card>
            </aside>

            <div className="min-w-0">
              <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
                <FaqMetric
                  icon={<Ticket className="h-5 w-5" />}
                  title="Ticket questions"
                  body="Buying, SMS references, pricing, and draw timing."
                />
                <FaqMetric
                  icon={<Trophy className="h-5 w-5" />}
                  title="Claims questions"
                  body="Winning, payout, product fulfilment, and KYC."
                />
                <FaqMetric
                  icon={<ShieldCheck className="h-5 w-5" />}
                  title="Trust questions"
                  body="RNG, audit records, fairness, and disputes."
                />
              </div>

              <div className="space-y-8">
                {categories.map((cat) => {
                  const Icon = cat.icon;

                  return (
                    <section
                      key={cat.id}
                      id={cat.id}
                      className="scroll-mt-28 rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.04)] sm:p-6"
                    >
                      <div className="mb-5 flex items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm bg-navy-50 text-navy-700">
                          <Icon className="h-5 w-5" />
                        </div>

                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
                            {cat.questions.length} questions
                          </p>
                          <h2 className="font-display text-2xl font-black tracking-[-0.03em] text-navy-950">
                            {cat.title}
                          </h2>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {cat.questions.map((qa, i) => (
                          <details
                            key={i}
                            className="group overflow-hidden rounded-2xl border border-slate-200 bg-white"
                          >
                            <summary className="flex cursor-pointer items-center justify-between gap-4 p-5 transition hover:bg-amber-50">
                              <h3 className="font-bold text-navy-950">{qa.q}</h3>
                              <ChevronRight className="h-5 w-5 shrink-0 text-navy-700 transition group-open:rotate-90" />
                            </summary>

                            <div className="border-t border-slate-100 bg-[#F8FAF4] p-5">
                              <p className="text-sm leading-relaxed text-slate-700">
                                {qa.a}
                              </p>
                            </div>
                          </details>
                        ))}
                      </div>
                    </section>
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
                      <Mail className="h-4 w-4" />
                      Still stuck?
                    </div>

                    <h3 className="font-display text-3xl font-black tracking-[-0.03em] text-white">
                      Ask support directly.
                    </h3>

                    <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/75">
                      Real questions get real answers. Email us or call the support line
                      and we’ll point you to the right next step.
                    </p>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                    <a
                      href="mailto:help@surewina.ng"
                      className="inline-flex items-center justify-center gap-2 rounded-sm bg-amber-500 px-4 py-3 text-sm font-bold text-navy-950 transition hover:bg-amber-400"
                    >
                      <Mail className="h-4 w-4" />
                      help@surewina.ng
                    </a>

                    <a
                      href="tel:0700SUREWINA"
                      className="inline-flex items-center justify-center gap-2 rounded-sm border border-white/20 bg-white/10 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/15"
                    >
                      <Phone className="h-4 w-4" />
                      0700-SUREWINA
                    </a>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </Container>
      </section>
    </main>
  );
}

function FaqMetric({
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
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-navy-50 text-navy-700">
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