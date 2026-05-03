'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface CopyableTicketRefProps {
  ticketRef: string;
}

export function CopyableTicketRef({ ticketRef }: CopyableTicketRefProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(ticketRef);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard not available — silently fail
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 bg-white border border-ink-100 rounded-md px-4 py-3">
      <span className="font-mono text-sm sm:text-base text-ink-950 tabular-nums">
        {ticketRef}
      </span>
      <button
        type="button"
        onClick={handleCopy}
        className={
          copied
            ? 'inline-flex items-center gap-1.5 text-xs font-medium text-success px-2 py-1'
            : 'inline-flex items-center gap-1.5 text-xs font-medium text-ink-500 hover:text-navy-800 transition-colors px-2 py-1'
        }
      >
        {copied ? (
          <>
            <Check className="w-3 h-3" />
            Copied
          </>
        ) : (
          <>
            <Copy className="w-3 h-3" />
            Copy
          </>
        )}
      </button>
    </div>
  );
}