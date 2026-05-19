import { Metadata } from 'next';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowRight,
  ChevronRight,
  Clock,
  Mail,
  Phone,
  Scale,
  ShieldCheck,
} from 'lucide-react';
import { Button, Card, Container } from '@surewina/ui';
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
      "If the claims team can't resolve it, we escalate to our Compliance Officer. They review the audit log end-to-end and respond with a written decision within 7 working days.",
    contact: { type: 'email', value: 'compliance@surewina.ng' },
  },
  {
    step: '3',
    duration: '30 days',
    title: 'Escalate to NLRC',
    description:
      "If you're still not satisfied, you can escalate to the National Lottery Regulatory Commission — Surewina's regulator. They are independent of us and can compel us to act.",
    contact: { type: 'external', value: 'https://nlrc.gov.ng/complaints' },
  },
];

const commonIssues = [
  {
    title: "I bought a ticket but didn't get the SMS",
    body:
      'Wait 5 minutes — Nigerian SMS networks can be slow. If still nothing after 5 minutes, contact claims@surewina.ng with your phone number and the approximate purchase time. We can resend the ticket reference immediately.',
  },
  {
    title: "I think I won but didn't receive a notification",
    body:
      "Use the public results archive (/results) and check your ticket reference against the winning ticket. If your reference matches and you didn't hear from us, that's a serious bug — please contact claims@surewina.ng with proof of purchase. We will manually validate and pay out.",
  },
  {
    title: 'I think the RNG was rigged',
    body:
      "Open the Audit Method page (/audit) for the cryptographic proof. Every draw publishes a SHA-256 seed hash before it runs and reveals the seed after. You can re-run the RNG yourself with the published seed to verify the winning ticket index. If your verification doesn't match ours, that is a verifiable claim of fraud and we will treat it with the seriousness it deserves.",
  },
  {
    title: "My cash prize hasn't arrived after 24 hours",
    body:
      'Bank transfers in Nigeria sometimes take longer than expected — try 48 hours before raising a dispute. If still not received, contact claims@surewina.ng with the claim ID. We will reissue the transfer or work with your bank to trace it.',
  },
  {
    title: 'My agent is acting in bad faith',
    body:
      "Agent issues are taken seriously. Email agents@surewina.ng with the agent's code (visible on your SMS receipt) and a description. Confirmed misconduct results in suspension or termination of the agent.",
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

      <section className="bg-[#F8FAF4]">
        <Container size="lg" className="max-w-[1400px] py-12 lg:py-16">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[360px_minmax(0,1fr)]">
            <aside className="lg:sticky lg:top-28 lg:self-start">
              <Card
                variant="default"
                className="overflow-hidden rounded-3xl border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.05)]"
              >
                <div className="bg-navy-800 p-6 text-white">
                  <div className="flex h-12 w-12 items-center justify-center rounded-sm bg-amber-500 text-navy-950">
                    <Scale className="h-6 w-6" />
                  </div>

                  <h2 className="mt-5 font-display text-3xl font-black leading-tight tracking-[-0.03em]">
                    Fair resolution, not customer service theatre.
                  </h2>

                  <p className="mt-4 text-sm leading-relaxed text-white/75">
                    If the audit log supports the player, the player wins. Simple.
                  </p>
                </div>

                <div className="space-y-3 p-5">
                  <QuickFact
                    icon={<Clock className="h-4 w-4" />}
                    title="First response"
                    body="Within 24 hours"
                  />
                  <QuickFact
                    icon={<ShieldCheck className="h-4 w-4" />}
                    title="Formal review"
                    body="Compliance decision within 7 working days"
                  />
                  <QuickFact
                    icon={<AlertCircle className="h-4 w-4" />}
                    title="Escalation"
                    body="NLRC route available if unresolved"
                  />
                </div>
              </Card>
            </aside>

            <div className="min-w-0">
              <Card
                variant="default"
                className="mb-8 overflow-hidden rounded-3xl border-navy-100 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.06)]"
              >
                <div className="grid grid-cols-1 lg:grid-cols-[0.72fr_1fr]">
                  <div className="bg-navy-800 p-7 text-white sm:p-8">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-400">
                      Our promise
                    </p>

                    <h2 className="mt-3 font-display text-3xl font-black leading-tight tracking-[-0.03em]">
                      We pay supported disputes.
                    </h2>

                    <p className="mt-4 text-sm leading-relaxed text-white/75">
                      Not “we’ll look into it forever.” If the records support you, we
                      resolve it.
                    </p>
                  </div>

                  <div className="p-6 sm:p-8">
                    <div className="rounded-2xl border border-navy-100 bg-[#F8FAF4] p-5">
                      <p className="text-sm leading-relaxed text-slate-700">
                        If the dispute is over a prize claim and the audit log clearly
                        supports the player&apos;s position, we pay the prize first and
                        continue the investigation afterwards. We never punish the player
                        for our mistake.
                      </p>
                    </div>
                  </div>
                </div>
              </Card>

              <div className="mb-8">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
                  Escalation ladder
                </p>

                <h2 className="mt-2 font-display text-3xl font-black tracking-[-0.03em] text-navy-950">
                  Three steps. Clear owners. No guessing.
                </h2>

                <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-600">
                  Most issues are resolved at step 1. The ladder exists so no complaint
                  disappears when a front-line answer is not enough.
                </p>
              </div>

              <div className="relative space-y-4">
                <div className="absolute left-6 top-8 hidden h-[calc(100%-4rem)] w-px bg-navy-50 sm:block" />

                {ladderSteps.map((step) => (
                  <Card
                    key={step.step}
                    variant="default"
                    className="relative overflow-hidden rounded-3xl border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.04)] sm:p-7"
                  >
                    <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                      <div className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-sm bg-navy-800 font-display text-xl font-black text-white">
                        {step.step}
                      </div>

                      <div className="flex-1">
                        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
                              Within {step.duration}
                            </p>

                            <h3 className="mt-1 font-display text-2xl font-black tracking-[-0.03em] text-navy-950">
                              {step.title}
                            </h3>
                          </div>

                          <ContactButton contact={step.contact} />
                        </div>

                        <p className="mt-4 text-sm leading-relaxed text-slate-600">
                          {step.description}
                        </p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>

              <div className="mt-14">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
                  Fast paths
                </p>

                <h2 className="mt-2 font-display text-3xl font-black tracking-[-0.03em] text-navy-950">
                  Issues we hear about most.
                </h2>

                <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-600">
                  A lot of complaints have known routes. Try these before opening a
                  formal dispute.
                </p>

                <div className="mt-6 space-y-3">
                  {commonIssues.map((issue, i) => (
                    <details
                      key={i}
                      className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_34px_rgba(15,23,42,0.03)]"
                    >
                      <summary className="flex cursor-pointer items-center justify-between gap-4 p-5 transition hover:bg-amber-50">
                        <h3 className="font-bold text-navy-950">{issue.title}</h3>
                        <ChevronRight className="h-5 w-5 shrink-0 text-navy-700 transition group-open:rotate-90" />
                      </summary>

                      <div className="border-t border-slate-100 bg-[#F8FAF4] p-5">
                        <p className="text-sm leading-relaxed text-slate-700">
                          {issue.body}
                        </p>
                      </div>
                    </details>
                  ))}
                </div>
              </div>

              <Card
                variant="default"
                className="mt-10 overflow-hidden rounded-3xl border-navy-100 bg-navy-800 p-8 text-white shadow-[0_24px_70px_rgba(1,58,168,0.18)] sm:p-10"
              >
                <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div>
                    <div className="mb-4 inline-flex items-center gap-2 rounded-sm bg-amber-500 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-navy-950">
                      <Phone className="h-4 w-4" />
                      Need help right now?
                    </div>

                    <h3 className="font-display text-3xl font-black tracking-[-0.03em] text-white">
                      Call our urgent claims line.
                    </h3>

                    <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/75">
                      For time-sensitive issues like missed claim deadlines or suspected
                      fraud, call us directly. Available 09:00–18:00 WAT, Mon–Sat.
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
            </div>
          </div>
        </Container>
      </section>
    </main>
  );
}

function QuickFact({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-navy-100 bg-[#F8FAF4] p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-navy-50 text-navy-700">
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

function ContactButton({
  contact,
}: {
  contact: { type: string; value: string };
}) {
  if (contact.type === 'email') {
    return (
      <a
        href={`mailto:${contact.value}`}
        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-sm border border-navy-200 bg-amber-50 px-4 py-2 text-sm font-bold text-navy-700 transition hover:bg-amber-100"
      >
        <Mail className="h-4 w-4" />
        {contact.value}
      </a>
    );
  }

  return (
    <a
      href={contact.value}
      target="_blank"
      rel="noreferrer"
      className="inline-flex shrink-0 items-center justify-center gap-2 rounded-sm border border-navy-200 bg-amber-50 px-4 py-2 text-sm font-bold text-navy-700 transition hover:bg-amber-100"
    >
      nlrc.gov.ng/complaints
      <ArrowRight className="h-4 w-4" />
    </a>
  );
}