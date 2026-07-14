'use client';

import { useEffect, useState } from 'react';

// Ticking HH:MM:SS to a deadline. Shows 00:00:00 once passed.
export function Countdown({ to }: { to: string }) {
  const target = new Date(to).getTime();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const left = Math.max(0, Math.floor((target - now) / 1000));
  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = left % 60;

  return (
    <span className="font-mono tabular-nums" suppressHydrationWarning>
      {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:
      {String(s).padStart(2, '0')}
    </span>
  );
}