import { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Container } from '@surewina/ui';
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
        a: 'Daily draws happen at 20:00 WAT (8 PM) every day except Saturday. The jackpot draw is at 21:00 WAT every Saturday. Ticket sales close one hour before each draw.',
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
    questions: [
      {
        q: 'Which payment methods do you accept?',
        a: 'Card (Visa, Mastercard, Verve), bank transfer, USSD (*894#), and OPay wallet. Payments are processed by Paystack and Flutterwave — both are PCI-DSS compliant and licensed by the CBN.',
      },
      {
        q: 'Are there transaction fees?',
        a: 'No. The ticket price you see is what you pay. Surewina absorbs all payment processor fees.',
      },
      {
        q: 'Can I get a refund?',
        a: 'Tickets are non-refundable except in two cases: the draw is cancelled by Surewina or NLRC (in which case all ticket holders get a full refund automatically), or your card was double-charged due to a payment processor bug. For double charges, email payments@surewina.ng with the transaction reference.',
      },
    ],
  },
  {
    id: 'winning',
    title: 'Winning and claims',
    questions: [
      {
        q: 'How do I know if I won?',
        a: 'You\'ll get an SMS within minutes of the draw if you won. We also email you if you\'ve set an email on your profile. You can also check the public results archive at /results — search by your ticket reference any time.',
      },
      {
        q: 'How long do I have to claim?',
        a: 'You have 7 days from the draw to choose product or cash, then 14 days to complete KYC if you chose cash. After that the prize defaults to cash via your phone-linked bank account, or forfeits to charity if no account exists.',
      },
      {
        q: 'Can I take cash instead of the product?',
        a: 'Yes. When you claim, you choose product fulfilment or cash conversion at face value. If you choose cash, 10% withholding tax (WHT) is deducted before payout — Nigerian law requires this for prizes over ₦10,000. You receive a tax certificate automatically.',
      },
      {
        q: 'Can I change my mind after I choose?',
        a: 'You can switch from product to cash, or cash to product, once within 48 hours of your first selection. After 48 hours, the choice is final.',
      },
      {
        q: 'How long does cash payout take?',
        a: 'After your KYC is verified (typically 1–2 hours during business hours), bank transfer is initiated immediately and usually arrives within 24 hours. Some banks are slower than others — if it\'s been over 48 hours, contact claims@surewina.ng.',
      },
      {
        q: 'How is the product delivered?',
        a: 'You can either book collection at any Surewina centre (free, available in Lagos, Abuja, PH, Kano, Ibadan), or have it delivered by courier (free, anywhere in Nigeria, 3 working days). Both options appear in your claim flow after you choose product.',
      },
    ],
  },
  {
    id: 'fairness',
    title: 'Fairness and the draw',
    questions: [
      {
        q: 'How do I know the draw is fair?',
        a: 'Every draw publishes a SHA-256 seed hash before it runs and reveals the original seed after. Anyone can re-run the RNG with the revealed seed and confirm it produces the same winning ticket. We also publish a Merkle tree of all eligible tickets, so winners can\'t be retroactively added. See /audit for the full method.',
      },
      {
        q: 'Has anyone audited Surewina?',
        a: 'Yes. Deloitte West Africa audits our RNG, audit log integrity, and payout records every quarter. Their reports are published in full on the public results archive.',
      },
      {
        q: 'What if I think the draw was rigged?',
        a: 'If you can show via the public seed and our published RNG that a different ticket should have won, that\'s a verifiable fraud claim and we will treat it with the seriousness it deserves. Email compliance@surewina.ng with your evidence.',
      },
    ],
  },
  {
    id: 'agents',
    title: 'Agents',
    questions: [
      {
        q: 'What is an agent?',
        a: 'Agents are independent, commissioned sellers who can buy tickets on behalf of customers — typically those without smartphones or app access. Every agent has a unique code printed on the SMS receipt. Agents do not own the tickets they sell.',
      },
      {
        q: 'Are tickets bought from agents legitimate?',
        a: 'Yes. Tickets bought from a registered Surewina agent are exactly the same as tickets bought online. They go through our RNG, they\'re part of the same Merkle tree, and they win at the same probability.',
      },
      {
        q: 'How do I become an agent?',
        a: 'We open agent applications at /agents. You need to complete agent training, pass Tier 2 KYC (one level above customer KYC), and sign the agent agreement. Approved agents earn 10% commission on tickets sold, paid out daily.',
      },
    ],
  },
  {
    id: 'safety',
    title: 'Responsible play',
    questions: [
      {
        q: 'Can I limit how much I spend?',
        a: 'Yes. From your account settings (or /dashboard/responsible-play if signed in) you can set a weekly or monthly cap. Once you hit it, all purchases are blocked until the next period. Lowering the cap is instant; raising it has a 24-hour cool-down.',
      },
      {
        q: 'I want to take a break — can I?',
        a: 'Absolutely. From /dashboard/responsible-play you can self-exclude for 7 days, 30 days, 6 months, or permanently. During exclusion, you can\'t buy tickets and we won\'t send marketing SMS. Permanent exclusion is irreversible.',
      },
      {
        q: 'I think I have a gambling problem. Where can I get help?',
        a: 'Call the Federal Ministry of Health gambling helpline at 0800-GAMBLE (0800-426253) — free from any Nigerian network, 24/7. We will also help — email support@surewina.ng and we will permanently exclude you and refund any unspent ticket balance.',
      },
    ],
  },
];

export default function FaqPage() {
  return (
    <main>
      <LegalPageHeader
        eyebrow="Help · FAQ"
        title="The questions everyone asks."
        subtitle="Honest answers to the things real players want to know. If yours isn't here, tell us at help@surewina.ng and we'll add it."
      />

      <Container size="lg" className="max-w-[1400px] py-12 lg:py-16">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[260px_1fr]">
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">
              Categories
            </p>
            <nav className="space-y-1">
              {categories.map((c) => (
                <Link
                  key={c.id}
                  href={`#${c.id}`}
                  className="block rounded-lg px-3 py-2 text-sm text-slate-600 transition hover:bg-emerald-50 hover:text-[#4E8F01]"
                >
                  {c.title}
                </Link>
              ))}
            </nav>
          </aside>

          <div className="space-y-12">
            {categories.map((cat) => (
              <section key={cat.id} id={cat.id} className="scroll-mt-6">
                <h2 className="font-display text-2xl font-black text-navy-950">{cat.title}</h2>

                <div className="mt-5 space-y-3">
                  {cat.questions.map((qa, i) => (
                    <details
                      key={i}
                      className="group overflow-hidden rounded-2xl border border-slate-200 bg-white"
                    >
                      <summary className="flex cursor-pointer items-center justify-between gap-4 p-5 transition hover:bg-slate-50">
                        <h3 className="font-bold text-navy-950">{qa.q}</h3>
                        <ChevronRight className="h-5 w-5 shrink-0 text-slate-400 transition group-open:rotate-90" />
                      </summary>
                      <div className="border-t border-slate-100 bg-slate-50/40 p-5">
                        <p className="text-sm leading-relaxed text-slate-700">{qa.a}</p>
                      </div>
                    </details>
                  ))}
                </div>
              </section>
            ))}

            {/* CTA */}
            <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/40 p-6 sm:p-8">
              <h3 className="font-display text-xl font-bold text-navy-950">
                Didn&apos;t find your answer?
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-700">
                Real questions get real answers. Email{' '}
                <a
                  href="mailto:help@surewina.ng"
                  className="font-semibold text-[#4E8F01] hover:underline"
                >
                  help@surewina.ng
                </a>{' '}
                or call{' '}
                <a
                  href="tel:0700SUREWINA"
                  className="font-semibold text-[#4E8F01] hover:underline"
                >
                  0700-SUREWINA
                </a>
                . We respond within 24 hours.
              </p>
            </div>
          </div>
        </div>
      </Container>
    </main>
  );
}