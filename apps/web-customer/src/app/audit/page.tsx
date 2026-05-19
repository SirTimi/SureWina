import { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  Check,
  Clock,
  ExternalLink,
  FileCheck,
  GitBranch,
  Hash,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import { Button, Card, Container } from '@surewina/ui';
import { LegalPageHeader } from '@/components/legal-page-header';

export const metadata: Metadata = {
  title: 'Audit Method · Surewina',
  description:
    'How Surewina makes raffle draws verifiable using seed commitments, deterministic selection, and public result records.',
};

const stages = [
  {
    n: '01',
    icon: Lock,
    title: 'Seed commit',
    when: 'Before the draw',
    description:
      'A random seed is generated before the draw. We publish a hash of that seed before the draw runs, so the seed cannot be quietly changed afterwards without the hash changing too.',
    technical:
      'Public record: drawCode, scheduledAt, seedHash, commit timestamp.',
  },
  {
    n: '02',
    icon: Clock,
    title: 'Ticket sales close',
    when: 'Before winner selection',
    description:
      'Ticket sales close before the draw runs. The eligible ticket list is locked so that no ticket can be inserted after the result is known.',
    technical:
      'Public record: drawCode, ticket count, close timestamp, eligible ticket references or inclusion proof.',
  },
  {
    n: '03',
    icon: GitBranch,
    title: 'Deterministic selection',
    when: 'At draw time',
    description:
      'The committed seed is used with the locked ticket list to select a winning index. The same inputs should always produce the same winner.',
    technical:
      'Verification idea: same seed + same draw code + same ticket list = same winning index.',
  },
  {
    n: '04',
    icon: Hash,
    title: 'Seed reveal',
    when: 'After the draw',
    description:
      'After the winner is selected, the original seed is revealed. Anyone can hash the revealed seed and check that it matches the pre-draw seed hash.',
    technical:
      'Verification check: hash(revealedSeed) must equal the published seedHash.',
  },
  {
    n: '05',
    icon: FileCheck,
    title: 'Public archive',
    when: 'After publication',
    description:
      'The winning ticket reference, draw time, seed hash, and verification data are kept in the public results archive.',
    technical:
      'Archive fields: drawCode, executedAt, winnerTicketRef, seedHash, revealedSeed, ticketCount.',
  },
];

const principles = [
  {
    title: 'Commit before',
    body:
      'The seed hash is published before the draw. That makes it hard to switch the seed after seeing the ticket list.',
  },
  {
    title: 'Reveal after',
    body:
      'The original seed is revealed after the draw so the public can check it against the earlier hash.',
  },
  {
    title: 'Re-run the result',
    body:
      'With the same seed and ticket list, the same selection process should reproduce the same winning ticket.',
  },
];

export default function AuditPage() {
  return (
    <main>
      <LegalPageHeader
        eyebrow="Trust · audit method"
        title="How we prove the draw was fair."
        subtitle="A draw is verifiable when the public can check the inputs, repeat the logic, and reach the same winner. This is the plain-English version of how Surewina intends to make draws auditable."
        backHref="/how-it-works"
        backLabel="Back to how it works"
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
                    <ShieldCheck className="h-6 w-6" />
                  </div>

                  <p className="mt-5 text-[10px] font-black uppercase tracking-[0.16em] text-amber-400">
                    Audit method
                  </p>

                  <p className="mt-2 text-sm leading-relaxed text-white/70">
                    The goal is simple: make the draw hard to manipulate and easy to
                    check.
                  </p>
                </div>

                <nav className="space-y-1 p-3">
                  {stages.map((stage) => (
                    <a
                      key={stage.n}
                      href={`#stage-${stage.n}`}
                      className="flex items-center gap-3 rounded-sm px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-amber-50 hover:text-navy-700"
                    >
                      <span className="font-mono text-xs font-black text-navy-700">
                        {stage.n}
                      </span>
                      {stage.title}
                    </a>
                  ))}
                </nav>
              </Card>

              <Card
                variant="default"
                className="mt-4 rounded-3xl border-navy-100 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.04)]"
              >
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
                  Quick test
                </p>

                <p className="mt-3 text-sm leading-relaxed text-slate-600">
                  If the seed reveal does not match the pre-draw hash, the draw fails
                  verification. If the same inputs do not reproduce the same winner, the
                  draw fails verification.
                </p>
              </Card>
            </aside>

            <div className="min-w-0">
              <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
                {principles.map((item) => (
                  <Card
                    key={item.title}
                    variant="default"
                    className="rounded-2xl border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.04)]"
                  >
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
                      {item.title}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">
                      {item.body}
                    </p>
                  </Card>
                ))}
              </div>

              <Card
                variant="default"
                className="mb-8 overflow-hidden rounded-3xl border-navy-100 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.06)]"
              >
                <div className="grid grid-cols-1 lg:grid-cols-[0.72fr_1fr]">
                  <div className="bg-navy-800 p-7 text-white sm:p-8">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-400">
                      The core idea
                    </p>

                    <h2 className="mt-3 font-display text-3xl font-black leading-tight tracking-[-0.03em]">
                      We publish the lock before showing the key.
                    </h2>

                    <p className="mt-4 text-sm leading-relaxed text-white/75">
                      The seed hash is the lock. The revealed seed is the key. If they
                      match, the seed was not changed after the fact.
                    </p>
                  </div>

                  <div className="p-6 sm:p-8">
                    <div className="rounded-2xl border border-navy-100 bg-[#F8FAF4] p-5">
                      <p className="text-sm leading-relaxed text-slate-700">
                        This does not ask players to “just trust us.” It creates a trail:
                        what was committed before the draw, what was revealed after the
                        draw, and what winner the process produced.
                      </p>

                      <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <AuditCheck>Seed hash committed before selection</AuditCheck>
                        <AuditCheck>Eligible tickets locked before selection</AuditCheck>
                        <AuditCheck>Winner produced from deterministic logic</AuditCheck>
                        <AuditCheck>Seed revealed after result publication</AuditCheck>
                      </ul>
                    </div>
                  </div>
                </div>
              </Card>

              <div className="mb-8">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
                  Verification flow
                </p>

                <h2 className="mt-2 font-display text-3xl font-black tracking-[-0.03em] text-navy-950">
                  The five stages.
                </h2>

                <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-600">
                  Every draw should follow the same path: commit, close, select, reveal,
                  archive.
                </p>
              </div>

              <div className="relative space-y-4">
                <div className="absolute left-6 top-8 hidden h-[calc(100%-4rem)] w-px bg-navy-50 sm:block" />

                {stages.map((stage) => {
                  const Icon = stage.icon;

                  return (
                    <Card
                      key={stage.n}
                      id={`stage-${stage.n}`}
                      variant="default"
                      className="relative scroll-mt-28 overflow-hidden rounded-3xl border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.04)] sm:p-7"
                    >
                      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                        <div className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-sm bg-navy-800 font-display text-xl font-black text-white">
                          {stage.n}
                        </div>

                        <div className="flex-1">
                          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
                                {stage.when}
                              </p>

                              <h3 className="mt-1 font-display text-2xl font-black tracking-[-0.03em] text-navy-950">
                                {stage.title}
                              </h3>
                            </div>

                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm bg-navy-50 text-navy-700">
                              <Icon className="h-5 w-5" />
                            </div>
                          </div>

                          <p className="mt-4 text-sm leading-relaxed text-slate-600">
                            {stage.description}
                          </p>

                          <div className="mt-5 rounded-2xl border border-navy-100 bg-[#F8FAF4] p-4">
                            <p className="mb-1 text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
                              Technical record
                            </p>
                            <p className="font-mono text-xs leading-relaxed text-slate-700">
                              {stage.technical}
                            </p>
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>

              <Card
                variant="default"
                className="mt-10 overflow-hidden rounded-3xl border-navy-100 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.05)]"
              >
                <div className="grid grid-cols-1 gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
                      Verify a published draw
                    </p>

                    <h3 className="mt-2 font-display text-2xl font-black tracking-[-0.03em] text-navy-950">
                      Start with the results archive.
                    </h3>

                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
                      The results archive should show the draw reference, winning ticket,
                      seed hash, and verification record for completed draws.
                    </p>
                  </div>

                  <Link href="/results">
                    <Button
                      variant="accent"
                      size="lg"
                      className="rounded-sm !border-transparent bg-amber-500 font-bold text-navy-950 hover:!border-transparent hover:bg-amber-400"
                    >
                      Open results archive
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </Card>

              <Card
                variant="default"
                className="mt-5 overflow-hidden rounded-3xl border-navy-100 bg-navy-800 p-8 text-white shadow-[0_24px_70px_rgba(1,58,168,0.18)] sm:p-10"
              >
                <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div>
                    <div className="mb-4 inline-flex items-center gap-2 rounded-sm bg-amber-500 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-navy-950">
                      <ShieldCheck className="h-4 w-4" />
                      Found an inconsistency?
                    </div>

                    <h3 className="font-display text-3xl font-black tracking-[-0.03em] text-white">
                      Treat it as a formal dispute.
                    </h3>

                    <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/75">
                      If a public verification record does not match the published result,
                      raise it through the dispute process with the draw code and evidence.
                    </p>
                  </div>

                  <Link
                    href="/disputes"
                    className="inline-flex items-center justify-center gap-2 rounded-sm border border-white/20 bg-white/10 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/15"
                  >
                    Open dispute process
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </div>
              </Card>
            </div>
          </div>
        </Container>
      </section>
    </main>
  );
}

function AuditCheck({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 rounded-2xl border border-navy-100 bg-white p-4 text-sm leading-relaxed text-slate-700">
      <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-navy-800 text-white">
        <Check className="h-3 w-3" />
      </span>
      <span>{children}</span>
    </li>
  );
}