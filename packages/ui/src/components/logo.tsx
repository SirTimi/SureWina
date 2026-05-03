import { cn } from '../lib/cn.js';

export interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showWordmark?: boolean;
  className?: string;
  /** When true, wordmark uses white text (for use on navy backgrounds) */
  inverted?: boolean;
}

const sizes = {
  sm: { box: 'w-6 h-6', icon: 14, text: 'text-base' },
  md: { box: 'w-8 h-8', icon: 18, text: 'text-lg' },
  lg: { box: 'w-10 h-10', icon: 22, text: 'text-xl' },
};

export function Logo({
  size = 'md',
  showWordmark = true,
  className,
  inverted = false,
}: LogoProps) {
  const s = sizes[size];

  return (
    <div className={cn('inline-flex items-center gap-2', className)}>
      <span
        className={cn(
          'inline-flex items-center justify-center bg-navy-900 rounded-md',
          s.box,
        )}
        aria-hidden="true"
      >
        <svg
          width={s.icon}
          height={s.icon}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M5 12.5L10 17.5L19 7.5"
            stroke="rgb(216 122 24)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {showWordmark && (
        <span
          className={cn(
            'font-display font-semibold tracking-tight',
            s.text,
            inverted ? 'text-white' : 'text-navy-900',
          )}
        >
          Surewina
        </span>
      )}
    </div>
  );
}