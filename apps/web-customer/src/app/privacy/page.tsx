import { Metadata } from 'next';
import Link from 'next/link';
import {
  Check,
  Cookie,
  Database,
  FileText,
  Lock,
  Mail,
  Phone,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { Card, Container } from '@surewina/ui';
import { LegalPageHeader } from '@/components/legal-page-header';

export const metadata: Metadata = {
  title: 'Privacy Policy · Surewina',
  description:
    'How Surewina collects, stores, and uses your data. NDPA compliant, Nigeria-first, no third-party ad trackers.',
};

const sections = [
  {
    id: 'what-we-collect',
    title: '1. What we collect',
    body: [
      'When you buy a ticket: your phone number, the state of play you selected, the payment method used, and the ticket reference assigned to you. Phone is the only identity anchor we require.',
      "When you create an account (optional, only for returning players): your phone number is verified once via SMS OTP. We do not store passwords because we don't use any.",
      'When you win a cash prize over ₦10,000: government-issued ID image, a selfie, your BVN (we verify, then store only the last 4 digits), and your bank account details.',
      'When you use the website: standard server logs such as IP address, user agent, and timestamps for security and abuse prevention. We do not use third-party analytics or ad trackers.',
    ],
  },
  {
    id: 'why-we-collect',
    title: '2. Why we collect it',
    body: [
      "Phone number — to deliver your ticket reference, draw alerts, and win notifications. This is mandatory because lottery regulation requires us to identify ticket holders.",
      'KYC data, only for qualifying cash winners — to comply with National Lottery Regulatory Commission and tax requirements before paying cash prizes.',
      'Server logs — to detect fraud, debug technical issues, prevent abuse, and respond to security incidents.',
    ],
  },
  {
    id: 'where-it-lives',
    title: '3. Where your data lives',
    body: [
      'Player records are stored in controlled production systems with restricted access, audit trails, and role-based permissions.',
      'Sensitive data is encrypted at rest. Data sent between your browser and Surewina is encrypted in transit using HTTPS.',
      'Backups are encrypted, access-controlled, and retained only for operational, security, and regulatory purposes.',
    ],
  },
  {
    id: 'how-long-we-keep-it',
    title: '4. How long we keep it',
    body: [
      'Phone number, ticket records, and audit logs may be kept for up to 7 years where required for lottery, tax, fraud prevention, and regulatory record-keeping.',
      'KYC documents are retained only as long as required for verification, payout, legal compliance, dispute handling, and regulatory obligations.',
      'Server logs are kept for security and abuse prevention, then deleted or anonymised when no longer needed.',
      'If you self-exclude permanently, identifiers required to enforce that exclusion may be kept on a permanent block list so the exclusion cannot be bypassed.',
    ],
  },
  {
    id: 'who-sees-it',
    title: '5. Who sees your data',
    body: [
      'Inside Surewina: only teams that need access to do their job. Customer support may see ticket history. Compliance may see KYC. Engineering may see technical logs under access controls.',
      'Outside Surewina: payment processors may receive the information required to process your payment. Banks may receive the information required to pay cash prizes.',
      'Government bodies and regulators may receive information only where required by law, regulation, lawful request, investigation, or compliance process.',
      'We never sell, rent, or share your data with marketers, ad networks, data brokers, or other third parties for advertising.',
    ],
  },
  {
    id: 'your-rights',
    title: '6. Your rights under NDPA',
    body: [
      'Right of access — you can request a copy of the personal data we hold about you by emailing privacy@surewina.ng.',
      'Right to rectification — you can ask us to correct inaccurate personal data.',
      'Right to erasure — you can request deletion of your data, subject to legal, regulatory, tax, fraud prevention, dispute, and audit retention requirements.',
      'Right to object — you can opt out of non-essential promotional SMS. Transactional SMS such as ticket confirmations and win notifications may still be required.',
      'Right to data portability — you can request your data in a structured format where applicable.',
      'Right to lodge a complaint — you can complain to the Nigeria Data Protection Commission if you believe your data has been mishandled.',
    ],
  },
  {
    id: 'cookies',
    title: '7. Cookies and tracking',
    body: [
      "We use essential cookies to keep the site working, remember sessions, and protect accounts. These are not advertising cookies.",
      'No third-party advertising cookies. No Facebook pixel. No ad-network tracking.',
      'Where analytics are used, they should be aggregated and privacy-conscious, not used to sell or profile individual players.',
    ],
  },
  {
    id: 'children',
    title: '8. Children',
    body: [
      'Surewina is for adults only. We do not knowingly collect data from anyone under 18. If we discover an underage account or ticket purchase, we act according to law, platform rules, and responsible play requirements.',
    ],
  },
  {
    id: 'contact',
    title: '9. Contact',
    body: [
      'Privacy questions or NDPA requests: privacy@surewina.ng',
      'Data Protection Officer: dpo@surewina.ng',
      'Postal: Surewina Limited, attn: DPO, Lagos, Nigeria',
    ],
  },
];

const commitments = [
  {
    icon: Database,
    title: 'Data minimised',
    body: 'We collect what is needed to issue tickets, verify winners, process payments, and meet legal obligations.',
  },
  {
    icon: Cookie,
    title: 'No ad trackers',
    body: 'No ad-network tracking, no data broker sharing, and no third-party advertising cookies.',
  },
  {
    icon: Phone,
    title: 'Phone-first access',
    body: 'Ticket access is built around SMS and OTP. No password database to leak.',
  },
];

export default function PrivacyPage() {
  return (
    <main>
      <LegalPageHeader
        eyebrow="Legal · privacy"
        title="Your data is yours."
        subtitle="We collect the minimum we need to run the platform legally, protect players, verify winners, and keep public draw records trustworthy."
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
                      Privacy policy
                    </p>
                  </div>

                  <p className="mt-2 text-sm leading-relaxed text-white/70">
                    Jump to what we collect, why we collect it, and what rights you have.
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
                {commitments.map((item) => {
                  const Icon = item.icon;

                  return (
                    <Card
                      key={item.title}
                      variant="default"
                      className="rounded-2xl border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.04)]"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-[#A8E368]/35 text-[#4E8F01]">
                          <Icon className="h-5 w-5" />
                        </div>

                        <div>
                          <h3 className="text-sm font-black text-navy-950">
                            {item.title}
                          </h3>
                          <p className="mt-1 text-sm leading-relaxed text-slate-500">
                            {item.body}
                          </p>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>

              <Card
                variant="default"
                className="mb-8 overflow-hidden rounded-3xl border-[#4E8F01]/15 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.06)]"
              >
                <div className="grid grid-cols-1 lg:grid-cols-[0.72fr_1fr]">
                  <div className="bg-[#4E8F01] p-7 text-white sm:p-8">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#A8E368]">
                      Our privacy position
                    </p>

                    <h2 className="mt-3 font-display text-3xl font-black leading-tight tracking-[-0.03em]">
                      We are not in the business of selling player data.
                    </h2>

                    <p className="mt-4 text-sm leading-relaxed text-white/75">
                      The product needs trust. Selling data destroys trust. So the model is
                      simple: use data to run the platform, protect players, and meet the law.
                    </p>
                  </div>

                  <div className="p-6 sm:p-8">
                    <ul className="grid grid-cols-1 gap-3 text-sm leading-relaxed text-slate-700 sm:grid-cols-2">
                      <PrivacySummaryItem>
                        We use your phone number to issue tickets and notify you.
                      </PrivacySummaryItem>
                      <PrivacySummaryItem>
                        We request KYC only when needed for prize claims or compliance.
                      </PrivacySummaryItem>
                      <PrivacySummaryItem>
                        We do not sell your data to advertisers or brokers.
                      </PrivacySummaryItem>
                      <PrivacySummaryItem>
                        We keep ticket and draw records where required for audit and regulation.
                      </PrivacySummaryItem>
                      <PrivacySummaryItem>
                        You can request access, correction, deletion, or portability.
                      </PrivacySummaryItem>
                      <PrivacySummaryItem>
                        Self-exclusion records may be retained to enforce player protection.
                      </PrivacySummaryItem>
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
                      Privacy requests
                    </p>

                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
                      For NDPA requests, privacy questions, or account data concerns,
                      contact the privacy team directly.
                    </p>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <a
                      href="mailto:privacy@surewina.ng"
                      className="inline-flex items-center justify-center gap-2 rounded-sm bg-[#4E8F01] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#3f7601]"
                    >
                      <Mail className="h-4 w-4" />
                      privacy@surewina.ng
                    </a>

                    <Link
                      href="/disputes"
                      className="inline-flex items-center justify-center rounded-sm border border-[#4E8F01]/20 bg-[#A8E368]/15 px-4 py-3 text-sm font-bold text-[#4E8F01] transition hover:bg-[#A8E368]/25"
                    >
                      Open a dispute
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

function PrivacySummaryItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 rounded-2xl border border-[#4E8F01]/10 bg-[#F8FAF4] p-4">
      <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#4E8F01] text-white">
        <Check className="h-3 w-3" />
      </span>
      <span>{children}</span>
    </li>
  );
}