'use client';

import { useState } from 'react';
import { Mail, MessageSquare, Save, Smartphone } from 'lucide-react';
import { Button } from '@surewina/ui';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { adminMock, type NotificationTemplate } from '@/lib/admin-mock';

export default function NotificationTemplatesPage() {
  return (
    <AdminShell>
      {() => <Body />}
    </AdminShell>
  );
}

function Body() {
  const templates = adminMock.listNotificationTemplates();
  const [active, setActive] = useState<NotificationTemplate>(templates[0]);
  const [draft, setDraft] = useState({ subject: active.subject ?? '', body: active.body });

  const select = (t: NotificationTemplate) => {
    setActive(t);
    setDraft({ subject: t.subject ?? '', body: t.body });
  };

  return (
    <>
      <PageHeader
        eyebrow="System · Templates"
        title="Notification templates"
        description="SMS, push, and email templates. Variables in {{double_braces}} are replaced at send time."
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Config', href: '/config' },
          { label: 'Templates' },
        ]}
        rightSlot={
          <Button
            variant="accent"
            className="rounded-md !border-transparent bg-[#4E8F01] font-black text-white hover:!border-transparent hover:bg-[#3a6a01]"
          >
            <Save className="h-4 w-4" />
            Save template
          </Button>
        }
      />

      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-4 px-6 py-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside>
          <SectionCard title="Templates" padded={false}>
            <ul className="divide-y divide-slate-100">
              {templates.map((t) => {
                const Icon =
                  t.channel === 'SMS'
                    ? MessageSquare
                    : t.channel === 'EMAIL'
                      ? Mail
                      : Smartphone;
                const isActive = active.templateId === t.templateId;
                return (
                  <li key={t.templateId}>
                    <button
                      type="button"
                      onClick={() => select(t)}
                      className={
                        isActive
                          ? 'flex w-full items-start gap-2 bg-[#A8E368]/15 p-3 text-left'
                          : 'flex w-full items-start gap-2 p-3 text-left hover:bg-[#F8FAF4]'
                      }
                    >
                      <Icon className="mt-0.5 h-4 w-4 text-[#4E8F01]" />
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[#0B1220]">{t.name}</p>
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                          {t.channel}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </SectionCard>
        </aside>

        <main className="space-y-3">
          {active.channel === 'EMAIL' && (
            <SectionCard title="Subject line">
              <input
                value={draft.subject}
                onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))}
                className="h-11 w-full rounded-md border border-slate-200 px-3 text-sm font-bold outline-none focus:border-[#4E8F01] focus:ring-2 focus:ring-[#A8E368]/30"
              />
            </SectionCard>
          )}

          <SectionCard title={`Body · ${active.channel}`}>
            <textarea
              value={draft.body}
              onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
              rows={8}
              className="w-full rounded-md border border-slate-200 p-3 font-mono text-sm outline-none focus:border-[#4E8F01] focus:ring-2 focus:ring-[#A8E368]/30"
            />
            <p className="mt-2 text-xs text-slate-500">
              {draft.body.length} characters
              {active.channel === 'SMS' &&
                ` · ${Math.ceil(draft.body.length / 160)} SMS segment(s)`}
            </p>
          </SectionCard>

          <SectionCard title="Preview">
            <p className="rounded-md border border-slate-200 bg-[#F8FAF4] p-3 font-mono text-sm text-[#0B1220]">
              {draft.body
                .replace(/\{\{ticket_ref\}\}/g, 'SW-04AB-9LK2')
                .replace(/\{\{prize\}\}/g, 'Samsung Galaxy A55 5G')
                .replace(/\{\{agent_name\}\}/g, 'Emeka')
                .replace(/\{\{amount\}\}/g, '24,500')
                .replace(/\{\{name\}\}/g, 'Adaeze')
                .replace(/\{\{method\}\}/g, 'bank transfer')}
            </p>
          </SectionCard>
        </main>
      </div>
    </>
  );
}
