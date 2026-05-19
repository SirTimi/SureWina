import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  description?: string;
  backHref?: string;
  rightSlot?: React.ReactNode;
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  backHref,
  rightSlot,
}: SectionHeadingProps) {
  return (
    <header className="mb-5">
      {backHref && (
        <Link
          href={backHref}
          className="mb-3 inline-flex items-center gap-1.5 text-xs font-bold text-navy-700 hover:text-navy-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </Link>
      )}

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
              {eyebrow}
            </p>
          )}
          <h1 className="mt-1.5 font-display text-2xl font-black leading-tight tracking-[-0.03em] text-navy-950 sm:text-3xl">
            {title}
          </h1>
          {description && (
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
              {description}
            </p>
          )}
        </div>

        {rightSlot && <div className="shrink-0">{rightSlot}</div>}
      </div>
    </header>
  );
}
