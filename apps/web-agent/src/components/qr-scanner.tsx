'use client';

import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { AlertCircle, X } from 'lucide-react';

// Pulls the ticket ref out of whatever the camera reads. The printed QR
// carries a lookup URL so a customer scanning their own ticket lands on a
// page that works for them — staff scanning the same code need only the
// ref, so we take it from the query string and ignore the rest.
//
// Falls back to matching a bare ref, in case a code is ever printed without
// the URL wrapper or a hardware scanner types the ref directly.
export function extractTicketRef(scanned: string): string | null {
  const direct = scanned.trim().toUpperCase();
  if (/^SW-[A-Z0-9]{2,5}-[A-Z0-9]{2,5}$/.test(direct)) return direct;

  try {
    const url = new URL(scanned);
    const ref = url.searchParams.get('ref')?.trim().toUpperCase();
    if (ref && /^SW-[A-Z0-9]{2,5}-[A-Z0-9]{2,5}$/.test(ref)) return ref;
  } catch {
    // Not a URL. Nothing more to try.
  }

  return null;
}

const READER_ID = 'surewina-qr-reader';

export function QrScanner({
  onResult,
  onClose,
}: {
  onResult: (ticketRef: string) => void;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  // Guards against the decoder firing twice before the camera stops — the
  // callback can run again while stop() is still resolving, which would
  // route the agent twice.
  const handled = useRef(false);

  useEffect(() => {
    const scanner = new Html5Qrcode(READER_ID);
    let live = true;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decoded) => {
          if (handled.current) return;
          const ref = extractTicketRef(decoded);
          if (!ref) {
            setError('That code is not a Surewina ticket.');
            return;
          }
          handled.current = true;
          void scanner.stop().finally(() => onResult(ref));
        },
        () => {
          // Per-frame decode misses. Normal while aiming — not an error.
        },
      )
      .catch((e: unknown) => {
        setError(
          e instanceof Error && e.name === 'NotAllowedError'
            ? 'Camera permission was refused. Allow it in your browser settings, or type the reference instead.'
            : 'Could not start the camera. Type the reference instead.',
        );
      });

    return () => {
      live = false;
      // stop() rejects if the camera never started; nothing to clean up then.
      void scanner.stop().catch(() => {});
      void live;
    };
  }, [onResult]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-navy-950">
      <div className="flex items-center justify-between px-4 py-3">
        <p className="text-sm font-black uppercase tracking-[0.16em] text-white/70">
          Scan ticket
        </p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-sm bg-white/10 p-2 text-white"
          aria-label="Close scanner"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div id={READER_ID} className="mx-auto w-full max-w-[420px] flex-1" />

      {error ? (
        <div className="m-4 flex items-start gap-2 rounded-2xl border border-red-300 bg-red-50 p-3 text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      ) : (
        <p className="p-4 text-center text-sm text-white/60">
          Point the camera at the QR code on the ticket.
        </p>
      )}
    </div>
  );
}