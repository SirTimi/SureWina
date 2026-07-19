'use client';

import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Info,
  Lock,
  RotateCw,
  XCircle,
} from 'lucide-react';
import type { AdminDrawPreChecks } from '@surewina/api-client';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatusPill, statusToTone } from '@/components/status-pill';
import { api } from '@/lib/api';

export default function DrawPreChecksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <AdminShell>
      {() => <Body id={id} />}
    </AdminShell>
  );
}

function Body({ id }: { id: string }) {
  const [data, setData] = useState<AdminDrawPreChecks | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api.admin
      .drawPreChecks(id)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load pre-checks.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  // Readiness changes as the clock moves — refresh periodically.
  useEffect(() => {
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [id]);

  if (loading && !data) {
    return (
      <div className="mx-auto max-w-[860px] px-6 py-8">
        <div className="h-64 animate-pulse rounded-xl bg-white" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-[860px] px-6 py-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
          {error ?? 'Draw not found.'}
        </div>
      </div>
    );
  }

  const verdict = data.executed
    ? { tone: 'done', title: 'Draw already executed', body: 'The result is final and published.' }
    : data.readyToRun
      ? {
          tone: 'ready',
          title: 'Ready to run',
          body: 'All blocking checks pass. The engine will execute this draw automatically at its scheduled time.',
        }
      : {
          tone: 'blocked',
          title: 'Not ready',
          body: `Blocking: ${data.blockingIssues.join(', ')}`,
        };

  return (
    <>
      <PageHeader
        eyebrow="Draws · Pre-checks"
        title={data.drawCode}
        description="Read-only readiness view. Draws are executed by the engine alone."
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Draws', href: '/draws' },
          { label: data.drawCode, href: `/draws/${id}` },
          { label: 'Pre-checks' },
        ]}
        rightSlot={
          <div className="flex items-center gap-2">
            <StatusPill tone={statusToTone(data.status)}>{data.status}</StatusPill>
            <button
              type="button"
              onClick={load}
              className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-[#0B1220] hover:bg-slate-50"
            >
              <RotateCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
              Refresh
            </button>
          </div>
        }
      />

      <div className="mx-auto max-w-[860px] space-y-4 px-6 py-5">
        <div
          className={
            verdict.tone === 'ready'
              ? 'rounded-xl border border-emerald-200 bg-emerald-50 p-5'
              : verdict.tone === 'done'
                ? 'rounded-xl border border-slate-200 bg-white p-5'
                : 'rounded-xl border border-amber-200 bg-amber-50 p-5'
          }
        >
          <div className="flex items-start gap-3">
            {verdict.tone === 'ready' ? (
              <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
            ) : verdict.tone === 'done' ? (
              <Lock className="mt-0.5 h-6 w-6 shrink-0 text-slate-500" />
            ) : (
              <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-amber-600" />
            )}
            <div>
              <p className="font-display text-xl font-black text-[#0B1220]">{verdict.title}</p>
              <p className="mt-1 text-sm text-slate-600">{verdict.body}</p>
            </div>
          </div>
        </div>

        <SectionCard title="Checks" padded={false}>
          <div className="divide-y divide-slate-100">
            {data.checks.map((c) => (
              <div key={c.key} className="flex items-start gap-3 px-5 py-3">
                {c.ok ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                ) : c.blocking ? (
                  <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                ) : (
                  <Clock className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-black text-[#0B1220]">{c.label}</p>
                    {c.blocking && (
                      <span className="rounded-sm bg-slate-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">
                        Blocking
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 break-all text-xs text-slate-500">{c.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-4">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-navy-700" />
          <p className="text-xs leading-relaxed text-slate-600">
            There is no manual execution control by design. The engine commits an RNG seed before
            sales open, then executes the draw at its scheduled time. No admin — at any clearance
            level — can trigger, delay, or influence a draw.
          </p>
        </div>

        <div>
          <Link
            href={`/draws/${id}`}
            className="text-sm font-black text-navy-700 hover:underline"
          >
            ← Back to draw
          </Link>
        </div>
      </div>
    </>
  );
}