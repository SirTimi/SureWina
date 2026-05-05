import { cn } from '../lib/cn.js';

export interface LogoProps {
  showWordmark?: boolean;
  className?: string;
  inverted?: boolean;
}

export function Logo({
  showWordmark = false,
  className,
  inverted = false,
}: LogoProps) {
  return (
    <div className={cn('inline-flex items-center gap-2', className)}>
      <img
        src="/surewina-icon.webp"
        alt="Surewina"
        className="h-20 w-20 shrink-0 object-contain"
      />

      {showWordmark && (
        <span
          className={cn(
            'font-display text-lg font-semibold tracking-tight',
            inverted ? 'text-white' : 'text-navy-900',
          )}
        >
          Surewina
        </span>
      )}
    </div>
  );
}