interface SectionCardProps {
  title?: string;
  description?: string;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}

export function SectionCard({
  title,
  description,
  rightSlot,
  children,
  className = '',
  padded = true,
}: SectionCardProps) {
  return (
    <section
      className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}
    >
      {(title || description || rightSlot) && (
        <header className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            {title && (
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#4E8F01]">
                {title}
              </p>
            )}
            {description && (
              <p className="mt-1 text-sm text-slate-500">{description}</p>
            )}
          </div>
          {rightSlot && <div className="shrink-0">{rightSlot}</div>}
        </header>
      )}
      <div className={padded ? 'p-4' : ''}>{children}</div>
    </section>
  );
}
