'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Calendar, Check, Pencil, Settings2, ShieldAlert, X } from 'lucide-react';
import type { AdminSetting } from '@surewina/api-client';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import {
  canPerformAdminAction,
  type AdminSession,
} from '@/lib/admin-auth';
import { api } from '@/lib/api';

// Presentation metadata per key — the API stays generic.
const META: Record<string, { label: string; unit: string; caution?: string }> = {
  WHT_RATE_PERCENT: {
    label: 'WHT rate',
    unit: '%',
    caution: 'Changes how much tax is withheld from every cash prize. Confirm with the tax advisor first.',
  },
  WHT_THRESHOLD_NGN: {
    label: 'WHT threshold',
    unit: '₦',
    caution: 'Prizes below this pay gross. 0 means WHT applies to all cash prizes.',
  },
  LEVY_RATE_PERCENT: {
    label: 'State levy rate',
    unit: '%',
    caution: 'Drives the statutory levy report. Provisional until confirmed with the regulatory advisor.',
  },
  AGENT_PAYOUT_MAX_NGN: {
    label: 'Agent cash payout limit',
    unit: '₦',
    caution: 'Largest prize an agent may settle in cash. Raising it raises cash-handling risk in the field.',
  },
};

export default function ConfigPage() {
  return <AdminShell>{(session) => <Body session={session} />}</AdminShell>;
}

function Body({ session }: { session: AdminSession }) {
  const [settings, setSettings] = useState<AdminSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  // Settings edits are final-approval-grade actions: SUPER only.
  const canEdit = canPerformAdminAction(session.tier, 'APPROVE_DRAW_SETUP');

  const load = () => {
    setLoading(true);
    api.admin
      .listSettings()
      .then((res) => setSettings(res.settings))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load settings.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const save = async (key: string) => {
    if (!/^\d+(\.\d+)?$/.test(draft.trim())) {
      setError('Value must be a non-negative number.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.admin.updateSetting(key, draft.trim());
      setEditingKey(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save setting.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="System"
        title="Configuration"
        description="Business thresholds that apply immediately across the platform. Every change is audited with its previous value."
        breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'Config' }]}
      />

      <div className="mx-auto max-w-[860px] space-y-4 px-6 py-5">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="h-64 animate-pulse rounded-xl bg-white" />
        ) : (
          <SectionCard
            title="Business settings"
            description={canEdit ? 'Changes take effect within a minute — no redeploy.' : 'Read-only at your clearance. SUPER admins can edit.'}
            padded={false}
          >
            <div className="divide-y divide-slate-100">
              {settings.map((s) => {
                const meta = META[s.key] ?? { label: s.key, unit: '' };
                const isEditing = editingKey === s.key;
                return (
                  <div key={s.key} className="px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-black text-[#0B1220]">{meta.label}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{s.description}</p>
                        <p className="mt-1 font-mono text-[10px] text-slate-400">
                          {s.key} · updated{' '}
                          {new Date(s.updatedAt).toLocaleString('en-NG', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>

                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <div className="relative">
                            <input
                              value={draft}
                              onChange={(e) => setDraft(e.target.value)}
                              autoFocus
                              className="h-10 w-36 rounded-md border border-navy-300 bg-white px-3 pr-8 text-right font-mono text-sm outline-none focus:border-navy-700"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                              {meta.unit}
                            </span>
                          </div>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => save(s.key)}
                            className="flex h-10 w-10 items-center justify-center rounded-md bg-[#0B1220] text-white disabled:bg-slate-300"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingKey(null)}
                            className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <p className="font-display text-xl font-black tabular-nums text-[#0B1220]">
                            {s.value}
                            <span className="ml-1 text-sm font-bold text-slate-400">{meta.unit}</span>
                          </p>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingKey(s.key);
                                setDraft(s.value);
                                setError(null);
                              }}
                              className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:border-navy-200 hover:text-navy-700"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {isEditing && meta.caution && (
                      <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3">
                        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                        <p className="text-xs leading-relaxed text-amber-800">{meta.caution}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </SectionCard>
        )}

        <SectionCard
          title="Linked configuration"
          description="Granular, versioned config lives on dedicated pages."
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Link
              href="/draws/schedule"
              className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 transition hover:border-navy-200 hover:bg-navy-50"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-navy-50 text-navy-700">
                <Calendar className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-sm font-black text-[#0B1220]">Draw schedule & pricing</span>
                <span className="block text-xs text-slate-500">
                  Ticket prices, prizes, times — versioned with dual approval
                </span>
              </span>
            </Link>
            <Link
              href="/audit-log"
              className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 transition hover:border-navy-200 hover:bg-navy-50"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-navy-50 text-navy-700">
                <Settings2 className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-sm font-black text-[#0B1220]">Setting change history</span>
                <span className="block text-xs text-slate-500">
                  Filter the audit log for SYSTEM_SETTING_CHANGED
                </span>
              </span>
            </Link>
          </div>
        </SectionCard>
      </div>
    </>
  );
}