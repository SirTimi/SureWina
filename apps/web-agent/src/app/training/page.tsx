'use client';

import { useState } from 'react';
import { CheckCircle2, Clock, PlayCircle } from 'lucide-react';
import { Card } from '@surewina/ui';
import { AgentShell } from '@/components/agent-shell';
import { SectionHeading } from '@/components/section-heading';
import { agentMock, type TrainingModule } from '@/lib/agent-mock';

export default function TrainingPage() {
  return (
    <AgentShell>
      {() => <TrainingBody />}
    </AgentShell>
  );
}

function TrainingBody() {
  const [modules, setModules] = useState<TrainingModule[]>(agentMock.listTrainingModules());
  const [active, setActive] = useState<TrainingModule | null>(modules[0] ?? null);

  const markDone = (id: string) => {
    agentMock.completeTraining(id);
    setModules(agentMock.listTrainingModules());
  };

  const completed = modules.filter((m) => m.completedAt).length;

  return (
    <main className="mx-auto max-w-[1100px] px-4 pb-10 pt-5">
      <SectionHeading
        eyebrow="Training"
        title="Agent training videos"
        description={`You've completed ${completed} of ${modules.length} modules. Keep going to unlock Gold-tier eligibility.`}
        backHref="/"
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {active && (
          <Card className="overflow-hidden rounded-3xl border-slate-200 bg-white shadow-sm">
            <div className="relative aspect-video w-full bg-slate-900">
              <iframe
                key={active.id}
                src={active.videoEmbedUrl}
                title={active.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 h-full w-full"
              />
            </div>
            <div className="p-5">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#4E8F01]">
                Module
              </p>
              <h2 className="mt-1 font-display text-2xl font-black text-navy-950">
                {active.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                {active.description}
              </p>
              <div className="mt-4 flex items-center gap-3">
                {active.completedAt ? (
                  <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-black uppercase tracking-[0.14em] text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Completed
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => markDone(active.id)}
                    className="inline-flex items-center gap-2 rounded-sm bg-[#A8E368] px-4 py-2 text-sm font-black text-navy-950 hover:bg-[#B7EF79]"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Mark as complete
                  </button>
                )}
                <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                  <Clock className="h-3 w-3" />
                  {active.durationMins} min
                </span>
              </div>
            </div>
          </Card>
        )}

        <aside>
          <Card className="overflow-hidden rounded-3xl border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#4E8F01]">
                Modules
              </p>
            </div>
            {modules.map((m) => {
              const isActive = active?.id === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setActive(m)}
                  className={
                    isActive
                      ? 'flex w-full items-start gap-3 border-b border-slate-100 bg-[#A8E368]/15 px-4 py-3 text-left last:border-b-0'
                      : 'flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left last:border-b-0 hover:bg-[#F8FAF4]'
                  }
                >
                  <div
                    className={
                      m.completedAt
                        ? 'flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-emerald-50 text-emerald-600'
                        : 'flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-[#A8E368]/30 text-[#4E8F01]'
                    }
                  >
                    {m.completedAt ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <PlayCircle className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-navy-950">{m.title}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{m.durationMins} min</p>
                  </div>
                </button>
              );
            })}
          </Card>
        </aside>
      </div>
    </main>
  );
}
