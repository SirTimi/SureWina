'use client';

import { useState } from 'react';
import { AlertOctagon, CheckCircle2, Send } from 'lucide-react';
import { Button } from '@surewina/ui';
import { AdminShell } from '@/components/admin-shell';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatusPill, statusToTone } from '@/components/status-pill';
import { adminMock, type AmlFlag } from '@/lib/admin-mock';

export default function AmlFlagsPage() {
  return (
    <AdminShell>
      {() => <Body />}
    </AdminShell>
  );
}

function Body() {
  const initial = adminMock.listAmlFlags();
  const [rows, setRows] = useState(initial);
  const [open, setOpen] = useState<AmlFlag | null>(null);
  const [note, setNote] = useState('');

  const act = (status: AmlFlag['status']) => {
    if (!open) return;
    setRows((arr) => arr.map((r) => (r.flagId === open.flagId ? { ...r, status } : r)));
    setOpen(null);
    setNote('');
  };

  return (
    <>
      <PageHeader
        eyebrow="Compliance · NFIU"
        title="AML flag inbox"
        description="Rules-based and behaviour-based flags. Cleared flags drop off after 30 days. Escalations route to NFIU."
        breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'AML flags' }]}
      />

      <div className="mx-auto max-w-[1400px] space-y-3 px-6 py-5">
        <DataTable<AmlFlag>
          rows={rows}
          rowKey={(f) => f.flagId}
          searchPlaceholder="Search rule or phone…"
          searchFn={(f, q) =>
            f.rule.toLowerCase().includes(q) ||
            f.customerPhoneE164.includes(q)
          }
          onRowClick={(f) => setOpen(f)}
          columns={[
            {
              key: 'severity',
              header: 'Severity',
              render: (f) => (
                <StatusPill
                  tone={f.severity === 'HIGH' ? 'danger' : f.severity === 'MEDIUM' ? 'warning' : 'neutral'}
                  icon={<AlertOctagon className="h-3 w-3" />}
                >
                  {f.severity}
                </StatusPill>
              ),
            },
            {
              key: 'rule',
              header: 'Rule',
              render: (f) => <span className="font-bold text-[#0B1220]">{f.rule}</span>,
            },
            {
              key: 'phone',
              header: 'Customer',
              render: (f) => (
                <span className="font-mono text-xs">{f.customerPhoneE164}</span>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (f) => <StatusPill tone={statusToTone(f.status)}>{f.status}</StatusPill>,
            },
            {
              key: 'raised',
              header: 'Raised',
              render: (f) => (
                <span className="text-xs text-slate-500">
                  {new Date(f.raisedAt).toLocaleDateString('en-NG', {
                    day: '2-digit',
                    month: 'short',
                  })}
                </span>
              ),
            },
          ]}
        />
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(null)}
        >
          <SectionCard
            title="Triage flag"
            description="Choose how to close out this flag. NFIU escalation files a Suspicious Activity Report."
            className="w-full max-w-lg"
          >
            <div onClick={(e) => e.stopPropagation()}>
              <p className="text-sm">
                <span className="font-bold">{open.rule}</span> on{' '}
                <span className="font-mono">{open.customerPhoneE164}</span>
              </p>
              <p className="mt-1 text-xs text-slate-500">{open.detail}</p>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Triage note (added to compliance audit log)…"
                className="mt-3 w-full rounded-md border border-slate-200 p-3 text-sm font-medium outline-none focus:border-[#4E8F01] focus:ring-2 focus:ring-[#A8E368]/30"
              />
              <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                <Button
                  variant="secondary"
                  onClick={() => act('CLEARED')}
                  disabled={!note.trim()}
                  className="rounded-md border-emerald-200 bg-emerald-50 text-emerald-700"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Clear
                </Button>
                <Button
                  variant="accent"
                  onClick={() => act('ESCALATED_NFIU')}
                  disabled={!note.trim()}
                  className="rounded-md !border-transparent bg-red-600 font-black text-white hover:!border-transparent hover:bg-red-700 disabled:!bg-slate-200 disabled:text-slate-500"
                >
                  <Send className="h-4 w-4" />
                  Escalate to NFIU
                </Button>
              </div>
            </div>
          </SectionCard>
        </div>
      )}
    </>
  );
}
