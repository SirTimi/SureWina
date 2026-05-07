import { Metadata } from 'next';
import { Container } from '@surewina/ui';
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

      <Container size="lg" className="max-w-[1180px] py-12 lg:py-16">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[260px_1fr]">
          {/* TOC */}
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">
              On this page
            </p>
            <nav className="space-y-1">
              {sections.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="block rounded-lg px-3 py-2 text-sm text-slate-600 transition hover:bg-emerald-50 hover:text-[#4E8F01]"
                >
                  {s.title}
                </a>
              ))}
            </nav>
          </aside>

          {/* Content */}
          <article>
            {/* Plain-language summary */}
            <div className="mb-12 rounded-2xl border-2 border-emerald-200 bg-emerald-50/40 p-6 sm:p-7">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">
                In plain English
              </p>
              <h2 className="mt-2 font-display text-xl font-bold text-navy-950">
                The 60-second version
              </h2>
              <ul className="mt-4 space-y-2.5 text-sm text-slate-700">
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#4E8F01]" />
                  <span>You must be 18+ and in Nigeria to play.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#4E8F01]" />
                  <span>
                    Tickets are non-refundable except if a draw is cancelled or you were
                    accidentally double-charged.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#4E8F01]" />
                  <span>
                    Draws are decided by a public, verifiable RNG. Anyone can audit the seed.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#4E8F01]" />
                  <span>
                    Cash prizes have 10% WHT deducted (Nigerian law). Product prizes don&apos;t.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#4E8F01]" />
                  <span>
                    You can convert product to cash (or vice versa) within 48 hours of choosing.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#4E8F01]" />
                  <span>
                    You can set spend caps and self-exclude any time. We enforce them server-side.
                  </span>
                </li>
              </ul>
            </div>

            {/* Sections */}
            <div className="space-y-12">
              {sections.map((s) => (
                <section key={s.id} id={s.id} className="scroll-mt-6">
                  <h2 className="font-display text-2xl font-black text-navy-950">{s.title}</h2>
                  <div className="mt-4 space-y-4 text-sm leading-relaxed text-slate-700 sm:text-base">
                    {s.body.map((p, i) => (
                      <p key={i}>{p}</p>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <div className="mt-16 rounded-2xl border border-slate-200 bg-slate-50/50 p-6">
              <p className="text-sm text-slate-600">
                Questions about these terms? Email{' '}
                <a
                  href="mailto:legal@surewina.ng"
                  className="font-semibold text-[#4E8F01] hover:underline"
                >
                  legal@surewina.ng
                </a>
                . For disputes, see our{' '}
                <a
                  href="/disputes"
                  className="font-semibold text-[#4E8F01] hover:underline"
                >
                  Dispute Resolution
                </a>{' '}
                page.
              </p>
            </div>
          </article>
        </div>
      </Container>
    </main>
  );
}