import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { Container } from '@surewina/ui';

interface LegalPageHeaderProps {
  eyebrow: string;
  title: string;
  subtitle: string;
  effectiveDate?: string;
  backHref?: string;
  backLabel?: string;
}

export function LegalPageHeader({
  eyebrow,
  title,
  subtitle,
  effectiveDate,
  backHref = '/',
  backLabel = 'Back to home',
}: LegalPageHeaderProps) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-navy-950 via-navy-950 to-[#08152a] text-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#A8E368]/40 to-transparent" />
      <div className="pointer-events-none absolute right-[-15%] top-[10%] h-[420px] w-[420px] rounded-full bg-[#A8E368]/5 blur-3xl" />
      <div className="pointer-events-none absolute left-[-10%] bottom-[-10%] h-[300px] w-[300px] rounded-full bg-amber-500/5 blur-3xl" />

      <Container size="lg" className="relative z-10 max-w-[1180px] py-14 lg:py-20">
        <Link
          href={backHref}
          className="mb-6 inline-flex items-center gap-1 text-sm text-white/60 transition hover:text-[#A8E368]"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {backLabel}
        </Link>

        <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#A8E368]">
          {eyebrow}
        </div>

        <h1 className="mt-3 max-w-3xl font-display text-4xl font-black leading-[1.05] tracking-[-0.03em] sm:text-5xl lg:text-6xl">
          {title}
        </h1>

        <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/70 sm:text-lg">
          {subtitle}
        </p>

        {effectiveDate && (
          <p className="mt-6 text-xs text-white/50">
            Effective from <span className="font-mono text-white/70">{effectiveDate}</span>. We
            keep historical versions on the public archive — you can always read what was in
            force when you played any specific draw.
          </p>
        )}
      </Container>
    </section>
  );
}