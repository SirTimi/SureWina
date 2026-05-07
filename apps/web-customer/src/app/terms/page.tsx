import { Metadata } from 'next';
import Link from 'next/link';
import { Check, FileText, Mail, Scale, ShieldCheck } from 'lucide-react';
import { Card, Container } from '@surewina/ui';
import { LegalPageHeader } from '@/components/legal-page-header';

export const metadata: Metadata = {
  title: 'Terms & Conditions · Surewina',
  description:
    'The legal agreement between Surewina and players. Plain-language summary up top, full terms below.',
};

const sections = [
  {
    id: 'who-can-play',
    title: '1. Who can play',
    body: [
      'You must be 18 years or older, resident in Nigeria, and have a valid Nigerian phone number to buy a ticket. By buying a ticket, you confirm both.',
      'Operators of Surewina (employees of Surewina Limited and their immediate family members) cannot play. Agents cannot play through their own agent account.',
      'You are responsible for the legality of playing in your specific Nigerian state. Surewina holds an NLRC federal licence (#NL/2025/0241) and operates only where state law permits.',
    ],
  },
  {
    id: 'tickets-and-draws',
    title: '2. Tickets and draws',
    body: [
      'A ticket is a contract for a single chance to win one specific draw. The draw and prize are bound to the ticket reference at the moment of purchase — neither can be changed afterwards.',
      'Draws happen daily at 20:00 WAT for the standard daily draw and Saturdays at 21:00 WAT for the jackpot. Cut-off for tickets is one hour before each draw.',
      'Once a ticket is purchased, it cannot be cancelled or refunded except in two cases: (a) the draw is cancelled by Surewina or NLRC, in which case all ticket holders are refunded in full; or (b) a payment processing error caused a duplicate charge, evidenced by transaction logs.',
    ],
  },
  {
    id: 'how-winners-are-picked',
    title: '3. How winners are picked',
    body: [
      'Each draw is decided by a deterministic random number generator (RNG) seeded with a value committed publicly before the draw and revealed publicly after. See our Audit Method page for the cryptographic detail.',
      'A winning ticket is the one whose index matches the RNG output for that draw. Only one winning ticket per draw, except where explicitly advertised (e.g. consolation prizes).',
      'If two or more tickets share the same reference (which should be impossible by design but we say it anyway): the earliest-purchased ticket by SQL primary key wins.',
    ],
  },
  {
    id: 'prizes',
    title: '4. Prizes',
    body: [
      'Product prizes are brand-new, sealed retail units with full manufacturer warranty unless explicitly stated otherwise. Surewina handles delivery or hosts collection at any of our centres listed on the claim page.',
      'Cash prizes are paid by bank transfer to a verified Nigerian bank account in the winner\'s name. We pay the net amount after deducting 10% withholding tax (WHT) on prizes over ₦10,000, as required by Nigerian tax law. The WHT is remitted to the Federal Inland Revenue Service and a tax certificate is issued to you.',
      'Winners may convert a product prize to cash at face value, or vice versa, within 48 hours of their first selection. After that, the choice is final.',
      'If a prize is unclaimed within 14 days of the draw (no KYC submitted, no collection booked), it defaults to cash conversion paid to the verified phone number\'s linked bank account, or forfeits to a charitable trust if no bank account exists.',
    ],
  },
  {
    id: 'verification-and-kyc',
    title: '5. Verification and KYC',
    body: [
      'Anonymous play is permitted up to ticket purchase. To claim any prize over ₦10,000 in cash, you must complete Tier 1 KYC: government-issued ID + selfie + BVN + bank account in your name.',
      'Product collection requires only your government-issued ID and the original SMS receipt — no BVN or bank account needed.',
      'KYC documents are encrypted at rest and auto-deleted 90 days after your prize is paid out, except where regulatory record-keeping requirements (typically 7 years) mandate longer retention.',
    ],
  },
  {
    id: 'agents',
    title: '6. Agents',
    body: [
      'Agents are independent commissioned sellers, not employees of Surewina. They sell tickets on behalf of customers (typically those without smartphones or app access) and earn a per-ticket commission paid daily.',
      'A ticket sold through an agent is bound to the customer\'s phone number, not the agent\'s. The customer is the legal ticket holder. Agents have no claim on prizes.',
      'Agents must complete training and pass a KYC tier higher than customers (Tier 2). Agents who breach the agent agreement are suspended or terminated.',
    ],
  },
  {
    id: 'limits-and-self-exclusion',
    title: '7. Spend limits and self-exclusion',
    body: [
      'You may set a weekly or monthly spend cap at any time from your account settings. The cap is enforced server-side — even if you bypass the UI, the server rejects ticket purchases that would exceed it.',
      'Lowering a cap takes effect immediately. Raising it has a 24-hour cool-down before it applies, to discourage in-the-moment overrides.',
      'You may self-exclude for 7 days, 30 days, 6 months, or permanently. During exclusion you cannot buy tickets and we will not send marketing SMS. Permanent self-exclusion is irreversible — your phone number, ID, and BVN are added to a permanent block list.',
    ],
  },
  {
    id: 'fair-play',
    title: '8. Fair play and abuse',
    body: [
      'Surewina reserves the right to suspend accounts engaged in fraud, identity theft, payment fraud, scripted purchasing, or any other abuse — including reversing winnings won via fraud and forwarding evidence to the EFCC.',
      'A "winning" account that fails KYC because the ID does not match the buyer\'s registered name is treated as suspected identity theft. The prize is held until investigation completes.',
    ],
  },
  {
    id: 'liability',
    title: '9. Liability',
    body: [
      'Surewina\'s total liability to any one player in any 12-month period is limited to the total amount that player spent on tickets in that period.',
      'Surewina is not liable for: SMS delivery delays caused by your network, bank transfer delays caused by your bank, force majeure events, or losses caused by the player providing incorrect personal details (e.g. wrong account number).',
      'Nothing in these terms limits or excludes liability for fraud, gross negligence, or breaches of Nigerian law.',
    ],
  },
  {
    id: 'governing-law',
    title: '10. Governing law and disputes',
    body: [
      'These terms are governed by the laws of the Federal Republic of Nigeria. Disputes are first handled by the Surewina disputes team (see Dispute Resolution page). If unresolved within 30 days, you may escalate to the National Lottery Regulatory Commission. The courts of Lagos State have exclusive jurisdiction for any litigation.',
    ],
  },
];

export default function TermsPage() {
  return (
    <main>
      <LegalPageHeader
        eyebrow="Legal"
        title="Terms and conditions."
        subtitle="The agreement between you and Surewina Limited when you buy a ticket. Plain-language summary first; full terms below. Read both."
        effectiveDate="01 May 2026"
      />

      <section className="bg-[#F8FAF4]">
        <Container size="lg" className="max-w-[1400px] py-12 lg:py-16">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="lg:sticky lg:top-28 lg:self-start">
              <Card
                variant="default"
                className="overflow-hidden rounded-3xl border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.05)]"
              >
                <div className="border-b border-slate-100 bg-[#4E8F01] p-5 text-white">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-[#A8E368]" />
                    <p className="text-[10px] font-black uppercase tracking-[0.16em]">
                      On this page
                    </p>
                  </div>

                  <p className="mt-2 text-sm leading-relaxed text-white/70">
                    Jump straight to the part of the agreement you care about.
                  </p>
                </div>

                <nav className="max-h-[calc(100vh-220px)] space-y-1 overflow-y-auto p-3">
                  {sections.map((s) => (
                    <a
                      key={s.id}
                      href={`#${s.id}`}
                      className="block rounded-sm px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-[#A8E368]/15 hover:text-[#4E8F01]"
                    >
                      {s.title}
                    </a>
                  ))}
                </nav>
              </Card>
            </aside>

            <article className="min-w-0">
              <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
                <TermsMetric
                  icon={<ShieldCheck className="h-5 w-5" />}
                  title="18+ only"
                  body="Players must be adults and resident in Nigeria."
                />

                <TermsMetric
                  icon={<Scale className="h-5 w-5" />}
                  title="Regulated draws"
                  body="Every ticket is tied to one draw and one public result."
                />

                <TermsMetric
                  icon={<Check className="h-5 w-5" />}
                  title="Verifiable result"
                  body="Draws use a public commit-reveal RNG process."
                />
              </div>

              <Card
                variant="default"
                className="mb-8 overflow-hidden rounded-3xl border-[#4E8F01]/15 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.06)]"
              >
                <div className="grid grid-cols-1 lg:grid-cols-[0.72fr_1fr]">
                  <div className="bg-[#4E8F01] p-7 text-white sm:p-8">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#A8E368]">
                      TLDR
                    </p>

                    <h2 className="mt-3 font-display text-3xl font-black leading-tight tracking-[-0.03em]">
                      The 60-second version.
                    </h2>

                    <p className="mt-4 text-sm leading-relaxed text-white/75">
                      This is the human-readable summary. The full legal wording still
                      applies, but this tells you what actually matters.
                    </p>
                  </div>

                  <div className="p-6 sm:p-8">
                    <ul className="grid grid-cols-1 gap-3 text-sm leading-relaxed text-slate-700 sm:grid-cols-2">
                      <SummaryItem>You must be 18+ and in Nigeria to play.</SummaryItem>
                      <SummaryItem>
                        Tickets are non-refundable except for cancelled draws or duplicate
                        charges.
                      </SummaryItem>
                      <SummaryItem>
                        Draws are decided by a public, verifiable RNG process.
                      </SummaryItem>
                      <SummaryItem>
                        Cash prizes may have withholding tax deducted under Nigerian law.
                      </SummaryItem>
                      <SummaryItem>
                        Product-to-cash conversion rules only apply within the stated window.
                      </SummaryItem>
                      <SummaryItem>
                        Spend caps and self-exclusion are enforced server-side.
                      </SummaryItem>
                    </ul>
                  </div>
                </div>
              </Card>

              <div className="space-y-5">
                {sections.map((s) => (
                  <section
                    key={s.id}
                    id={s.id}
                    className="scroll-mt-28 rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.04)] sm:p-8"
                  >
                    <h2 className="font-display text-2xl font-black tracking-[-0.03em] text-navy-950">
                      {s.title}
                    </h2>

                    <div className="mt-5 space-y-4 text-sm leading-relaxed text-slate-700 sm:text-base">
                      {s.body.map((p, i) => (
                        <p key={i}>{p}</p>
                      ))}
                    </div>
                  </section>
                ))}
              </div>

              <Card
                variant="default"
                className="mt-8 overflow-hidden rounded-3xl border-[#4E8F01]/15 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.05)]"
              >
                <div className="grid grid-cols-1 gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#4E8F01]">
                      Questions about these terms?
                    </p>

                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
                      For legal questions, email the legal team. For prize or ticket
                      disputes, use the dispute resolution process so the issue is tracked
                      properly.
                    </p>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <a
                      href="mailto:legal@surewina.ng"
                      className="inline-flex items-center justify-center gap-2 rounded-sm bg-[#4E8F01] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#3f7601]"
                    >
                      <Mail className="h-4 w-4" />
                      legal@surewina.ng
                    </a>

                    <Link
                      href="/disputes"
                      className="inline-flex items-center justify-center rounded-sm border border-[#4E8F01]/20 bg-[#A8E368]/15 px-4 py-3 text-sm font-bold text-[#4E8F01] transition hover:bg-[#A8E368]/25"
                    >
                      Dispute resolution
                    </Link>
                  </div>
                </div>
              </Card>
            </article>
          </div>
        </Container>
      </section>
    </main>
  );
}

function TermsMetric({
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

function SummaryItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 rounded-2xl border border-[#4E8F01]/10 bg-[#F8FAF4] p-4">
      <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#4E8F01] text-white">
        <Check className="h-3 w-3" />
      </span>
      <span>{children}</span>
    </li>
  );
}