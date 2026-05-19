import Link from 'next/link';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
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
    <section className="relative overflow-hidden bg-[radial-gradient(circle_at_78%_28%,rgba(216,122,24,0.18)_0%,rgba(216,122,24,0.10)_28%,transparent_56%),linear-gradient(135deg,#ffffff_0%,#f4ffe8_48%,#E8F0FB_100%)] pb-20 pt-32 sm:pb-24 sm:pt-36 lg:pb-28 lg:pt-40">
      <div className="absolute right-[-8%] top-1/2 hidden h-[520px] w-[520px] -translate-y-1/2 rounded-full bg-navy-50 blur-3xl lg:block" />
      <div className="absolute bottom-[-120px] left-[18%] h-80 w-80 rounded-full bg-navy-50 blur-3xl" />

      <Container size="lg" className="relative max-w-[1400px]">
        <Link
          href={backHref}
          className="mb-8 inline-flex items-center gap-2 text-sm font-bold text-navy-700 transition hover:text-navy-800"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Link>

        <div className="max-w-4xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-sm border border-white/30 bg-navy-700/90 px-4 py-2 text-sm font-semibold text-white shadow-sm backdrop-blur">
            <ShieldCheck className="h-4 w-4 text-white" />
            {eyebrow}
          </div>

          <h1 className="font-display text-5xl font-black leading-[0.98] tracking-[-0.05em] text-navy-950 sm:text-6xl lg:text-7xl">
            {title}
          </h1>

          <p className="mt-6 max-w-2xl text-base leading-relaxed text-slate-700 sm:text-lg">
            {subtitle}
          </p>

          {effectiveDate && (
            <p className="mt-6 max-w-2xl text-sm leading-relaxed text-slate-600">
              Effective from{' '}
              <span className="font-mono font-black text-navy-700">
                {effectiveDate}
              </span>
              . Historical versions are kept in the public archive, so you can always
              read what was active when you played a draw.
            </p>
          )}
        </div>
      </Container>
    </section>
  );
}