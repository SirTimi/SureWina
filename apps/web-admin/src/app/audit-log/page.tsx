'use client';

import { Download } from 'lucide-react';
import { Button } from '@surewina/ui';
import { AdminShell } from '@/components/admin-shell';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { StatusPill, statusToTone } from '@/components/status-pill';
import { adminMock, type AuditLogEntry } from '@/lib/admin-mock';

export default function AuditLogPage() {
  return (
    <AdminShell>
      {() => <Body />}
    </AdminShell>
  );
}

function Body() {
  const rows = adminMock.listAuditLog();

  const download = () => {
    const csv = [
      'at,actor_email,actor_role,action,resource_type,resource_id,ip,result',
      ...rows.map(
        (r) =>
          `${r.at},${r.actorEmail},${r.actorRole},${r.action},${r.resourceType},${r.resourceId},${r.ipAddress},${r.result}`,
      ),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        eyebrow="System"
        title="Audit log"
        description="Every admin action is captured here. Hash-chained for tamper evidence in Phase 6+."
        breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'Audit log' }]}
        rightSlot={
          <Button
            variant="secondary"
            onClick={download}
            className="rounded-md border-slate-200 bg-white text-[#1A1816]"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      <div className="mx-auto max-w-[1400px] space-y-3 px-6 py-5">
        <DataTable<AuditLogEntry>
          rows={rows}
          rowKey={(r) => r.logId}
          pageSize={20}
          searchPlaceholder="Search by actor, action, resource…"
          searchFn={(r, q) =>
            r.actorEmail.toLowerCase().includes(q) ||
            r.action.toLowerCase().includes(q) ||
            r.resourceId.toLowerCase().includes(q)
          }
          columns={[
            {
              key: 'at',
              header: 'When',
              render: (r) => (
                <span className="font-mono text-xs text-slate-500">
                  {new Date(r.at).toLocaleString('en-NG', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </span>
              ),
            },
            {
              key: 'actor',
              header: 'Actor',
              render: (r) => (
                <div>
                  <p className="text-xs font-bold text-[#1A1816]">{r.actorEmail}</p>
                  <p className="text-[10px] text-slate-500">{r.actorRole}</p>
                </div>
              ),
            },
            { key: 'action', header: 'Action', render: (r) => <span className="font-mono text-xs">{r.action}</span> },
            { key: 'resource', header: 'Resource', render: (r) => (
              <div>
                <p className="text-xs font-bold text-[#1A1816]">{r.resourceType}</p>
                <p className="font-mono text-[10px] text-slate-500">{r.resourceId}</p>
              </div>
            ) },
            {
              key: 'ip',
              header: 'IP',
              render: (r) => <span className="font-mono text-[10px] text-slate-500">{r.ipAddress}</span>,
            },
            {
              key: 'result',
              header: 'Result',
              render: (r) => <StatusPill tone={statusToTone(r.result)}>{r.result}</StatusPill>,
            },
          ]}
        />
      </div>
    </>
  );
}
