import { Metadata } from 'next';
import Link from 'next/link';
import { AlertCircle, ArrowRight, ChevronRight, Mail, Phone, Scale } from 'lucide-react';
import { Button, Container } from '@surewina/ui';
import { LegalPageHeader } from '@/components/legal-page-header';

export const metadata: Metadata = {
  title: 'Dispute Resolution · Surewina',
  description:
    'How to raise a complaint about a Surewina draw, ticket, or claim. Three-tier escalation ladder.',
};

const ladderSteps = [
  {
    step: '1',
    duration: '24 hours',
    title: 'Contact our claims team',
    description:
      'Email or WhatsApp our claims team with your ticket reference and a clear description. We respond within 24 hours.',
    contact: { type: 'email', value: 'claims@surewina.ng' },
  },
  {
    step: '2',
    duration: '7 days',
    title: 'Formal review by Compliance',
    description:
      'If the claims team can\'t resolve it, we escalate to our Compliance Officer. They review the audit log end-to-end and respond with a written decision within 7 working days.',
    contact: { type: 'email', value: 'compliance@surewina.ng' },
  },
  {
    step: '3',
    duration: '30 days',
    title: 'Escalate to NLRC',
    description:
      'If you\'re still not satisfied, you can escalate to the National Lottery Regulatory Commission — Surewina\'s regulator. They are independent of us and can compel us to act.',
    contact: { type: 'external', value: 'https://nlrc.gov.ng/complaints' },
  },
];

const commonIssues = [
  {
    title: 'I bought a ticket but didn\'t get the SMS',
    body: 'Wait 5 minutes — Nigerian SMS networks can be slow. If still nothing after 5 minutes, contact claims@surewina.ng with your phone number and the approximate purchase time. We can resend the ticket reference immediately.',
  },
  {
    title: 'I think I won but didn\'t receive a notification',
    body: 'Use the public results archive (/results) and check your ticket reference against the winning ticket. If your reference matches and you didn\'t hear from us, that\'s a serious bug — please contact claims@surewina.ng with proof of purchase. We will manually validate and pay out.',
  },
  {
    title: 'I think the RNG was rigged',
    body: 'Open the Audit Method page (/audit) for the cryptographic proof. Every draw publishes a SHA-256 seed hash before it runs and reveals the seed after. You can re-run the RNG yourself with the published seed to verify the winning ticket index. If your verification doesn\'t match ours, that is a verifiable claim of fraud and we will treat it with the seriousness it deserves.',
  },
  {
    title: 'My cash prize hasn\'t arrived after 24 hours',
    body: 'Bank transfers in Nigeria sometimes take longer than expected — try 48 hours before raising a dispute. If still not received, contact claims@surewina.ng with the claim ID. We will reissue the transfer or work with your bank to trace it.',
  },
  {
    title: 'My agent is acting in bad faith',
    body: 'Agent issues are taken seriously. Email agents@surewina.ng with the agent\'s code (visible on your SMS receipt) and a description. Confirmed misconduct results in suspension or termination of the agent.',
  },
];

export default function DisputesPage() {
  return (
    <main>
      <LegalPageHeader
        eyebrow="Support · disputes"
        title="Something went wrong?"
        subtitle="Every player has the right to a fair, fast resolution. Here's exactly how to raise an issue and what happens next at each step."
      />

      <Container size="lg" className="max-w-[1400px] py-12 lg:py-16">
        {/* Promise card */}
        <div className="mb-12 overflow-hidden rounded-2xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50/60 to-white p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <Scale className="h-6 w-6 shrink-0 text-[#4E8F01]" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">
                Our promise
              </p>
              <h2 className="mt-2 font-display text-2xl font-black text-navy-950">
                We pay disputed prizes pending investigation.
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-700">
                If the dispute is over a prize claim and the audit log clearly supports the
                player&apos;s position, we pay the prize first and continue the investigation
                afterwards. We never punish the player for our mistake.
              </p>
            </div>
          </div>
        </div>

        {/* Escalation ladder */}
        <h2 className="font-display text-3xl font-black text-navy-950">The escalation ladder</h2>
        <p className="mt-3 max-w-2xl text-base text-slate-600">
          Most issues are resolved at step 1. The ladder exists so that no complaint goes
          unheard, even if our front-line team gets it wrong.
        </p>

        <div className="mt-8 space-y-4">
          {ladderSteps.map((step) => (
            <div
              key={step.step}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)] sm:p-7"
            >
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                <div className="flex shrink-0 items-center gap-4 sm:flex-col sm:items-center sm:gap-2">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#A8E368]/30 to-emerald-50 font-display text-xl font-black text-[#4E8F01]">
                    {step.step}
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">
                    Within {step.duration}
                  </div>
                </div>

                <div className="flex-1">
                  <h3 className="font-display text-xl font-bold text-navy-950">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-700">
                    {step.description}
                  </p>
                  <div className="mt-4">
                    {step.contact.type === 'email' ? (
                      <a
                        href={`mailto:${step.contact.value}`}
                        className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-[#4E8F01] transition hover:bg-emerald-100"
                      >
                        <Mail className="h-4 w-4" />
                        {step.contact.value}
                      </a>
                    ) : (
                      <a
                        href={step.contact.value}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-[#4E8F01] transition hover:bg-emerald-100"
                      >
                        nlrc.gov.ng/complaints
                        <ChevronRight className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Common issues */}
        <h2 className="mt-16 font-display text-3xl font-black text-navy-950">
          Issues we hear about most
        </h2>
        <p className="mt-3 max-w-2xl text-base text-slate-600">
          A lot of complaints have known fast paths. Try these before opening a dispute.
        </p>

        <div className="mt-8 space-y-3">
          {commonIssues.map((issue, i) => (
            <details
              key={i}
              className="group overflow-hidden rounded-2xl border border-slate-200 bg-white"
            >
              <summary className="flex cursor-pointer items-center justify-between gap-4 p-5 transition hover:bg-slate-50">
                <h3 className="font-bold text-navy-950">{issue.title}</h3>
                <ChevronRight className="h-5 w-5 shrink-0 text-slate-400 transition group-open:rotate-90" />
              </summary>
              <div className="border-t border-slate-100 bg-slate-50/40 p-5">
                <p className="text-sm leading-relaxed text-slate-700">{issue.body}</p>
              </div>
            </details>
          ))}
        </div>

        {/* Phone CTA */}
        <div className="mt-16 overflow-hidden rounded-2xl bg-navy-950 p-8 text-white">
          <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-sm border border-amber-400/20 bg-amber-400/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300">
                <Phone className="h-3.5 w-3.5" />
                Need help right now?
              </div>
              <h3 className="mt-3 font-display text-2xl font-bold">
                Call our urgent claims line.
              </h3>
              <p className="mt-2 max-w-md text-sm text-white/70">
                For time-sensitive issues like missed claim deadlines or suspected fraud, call us
                directly. Available 09:00–18:00 WAT, Mon–Sat.
              </p>
            </div>
            <a href="tel:0700SUREWINA">
              <Button
                variant="accent"
                size="lg"
                className="rounded-sm !border-transparent bg-[#A8E368] font-bold text-navy-950 shadow-[0_16px_34px_rgba(78,143,1,0.22)] hover:!border-transparent hover:bg-[#B7EF79]"
              >
                <Phone className="h-4 w-4" />
                0700-SUREWINA
              </Button>
            </a>
          </div>
        </div>
      </Container>
    </main>
  );
}