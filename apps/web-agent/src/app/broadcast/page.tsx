'use client';

import { useState } from 'react';
import { Lock, MessageCircle, Sparkles, Users } from 'lucide-react';
import { Button, Card } from '@surewina/ui';
import { AgentShell } from '@/components/agent-shell';
import { SectionHeading } from '@/components/section-heading';

const TEMPLATES = [
  {
    id: 'tpl_daily',
    label: 'Today’s draw is hot',
    text: 'Today daily draw closes at 8pm — Samsung A55 5G. Tickets ₦500 from your favourite Surewina agent.',
  },
  {
    id: 'tpl_jackpot',
    label: 'Saturday jackpot reminder',
    text: 'Saturday ₦4M jackpot draw is tomorrow. Buy 10 daily tickets and you automatically enter the jackpot.',
  },
  {
    id: 'tpl_winner',
    label: 'Recent winner story',
    text: 'My customer Adaeze just won a Samsung TV with one ₦500 ticket. Want to be next? Reply YES.',
  },
];

export default function BroadcastPage() {
  return (
    <AgentShell>
      {() => <BroadcastBody />}
    </AgentShell>
  );
}

function BroadcastBody() {
  const [message, setMessage] = useState(TEMPLATES[0].text);

  return (
    <main className="mx-auto max-w-[860px] px-4 pb-10 pt-5">
      <SectionHeading
        eyebrow="Broadcast · Phase 2 preview"
        title="WhatsApp broadcast"
        description="Send pre-approved templates to opted-in customers. Available in Phase 2."
        backHref="/"
      />

      <Card className="rounded-3xl border-amber-200 bg-amber-50 p-4 text-amber-900">
        <div className="flex items-start gap-2">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="text-sm">
            Broadcast is launching in Phase 2 once WhatsApp Business approval lands. The
            UI is wired up here so the team can review the flow.
          </p>
        </div>
      </Card>

      <Card className="mt-4 overflow-hidden rounded-3xl border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
            Pick a template
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-3">
          {TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => setMessage(tpl.text)}
              className={
                message === tpl.text
                  ? 'rounded-2xl border-2 border-navy-700 bg-amber-50 p-3 text-left'
                  : 'rounded-2xl border border-slate-200 bg-white p-3 text-left hover:border-navy-200'
              }
            >
              <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-navy-700">
                <Sparkles className="h-3 w-3" />
                {tpl.label}
              </p>
              <p className="mt-2 line-clamp-3 text-xs text-slate-600">{tpl.text}</p>
            </button>
          ))}
        </div>

        <div className="border-t border-slate-100 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
            Message preview
          </p>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            className="mt-2 w-full rounded-xl border border-slate-200 bg-[#F8FAF4] p-3 text-sm font-medium text-navy-950 outline-none focus:border-navy-700 focus:ring-2 focus:ring-amber-400/30"
          />
          <p className="mt-2 text-xs text-slate-500">
            All broadcasts must use approved templates per WhatsApp Business policy.
          </p>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 p-4">
          <div className="inline-flex items-center gap-1.5 text-xs text-slate-500">
            <Users className="h-3.5 w-3.5" />
            Estimated audience · 32 customers
          </div>

          <Button
            variant="accent"
            disabled
            className="rounded-sm !border-transparent bg-amber-500/40 font-black text-navy-950/50"
          >
            <MessageCircle className="h-4 w-4" />
            Send (Phase 2)
          </Button>
        </div>
      </Card>
    </main>
  );
}
