import { Metadata } from 'next';
import { Container } from '@surewina/ui';
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
      'When you create an account (optional, only for returning players): your phone number is verified once via SMS OTP. We do not store passwords because we don\'t use any.',
      'When you win a cash prize over ₦10,000: government-issued ID image, a selfie, your BVN (we verify, then store only the last 4 digits), and your bank account details.',
      'When you use the website: standard server logs (IP address, user agent, timestamps) for security and abuse prevention. We do not use third-party analytics or ad trackers.',
    ],
  },
  {
    id: 'why-we-collect',
    title: '2. Why we collect it',
    body: [
      'Phone number — to deliver your ticket reference, draw alerts, and win notifications. This is the only purpose, and it\'s mandatory because lottery regulation requires us to identify ticket holders.',
      'KYC data (only for cash winners) — to comply with the National Lottery Regulatory Commission (NLRC) and Federal Inland Revenue Service requirements before paying cash prizes.',
      'Server logs — to detect fraud, debug issues, and respond to security incidents.',
    ],
  },
  {
    id: 'where-it-lives',
    title: '3. Where your data lives',
    body: [
      'All databases are hosted in Nigerian data centres (specifically AWS af-south-1 region for primary and Rack Centre Lagos for secondary backup). Your data does not leave Nigeria.',
      'Encrypted at rest using AES-256. Encrypted in transit using TLS 1.3 only — TLS 1.2 and below are explicitly disabled.',
      'Backups are encrypted and rotated weekly; old backups are securely destroyed after 90 days.',
    ],
  },
  {
    id: 'how-long-we-keep-it',
    title: '4. How long we keep it',
    body: [
      'Phone number, ticket records, and audit logs: 7 years from the date of last activity. This is mandated by Nigerian lottery and tax law for record-keeping.',
      'KYC documents (ID image, selfie): 90 days after your prize is paid. After that they are cryptographically erased — not just deleted from a database, but the storage blocks are overwritten.',
      'Server logs (IP, user agent): 90 days unless flagged for an active security investigation.',
      'If you self-exclude permanently, your phone number, ID hash, and BVN hash are kept on a permanent block list — these are required to prevent re-registration and cannot be deleted.',
    ],
  },
  {
    id: 'who-sees-it',
    title: '5. Who sees your data',
    body: [
      'Inside Surewina: only the smallest team that needs access to do their job. Customer support sees phone + ticket history. Compliance sees KYC. Engineering sees server logs but never PII without an audit trail entry.',
      'Outside Surewina: payment processors (Paystack and Flutterwave) see your phone number and amount when you buy a ticket — they need it to authorise the charge. The bank you nominate for cash payouts sees your account name and amount. Nothing else is shared.',
      'Government bodies (NLRC, FIRS, EFCC) get access only when legally compelled. Each request is logged and you are notified, where lawfully possible.',
      'We never sell, rent, or share your data with marketers, ad networks, data brokers, or other third parties. Period.',
    ],
  },
  {
    id: 'your-rights',
    title: '6. Your rights under NDPA',
    body: [
      'Right of access — you can request a copy of all data we hold about you, by emailing privacy@surewina.ng. We respond within 7 working days.',
      'Right to rectification — you can correct any inaccurate personal data via your account settings or by contacting us.',
      'Right to erasure — you can request deletion of your data, subject to legal retention requirements above. Tickets, audit logs, and KYC records under regulatory hold cannot be deleted on demand.',
      'Right to object — you can opt out of all non-essential SMS (e.g. promotional offers) at any time from notification settings. Transactional SMS (ticket confirmations, win notifications) are required and cannot be disabled.',
      'Right to data portability — you can request your data in JSON format, suitable for transfer to another service.',
      'Right to lodge a complaint — you can complain to the Nigeria Data Protection Commission (NDPC) at https://ndpc.gov.ng if you believe we have mishandled your data.',
    ],
  },
  {
    id: 'cookies',
    title: '7. Cookies and tracking',
    body: [
      'We use one cookie: a session cookie that remembers you\'re signed in. It expires when you close your browser unless you explicitly check "remember me", in which case it lasts 30 days.',
      'No third-party cookies. No advertising trackers. No fingerprinting. No Facebook pixel. No Google Tag Manager.',
      'For analytics we use server-side aggregated logs. Individual user behaviour is not tracked across pages.',
    ],
  },
  {
    id: 'children',
    title: '8. Children',
    body: [
      'Surewina is for adults only. We do not knowingly collect data from anyone under 18. If we discover an underage account, we close it immediately, refund any tickets, and delete all data we are not legally required to keep.',
    ],
  },
  {
    id: 'contact',
    title: '9. Contact',
    body: [
      'Privacy questions or NDPA requests: privacy@surewina.ng',
      'Data Protection Officer: dpo@surewina.ng',
      'Postal: Surewina Limited, attn: DPO, [registered office address], Lagos, Nigeria',
    ],
  },
];

export default function PrivacyPage() {
  return (
    <main>
      <LegalPageHeader
        eyebrow="Legal · privacy"
        title="Your data is yours."
        subtitle="We collect the minimum we need to run the platform legally, store it in Nigeria, never sell it, and let you delete most of it any time. Here's the full picture."
        effectiveDate="01 May 2026"
      />

      <Container size="lg" className="max-w-[1400px] py-12 lg:py-16">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[260px_1fr]">
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

          <article>
            {/* Headline commitments */}
            <div className="mb-12 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                {
                  k: 'Hosted in Nigeria',
                  v: 'AWS af-south-1 + local backup. Your data does not leave the country.',
                },
                {
                  k: 'Zero ad trackers',
                  v: 'No Google Analytics, no Facebook Pixel, no third-party trackers.',
                },
                {
                  k: 'Phone-first',
                  v: 'No password to leak. No email needed unless you want one.',
                },
              ].map((item) => (
                <div
                  key={item.k}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]"
                >
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">
                    {item.k}
                  </p>
                  <p className="mt-2 text-sm text-slate-700">{item.v}</p>
                </div>
              ))}
            </div>

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
          </article>
        </div>
      </Container>
    </main>
  );
}