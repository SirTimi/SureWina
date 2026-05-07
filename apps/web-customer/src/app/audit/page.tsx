import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Hash, Lock, ShieldCheck, Clock, FileCheck, ExternalLink, GitBranch } from 'lucide-react';
import { Button, Container } from '@surewina/ui';
import { LegalPageHeader } from '@/components/legal-page-header';

export const metadata: Metadata = {
  title: 'Audit Method · Surewina',
  description:
    'How Surewina runs verifiable random draws using SHA-256 seed commits, deterministic RNG, and a public audit log.',
};

const stages = [
  {
    n: '01',
    icon: Lock,
    title: 'Seed commit',
    when: 'At 00:00 WAT, before any tickets sell for the day',
    description:
      'A cryptographically random seed is generated using a hardware RNG (the OS getrandom system call backed by the kernel entropy pool). The SHA-256 hash of this seed is published immediately to a public read-only log.',
    technical:
      'Algorithm: SHA-256 (256-bit output). Seed length: 256 bits. Source: `/dev/urandom` (Linux) backed by Yarrow/Fortuna PRNG with hardware entropy contributions.',
  },
  {
    n: '02',
    icon: Clock,
    title: 'Ticket sales close',
    when: 'One hour before the draw',
    description:
      'No more tickets can be sold for this draw. The complete ticket index is locked and snapshotted to a Merkle tree. The Merkle root is also published to the audit log.',
    technical:
      'Tree structure: balanced binary, leaves are SHA-256(ticketRef + drawCode). Root: SHA-256 hash of concatenated child hashes. Anyone with a ticket can verify their inclusion in the root using a Merkle proof.',
  },
  {
    n: '03',
    icon: GitBranch,
    title: 'Deterministic draw',
    when: 'At the scheduled draw time',
    description:
      'The committed seed is fed into a deterministic RNG together with the draw code. The output is a single integer in [0, ticketCount) which selects the winning ticket index from the locked snapshot.',
    technical:
      'RNG: ChaCha20 stream cipher seeded with SHA-256(seed || drawCode || \"WINNER_INDEX\"). The first 64 bits of output are reduced modulo ticketCount using rejection sampling to avoid bias. Output is the index into the sorted ticket list.',
  },
  {
    n: '04',
    icon: Hash,
    title: 'Seed reveal',
    when: 'Immediately after the draw executes',
    description:
      'The original seed is published to the audit log alongside the winning ticket reference. Anyone can re-run steps 1-3 with the revealed seed and confirm they produce the exact same winning index.',
    technical:
      'Verification command (anyone can run): `python3 surewina-verify.py --seed <revealed_seed> --draw <draw_code> --tickets <merkle_root>`. Output should match the published winning ticket reference exactly.',
  },
  {
    n: '05',
    icon: FileCheck,
    title: 'Public archive',
    when: 'Forever',
    description:
      'Every draw\'s seed hash, Merkle root, revealed seed, and winning ticket reference is kept in the public archive at /results indefinitely. Older entries are signed with our root certificate so even Surewina cannot edit them after the fact.',
    technical:
      'Append-only log. Each entry includes: drawCode, sha256(seed), merkleRoot, executedAt, revealedSeed, winnerTicketRef, signature. Signature: Ed25519 over the entire entry, using the Surewina root key (held offline by our compliance officer).',
  },
];

export default function AuditPage() {
  return (
    <main>
      <LegalPageHeader
        eyebrow="Trust · audit method"
        title="How we prove the draw was fair."
        subtitle="A draw is verifiable when an outsider can re-run the math and reach the same result. Here is exactly how Surewina does it, in plain language and in cryptographic detail."
        backHref="/how-it-works"
        backLabel="Back to how it works"
      />

      <Container size="lg" className="max-w-[1180px] py-12 lg:py-16">
        {/* TL;DR card */}
        <div className="mb-12 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            {
              k: 'Commit before',
              v: 'SHA-256 hash of the seed is published before the draw runs. Surewina cannot change the seed afterwards without breaking the hash.',
            },
            {
              k: 'Reveal after',
              v: 'The original seed is published after the draw. Anyone can re-hash it and confirm it matches the pre-draw commit.',
            },
            {
              k: 'Re-run the draw',
              v: 'With the revealed seed and the public ticket list, anyone can re-derive the winning ticket index using the published RNG.',
            },
          ].map((item) => (
            <div
              key={item.k}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]"
            >
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">
                {item.k}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-slate-700">{item.v}</p>
            </div>
          ))}
        </div>

        {/* Five stages */}
        <h2 className="font-display text-3xl font-black text-navy-950">The five stages</h2>
        <p className="mt-3 max-w-2xl text-base text-slate-600">
          Every draw — daily and Saturday jackpot — runs through these exact five steps. The same
          code, the same audit trail, the same verification path.
        </p>

        <div className="mt-8 space-y-4">
          {stages.map((stage) => {
            const Icon = stage.icon;
            return (
              <div
                key={stage.n}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)]"
              >
                <div className="flex flex-col gap-5 p-6 sm:flex-row sm:p-7">
                  <div className="flex shrink-0 items-start gap-4">
                    <div className="font-display text-4xl font-black text-[#A8E368] sm:text-5xl">
                      {stage.n}
                    </div>
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#A8E368]/25 to-emerald-50 text-[#4E8F01]">
                      <Icon className="h-5 w-5" />
                    </div>
                  </div>

                  <div className="flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">
                      {stage.when}
                    </p>
                    <h3 className="mt-1 font-display text-xl font-bold text-navy-950">
                      {stage.title}
                    </h3>
                    <p className="mt-3 text-sm leading-relaxed text-slate-700">
                      {stage.description}
                    </p>

                    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-900/95 p-4 font-mono text-xs leading-relaxed text-slate-300">
                      <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#A8E368]">
                        Technical
                      </p>
                      {stage.technical}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Why this works */}
        <div className="mt-16 overflow-hidden rounded-2xl border-2 border-emerald-200 bg-emerald-50/40 p-6 sm:p-8">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">
            Why this approach is unfakeable
          </p>
          <h2 className="mt-2 font-display text-2xl font-black text-navy-950">
            Either the math works, or it doesn&apos;t.
          </h2>
          <div className="mt-5 space-y-4 text-sm leading-relaxed text-slate-700">
            <p>
              <strong className="text-navy-950">Commit-reveal is binding both ways.</strong>{' '}
              Once we publish the SHA-256 hash of the seed, we cannot change the seed without
              the hash also changing — SHA-256 is collision-resistant. So we have to use the
              same seed at draw time as we committed to before.
            </p>
            <p>
              <strong className="text-navy-950">The RNG is deterministic.</strong> The same
              seed always produces the same output. So once the seed is revealed, anyone running
              the same RNG with that seed must get the same winning index. If we cheat by using
              a different seed, the verification fails publicly.
            </p>
            <p>
              <strong className="text-navy-950">The ticket list is committed too.</strong> The
              Merkle root locks in the exact set of tickets eligible for the draw. Surewina
              cannot inject a winning ticket after the fact, because the new ticket would not be
              in the Merkle tree, and the root hash would not match.
            </p>
            <p>
              <strong className="text-navy-950">The seed source is independent.</strong> We use
              a hardware RNG, audited annually by Deloitte West Africa. Even Surewina engineers
              don&apos;t know the seed value before commit time.
            </p>
          </div>
        </div>

        {/* Verifier */}
        <div className="mt-12 overflow-hidden rounded-2xl bg-navy-950 p-8 text-white">
          <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-sm border border-[#A8E368]/30 bg-[#A8E368]/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#A8E368]">
                <ShieldCheck className="h-3.5 w-3.5" />
                Verify any draw yourself
              </div>
              <h3 className="mt-3 font-display text-2xl font-bold">
                Open-source verifier on GitHub.
              </h3>
              <p className="mt-2 max-w-md text-sm text-white/70">
                Clone the verifier, plug in any draw code, and confirm the winning ticket
                independently. We will publish it at v1 launch.
              </p>
            </div>
            <Link
              href="https://github.com/surewina/verify"
              target="_blank"
              rel="noreferrer"
              className="inline-flex"
            >
              <Button
                variant="accent"
                size="lg"
                className="rounded-sm !border-transparent bg-[#A8E368] font-bold text-navy-950 shadow-[0_16px_34px_rgba(78,143,1,0.22)] hover:!border-transparent hover:bg-[#B7EF79]"
              >
                <ExternalLink className="h-4 w-4" />
                github.com/surewina/verify
              </Button>
            </Link>
          </div>
        </div>

        {/* Auditor */}
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">
            External audit
          </p>
          <h3 className="mt-2 font-display text-xl font-bold text-navy-950">
            Audited by Deloitte West Africa
          </h3>
          <p className="mt-3 text-sm leading-relaxed text-slate-700">
            Deloitte West Africa conducts a quarterly audit of our RNG, audit log integrity, and
            payout records. Their reports are published in full at the bottom of the public
            results archive — redacted only for individual customer PII.
          </p>
          <Link
            href="/results"
            className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#4E8F01] hover:underline"
          >
            See the latest audit report
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </Container>
    </main>
  );
}