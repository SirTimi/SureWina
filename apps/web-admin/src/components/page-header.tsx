import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

interface Crumb {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  breadcrumbs?: Crumb[];
  rightSlot?: React.ReactNode;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  breadcrumbs,
  rightSlot,
}: PageHeaderProps) {
  return (
    <header className="border-b border-slate-200 bg-white px-6 pb-5 pt-6">
      <div className="mx-auto max-w-[1400px]">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav
            aria-label="Breadcrumb"
            className="mb-2 flex items-center gap-1 text-xs text-slate-500"
          >
            {breadcrumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1">
                {c.href ? (
                  <Link
                    href={c.href}
                    className="font-bold text-navy-700 hover:underline"
                  >
                    {c.label}
                  </Link>
                ) : (
                  <span className="text-slate-500">{c.label}</span>
                )}
                {i < breadcrumbs.length - 1 && <ChevronRight className="h-3 w-3" />}
              </span>
            ))}
          </nav>
        )}

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            {eyebrow && (
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-navy-700">
                {eyebrow}
              </p>
            )}
            <h1 className="mt-1 font-display text-2xl font-black tracking-[-0.02em] text-[#0B1220]">
              {title}
            </h1>
            {description && (
              <p className="mt-1 max-w-3xl text-sm text-slate-500">{description}</p>
            )}
          </div>

          {rightSlot && <div className="shrink-0">{rightSlot}</div>}
        </div>
      </div>
    </header>
  );
}
