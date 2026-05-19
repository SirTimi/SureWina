'use client';

import Link from 'next/link';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { StatusPill, statusToTone } from '@/components/status-pill';
import { adminMock, type RngSeed } from '@/lib/admin-mock';

export default function RngSeedsPage() {
  return (
    <AdminShell>
      {() => <Body />}
    </AdminShell>
  );
}

function Body() {
  const rows = adminMock.listRngSeeds();

  return (
    <>
      <PageHeader
        eyebrow="System"
        title="RNG seed inbox"
        description="Pre-draw seed commits and post-draw reveals. Hash chain verifies no operator tampered between commit and reveal."
        breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'RNG seeds' }]}
      />

      <div className="mx-auto max-w-[1400px] space-y-3 px-6 py-5">
        <DataTable<RngSeed>
          rows={rows}
          rowKey={(r) => r.seedId}
          searchPlaceholder="Search by draw code…"
          searchFn={(r, q) => r.drawCode.toLowerCase().includes(q)}
          columns={[
            {
              key: 'draw',
              header: 'Draw',
              render: (r) => (
                <Link
                  href={`/draws/${r.drawCode}/audit`}
                  className="font-mono text-sm font-black text-[#0B1220] hover:text-navy-700"
                >
                  {r.drawCode}
                </Link>
              ),
            },
            {
              key: 'commit',
              header: 'Commit hash',
              render: (r) => (
                <span className="inline-flex items-center gap-1.5 font-mono text-xs">
                  <KeyRound className="h-3 w-3" />
                  {r.commitHash.slice(0, 18)}…
                </span>
              ),
            },
            {
              key: 'reveal',
              header: 'Revealed seed',
              render: (r) =>
                r.revealedSeed ? (
                  <span className="font-mono text-xs">{r.revealedSeed.slice(0, 24)}…</span>
                ) : (
                  <span className="text-xs italic text-slate-400">Not revealed</span>
                ),
            },
            {
              key: 'committedAt',
              header: 'Committed',
              render: (r) => (
                <span className="text-xs text-slate-500">
                  {new Date(r.committedAt).toLocaleDateString('en-NG', {
                    day: '2-digit',
                    month: 'short',
                  })}
                </span>
              ),
            },
            {
              key: 'verified',
              header: 'Verification',
              render: (r) =>
                r.status === 'REVEALED' ? (
                  <StatusPill tone="success" icon={<ShieldCheck className="h-3 w-3" />}>
                    Hashes match
                  </StatusPill>
                ) : (
                  <StatusPill tone={statusToTone(r.status)}>{r.status}</StatusPill>
                ),
            },
          ]}
        />
      </div>
    </>
  );
}
