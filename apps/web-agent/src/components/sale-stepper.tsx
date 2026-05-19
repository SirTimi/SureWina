interface SaleStepperProps {
  step: 1 | 2 | 3 | 4;
}

const STEPS = [
  { num: 1, label: 'Draw' },
  { num: 2, label: 'Quantity' },
  { num: 3, label: 'Confirm' },
  { num: 4, label: 'Done' },
];

export function SaleStepper({ step }: SaleStepperProps) {
  return (
    <ol className="mb-4 flex items-center gap-2">
      {STEPS.map((s, i) => {
        const isDone = step > s.num;
        const isActive = step === s.num;
        return (
          <li key={s.num} className="flex items-center gap-2">
            <div
              className={
                isActive
                  ? 'flex h-7 w-7 items-center justify-center rounded-full bg-navy-800 text-xs font-black text-white shadow-[0_4px_18px_rgba(14,42,71,0.30)]'
                  : isDone
                    ? 'flex h-7 w-7 items-center justify-center rounded-full bg-amber-500 text-xs font-black text-navy-950'
                    : 'flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-black text-slate-400'
              }
            >
              {s.num}
            </div>
            <p
              className={
                isActive
                  ? 'hidden text-[11px] font-black uppercase tracking-[0.14em] text-navy-700 sm:block'
                  : 'hidden text-[11px] font-black uppercase tracking-[0.14em] text-slate-400 sm:block'
              }
            >
              {s.label}
            </p>
            {i < STEPS.length - 1 && (
              <div
                className={
                  step > s.num ? 'h-px w-6 bg-amber-500 sm:w-10' : 'h-px w-6 bg-slate-200 sm:w-10'
                }
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
